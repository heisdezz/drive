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
  clear: () => set({ selected: new Set() }),
  selectMany: (ids) =>
    set((s) => {
      const next = new Set(s.selected);
      for (const id of ids) next.add(id);
      return { selected: next };
    }),
  deselectMany: (ids) =>
    set((s) => {
      const next = new Set(s.selected);
      for (const id of ids) next.delete(id);
      return { selected: next };
    }),
}));
