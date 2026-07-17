import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, CornerDownLeft } from "lucide-react";

interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  page,
  totalPages,
  totalItems,
  onPageChange,
}: PaginationProps) {
  const [jumpPage, setJumpPage] = useState(String(page + 1));

  useEffect(() => {
    setJumpPage(String(page + 1));
  }, [page]);

  if (totalPages <= 1) return null;

  const handleJumpSubmit = () => {
    const pageNum = parseInt(jumpPage, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      onPageChange(pageNum - 1);
    } else {
      setJumpPage(String(page + 1));
    }
  };

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const range = 1; // Number of pages to show around current page
    
    for (let i = 0; i < totalPages; i++) {
      if (
        i === 0 ||
        i === totalPages - 1 ||
        Math.abs(i - page) <= range
      ) {
        pages.push(i);
      } else if (
        i === 1 ||
        i === totalPages - 2
      ) {
        if (pages[pages.length - 1] !== "...") {
          pages.push("...");
        }
      }
    }
    return pages;
  };

  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-4 py-4 border-t border-base-200/50 bg-base-300/10 px-4 rounded-xl">
      {/* Information text */}
      <div className="text-xs text-base-content/50 font-medium">
        Showing page <span className="text-base-content font-extrabold">{page + 1}</span> of{" "}
        <span className="text-base-content font-extrabold">{totalPages}</span>{" "}
        <span className="text-base-content/30 font-normal">|</span> <span className="text-primary font-bold">{totalItems}</span> items total
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Button group */}
        <div className="join border border-base-300 shadow-sm bg-base-100 rounded-lg overflow-hidden">
          {/* Prev button */}
          <button
            onClick={() => onPageChange(Math.max(0, page - 1))}
            disabled={page === 0}
            className="join-item btn btn-sm btn-ghost gap-1 font-bold text-xs disabled:bg-transparent disabled:text-base-content/20"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Prev</span>
          </button>

          {/* Page numbers */}
          {getPageNumbers().map((item, idx) => {
            if (item === "...") {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="join-item btn btn-sm btn-ghost no-animation pointer-events-none text-base-content/30"
                >
                  ...
                </span>
              );
            }

            const pageIdx = item as number;
            return (
              <button
                key={pageIdx}
                onClick={() => onPageChange(pageIdx)}
                className={`join-item btn btn-sm font-bold text-xs ${
                  page === pageIdx
                    ? "btn-primary text-primary-content hover:btn-primary"
                    : "btn-ghost text-base-content/75 hover:bg-base-200"
                }`}
              >
                {pageIdx + 1}
              </button>
            );
          })}

          {/* Next button */}
          <button
            onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
            disabled={page === totalPages - 1}
            className="join-item btn btn-sm btn-ghost gap-1 font-bold text-xs disabled:bg-transparent disabled:text-base-content/20"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Go to page input */}
        <div className="flex items-center gap-1 bg-base-100 border border-base-300 shadow-sm px-2.5 py-1 rounded-lg">
          <span className="text-[10px] text-base-content/40 font-bold uppercase tracking-wider">Go to</span>
          <div className="relative flex items-center">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={jumpPage}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "" || /^[0-9]+$/.test(val)) {
                  setJumpPage(val);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleJumpSubmit();
                }
              }}
              className="w-10 text-center text-xs font-black text-base-content focus:outline-none bg-transparent"
            />
          </div>
          <button
            onClick={handleJumpSubmit}
            disabled={!jumpPage || parseInt(jumpPage, 10) < 1 || parseInt(jumpPage, 10) > totalPages}
            className="btn btn-xs btn-primary btn-square hover:scale-105 active:scale-95 transition-all shadow-md shadow-primary/20 flex items-center justify-center cursor-pointer"
            title="Go to page"
          >
            <CornerDownLeft className="w-3 h-3 text-primary-content" />
          </button>
        </div>
      </div>
    </div>
  );
}
