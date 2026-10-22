import { CheckCircle2, Clock3, CircleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
const STYLE = {
  neutral: "bg-muted text-foreground",
  pending: "border-warning/40 bg-warning/10 text-foreground",
  success: "border-success/30 bg-success/10 text-success",
  danger: "border-destructive/30 bg-destructive/5 text-destructive",
};
export function StatusBadge({
  children,
  tone = "neutral",
  icon,
  prefix,
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof STYLE;
  icon?: LucideIcon;
  prefix?: string;
  className?: string;
}) {
  const Icon: LucideIcon =
    icon ?? (tone === "success" ? CheckCircle2 : tone === "danger" ? CircleAlert : Clock3);
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        STYLE[tone],
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span>
        {prefix ? <span className="sr-only">{prefix}: </span> : null}
        {children}
      </span>
    </span>
  );
}
