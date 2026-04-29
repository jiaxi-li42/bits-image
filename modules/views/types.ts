export type ViewKind = "library" | "inbox" | "organised" | "trash";

export type TagFilterMode = "and" | "or";

export type GridImage = {
  id: string;
  hash: string;
  width: number;
  height: number;
  title: string | null;
  createdAt: number;
  deletedAt: number | null;
};

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type ListImagesResult = {
  items: GridImage[];
  nextCursor: string | null;
};

export const PAGE_SIZE = 48;
