import { notFound } from "next/navigation";
import { ViewPage } from "@/modules/views";
import { getFolderWithPath } from "@/modules/folders";

export default async function FolderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const data = await getFolderWithPath(id);
  if (!data) notFound();
  return (
    <ViewPage
      view="library"
      folder={{
        id: data.folder.id,
        name: data.folder.name,
        path: data.path,
        depth: data.depth,
      }}
      searchParams={searchParams}
    />
  );
}
