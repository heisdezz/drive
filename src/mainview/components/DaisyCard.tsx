import { JSX } from "solid-js";

interface DaisyCardProps {
  title: string;
  emoji?: string;
  icon?: (props: any) => JSX.Element;
  children: JSX.Element;
  borderColor?: string;
}

export default function DaisyCard(props: DaisyCardProps) {
  const borderColor = () => props.borderColor || "hover:border-primary/40";

  return (
    <div
      class={`card bg-base-100/40 border border-slate-900 ${borderColor()} hover:-translate-y-1 transition-all duration-300 group`}
    >
      <div class="card-body p-6">
        <div class="mb-2 group-hover:scale-110 transition-transform duration-300">
          {props.icon ? (
            <props.icon class="w-8 h-8 text-primary group-hover:text-secondary transition-colors duration-300" />
          ) : (
            <div class="text-3xl">{props.emoji}</div>
          )}
        </div>
        <h4 class="card-title text-white">{props.title}</h4>
        <div class="text-slate-400 text-sm leading-relaxed">
          {props.children}
        </div>
      </div>
    </div>
  );
}
