import type { JSX } from "solid-js";
import { Search, ArrowUpDown } from "lucide-solid";

export type AlbumSortBy = "name" | "count" | "date";

interface AlbumsFilterBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  sortBy: AlbumSortBy;
  onSortChange: (value: AlbumSortBy) => void;
  actions?: JSX.Element;
}

export function AlbumsFilterBar(props: AlbumsFilterBarProps) {
  return (
    <div class="flex flex-wrap items-center gap-2 rounded-xl border border-base-200 bg-base-200/70 p-2.5">
      <div class="relative min-w-48 flex-1">
        <Search class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40" />
        <input
          type="text"
          placeholder="Search albums..."
          value={props.searchQuery}
          onInput={(e) => props.onSearchChange(e.currentTarget.value)}
          aria-label="Search albums"
          class="h-8 w-full rounded-lg border border-base-300 bg-base-100/60 pl-9 pr-3 text-xs text-base-content placeholder-base-content/40 focus:border-primary/60 focus:outline-none"
        />
      </div>
      <div class="flex items-center gap-1.5">
        <ArrowUpDown class="h-3.5 w-3.5 text-base-content/50" />
        <select
          aria-label="Sort albums by"
          value={props.sortBy}
          onChange={(e) =>
            props.onSortChange(e.currentTarget.value as AlbumSortBy)
          }
          class="select select-bordered select-xs rounded-lg border-base-300 bg-base-100/60 text-xs text-base-content focus:border-primary/60 focus:outline-none"
        >
          <option value="name">Name (A-Z)</option>
          <option value="count">File Count</option>
          <option value="date">Date Discovered</option>
        </select>
      </div>
      {props.actions}
    </div>
  );
}
