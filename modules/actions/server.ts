"use server";

import { purgeTrash } from "@/modules/manage/trash";
import { revalidateAllViews } from "@/lib/revalidate";

export async function emptyTrash() {
  const result = await purgeTrash();
  revalidateAllViews();
  return result;
}
