import { SearchIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { useDebouncedCallback } from "use-debounce";

export default function SearchBar({ value, onChange }: any) {
  const form = useForm({
    defaultValues: {
      search: value,
    },
  });

  const debouncedOnChange = useDebouncedCallback((val: string) => {
    onChange(val);
  }, 500);

  return (
    <form
      className="flex"
      onSubmit={form.handleSubmit((data) => {
        debouncedOnChange.cancel();
        onChange(data.search);
      })}
    >
      <input
        className="input md:input-lg"
        {...form.register("search")}
        placeholder="search here..."
        onChange={(e) => {
          form.setValue("search", e.target.value);
          debouncedOnChange(e.target.value);
        }}
      />
      <button
        className="btn ml-2 btn-primary md:btn-lg btn-square"
        type="submit"
      >
        <SearchIcon />
      </button>
    </form>
  );
}
