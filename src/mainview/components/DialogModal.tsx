import { onMount, JSX, Show } from "solid-js";
import { X } from "lucide-solid";

export interface ModalHandle {
  open: () => void;
  close: () => void;
}

interface ModalProps {
  children?: JSX.Element;
  actions?: JSX.Element;
  title?: string;
  ref?:
    | ModalHandle
    | { current: ModalHandle | null }
    | ((handle: ModalHandle) => void);
}

export default function DialogModal(props: ModalProps) {
  let modalRef: HTMLDialogElement | undefined;

  const handle: ModalHandle = {
    open: () => {
      modalRef?.showModal();
    },
    close: () => {
      modalRef?.close();
    },
  };

  onMount(() => {
    if (typeof props.ref === "function") {
      props.ref(handle);
    } else if (props.ref && typeof props.ref === "object") {
      (props.ref as any).current = handle;
    }
  });

  return (
    <dialog ref={modalRef} class="modal modal-middle">
      <div class="modal-box bg-base-100 fade border border text-white max-w-lg flex flex-col max-h-[90vh] rounded-2xl shadow-2xl relative p-0 overflow-hidden">
        <div class="flex border-b fade py-4 items-center px-6">
          <Show when={props.title}>
            <h3 class="font-bold text-lg text-white">{props.title}</h3>
          </Show>
          <form method="dialog" class="ml-auto">
            <button
              type="button"
              class="btn btn-sm btn-circle btn-ghost text-slate-400 hover:text-white hover:bg-base-100 cursor-pointer flex items-center justify-center"
              onClick={() => modalRef?.close()}
            >
              <X size={18} />
            </button>
          </form>
        </div>
        <Show when={props.children}>
          <div class="p-6 overflow-y-auto text-sm">{props.children}</div>
        </Show>
        <Show when={props.actions}>
          <div class="flex justify-end gap-2 p-4 bg-base-100 border-t border fade sticky bottom-0">
            {props.actions}
          </div>
        </Show>
      </div>
      <form method="dialog" class="modal-backdrop bg-black/60 bg-opacity-80">
        <button>close</button>
      </form>
    </dialog>
  );
}
