export type SitePolicyInput = Readonly<{
  defaultLocale: string;
  allowedLocales: readonly string[];
  allowedProducts: readonly string[];
  publicManifest: boolean;
}>;
