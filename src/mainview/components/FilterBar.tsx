import { useState, useEffect, memo, useCallback } from "react";
import { Search, X, LayoutGrid, Image, Film, RotateCcw, Filter } from "lucide-react";
import { useDebouncedCallback } from "use-debounce";

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filterType: "all" | "images" | "videos";
  onFilterChange: (filter: "all" | "images" | "videos") => void;
  sortBy?: "date" | "name" | "size";
  onSortByChange?: (sortBy: "date" | "name" | "size") => void;
  sortOrder?: "asc" | "desc";
  onToggleSortOrder?: () => void;
  totalItems?: number;
}

export const FilterBar = memo(function FilterBar({
  searchQuery,
  onSearchChange,
  filterType,
  onFilterChange,
  sortBy = "date",
  onSortByChange,
  sortOrder = "desc",
  onToggleSortOrder,
  totalItems,
}: FilterBarProps) {
  const [localSearch, setLocalSearch] = useState(searchQuery);

  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  const debouncedSearch = useDebouncedCallback((val: string) => {
    onSearchChange(val);
  }, 500);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalSearch(val);
    debouncedSearch(val);
  };

  const handleClearSearch = useCallback(() => {
    debouncedSearch.cancel();
    setLocalSearch("");
    onSearchChange("");
  }, [debouncedSearch, onSearchChange]);

  const handleResetAll = useCallback(() => {
    handleClearSearch();
    onFilterChange("all");
    if (onSortByChange) onSortByChange("date");
    if (onToggleSortOrder && sortOrder === "asc") onToggleSortOrder();
  }, [handleClearSearch, onFilterChange, onSortByChange, onToggleSortOrder, sortOrder]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    debouncedSearch.cancel();
    onSearchChange(localSearch);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      handleClearSearch();
    }
  };

  const isFiltered =
    filterType !== "all" ||
    searchQuery.trim() !== "" ||
    sortBy !== "date" ||
    sortOrder !== "desc";

  return (
    <div className="p-4 rounded-2xl bg-base-200/40 backdrop-blur-md border border-base-200/80 shadow-lg flex flex-col md:flex-row gap-4 items-center justify-between transition-all duration-300">
      {/* Left section: Filter Type Segmented Control & Active Reset Button */}
      <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
        <div className="p-1 rounded-xl bg-base-300/80 border border-base-200/60 flex items-center gap-1 shadow-inner">
          <button
            type="button"
            onClick={() => onFilterChange("all")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              filterType === "all"
                ? "bg-primary text-primary-content shadow-md shadow-primary/20 scale-[1.02]"
                : "text-base-content/60 hover:text-base-content hover:bg-base-100/50"
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>All</span>
          </button>

          <button
            type="button"
            onClick={() => onFilterChange("images")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              filterType === "images"
                ? "bg-primary text-primary-content shadow-md shadow-primary/20 scale-[1.02]"
                : "text-base-content/60 hover:text-base-content hover:bg-base-100/50"
            }`}
          >
            <Image className="w-3.5 h-3.5" />
            <span>Photos</span>
          </button>

          <button
            type="button"
            onClick={() => onFilterChange("videos")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              filterType === "videos"
                ? "bg-primary text-primary-content shadow-md shadow-primary/20 scale-[1.02]"
                : "text-base-content/60 hover:text-base-content hover:bg-base-100/50"
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Videos</span>
          </button>
        </div>

        {/* Sort By Dropdown & Direction Toggle */}
        {onSortByChange && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-base-content/60 font-semibold hidden sm:inline">
              Sort:
            </span>
            <select
              value={sortBy}
              onChange={(e) =>
                onSortByChange(e.target.value as "date" | "name" | "size")
              }
              className="select select-bordered select-sm text-xs bg-base-100/60 border-base-300 text-base-content/80 rounded-xl focus:outline-none focus:border-primary/60 cursor-pointer h-9"
            >
              <option value="date">Date Added</option>
              <option value="name">File Name</option>
              <option value="size">File Size</option>
            </select>

            {onToggleSortOrder && (
              <button
                type="button"
                onClick={onToggleSortOrder}
                className="btn btn-sm btn-outline border-base-300 text-base-content/80 hover:bg-base-100 px-3 cursor-pointer font-bold flex items-center gap-1 rounded-xl h-9"
                title={sortOrder === "asc" ? "Ascending order" : "Descending order"}
              >
                {sortOrder === "asc" ? (
                  <span className="text-xs">ASC ↑</span>
                ) : (
                  <span className="text-xs">DESC ↓</span>
                )}
              </button>
            )}
          </div>
        )}

        {isFiltered && (
          <button
            type="button"
            onClick={handleResetAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-error/10 hover:bg-error/20 border border-error/20 text-error text-xs font-semibold transition-all hover:scale-105 active:scale-95 cursor-pointer animate-fade-in"
            title="Reset filters, search, and sorting"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Right section: Search input form & total items badge */}
      <div className="flex items-center gap-3 w-full md:w-auto">
        {totalItems !== undefined && (
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-base-100/60 border border-base-200 text-xs font-mono text-base-content/70">
            <Filter className="w-3 h-3 text-primary" />
            <span>
              <strong className="text-base-content">{totalItems}</strong> items
            </span>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="flex w-full md:w-80 items-center gap-2"
        >
          <div className="relative flex-grow">
            <input
              type="text"
              placeholder="Search media files... (Esc to clear)"
              value={localSearch}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              className="input input-sm w-full bg-base-300/60 border border-base-200/80 rounded-xl text-xs text-base-content pl-9 pr-8 h-9 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 placeholder:text-base-content/40 transition-all"
            />
            <Search className="w-4 h-4 text-base-content/40 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            {localSearch && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content transition-colors p-0.5 rounded-full hover:bg-base-200 cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="btn btn-sm btn-primary rounded-xl text-xs font-bold px-4 h-9 shadow-md shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
          >
            Search
          </button>
        </form>
      </div>
    </div>
  );
});
