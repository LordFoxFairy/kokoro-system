export type PagePosition = Readonly<{ createdAt: string; id: string }>;
export type PageQuery = Readonly<{ limit: number; after: PagePosition | null }>;
