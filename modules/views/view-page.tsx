import { ViewHeader, EmptyState } from "@/modules/shell";
import { UploadButton } from "@/modules/ingestion";
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
    emptyBody:
      "Newly saved images land here until you give them at least one tag.",
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
    emptyBody:
      "Deleted images can be restored from here for up to 30 days.",
  },
};

export type ViewPageProps = {
  view: ViewKind;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
  folder?: { id: string; name: string; path?: string };
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

  const folderLabel = folder?.path ?? folder?.name ?? "";
  let title = meta.title;
  let description = meta.description;
  let emptyTitle = meta.emptyTitle;
  let emptyBody = meta.emptyBody;

  if (folder) {
    title = folderLabel;
    description = `Photos in "${folderLabel}".`;
    emptyTitle = "Folder is empty";
    emptyBody = "Move photos into this folder from the Edit details panel.";
  } else if (tag) {
    title = `#${tag.name}`;
    description = `Photos tagged "${tag.name}".`;
    emptyTitle = "No photos with this tag";
    emptyBody = "Tag a photo from the Edit details panel.";
  }

  return (
    <ManageProvider>
      <div className="flex min-h-dvh flex-col">
        <ViewHeader
          title={title}
          description={description}
          actions={
            <>
              <SearchBar />
              {folder ? <FolderHeaderActions folder={folder} /> : null}
              {tag ? <TagHeaderActions tag={tag} /> : null}
              {view === "trash" && items.length > 0 ? (
                <TrashEmptyButton />
              ) : view !== "trash" ? (
                <UploadButton folderId={folder?.id} tagId={tag?.id} />
              ) : null}
            </>
          }
        />
        {/* Toolbar row: filter (where applicable) + Manage toggle. Always
            renders so the Manage button is reachable in every view. */}
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 md:px-6">
          {showTagFilter ? <TagFilterBar excludeTagId={tag?.id} /> : null}
          <ManageBar />
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
      <ManagePanel view={view} />
    </ManageProvider>
  );
}
