import { ChevronLeft, ChevronRight } from "lucide-react";

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
  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-900">
      <div className="text-xs text-slate-500 font-medium">
        Showing page <span className="text-white font-bold">{page + 1}</span> of{" "}
        <span className="text-white font-bold">{totalPages}</span> ({totalItems}{" "}
        items total)
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="btn btn-sm btn-outline border-slate-800 text-slate-300 hover:bg-base-100"
        >
          <ChevronLeft className="w-4 h-4" /> Prev
        </button>

        <div className="flex gap-1">
          {Array.from({ length: totalPages }).map((_, idx) => {
            // Show active, first, last, and neighboring pages
            if (
              idx === 0 ||
              idx === totalPages - 1 ||
              Math.abs(idx - page) <= 1
            ) {
              return (
                <button
                  key={idx}
                  onClick={() => onPageChange(idx)}
                  className={`btn btn-sm ${page === idx ? "btn-primary text-white" : "btn-ghost text-slate-400"}`}
                >
                  {idx + 1}
                </button>
              );
            }
            if (idx === 1 || idx === totalPages - 2) {
              return (
                <span key={idx} className="text-slate-600 px-1">
                  ...
                </span>
              );
            }
            return null;
          })}
        </div>

        <button
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          disabled={page === totalPages - 1}
          className="btn btn-sm btn-outline border-slate-800 text-slate-300 hover:bg-base-100"
        >
          Next <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
