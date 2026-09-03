export type PageRequest = Readonly<{ cursor?: string; limit?: number }>;
export type Page<T> = Readonly<{
  items: readonly T[];
  nextCursor: string | null;
}>;
