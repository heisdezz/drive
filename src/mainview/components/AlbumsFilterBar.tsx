import { memo } from "react";
import { Search, ArrowUpDown } from "lucide-react";

export type AlbumSortBy = "name" | "count" | "date";

interface AlbumsFilterBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  sortBy: AlbumSortBy;
  onSortChange: (value: AlbumSortBy) => void;
}

export const AlbumsFilterBar = memo(function AlbumsFilterBar({
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
}: AlbumsFilterBarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 justify-between items-center border border-base-200 p-4 rounded-xl sticky top-0 z-10 bg-base-200">
      <div className="relative w-full sm:max-w-xs">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40" />
        <input
          type="text"
          placeholder="Search albums..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-base-100/60 border border-base-300 text-base-content placeholder-base-content/30 focus:outline-none focus:border-primary/60 transition-colors"
        />
      </div>
      <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
        <ArrowUpDown className="w-3.5 h-3.5 text-base-content/40" />
        <span className="text-xs text-base-content/60 mr-1 hidden sm:inline">
          Sort by:
        </span>
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as AlbumSortBy)}
          className="select select-bordered select-xs text-xs rounded-lg bg-base-100/60 border-base-300 text-base-content/80 focus:outline-none focus:border-primary/60"
        >
          <option value="name">Name (A-Z)</option>
          <option value="count">File Count</option>
          <option value="date">Date Discovered</option>
        </select>
      </div>
    </div>
  );
});
