import { useEffect, useState } from "react";
import { useGame } from "@/game/GameProvider";
import { RESOURCE_META } from "@/game/resources";
import { BALANCE } from "@/game/balance";
import type { ResourceKey } from "@/game/types";
import { cn } from "@/lib/utils";

function fmtDuration(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  if (h > 0) return `${h}h ${String(rem).padStart(2, "0")}m`;
  return `${rem}m`;
}

/** Consumption per hour: survivor + assigned NPCs at 25 % factor. */
function upkeepPerHour(npcCount: number): number {
  return BALANCE.survivorUpkeepPerHour * (1 + npcCount * BALANCE.npcConsumptionFactor);
}

const UNIT_KEYS: ResourceKey[] = ["materiales", "medicamentos", "componentes", "dinero"];

/** Materials/components used by one building level-up (for the "needed for" hint). */
function buildingHint(key: ResourceKey): string | null {
  if (key === "materiales") return "Construcciones";
  if (key === "componentes") return "Construcciones";
  if (key === "medicamentos") return "Usar medicina (+1 Salud)";
  return null;
}

export function MochilaTab() {
  const { state } = useGame();
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!state) return null;
  const upkeep = upkeepPerHour(state.npcs.length);

  const timeRows = (
    [
      { key: "comida" as const, value: state.foodMin, danger: state.foodMin < 120 },
      { key: "agua" as const, value: state.waterMin, danger: state.waterMin < 120 },
    ]
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-[10px] uppercase tracking-[0.25em] text-subtle">
        Todo lo que llevas encima y lo acumulado por tu equipo
      </p>

      {/* survival timers */}
      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-3">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-300">Supervivencia</h3>
        <div className="flex flex-col gap-2">
          {timeRows.map(({ key, value, danger }) => {
            const meta = RESOURCE_META[key];
            return (
              <div key={key} className="flex items-center justify-between rounded-sm border border-white/5 bg-black/40 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">{meta.icon}</span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-zinc-200">{meta.label}</p>
                    <p className={cn("text-[10px]", danger ? "text-red-400" : "text-subtle")}>
                      −{Math.round(upkeep)} min/h · {state.npcs.length} bocas
                    </p>
                    <p className="text-[10px] text-subtle">+{BALANCE.survivorUpkeepPerHour} min/h por superviviente · NPC ×{BALANCE.npcConsumptionFactor}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn("text-lg font-black tabular-nums", danger ? "text-red-400" : "text-zinc-100")}>
                    {fmtDuration(value)}
                  </p>
                  {danger && <p className="text-[9px] font-bold uppercase tracking-wider text-red-400">Crítico</p>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* unit resources */}
      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-3">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-300">Almacén</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {UNIT_KEYS.map((key) => {
            const meta = RESOURCE_META[key];
            const value = Math.floor(state.resources[key]);
            const hint = buildingHint(key);
            return (
              <div key={key} className="flex flex-col gap-0.5 rounded-sm border border-white/5 bg-black/40 px-3 py-2">
                <span className="text-base">{meta.icon}</span>
                <p className="text-2xl font-black tabular-nums text-zinc-100">{value.toLocaleString("es")}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{meta.label}</p>
                {hint && <p className="text-[9px] text-subtle">{hint}</p>}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-subtle">
          ⚡ Energía: {Math.floor(state.resources.energia)}/24 · regenera 1 cada {BALANCE.energyRegenMinutesPerPoint} min, incluso con la app cerrada.
        </p>
      </section>

      {/* NPC cumulative production */}
      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-3">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-300">Producido por tu equipo</h3>
        {(() => {
          const producers = state.npcs.filter((n) =>
            Object.values(n.productionTotals).some((v) => v > 0),
          );
          if (producers.length === 0) {
            return (
              <p className="text-xs text-subtle">
                Aún no hay producción acumulada. Asigna supervivientes a zonas en Equipo.
              </p>
            );
          }
          return (
            <div className="flex flex-col gap-2">
              {producers.map((npc) => {
                const totals = npc.productionTotals;
                const entries = (Object.keys(totals) as ResourceKey[]).filter((k) => totals[k] > 0);
                return (
                  <div key={npc.id} className="flex items-start gap-3 rounded-sm border border-white/5 bg-black/40 px-3 py-2">
                    <img
                      src={npc.portrait}
                      alt={npc.name}
                      className="size-9 shrink-0 rounded-sm border border-zinc-800 object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-zinc-200">
                        {npc.id} «{npc.alias}»
                      </p>
                      <p className="text-[10px] uppercase tracking-wider text-subtle">
                        {npc.assignedZoneId ? `Zona ${npc.assignedZoneId.padStart(2, "0")}` : "Sin asignar"}
                      </p>
                      <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] tabular-nums text-zinc-400">
                        {entries.map((k) => (
                          <span key={k}>
                            {RESOURCE_META[k].icon} {fmtResourceTotal(k, totals[k])}
                          </span>
                        ))}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </section>
    </div>
  );
}

function fmtResourceTotal(key: ResourceKey, amount: number): string {
  const v = Math.floor(amount);
  if (key === "comida" || key === "agua") return `${v} min`;
  if (key === "dinero") return `$${v}`;
  return `${v}`;
}
