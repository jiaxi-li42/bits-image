"use server";

import { listImages } from "./list-images";
import type { ViewKind, ListImagesResult } from "./types";

export async function loadMore({
  view,
  cursor,
}: {
  view: ViewKind;
  cursor: string;
}): Promise<ListImagesResult> {
  return listImages({ view, cursor });
}
