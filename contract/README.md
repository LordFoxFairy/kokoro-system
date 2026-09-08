# System internal-owner contract

G1目标字段唯一源：src/modules/*/schemas/*.schema.ts。运行时Zod→scripts/generate-system-openapi.ts→openapi/system.openapi.json（只读）。
scripts/system-openapi-operations.ts只定义path/operation metadata；后续Controller直接引用Zod并用route inventory防漂移。

```bash
pnpm contract:generate:openapi
pnpm contract:lint
pnpm verify:contract-provenance
pnpm test:contract:target
```

2.0.0 /v1-fresh-cutover：完整业务扩展、Model HTTP合入、CAS/Config收紧、{data}/{error}+x-request-id替换旧meta。
未发布registry baseline，外部消费者清单仍需发布前核对；BFF与Agent由Root在owner提交后串行更新并真实验证。
provenance.json记录runtime schema/生成器/OpenAPI digest；consumer固定artifact version/source commit/digest，不复制编辑DTO。
G1旧contract/proto与src/generated/proto仅保留当前Site测试/运行所需，不是目标第二协议；后续同切片删除。禁止手改generated。
Root Developer API门户不发布本内部接口。机器artifact和canonicalSQL先行，当前旧进程不实现目标接口，G1不是可部署版本。

Owner: kokoro-system；visibility: internal-owner；version: 2.0.0。generation单向由runtime Zod产生；breaking分类为v1-fresh-cutover；provenance以digest验证。每个consumer由Root按owner artifact提交后升级。
