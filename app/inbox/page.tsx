import { ViewPage } from "@/modules/views";

export default function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return <ViewPage view="inbox" searchParams={searchParams} />;
}
