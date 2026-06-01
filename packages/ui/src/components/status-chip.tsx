import { cn } from "../cn";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const tones: Record<Tone, string> = {
  success: "text-success bg-success/10",
  warning: "text-warning bg-warning/10",
  danger: "text-danger bg-danger/10",
  info: "text-info bg-info/10",
  neutral: "text-ink-2 bg-hover",
};

export function StatusChip({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
        tones[tone],
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", `bg-current`)} aria-hidden="true" />
      {children}
    </span>
  );
}
