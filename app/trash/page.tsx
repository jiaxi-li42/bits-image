import { ViewPage } from "@/modules/views";

export default function TrashPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return <ViewPage view="trash" searchParams={searchParams} />;
}
