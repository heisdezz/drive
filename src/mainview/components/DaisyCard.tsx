import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";

interface DaisyCardProps {
  title: string;
  emoji?: string;
  icon?: LucideIcon;
  children: ReactNode;
  borderColor?: string;
}

export default function DaisyCard({
  title,
  emoji,
  icon: Icon,
  children,
  borderColor = "hover:border-primary/40",
}: DaisyCardProps) {
  return (
    <div
      className={`card bg-base-100/40 border border-slate-900 ${borderColor} hover:-translate-y-1 transition-all duration-300 group`}
    >
      <div className="card-body p-6">
        <div className="mb-2 group-hover:scale-110 transition-transform duration-300">
          {Icon ? (
            <Icon className="w-8 h-8 text-primary group-hover:text-secondary transition-colors duration-300" />
          ) : (
            <div className="text-3xl">{emoji}</div>
          )}
        </div>
        <h4 className="card-title text-white">{title}</h4>
        <div className="text-slate-400 text-sm leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
