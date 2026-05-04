import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";

/**
 * Tag used by sidebar data fetchers (`getViewCounts`, `listFolders`,
 * `listTags`) when wrapped in `unstable_cache`. Most mutations (image
 * add/move/delete, folder/tag CRUD, bulk operations) bust this tag via
 * `revalidateAllViews`. Mutations that don't touch the sidebar (e.g.
 * updating an image's title/description) skip the tag bust so the
 * cached sidebar data continues to serve.
 */
export const SHELL_CACHE_TAG = "shell";

/**
 * Invalidate every rendered view *and* sidebar data. Use this for
 * mutations that affect what's listed in the grid AND/OR what shows
 * in the sidebar (folders, tags, view counts). The `"max"` profile
 * uses Next 16's stale-while-revalidate semantics.
 */
export function revalidateAllViews() {
  revalidatePath("/", "layout");
  revalidateTag(SHELL_CACHE_TAG, "max");
}

/**
 * Invalidate views (RSC payloads) without busting the cached sidebar
 * data. Use for mutations like `updateImageMeta` that change a single
 * image's metadata but don't move it between views or change any count.
 */
export function revalidateViewsOnly() {
  revalidatePath("/", "layout");
}
