import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type PropsWithChildren,
} from "react";
import { X } from "lucide-react";

interface ModalProps extends PropsWithChildren {
  actions?: React.ReactNode;
  title?: string;
}

export interface ModalHandle {
  open: () => void;
  close: () => void;
}

const Modal = forwardRef<ModalHandle, ModalProps>(
  ({ children, actions, title }, ref) => {
    const modalRef = useRef<HTMLDialogElement>(null);

    useImperativeHandle(ref, () => ({
      open: () => {
        modalRef.current?.showModal();
      },
      close: () => {
        modalRef.current?.close();
      },
    }));

    return (
      <dialog ref={modalRef} className="modal modal-middle">
        <div className="modal-box bg-slate-950 border border-slate-900 text-white max-w-lg flex flex-col max-h-[90vh] rounded-2xl shadow-2xl relative p-0 overflow-hidden">
          <div className="flex border-b border-slate-900 py-4 items-center px-6">
            {title && <h3 className="font-bold text-lg text-white">{title}</h3>}
            <form method="dialog" className="ml-auto">
              <button
                type="button"
                className="btn btn-sm btn-circle btn-ghost text-slate-400 hover:text-white hover:bg-slate-900 cursor-pointer flex items-center justify-center"
                onClick={() => modalRef.current?.close()}
              >
                <X size={18} />
              </button>
            </form>
          </div>
          {children && <div className="p-6 overflow-y-auto text-sm">{children}</div>}
          {actions && (
            <div className="flex justify-end gap-2 p-4 bg-slate-950 border-t border-slate-900 sticky bottom-0">
              {actions}
            </div>
          )}
        </div>
        <form method="dialog" className="modal-backdrop bg-black/60 backdrop-blur-sm">
          <button>close</button>
        </form>
      </dialog>
    );
  },
);

Modal.displayName = "Modal";

export default Modal;
