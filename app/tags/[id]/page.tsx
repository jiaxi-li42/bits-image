import { notFound } from "next/navigation";
import { ViewPage } from "@/modules/views";
import { getTag } from "@/modules/tags";

export default async function TagPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const tag = await getTag(id);
  if (!tag) notFound();
  return <ViewPage view="library" tag={tag} searchParams={searchParams} />;
}
