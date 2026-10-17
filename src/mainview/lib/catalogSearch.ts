export type AlbumSortBy = "name" | "count" | "date";
export type MediaFilter = "all" | "images" | "videos";
export type MediaSortBy = "date" | "name" | "size";
export type SortOrder = "asc" | "desc";

export interface AlbumsSearch {
  search?: string;
  sortBy?: AlbumSortBy;
}

export interface MediaSearch {
  page?: number;
  search?: string;
  filter?: MediaFilter;
  sortBy?: MediaSortBy;
  sortOrder?: SortOrder;
}

export interface AlbumMediaSearch extends MediaSearch {
  limit?: number;
}

function choice<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === "string" && choices.includes(value as T) ? value as T : fallback;
}

function integer(value: unknown, fallback: number, minimum: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

export function validateAlbumsSearch(raw: Record<string, unknown>): AlbumsSearch {
  return {
    search: typeof raw.search === "string" && raw.search ? raw.search : undefined,
    sortBy: choice<AlbumSortBy>(raw.sortBy, ["name", "count", "date"], "name"),
  };
}

export function validateMediaSearch(raw: Record<string, unknown>): MediaSearch {
  return {
    page: integer(raw.page, 0, 0),
    search: typeof raw.search === "string" ? raw.search : "",
    filter: choice<MediaFilter>(raw.filter, ["all", "images", "videos"], "all"),
    sortBy: choice<MediaSortBy>(raw.sortBy, ["date", "name", "size"], "date"),
    sortOrder: choice<SortOrder>(raw.sortOrder, ["asc", "desc"], "desc"),
  };
}

export function validateAlbumMediaSearch(raw: Record<string, unknown>): AlbumMediaSearch {
  return { ...validateMediaSearch(raw), limit: integer(raw.limit, 100, 1) };
}

export function patchSearch<T extends object>(previous: T, patch: Partial<T>): T {
  return { ...previous, ...patch };
}

export function patchPagedSearch<T extends { page?: number }>(previous: T, patch: Partial<T>): T {
  return { ...previous, ...patch, page: 0 };
}
