import { createSignal, createEffect } from "solid-js";
import { Search } from "lucide-solid";

export default function SearchBar(props: {
  value?: string;
  onChange: (val: string) => void;
}) {
  const [val, setVal] = createSignal(props.value || "");
  let timer: any = null;

  createEffect(() => {
    setVal(props.value || "");
  });

  const handleInput = (newVal: string) => {
    setVal(newVal);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      props.onChange(newVal);
    }, 500);
  };

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (timer) clearTimeout(timer);
    props.onChange(val());
  };

  return (
    <form class="flex" onSubmit={handleSubmit}>
      <input
        class="input input-sm w-full bg-base-100/60 border-base-300 text-xs text-base-content"
        value={val()}
        placeholder="search here..."
        onInput={(e) => handleInput(e.currentTarget.value)}
      />
      <button class="btn btn-sm ml-2 btn-primary btn-square" type="submit">
        <Search class="size-4" />
      </button>
    </form>
  );
}
