import { ViewPage } from "@/modules/views";

export default function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return <ViewPage view="library" searchParams={searchParams} />;
}
