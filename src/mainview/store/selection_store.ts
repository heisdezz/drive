import { create } from "zustand";

interface SelectionState {
  isSelecting: boolean;
  selected: Set<number>;
  start: () => void;
  cancel: () => void;
  toggle: (id: number) => void;
  clear: () => void;
  selectMany: (ids: number[]) => void;
  deselectMany: (ids: number[]) => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  isSelecting: false,
  selected: new Set<number>(),
  start: () => set({ isSelecting: true, selected: new Set() }),
  cancel: () => set({ isSelecting: false, selected: new Set() }),
  toggle: (id) =>
    set((s) => {
      const next = new Set(s.selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selected: next };
    }),
  clear: () =>
    set((s) => (s.selected.size === 0 ? s : { selected: new Set() })),
  selectMany: (ids) =>
    set((s) => {
      // Skip copy + re-render if every id is already selected.
      const toAdd = ids.filter((id) => !s.selected.has(id));
      if (toAdd.length === 0) return s;
      const next = new Set(s.selected);
      for (const id of toAdd) next.add(id);
      return { selected: next };
    }),
  deselectMany: (ids) =>
    set((s) => {
      // Skip copy + re-render if none of the ids are currently selected.
      const toRemove = ids.filter((id) => s.selected.has(id));
      if (toRemove.length === 0) return s;
      const next = new Set(s.selected);
      for (const id of toRemove) next.delete(id);
      return { selected: next };
    }),
}));
