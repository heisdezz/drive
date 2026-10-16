import { For, type JSX } from "solid-js";
import { ContextMenu } from "@kobalte/core/context-menu";

export interface ContextAction {
  label: string;
  icon?: JSX.Element;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
  separatorBefore?: boolean;
}

interface AppContextMenuProps {
  trigger: JSX.Element;
  label: string;
  actions: ContextAction[];
}

export function AppContextMenu(props: AppContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenu.Trigger class="block min-w-0 h-full" aria-label={props.label}>
        {props.trigger}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content class="z-[100] min-w-44 rounded-xl border border-base-200 bg-base-100 p-1.5 text-base-content shadow-xl outline-none">
          <For each={props.actions}>
            {(action) => (
              <>
                {action.separatorBefore && <ContextMenu.Separator class="my-1 border-t border-base-200" />}
                <ContextMenu.Item
                  onSelect={action.onSelect}
                  disabled={action.disabled}
                  class={`flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium outline-none cursor-pointer data-[highlighted]:bg-base-200 data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed ${action.destructive ? "text-error data-[highlighted]:bg-error/10" : "text-base-content"}`}
                >
                  {action.icon}
                  <ContextMenu.ItemLabel>{action.label}</ContextMenu.ItemLabel>
                </ContextMenu.Item>
              </>
            )}
          </For>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu>
  );
}
