import { createSignal, createEffect, For, Show } from "solid-js";
import { ChevronLeft, ChevronRight, CornerDownLeft } from "lucide-solid";

interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

export function Pagination(props: PaginationProps) {
  const [jumpPage, setJumpPage] = createSignal(String(props.page + 1));

  createEffect(() => {
    setJumpPage(String(props.page + 1));
  });

  const handleJumpSubmit = () => {
    const pageNum = parseInt(jumpPage(), 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= props.totalPages) {
      props.onPageChange(pageNum - 1);
    } else {
      setJumpPage(String(props.page + 1));
    }
  };

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const range = 1;

    for (let i = 0; i < props.totalPages; i++) {
      if (
        i === 0 ||
        i === props.totalPages - 1 ||
        Math.abs(i - props.page) <= range
      ) {
        pages.push(i);
      } else if (i === 1 || i === props.totalPages - 2) {
        if (pages[pages.length - 1] !== "...") {
          pages.push("...");
        }
      }
    }
    return pages;
  };

  return (
    <Show when={props.totalPages > 1}>
      <div class="flex flex-col md:flex-row items-center justify-between gap-4 py-4 border-t border-base-200/50 bg-base-300/10 px-4 rounded-xl">
        {/* Information text */}
        <div class="text-xs text-base-content/50 font-medium">
          Showing page{" "}
          <span class="text-base-content font-extrabold">{props.page + 1}</span>{" "}
          of{" "}
          <span class="text-base-content font-extrabold">
            {props.totalPages}
          </span>{" "}
          <span class="text-base-content/30 font-normal">|</span>{" "}
          <span class="text-primary font-bold">{props.totalItems}</span> items
          total
        </div>

        <div class="flex flex-wrap items-center gap-3">
          {/* Button group */}
          <div class="join border border-base-300 shadow-sm bg-base-100 rounded-lg overflow-hidden">
            {/* Prev button */}
            <button
              onClick={() => props.onPageChange(Math.max(0, props.page - 1))}
              disabled={props.page === 0}
              class="join-item btn btn-sm btn-ghost gap-1 font-bold text-xs disabled:bg-transparent disabled:text-base-content/20"
            >
              <ChevronLeft class="w-3.5 h-3.5" />
              <span class="hidden sm:inline">Prev</span>
            </button>

            {/* Page numbers */}
            <For each={getPageNumbers()}>
              {(item) => {
                if (item === "...") {
                  return (
                    <span class="join-item btn btn-sm btn-ghost no-animation pointer-events-none text-base-content/30">
                      ...
                    </span>
                  );
                }

                const pageIdx = item as number;
                return (
                  <button
                    onClick={() => props.onPageChange(pageIdx)}
                    class={`join-item btn btn-sm font-bold text-xs ${
                      props.page === pageIdx
                        ? "btn-primary text-primary-content hover:btn-primary"
                        : "btn-ghost text-base-content/75 hover:bg-base-200"
                    }`}
                  >
                    {pageIdx + 1}
                  </button>
                );
              }}
            </For>

            {/* Next button */}
            <button
              onClick={() =>
                props.onPageChange(
                  Math.min(props.totalPages - 1, props.page + 1),
                )
              }
              disabled={props.page === props.totalPages - 1}
              class="join-item btn btn-sm btn-ghost gap-1 font-bold text-xs disabled:bg-transparent disabled:text-base-content/20"
            >
              <span class="hidden sm:inline">Next</span>
              <ChevronRight class="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Go to page input */}
          <div class="flex items-center gap-1 bg-base-100 border border-base-300 shadow-sm px-2.5 py-1 rounded-lg">
            <span class="text-[10px] text-base-content/40 font-bold uppercase tracking-wider">
              Go to
            </span>
            <div class="relative flex items-center">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={jumpPage()}
                onInput={(e) => {
                  const val = e.currentTarget.value;
                  if (val === "" || /^[0-9]+$/.test(val)) {
                    setJumpPage(val);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleJumpSubmit();
                  }
                }}
                class="w-10 text-center text-xs font-black text-base-content focus:outline-none bg-transparent"
              />
            </div>
            <button
              onClick={handleJumpSubmit}
              disabled={
                !jumpPage() ||
                parseInt(jumpPage(), 10) < 1 ||
                parseInt(jumpPage(), 10) > props.totalPages
              }
              class="btn btn-xs btn-primary btn-square hover:scale-105 active:scale-95 transition-all shadow-md shadow-primary/20 flex items-center justify-center cursor-pointer"
              title="Go to page"
            >
              <CornerDownLeft class="w-3 h-3 text-primary-content" />
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
