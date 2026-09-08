import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import { DatabaseService } from "../../database/database.service.js";
import { ProductProjectionRepository } from "./product-projection.repository.js";
import type {
  navigationItemSchema,
  themeSchema,
  localeNamespaceSchema,
  featureFlagSchema,
  referenceSchema,
} from "./schemas/presentation.schema.js";
@Injectable()
export class ProductProjectionService {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ProductProjectionRepository)
    private readonly projection: ProductProjectionRepository,
  ) {}
  public product(key: string) {
    return this.database.read((tx) => this.projection.product(tx, key));
  }
  public resolve(
    tenant: string,
    site: string,
    product: string,
    locale: string,
    surface: string | null,
  ) {
    return this.database.read(async (tx) => {
      const releaseId = await this.projection.binding(
        tx,
        tenant,
        site,
        product,
        surface,
      );
      const configs = await this.projection.configs(
        tx,
        tenant,
        site,
        product,
        locale,
        surface,
        releaseId,
      );
      const presentations = await this.projection.presentations(
        tx,
        tenant,
        site,
        product,
        locale,
        surface,
      );
      const enabled = new Set(
        await this.projection.enabledFeatures(tx, tenant, site, product),
      );
      let navigation: z.infer<typeof navigationItemSchema>[] = [];
      let theme: z.infer<typeof themeSchema> = {
        mode: "system",
        accent_color: "#6366f1",
        logo_asset_id: null,
      };
      let localeNamespaces: z.infer<typeof localeNamespaceSchema>[] = [];
      let featureFlags: z.infer<typeof featureFlagSchema>[] = [...enabled].map(
        (key) => ({ key, enabled: true }),
      );
      let references: z.infer<typeof referenceSchema>[] = [];
      let configVersion = 0n;
      const selected = new Map<string, (typeof configs)[number]>();
      for (const config of configs)
        selected.set(`${config.module_key}:${config.config_key}`, config);
      for (const config of configs.filter(
        (item) =>
          selected.get(`${item.module_key}:${item.config_key}`) === item,
      )) {
        const version = BigInt(config.config_version);
        if (version > configVersion) configVersion = version;
        switch (config.module_key) {
          case "navigation":
            navigation = [
              ...new Map(
                [...navigation, ...config.value].map((item) => [
                  item.key,
                  item,
                ]),
              ).values(),
            ];
            break;
          case "theme":
            theme = config.value;
            break;
          case "i18n":
            localeNamespaces = [
              ...new Map(
                [...localeNamespaces, ...config.value].map((item) => [
                  item.namespace,
                  item,
                ]),
              ).values(),
            ];
            break;
          case "feature_flags":
            featureFlags = [
              ...new Map(
                [...featureFlags, ...config.value].map((item) => [
                  item.key,
                  item,
                ]),
              ).values(),
            ];
            break;
          case "references":
            references = [
              ...new Map(
                [...references, ...config.value].map((item) => [
                  item.key,
                  item,
                ]),
              ).values(),
            ];
            break;
        }
      }
      for (const presentation of presentations) {
        navigation = presentation.navigation;
        theme = presentation.theme;
        localeNamespaces = presentation.locale_namespaces;
      }
      // Unexposed feature links never become executable merely through saved presentation.
      navigation = navigation.filter(
        (item) => item.feature_key === null || enabled.has(item.feature_key),
      );
      featureFlags = featureFlags.map((item) => ({
        ...item,
        enabled: item.enabled && enabled.has(item.key),
      }));
      return {
        navigation,
        theme,
        locale_namespaces: localeNamespaces,
        feature_flags: featureFlags,
        references,
        config_version: configVersion.toString(),
        release_id: releaseId,
      };
    });
  }
}
