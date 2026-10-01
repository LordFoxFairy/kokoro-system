import type { Client } from "pg";

// Read-only owner metadata, never DDL or a second editable expected catalog.
// The caller owns this idle Client. OIDs are lookup keys, not snapshot identity.
export async function snapshotSystemSchemaCatalog(
  database: Client,
  schema: string,
) {
  await database.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const namespace = await database.query<{ present: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname=$1) AS present",
      [schema],
    );
    if (namespace.rows[0]?.present !== true)
      throw new Error("Owner catalog namespace is missing");
    await database.query(
      `SET LOCAL search_path TO "${schema.replaceAll('"', '""')}",pg_catalog`,
    );
    await database.query("SET LOCAL TIME ZONE 'UTC'");
    // Current canonical SQL uses ordinary tables, generated row/array types,
    // built-in expression dependencies and PL/pgSQL guards. Unknown schema-bound
    // semantics fail closed instead of being erased during normalization.
    const unsupported = await database.query<{ present: boolean }>(
      `
      WITH target AS (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname=$1)
      SELECT EXISTS (
        SELECT 1 FROM pg_catalog.pg_class c,target n
          WHERE c.relnamespace=n.oid AND c.relkind NOT IN ('r','p','i','I')
        UNION ALL
        SELECT 1 FROM pg_catalog.pg_type t,target n WHERE t.typnamespace=n.oid AND NOT (
          (t.typtype='c' AND EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid=t.typrelid AND c.relnamespace=n.oid AND c.relkind IN ('r','p')))
          OR (t.typtype='b' AND EXISTS(SELECT 1 FROM pg_catalog.pg_type element WHERE element.oid=t.typelem AND element.typnamespace=n.oid AND element.typtype='c' AND element.typarray=t.oid))
        )
        UNION ALL
        SELECT 1 FROM pg_catalog.pg_proc p,target n
          WHERE p.pronamespace=n.oid AND (p.prokind='a' OR p.prosqlbody IS NOT NULL OR EXISTS (
            SELECT 1 FROM pg_catalog.unnest(p.proconfig) AS setting(value) WHERE setting.value LIKE 'search_path=%'
          ))
        UNION ALL
        SELECT 1 FROM pg_catalog.pg_trigger t
          JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
          JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid,target n
          WHERE c.relnamespace=n.oid AND p.pronamespace<>n.oid
        UNION ALL
        SELECT 1 FROM pg_catalog.pg_depend d,target n
          CROSS JOIN LATERAL pg_catalog.pg_identify_object(d.classid,d.objid,d.objsubid) AS identity
          WHERE d.refclassid='pg_catalog.pg_namespace'::regclass AND d.refobjid=n.oid AND identity.schema=$1
            AND d.classid NOT IN ('pg_catalog.pg_class'::regclass,'pg_catalog.pg_type'::regclass,'pg_catalog.pg_proc'::regclass,'pg_catalog.pg_constraint'::regclass)
        UNION ALL
        SELECT 1 FROM pg_catalog.pg_extension e,target n WHERE e.extnamespace=n.oid
        UNION ALL
        SELECT 1 FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid,target n WHERE c.relnamespace=n.oid
        UNION ALL
        SELECT 1 FROM pg_catalog.pg_rewrite r JOIN pg_catalog.pg_class c ON c.oid=r.ev_class,target n WHERE c.relnamespace=n.oid
        UNION ALL
        SELECT 1 FROM pg_catalog.pg_depend d
          JOIN pg_catalog.pg_attrdef a ON d.classid='pg_catalog.pg_attrdef'::regclass AND a.oid=d.objid
          JOIN pg_catalog.pg_class c ON c.oid=a.adrelid,target n
          CROSS JOIN LATERAL pg_catalog.pg_identify_object(d.refclassid,d.refobjid,d.refobjsubid) AS dependency
          WHERE c.relnamespace=n.oid AND d.deptype='n' AND dependency.schema IS NOT NULL AND dependency.schema<>'pg_catalog'
        UNION ALL
        SELECT 1 FROM pg_catalog.pg_depend d
          JOIN pg_catalog.pg_proc p ON d.classid='pg_catalog.pg_proc'::regclass AND p.oid=d.objid,target n
          CROSS JOIN LATERAL pg_catalog.pg_identify_object(d.refclassid,d.refobjid,d.refobjsubid) AS dependency
          WHERE p.pronamespace=n.oid AND p.pronargdefaults>0 AND d.deptype='n' AND dependency.schema IS NOT NULL AND dependency.schema<>'pg_catalog'
      ) AS present
    `,
      [schema],
    );
    if (unsupported.rows[0]?.present !== false)
      throw new Error(
        "Unsupported owner catalog semantics or namespace-bound default dependency",
      );
    const result = await database.query<{ snapshot: Record<string, unknown> }>(
      `
      WITH target AS (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname=$1),
      type_identity AS (
        SELECT t.oid,pg_catalog.jsonb_build_object(
          'namespace',CASE WHEN n.oid=(SELECT oid FROM target) THEN 'owner' ELSE n.nspname END,
          'name',t.typname) AS value
        FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
      ),
      routine_identity AS (
        SELECT p.oid,pg_catalog.jsonb_build_object(
          'namespace',CASE WHEN n.oid=(SELECT oid FROM target) THEN 'owner' ELSE n.nspname END,
          'name',p.proname,
          'arguments',COALESCE((SELECT pg_catalog.jsonb_agg(t.value ORDER BY a.ordinal)
            FROM pg_catalog.unnest(p.proargtypes::oid[]) WITH ORDINALITY a(type,ordinal)
            JOIN type_identity t ON t.oid=a.type),'[]'::jsonb)) AS value
        FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
        WHERE p.pronamespace=(SELECT oid FROM target) OR p.oid IN (
          SELECT pg_catalog.unnest(ARRAY[t.typinput,t.typoutput,t.typreceive,t.typsend,t.typmodin,t.typmodout,t.typanalyze]::oid[])
          FROM pg_catalog.pg_type t WHERE t.typnamespace=(SELECT oid FROM target)
          UNION ALL SELECT p.prosupport::oid FROM pg_catalog.pg_proc p WHERE p.pronamespace=(SELECT oid FROM target)
        )
      ),
      collation_identity AS (
        SELECT c.oid,pg_catalog.jsonb_build_object(
          'namespace',CASE WHEN n.oid=(SELECT oid FROM target) THEN 'owner' ELSE n.nspname END,
          'name',c.collname) AS value
        FROM pg_catalog.pg_collation c JOIN pg_catalog.pg_namespace n ON n.oid=c.collnamespace
      ),
      relation_identity AS (
        SELECT c.oid,pg_catalog.jsonb_build_object(
          'namespace',CASE WHEN n.oid=(SELECT oid FROM target) THEN 'owner' ELSE n.nspname END,
          'name',c.relname) AS value
        FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      ),
      operator_identity AS (
        SELECT o.oid,pg_catalog.jsonb_build_object(
          'namespace',CASE WHEN n.oid=(SELECT oid FROM target) THEN 'owner' ELSE n.nspname END,
          'name',o.oprname,'left',l.value,'right',r.value) AS value
        FROM pg_catalog.pg_operator o JOIN pg_catalog.pg_namespace n ON n.oid=o.oprnamespace
        LEFT JOIN type_identity l ON l.oid=o.oprleft LEFT JOIN type_identity r ON r.oid=o.oprright
      ),
      opclass_identity AS (
        SELECT o.oid,pg_catalog.jsonb_build_object(
          'namespace',CASE WHEN n.oid=(SELECT oid FROM target) THEN 'owner' ELSE n.nspname END,
          'name',o.opcname,'method',am.amname,'input_type',t.value) AS value
        FROM pg_catalog.pg_opclass o JOIN pg_catalog.pg_namespace n ON n.oid=o.opcnamespace
        JOIN pg_catalog.pg_am am ON am.oid=o.opcmethod JOIN type_identity t ON t.oid=o.opcintype
      )
      SELECT pg_catalog.jsonb_build_object(
        'tables',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'name',c.relname,'kind',c.relkind,'persistence',c.relpersistence,
          'replica_identity',c.relreplident,'row_security',c.relrowsecurity,
          'force_row_security',c.relforcerowsecurity,'options',c.reloptions,
          'access_method',am.amname,'is_partition',c.relispartition,
          'partition_key',CASE WHEN c.relkind='p' THEN pg_catalog.pg_get_partkeydef(c.oid) END,
          'partition_bound',pg_catalog.pg_get_expr(c.relpartbound,c.oid,false),
          'parents',COALESCE((SELECT pg_catalog.jsonb_agg(r.value ORDER BY i.inhseqno)
            FROM pg_catalog.pg_inherits i JOIN relation_identity r ON r.oid=i.inhparent
            WHERE i.inhrelid=c.oid),'[]'::jsonb)
        ) ORDER BY c.relname) FROM pg_catalog.pg_class c
          LEFT JOIN pg_catalog.pg_am am ON am.oid=c.relam,target n
          WHERE c.relnamespace=n.oid AND c.relkind IN ('r','p')),'[]'::jsonb),
        'columns',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'table',c.relname,'ordinal',a.attnum,'name',a.attname,'type',t.value,
          'typmod',a.atttypmod,'not_null',a.attnotnull,'identity',a.attidentity,
          'generated',a.attgenerated,'collation',co.value,'dimensions',a.attndims,
          'storage',a.attstorage,'compression',a.attcompression,'options',a.attoptions,
          'is_local',a.attislocal,'inherited_count',a.attinhcount,
          'default',pg_catalog.pg_get_expr(d.adbin,d.adrelid,false)
        ) ORDER BY c.relname,a.attnum) FROM pg_catalog.pg_class c
          JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
          JOIN type_identity t ON t.oid=a.atttypid
          LEFT JOIN collation_identity co ON co.oid=a.attcollation
          LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum,target n
          WHERE c.relnamespace=n.oid AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb),
        'types',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'name',t.typname,'kind',t.typtype,'category',t.typcategory,
          'preferred',t.typispreferred,'defined',t.typisdefined,'length',t.typlen,
          'by_value',t.typbyval,'delimiter',t.typdelim,'alignment',t.typalign,
          'storage',t.typstorage,'not_null',t.typnotnull,'dimensions',t.typndims,
          'typmod',t.typtypmod,'relation',relation.value,'element',element.value,
          'array',array_type.value,'base',base.value,'collation',collation_entry.value,
          'input',input.value,'output',output.value,'receive',receive.value,'send',send.value,
          'typmod_in',mod_in.value,'typmod_out',mod_out.value,'analyze',analyze_routine.value,
          'default',t.typdefault,'default_expression',pg_catalog.pg_get_expr(t.typdefaultbin,0,false)
        ) ORDER BY t.typname) FROM pg_catalog.pg_type t
          LEFT JOIN relation_identity relation ON relation.oid=t.typrelid
          LEFT JOIN type_identity element ON element.oid=t.typelem
          LEFT JOIN type_identity array_type ON array_type.oid=t.typarray
          LEFT JOIN type_identity base ON base.oid=t.typbasetype
          LEFT JOIN collation_identity collation_entry ON collation_entry.oid=t.typcollation
          LEFT JOIN routine_identity input ON input.oid=t.typinput
          LEFT JOIN routine_identity output ON output.oid=t.typoutput
          LEFT JOIN routine_identity receive ON receive.oid=t.typreceive
          LEFT JOIN routine_identity send ON send.oid=t.typsend
          LEFT JOIN routine_identity mod_in ON mod_in.oid=t.typmodin
          LEFT JOIN routine_identity mod_out ON mod_out.oid=t.typmodout
          LEFT JOIN routine_identity analyze_routine ON analyze_routine.oid=t.typanalyze,target n
          WHERE t.typnamespace=n.oid),'[]'::jsonb),
        'constraints',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'table',r.value,'name',c.conname,'type',c.contype,'columns',c.conkey,
          'validated',c.convalidated,'deferrable',c.condeferrable,'deferred',c.condeferred,
          'is_local',c.conislocal,'inherited_count',c.coninhcount,'no_inherit',c.connoinherit,
          'definition',pg_catalog.pg_get_constraintdef(c.oid,false),
          'index',index_relation.value,'foreign_table',foreign_relation.value,
          'foreign_columns',c.confkey,'update_action',c.confupdtype,
          'delete_action',c.confdeltype,'match_type',c.confmatchtype,
          'exclusion_operators',COALESCE((SELECT pg_catalog.jsonb_agg(o.value ORDER BY a.ordinal)
            FROM pg_catalog.unnest(c.conexclop) WITH ORDINALITY a(operator_oid,ordinal)
            JOIN operator_identity o ON o.oid=a.operator_oid),'[]'::jsonb)
        ) ORDER BY r.value::text,c.conname) FROM pg_catalog.pg_constraint c
          LEFT JOIN relation_identity r ON r.oid=c.conrelid
          LEFT JOIN relation_identity index_relation ON index_relation.oid=c.conindid
          LEFT JOIN relation_identity foreign_relation ON foreign_relation.oid=c.confrelid,target n
          WHERE c.connamespace=n.oid),'[]'::jsonb),
        'indexes',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'name',c.relname,'table',table_relation.value,'method',am.amname,
          'unique',i.indisunique,'primary',i.indisprimary,'exclusion',i.indisexclusion,
          'immediate',i.indimmediate,'nulls_not_distinct',i.indnullsnotdistinct,
          'valid',i.indisvalid,'ready',i.indisready,'live',i.indislive,
          'clustered',i.indisclustered,'replica_identity',i.indisreplident,
          'attributes',i.indnatts,'key_attributes',i.indnkeyatts,'keys_and_includes',i.indkey::smallint[],
          'ordering_flags',i.indoption::smallint[],'options',c.reloptions,
          'column_definitions',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.pg_get_indexdef(c.oid,slot,false) ORDER BY slot)
            FROM pg_catalog.generate_series(1,i.indnatts) slot),'[]'::jsonb),
          'collations',COALESCE((SELECT pg_catalog.jsonb_agg(co.value ORDER BY a.ordinal)
            FROM pg_catalog.unnest(i.indcollation::oid[]) WITH ORDINALITY a(collation_oid,ordinal)
            LEFT JOIN collation_identity co ON co.oid=a.collation_oid),'[]'::jsonb),
          'operator_classes',COALESCE((SELECT pg_catalog.jsonb_agg(o.value ORDER BY a.ordinal)
            FROM pg_catalog.unnest(i.indclass::oid[]) WITH ORDINALITY a(opclass,ordinal)
            JOIN opclass_identity o ON o.oid=a.opclass),'[]'::jsonb),
          'expressions',pg_catalog.pg_get_expr(i.indexprs,i.indrelid,false),
          'predicate',pg_catalog.pg_get_expr(i.indpred,i.indrelid,false)
        ) ORDER BY c.relname) FROM pg_catalog.pg_index i
          JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid
          JOIN relation_identity table_relation ON table_relation.oid=i.indrelid
          JOIN pg_catalog.pg_am am ON am.oid=c.relam,target n
          WHERE c.relnamespace=n.oid),'[]'::jsonb),
        'functions',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'identity',identity.value,'kind',p.prokind,'language',l.lanname,
          'return_type',return_type.value,'returns_set',p.proretset,
          'security_definer',p.prosecdef,'strict',p.proisstrict,'leakproof',p.proleakproof,
          'volatility',p.provolatile,'parallel',p.proparallel,'cost',p.procost,'rows',p.prorows,
          'variadic_type',variadic_type.value,'support',support.value,
          'argument_names',p.proargnames,'argument_modes',p.proargmodes,
          'all_argument_types',CASE WHEN p.proallargtypes IS NOT NULL THEN
            (SELECT pg_catalog.jsonb_agg(t.value ORDER BY a.ordinal)
              FROM pg_catalog.unnest(p.proallargtypes) WITH ORDINALITY a(type,ordinal)
              JOIN type_identity t ON t.oid=a.type) END,
          'default_count',p.pronargdefaults,'arguments_with_defaults',pg_catalog.pg_get_function_arguments(p.oid),
          'transform_types',COALESCE((SELECT pg_catalog.jsonb_agg(t.value ORDER BY a.ordinal)
            FROM pg_catalog.unnest(p.protrftypes) WITH ORDINALITY a(type,ordinal)
            JOIN type_identity t ON t.oid=a.type),'[]'::jsonb),
          'source',p.prosrc,'binary',p.probin,'settings',p.proconfig
        ) ORDER BY identity.value::text) FROM pg_catalog.pg_proc p
          JOIN routine_identity identity ON identity.oid=p.oid
          JOIN pg_catalog.pg_language l ON l.oid=p.prolang
          JOIN type_identity return_type ON return_type.oid=p.prorettype
          LEFT JOIN type_identity variadic_type ON variadic_type.oid=p.provariadic
          LEFT JOIN routine_identity support ON support.oid=p.prosupport,target n
          WHERE p.pronamespace=n.oid),'[]'::jsonb),
        'triggers',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'table',c.relname,'name',t.tgname,'function',routine.value,
          'type',t.tgtype,'enabled',t.tgenabled,'internal',t.tgisinternal,
          'deferrable',t.tgdeferrable,'deferred',t.tginitdeferred,
          'argument_count',t.tgnargs,'arguments_hex',pg_catalog.encode(t.tgargs,'hex'),
          'columns',t.tgattr::smallint[],'old_table',t.tgoldtable,'new_table',t.tgnewtable,
          'definition',pg_catalog.pg_get_triggerdef(t.oid,true)
        ) ORDER BY c.relname,t.tgname) FROM pg_catalog.pg_trigger t
          JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
          JOIN routine_identity routine ON routine.oid=t.tgfoid,target n
          WHERE c.relnamespace=n.oid),'[]'::jsonb)
      ) AS snapshot
    `,
      [schema],
    );
    const snapshot = result.rows[0]?.snapshot;
    if (!snapshot) throw new Error("Owner catalog snapshot is missing");
    await database.query("COMMIT");
    return Object.freeze(snapshot);
  } catch (error) {
    await database.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
