import { createSignal, createEffect, Show } from "solid-js";
import {
  Search,
  X,
  LayoutGrid,
  Image,
  Film,
  RotateCcw,
  Filter,
} from "lucide-solid";

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

export function FilterBar(props: FilterBarProps) {
  const [localSearch, setLocalSearch] = createSignal(props.searchQuery);
  let timer: any = null;

  createEffect(() => {
    setLocalSearch(props.searchQuery);
  });

  const handleInput = (val: string) => {
    setLocalSearch(val);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      props.onSearchChange(val);
    }, 500);
  };

  const handleClearSearch = () => {
    if (timer) clearTimeout(timer);
    setLocalSearch("");
    props.onSearchChange("");
  };

  const handleResetAll = () => {
    handleClearSearch();
    props.onFilterChange("all");
    if (props.onSortByChange) props.onSortByChange("date");
    if (props.onToggleSortOrder && props.sortOrder === "asc")
      props.onToggleSortOrder();
  };

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (timer) clearTimeout(timer);
    props.onSearchChange(localSearch());
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      handleClearSearch();
    }
  };

  const isFiltered = () =>
    props.filterType !== "all" ||
    props.searchQuery.trim() !== "" ||
    (props.sortBy && props.sortBy !== "date") ||
    (props.sortOrder && props.sortOrder !== "desc");

  return (
    <div class="p-4 rounded-2xl bg-base-200/40 border border-base-200/80 shadow-lg flex flex-col md:flex-row gap-4 items-center justify-between transition-all duration-300">
      {/* Left section: Filter Type Segmented Control & Active Reset Button */}
      <div class="flex flex-wrap items-center gap-3 w-full md:w-auto">
        <div class="p-1 rounded-xl bg-base-300/80 border border-base-200/60 flex items-center gap-1 shadow-inner">
          <button
            type="button"
            onClick={() => props.onFilterChange("all")}
            class={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              props.filterType === "all"
                ? "bg-primary text-primary-content shadow-md shadow-primary/20 scale-[1.02]"
                : "text-base-content/60 hover:text-base-content hover:bg-base-100/50"
            }`}
          >
            <LayoutGrid class="w-3.5 h-3.5" />
            <span>All</span>
          </button>

          <button
            type="button"
            onClick={() => props.onFilterChange("images")}
            class={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              props.filterType === "images"
                ? "bg-primary text-primary-content shadow-md shadow-primary/20 scale-[1.02]"
                : "text-base-content/60 hover:text-base-content hover:bg-base-100/50"
            }`}
          >
            <Image class="w-3.5 h-3.5" />
            <span>Photos</span>
          </button>

          <button
            type="button"
            onClick={() => props.onFilterChange("videos")}
            class={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              props.filterType === "videos"
                ? "bg-primary text-primary-content shadow-md shadow-primary/20 scale-[1.02]"
                : "text-base-content/60 hover:text-base-content hover:bg-base-100/50"
            }`}
          >
            <Film class="w-3.5 h-3.5" />
            <span>Videos</span>
          </button>
        </div>

        {/* Sort By Dropdown & Direction Toggle */}
        <Show when={props.onSortByChange}>
          <div class="flex items-center gap-2">
            <span class="text-xs text-base-content/60 font-semibold hidden sm:inline">
              Sort:
            </span>
            <select
              value={props.sortBy || "date"}
              onChange={(e) =>
                props.onSortByChange?.(
                  e.currentTarget.value as "date" | "name" | "size",
                )
              }
              class="select select-bordered select-sm text-xs bg-base-100/60 border-base-300 text-base-content/80 rounded-xl focus:outline-none focus:border-primary/60 cursor-pointer h-9"
            >
              <option value="date">Date Added</option>
              <option value="name">File Name</option>
              <option value="size">File Size</option>
            </select>

            <Show when={props.onToggleSortOrder}>
              <button
                type="button"
                onClick={props.onToggleSortOrder}
                class="btn btn-sm btn-outline border-base-300 text-base-content/80 hover:bg-base-100 px-3 cursor-pointer font-bold flex items-center gap-1 rounded-xl h-9"
                title={
                  props.sortOrder === "asc"
                    ? "Ascending order"
                    : "Descending order"
                }
              >
                {props.sortOrder === "asc" ? (
                  <span class="text-xs">ASC ↑</span>
                ) : (
                  <span class="text-xs">DESC ↓</span>
                )}
              </button>
            </Show>
          </div>
        </Show>

        <Show when={isFiltered()}>
          <button
            type="button"
            onClick={handleResetAll}
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-error/10 hover:bg-error/20 border border-error/20 text-error text-xs font-semibold transition-all hover:scale-105 active:scale-95 cursor-pointer animate-fade-in"
            title="Reset filters, search, and sorting"
          >
            <RotateCcw class="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </Show>
      </div>

      {/* Right section: Search input form & total items badge */}
      <div class="flex items-center gap-3 w-full md:w-auto">
        <Show when={props.totalItems !== undefined}>
          <div class="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-base-100/60 border border-base-200 text-xs font-mono text-base-content/70">
            <Filter class="w-3 h-3 text-primary" />
            <span>
              <strong class="text-base-content">{props.totalItems}</strong>{" "}
              items
            </span>
          </div>
        </Show>

        <form
          onSubmit={handleSubmit}
          class="flex w-full md:w-80 items-center gap-2"
        >
          <div class="relative flex-grow">
            <input
              type="text"
              placeholder="Search media files... (Esc to clear)"
              value={localSearch()}
              onInput={(e) => handleInput(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
              class="input input-sm w-full bg-base-300/60 border border-base-200/80 rounded-xl text-xs text-base-content pl-9 pr-8 h-9 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 placeholder:text-base-content/40 transition-all"
            />
            <Search class="w-4 h-4 text-base-content/40 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Show when={localSearch()}>
              <button
                type="button"
                onClick={handleClearSearch}
                class="absolute right-2.5 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content transition-colors p-0.5 rounded-full hover:bg-base-200 cursor-pointer"
                aria-label="Clear search"
              >
                <X class="w-3.5 h-3.5" />
              </button>
            </Show>
          </div>
          <button
            type="submit"
            class="btn btn-sm btn-primary rounded-xl text-xs font-bold px-4 h-9 shadow-md shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
          >
            Search
          </button>
        </form>
      </div>
    </div>
  );
}
