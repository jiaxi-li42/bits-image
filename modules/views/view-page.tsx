import { ViewHeader, EmptyState } from "@/modules/shell";
import { UploadButton } from "@/modules/ingestion";
import { TrashEmptyButton } from "@/modules/actions";
import { listImages } from "./list-images";
import { Grid } from "./grid";
import type { ViewKind } from "./types";

const VIEW_META: Record<
  ViewKind,
  { title: string; description: string; emptyTitle: string; emptyBody: string }
> = {
  library: {
    title: "Library",
    description: "Every image in your library.",
    emptyTitle: "Library is empty",
    emptyBody: "Upload images to start building your inspiration library.",
  },
  inbox: {
    title: "Inbox",
    description: "Images you haven't tagged yet.",
    emptyTitle: "Inbox is clear",
    emptyBody: "Newly saved images land here until you give them at least one tag.",
  },
  organised: {
    title: "Organised",
    description: "Images with at least one tag.",
    emptyTitle: "Nothing organised yet",
    emptyBody: "Tagged images appear here.",
  },
  trash: {
    title: "Trash",
    description: "Deleted images are kept for 30 days.",
    emptyTitle: "Trash is empty",
    emptyBody: "Deleted images can be restored from here for up to 30 days.",
  },
};

export async function ViewPage({ view }: { view: ViewKind }) {
  const meta = VIEW_META[view];
  const { items, nextCursor } = await listImages({ view });

  return (
    <div className="flex min-h-dvh flex-col">
      <ViewHeader
        title={meta.title}
        description={meta.description}
        actions={
          view === "trash" && items.length > 0 ? (
            <TrashEmptyButton />
          ) : view !== "trash" ? (
            <UploadButton />
          ) : null
        }
      />
      {items.length === 0 ? (
        <EmptyState title={meta.emptyTitle} description={meta.emptyBody} />
      ) : (
        <Grid view={view} initialItems={items} initialCursor={nextCursor} />
      )}
    </div>
  );
}
