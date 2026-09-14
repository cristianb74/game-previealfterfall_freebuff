import { Progress } from "@/components/ui/progress";
import { BALANCE } from "@/game/balance";
import { ZONES, getZone } from "@/game/zones";
import { useGame } from "@/game/GameProvider";
import { currentEnergy } from "@/game/energySystem";
import type { GameState } from "@/game/types";
import { cn } from "@/lib/utils";

function fmtDuration(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h > 0) return `${h}h ${String(rem).padStart(2, "0")}m`;
  return `${rem}m`;
}

function SurvivalBar({
  label,
  value,
  max,
  display,
  color,
  danger,
}: {
  label: string;
  value: number;
  max: number;
  display: string;
  color: string;
  danger?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{label}</span>
        <span className={cn("text-[10px] font-bold tabular-nums", danger ? "text-red-400" : "text-zinc-300")}>
          {display}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/80">
        <div
          className={cn("h-full rounded-full transition-all", danger ? "animate-pulse" : "")}
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function nextLockedZone(state: GameState) {
  return ZONES.find((z) => state.expTotal < z.unlockExp) ?? null;
}

export function HUD() {
  const { state } = useGame();
  if (!state) return null;
  const now = Date.now();
  const energy = currentEnergy(state, now);
  const nextZone = nextLockedZone(state);
  const assigned = state.npcs.filter((n) => n.assignedZoneId).length;

  const expForNext = nextZone ? nextZone.unlockExp : state.expTotal;
  const prevUnlock = nextZone
    ? ZONES.filter((z) => z.id < nextZone.id).reduce((acc, z) => Math.max(acc, z.unlockExp), 0)
    : 0;
  const zonePct =
    nextZone != null
      ? Math.max(0, Math.min(100, ((state.expTotal - prevUnlock) / Math.max(1, expForNext - prevUnlock)) * 100))
      : 100;

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-[#0c0e0f]/95 px-3 pb-2 pt-2 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black tracking-[0.3em] text-zinc-100">AFTERFALL</span>
            <span className="text-[9px] uppercase tracking-[0.2em] text-green-500/80">
              ZONA {getZone(state.currentZoneId).id}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            <span className="tabular-nums">{Math.floor(state.expTotal).toLocaleString("es")} EXP</span>
            <span className="text-green-500 tabular-nums">{Math.floor(energy)}/{BALANCE.maxEnergy} ⚡</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
          <SurvivalBar
            label="Comida"
            value={state.foodMin}
            max={BALANCE.startingFoodMin * 1.5}
            display={fmtDuration(state.foodMin)}
            color="#a3e635"
            danger={state.foodMin < 120}
          />
          <SurvivalBar
            label="Agua"
            value={state.waterMin}
            max={BALANCE.startingWaterMin * 1.5}
            display={fmtDuration(state.waterMin)}
            color="#38bdf8"
            danger={state.waterMin < 120}
          />
          <SurvivalBar
            label="Energía"
            value={energy}
            max={BALANCE.maxEnergy}
            display={`${Math.floor(energy)}/24`}
            color="#22c55e"
          />
          <SurvivalBar
            label="Salud"
            value={state.health}
            max={BALANCE.maxHealth}
            display={`${Math.round(state.health)}/100`}
            color={state.health < 30 ? "#ef4444" : "#e4e4e7"}
            danger={state.health < 30}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <img
              src={state.survivor.portrait}
              alt={state.survivor.name}
              className="size-8 shrink-0 rounded-sm border border-zinc-800 object-cover"
            />
            <div className="min-w-0">
              <p className="truncate text-[10px] font-bold uppercase tracking-wider text-zinc-300">
                Superviviente · {state.survivor.name}
              </p>
              <p className="truncate text-[9px] uppercase tracking-wider text-zinc-500">
                Equipo · {state.npcs.length} · {assigned} activos
              </p>
            </div>
          </div>
          <div className="w-36 shrink-0 sm:w-52">
            <div className="mb-0.5 flex items-baseline justify-between">
              <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                {nextZone ? "Próxima zona" : "Todas las zonas"}
              </span>
              <span className="text-[9px] tabular-nums text-zinc-500">
                {nextZone
                  ? `${Math.floor(state.expTotal).toLocaleString("es")}/${nextZone.unlockExp.toLocaleString("es")}`
                  : "20/20"}
              </span>
            </div>
            <Progress value={zonePct} className="h-1.5 bg-zinc-800" />
          </div>
        </div>

        <div className="flex items-center gap-3 overflow-x-auto text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          <span>⚒ {Math.floor(state.resources.materiales)}</span>
          <span>✚ {Math.floor(state.resources.medicamentos)}</span>
          <span>⚙ {Math.floor(state.resources.componentes)}</span>
          <span className="text-green-500">$ {Math.floor(state.resources.dinero)}</span>
        </div>
      </div>
    </header>
  );
}
