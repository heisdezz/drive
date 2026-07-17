import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { useDebouncedCallback } from "use-debounce";

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filterType: "all" | "images" | "videos";
  onFilterChange: (filter: "all" | "images" | "videos") => void;
}

export function FilterBar({
  searchQuery,
  onSearchChange,
  filterType,
  onFilterChange,
}: FilterBarProps) {
  const [localSearch, setLocalSearch] = useState(searchQuery);

  // Sync local input state with query param if it changes externally
  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  // Debounce the change callback
  const debouncedSearch = useDebouncedCallback((val: string) => {
    onSearchChange(val);
  }, 500);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalSearch(val);
    debouncedSearch(val);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    debouncedSearch.cancel(); // Cancel any pending debounced search
    onSearchChange(localSearch);
  };

  return (
    <div className="p-4 rounded-xl bg-base-100/40 border border-slate-900/80 flex flex-col md:flex-row gap-3 items-center justify-between">
      {/* File Type Filter Tabs */}
      <div className="tabs tabs-boxed bg-slate-950 border border-slate-900/50 p-0.5">
        <button
          onClick={() => onFilterChange("all")}
          className={`tab tab-sm font-bold rounded-lg ${filterType === "all" ? "tab-active text-white bg-base-100" : "text-slate-400"}`}
        >
          All
        </button>
        <button
          onClick={() => onFilterChange("images")}
          className={`tab tab-sm font-bold rounded-lg ${filterType === "images" ? "tab-active text-white bg-base-100" : "text-slate-400"}`}
        >
          Photos
        </button>
        <button
          onClick={() => onFilterChange("videos")}
          className={`tab tab-sm font-bold rounded-lg ${filterType === "videos" ? "tab-active text-white bg-base-100" : "text-slate-400"}`}
        >
          Videos
        </button>
      </div>

      {/* Search Field with Button */}
      <form
        onSubmit={handleSubmit}
        className="flex w-full md:w-80 items-center join bg-slate-950 border border-slate-900/80 focus-within:border-primary/60 rounded-xl overflow-hidden transition-colors"
      >
        <div className="relative flex-grow">
          <input
            type="text"
            placeholder="Search media files..."
            value={localSearch}
            onChange={handleChange}
            className="input input-sm w-full bg-transparent border-none text-xs focus:outline-none focus:ring-0 text-white pl-8 h-8"
          />
          <Search className="w-3.5 h-3.5 text-slate-600 absolute left-2.5 top-2.5" />
        </div>
        <button
          type="submit"
          className="btn btn-sm btn-primary rounded-none font-bold text-xs h-8 border-none px-4 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          Search
        </button>
      </form>
    </div>
  );
}
