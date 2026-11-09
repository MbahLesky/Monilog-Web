import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "primary" | "secondary" | "accent";
  trendLabel?: string;
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "primary",
  trendLabel
}: MetricCardProps) {
  const toneClasses =
    tone === "secondary"
      ? "bg-secondary/12 text-secondary"
      : tone === "accent"
        ? "bg-accent/12 text-accent"
        : "bg-primary/12 text-primary";

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="space-y-1.5 min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="text-lg font-bold tracking-tight sm:text-xl truncate">{value}</p>
          {trendLabel ? (
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              {tone === "accent" ? (
                <ArrowDownRight className="size-3 text-accent shrink-0" />
              ) : (
                <ArrowUpRight className="size-3 text-secondary shrink-0" />
              )}
              <span className="truncate">{trendLabel}</span>
            </div>
          ) : null}
        </div>
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", toneClasses)}>
          <Icon className="size-4" />
        </div>
      </CardContent>
    </Card>
  );
}

