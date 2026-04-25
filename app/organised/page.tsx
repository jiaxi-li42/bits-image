import { ViewPage } from "@/modules/views";

export default function OrganisedPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return <ViewPage view="organised" searchParams={searchParams} />;
}
