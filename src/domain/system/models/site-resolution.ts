export type SiteResolution = Readonly<{
  siteId: string;
  key: string;
  canonicalHost: string;
  defaultLocale: string;
  timezone: string;
  generation: number;
}>;
