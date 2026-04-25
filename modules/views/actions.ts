"use server";

import { listImages } from "./list-images";
import type { ViewKind, ListImagesResult, TagFilterMode } from "./types";

export async function loadMore({
  view,
  cursor,
  tagIds,
  tagMode,
  query,
  folderId,
}: {
  view: ViewKind;
  cursor: string;
  tagIds?: string[];
  tagMode?: TagFilterMode;
  query?: string;
  folderId?: string;
}): Promise<ListImagesResult> {
  return listImages({ view, cursor, tagIds, tagMode, query, folderId });
}
