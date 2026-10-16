import { createSignal } from "solid-js";

const [isSelecting, setIsSelecting] = createSignal(false);
const [selected, setSelected] = createSignal<Set<number>>(new Set<number>());

function start() {
  setIsSelecting(true);
  setSelected(new Set<number>());
}

function cancel() {
  setIsSelecting(false);
  setSelected(new Set<number>());
}

function toggle(id: number) {
  const current = selected();
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  setSelected(next);
}

function clear() {
  if (selected().size > 0) {
    setSelected(new Set<number>());
  }
}

function selectMany(ids: number[]) {
  const current = selected();
  const toAdd = ids.filter((id) => !current.has(id));
  if (toAdd.length === 0) return;
  const next = new Set(current);
  for (const id of toAdd) next.add(id);
  setSelected(next);
}

function deselectMany(ids: number[]) {
  const current = selected();
  const toRemove = ids.filter((id) => current.has(id));
  if (toRemove.length === 0) return;
  const next = new Set(current);
  for (const id of toRemove) next.delete(id);
  setSelected(next);
}

const state = {
  get isSelecting() {
    return isSelecting();
  },
  get selected() {
    return selected();
  },
  start,
  cancel,
  toggle,
  clear,
  selectMany,
  deselectMany,
};

export function useSelectionStore<T = any>(
  selector?: (s: typeof state) => T,
): any {
  if (selector) return selector(state);
  return state;
}

useSelectionStore.getState = () => state;
useSelectionStore.subscribe = (_listener: any) => {
  return () => {};
};

export {
  isSelecting,
  selected,
  start as startSelection,
  cancel as cancelSelection,
  toggle as toggleSelection,
  clear as clearSelection,
  selectMany,
  deselectMany,
};
