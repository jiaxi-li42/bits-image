import { ViewHeader, EmptyState } from "@/modules/shell";
import { MobileFloatingActions } from "@/modules/shell/mobile-floating-actions";
import { UploadButton, UploadDropTarget } from "@/modules/ingestion";
import { TrashEmptyButton } from "@/modules/actions";
import { SearchBar } from "@/modules/search";
import { FolderHeaderActions } from "@/modules/folders/folder-header-actions";
import { TagFilterBar, TagHeaderActions } from "@/modules/tags";
import { ManageProvider, ManageBar, ManagePanel } from "@/modules/manage";
import { listImages } from "./list-images";
import { Grid } from "./grid";
import type { TagFilterMode, ViewKind } from "./types";

const VIEW_META: Record<
  ViewKind,
  { title: string; emptyTitle: string; emptyBody: string }
> = {
  library: {
    title: "Library",
    emptyTitle: "Library is empty",
    emptyBody: "Upload images to start building your inspiration library.",
  },
  inbox: {
    title: "Inbox",
    emptyTitle: "Inbox is clear",
    emptyBody:
      "Newly saved images land here until you give them at least one tag.",
  },
  organised: {
    title: "Organised",
    emptyTitle: "Nothing organised yet",
    emptyBody: "Tagged images appear here.",
  },
  trash: {
    title: "Trash",
    emptyTitle: "Trash is empty",
    emptyBody:
      "Deleted images can be restored from here for up to 30 days.",
  },
};

export type ViewPageProps = {
  view: ViewKind;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
  folder?: { id: string; name: string; path?: string; depth: number };
  tag?: { id: string; name: string };
};

export async function ViewPage({
  view,
  searchParams,
  folder,
  tag,
}: ViewPageProps) {
  const meta = VIEW_META[view];
  const sp = (await searchParams) ?? {};
  const tagsRaw = typeof sp.tags === "string" ? sp.tags : "";
  const tagIds = tagsRaw ? tagsRaw.split(",").filter(Boolean) : [];
  const modeRaw = typeof sp.mode === "string" ? sp.mode : "and";
  const tagMode: TagFilterMode = modeRaw === "or" ? "or" : "and";
  const query = typeof sp.q === "string" ? sp.q : "";

  const showTagFilter = view !== "trash";

  // For tag-detail view, the "primary" tag is the one we always require.
  // Additional ?tags filters from TagFilterBar narrow within that.
  const primaryTagIds = tag ? [tag.id] : [];
  const effectiveTagIds = showTagFilter
    ? [...primaryTagIds, ...tagIds.filter((id) => id !== tag?.id)]
    : undefined;
  const effectiveMode: TagFilterMode =
    effectiveTagIds && effectiveTagIds.length > 1 ? tagMode : "and";

  const { items, nextCursor } = await listImages({
    view,
    tagIds: effectiveTagIds,
    tagMode: effectiveMode,
    query,
    folderId: folder?.id,
  });

  const isFiltered =
    (showTagFilter && tagIds.length > 0) || Boolean(query.trim());

  let title = meta.title;
  let emptyTitle = meta.emptyTitle;
  let emptyBody = meta.emptyBody;

  if (folder) {
    title = folder.name;
    emptyTitle = "Folder is empty";
    emptyBody = "Move images into this folder from the image details panel.";
  } else if (tag) {
    title = `#${tag.name}`;
    emptyTitle = "No images with this tag";
    emptyBody = "Tag an image from the image details panel.";
  }

  const pageContent = (
    <>
      <div className="flex min-h-dvh flex-col">
        <ViewHeader
          title={title}
          action={
            folder ? (
              <FolderHeaderActions folder={folder} depth={folder.depth} />
            ) : tag ? (
              <TagHeaderActions tag={tag} />
            ) : null
          }
        />
        {/* Toolbar row: filter (where applicable) on the left.
            On desktop, search + Manage + Upload cluster on the right.
            On mobile, search lives in the header and Manage/Upload are FABs
            (see MobileFloatingActions below). */}
        <div className="flex flex-wrap items-start gap-2 px-4 pb-3 md:px-6">
          {showTagFilter ? <TagFilterBar excludeTagId={tag?.id} /> : null}
          <div className="ml-auto hidden md:flex md:flex-wrap md:items-start md:gap-2">
            <SearchBar />
            <ManageBar />
            {view === "trash" ? (
              <TrashEmptyButton disabled={items.length === 0} />
            ) : (
              <UploadButton />
            )}
          </div>
        </div>
        {items.length === 0 ? (
          <EmptyState
            title={isFiltered ? "No matches" : emptyTitle}
            description={
              isFiltered ? "No images match the current filter." : emptyBody
            }
          />
        ) : (
          <Grid
            view={view}
            initialItems={items}
            initialCursor={nextCursor}
            tagIds={effectiveTagIds}
            tagMode={effectiveMode}
            query={query}
            folderId={folder?.id}
          />
        )}
      </div>
      <MobileFloatingActions>
        <ManageBar variant="floating" />
        {view === "trash" ? (
          <TrashEmptyButton
            disabled={items.length === 0}
            variant="floating"
          />
        ) : (
          <UploadButton variant="floating" />
        )}
      </MobileFloatingActions>
      <ManagePanel view={view} folderId={folder?.id} />
    </>
  );

  return (
    <ManageProvider>
      {/* Trash never accepts uploads, so the drop-target host (which
          also owns the dialog + page-level drag listeners) isn't
          mounted there — keeps stray file drags from spinning up an
          upload dialog on a view where the action makes no sense.
          UploadButton isn't rendered in trash either, so it's safe to
          skip the provider entirely. */}
      {view !== "trash" ? (
        <UploadDropTarget folderId={folder?.id} tagId={tag?.id}>
          {pageContent}
        </UploadDropTarget>
      ) : (
        pageContent
      )}
    </ManageProvider>
  );
}
