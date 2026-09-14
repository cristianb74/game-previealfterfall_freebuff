import { STAT_META, STAT_ORDER } from "@/game/resources";
import type { Stats } from "@/game/types";
import { cn } from "@/lib/utils";

export function StatsGrid({ stats, className }: { stats: Stats; className?: string }) {
  return (
    <div className={cn("grid grid-cols-3 gap-1.5", className)}>
      {STAT_ORDER.map((k) => (
        <div
          key={k}
          className="flex items-center justify-between rounded-sm border border-white/5 bg-black/40 px-2 py-1"
        >
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">{STAT_META[k].short}</span>
          <span className="text-xs font-semibold text-zinc-200 tabular-nums">{stats[k]}</span>
        </div>
      ))}
    </div>
  );
}
