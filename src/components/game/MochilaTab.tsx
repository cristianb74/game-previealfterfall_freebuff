import { useEffect, useState } from "react";
import { useGame } from "@/game/GameProvider";
import { RESOURCE_META } from "@/game/resources";
import { BALANCE, teamFoodUpkeepPerHour, teamWaterUpkeepPerHour } from "@/game/balance";
import { getZone, ZONES } from "@/game/zones";
import { RECIPE_BY_ID } from "@/game/crafting/recipes";import {
  activeAssignments,
  buffRemainingMs,
  craftedItemKind,
} from "@/game/crafting/craftedEffects";
import type { CraftedAssignment, ResourceKey } from "@/game/types";
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

/** Consumption per hour: survivor + recruited NPCs at NPC_CONSUMPTION_FACTOR
 *  (con sus consumptionMultiplier — los candidatos no consumen). */
function upkeepPerHour(npcRates: { food: number; water: number }): number {
  return npcRates.food + npcRates.water;
}

const UNIT_KEYS: ResourceKey[] = ["materiales", "medicamentos", "componentes", "dinero"];

/** Materials/components used by one building level-up (for the "needed for" hint). */
function buildingHint(key: ResourceKey): string | null {
  if (key === "materiales") return "Construcciones";
  if (key === "componentes") return "Construcciones";
  return null;
}

/** "Zona 03 · 1h 12m" / "Inés «Rastreadora» · 45m" for badges and lists. */
function assignmentTargetLabel(a: CraftedAssignment, npcName?: (id: string) => string): string {
  if (a.targetType === "zone") {
    return `Zona ${a.targetId.padStart(2, "0")}`;
  }
  return npcName ? npcName(a.targetId) : a.targetId;
}

export function MochilaTab() {
  const {
    state,
    useMedicine,
    useCraftedItem,
    assignCraftedItem,
    cancelCraftedAssignment,
    maxUnlockedZoneId,
  } = useGame();
  const [, force] = useState(0);
  // 1 s re-render: assignment countdowns tick like the exploration ones.
  useEffect(() => {
    const id = window.setInterval(() => force((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  // ASIGNAR panel state: which recipe is open + zone/NPC mode.
  const [assignPanelFor, setAssignPanelFor] = useState<string | null>(null);
  const [assignMode, setAssignMode] = useState<"zone" | "npc">("zone");

  if (!state) return null;
  const upkeep = upkeepPerHour({
    food: BALANCE.FOOD_PER_HOUR_PLAYER + teamFoodUpkeepPerHour(state.npcs),
    water: BALANCE.WATER_PER_HOUR_PLAYER + teamWaterUpkeepPerHour(state.npcs),
  });
  const now = nowReal();

  const npcName = (id: string) => {
    const npc = state.npcs.find((n) => n.id === id);
    return npc ? `${npc.name} «${npc.alias}»` : id;
  };
  const assignments = activeAssignments(state, now);
  const assignedOn = (recipeId: string) => assignments.filter((a) => a.recipeId === recipeId);
  const openRecipe = assignPanelFor != null ? RECIPE_BY_ID[assignPanelFor] : null;
  const accessibleZones = ZONES.filter((z) => z.id <= maxUnlockedZoneId);
  const activeNpcs = state.npcs.filter((n) => (n.status ?? "active") === "active");

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
                    <p className="text-[10px] text-subtle">+{BALANCE.FOOD_PER_HOUR_PLAYER} min/h por superviviente · NPC ×{BALANCE.NPC_CONSUMPTION_FACTOR}</p>
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
            const isMedicine = key === "medicamentos";
            const missingHealth = Math.ceil(BALANCE.maxHealth - state.health);
            const unitsForMissing = Math.min(value, missingHealth);
            const canHeal = isMedicine && value >= 1 && state.health < BALANCE.maxHealth;
            const quickAmounts = [5, 10, 25].filter((q) => q <= value);
            return (
              <div key={key} className="flex flex-col gap-0.5 rounded-sm border border-white/5 bg-black/40 px-3 py-2">
                <span className="text-base">{meta.icon}</span>
                <p className="text-2xl font-black tabular-nums text-zinc-100">{value.toLocaleString("es")}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{meta.label}</p>
                {isMedicine ? (                  <div className="mt-0.5 flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={useMedicine}
                      disabled={!canHeal}
                      title={
                        canHeal
                          ? `Consume hasta ${unitsForMissing} de tus ${value} medicamentos para llenar los ${missingHealth} puntos de salud que faltan`
                          : value < 1
                            ? "Sin medicamentos"
                            : "Salud completa"
                      }
                      className={cn(
                        "flex h-6 cursor-pointer items-center justify-center rounded-sm border text-[9px] font-bold uppercase tracking-wider transition-colors",
                        canHeal
                          ? "border-red-500/50 bg-red-950/40 text-red-300 hover:bg-red-900/50 hover:text-red-200 active:bg-red-900/60"
                          : "cursor-not-allowed border-zinc-800 bg-black/20 text-zinc-600",
                      )}
                    >
                      ✚ Curar al máximo
                    </button>
                    {canHeal && quickAmounts.length > 0 && (
                      <div className="flex items-center justify-between gap-1">
                        {quickAmounts.map((q) => (
                          <button
                            key={q}
                            type="button"
                          >
                              <button
                              type="button"
                              onClick={() => useMedicine(q)}
                              title={`Usa ${q} medicamentos · +${q * BALANCE.medicineHealthPerUnit} salud (se ajusta a lo que falte)`}
                            >
                              ×{q}
                            </button>
                          </button>
                        ))}
                      </div>
                    )}</div>
                ) : (
                  hint && <p className="text-[9px] text-subtle">{hint}</p>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-subtle">
          ⚡ Energía: {Math.floor(state.resources.energia)}/{BALANCE.maxEnergy} · regenera 1 cada {BALANCE.energyRegenMinutesPerPoint} min, incluso con la app cerrada.
        </p>
      </section>

      {/* crafted items — SAME source of truth as the crafting screen */}
      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-3">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-300">Objetos fabricados</h3>
        {Object.keys(state.craftedInventory).length === 0 ? (
          <p className="text-xs text-subtle">
            Aún no fabricaste nada. Visita el Taller de crafteo en Base para crear objetos.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {Object.entries(state.craftedInventory).map(([id, count]) => {
              const r = RECIPE_BY_ID[id];
              if (!r) return null; // unknown ids are pruned on load
              const kind = craftedItemKind(id);
              const buffMs = buffRemainingMs(state, "consumo_comida_agua", now);
              const itemAssignments = assignedOn(id);
              const isPanelOpen = assignPanelFor === id;
              const durationMin = Math.round((r.assignDurationSeconds ?? 7200) / 60);
              return (
                <div key={id} className="rounded-sm border border-white/5 bg-black/40 px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="text-base">{r.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold uppercase tracking-wider text-zinc-200">
                        {r.name}
                        <span className="ml-2 font-mono tabular-nums text-zinc-500">×{count}</span>
                      </p>
                      <p className="truncate text-[10px] text-subtle">{r.effect}</p>
                      {itemAssignments.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {itemAssignments.map((a) => (
                            <span
                              key={a.id}
                              className="rounded-sm bg-lime-950/40 px-1.5 py-0.5 font-mono text-[9px] font-bold tabular-nums text-lime-300"
                            >
                              {assignmentTargetLabel(a, npcName)} · {fmtDuration((a.endsAt - now) / 60000)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {kind === "consumable" ? (
                      <button
                        type="button"
                        onClick={() => useCraftedItem(id)}
                        title={
                          id === "botiquin"
                            ? `Restaura hasta 20 Salud (salud ${Math.round(state.health)}/${BALANCE.maxHealth})`
                            : buffMs > 0
                              ? `Renueva el buff · quedan ${fmtDuration(buffMs / 60000)}`
                              : "Activa −10% consumo de Comida y Agua durante 30 min"
                        }
                        className={cn(
                          "flex h-6 shrink-0 cursor-pointer items-center justify-center rounded-sm border px-2 text-[9px] font-bold uppercase tracking-wider transition-colors",
                          id === "botiquin" && state.health >= BALANCE.maxHealth
                            ? "cursor-not-allowed border-zinc-800 bg-black/20 text-zinc-600"
                            : "border-lime-700/50 bg-lime-950/30 text-lime-300 hover:bg-lime-900/40 hover:text-lime-200 active:bg-lime-950/60",
                        )}
                      >
                        Usar
                      </button>
                    ) : kind === "unlock" ? (
                      <span className="shrink-0 rounded-sm bg-amber-950/40 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-amber-400">
                        Desbloqueado
                      </span>
                    ) : (
                      count >= 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (isPanelOpen) {
                              setAssignPanelFor(null);
                              return;
                            }
                            setAssignPanelFor(id);
                            setAssignMode(r.assignTarget ?? "zone");
                          }}
                          title={`Asignar a una zona o superviviente durante ${fmtDuration(durationMin)}`}
                          className="flex h-6 shrink-0 cursor-pointer items-center justify-center rounded-sm border border-lime-700/50 bg-lime-950/30 px-2 text-[9px] font-bold uppercase tracking-wider text-lime-300 transition-colors hover:bg-lime-900/40 hover:text-lime-200 active:bg-lime-950/60"
                        >
                          Asignar
                        </button>
                      )
                    )}
                  </div>

                  {/* ASIGNAR panel: pick a zone or an NPC target */}
                  {isPanelOpen && openRecipe && kind === "passive" && (
                    <div className="mt-2 rounded-sm border border-lime-900/40 bg-black/60 p-2">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex gap-1">
                          {(["zone", "npc"] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setAssignMode(m)}
                              className={cn(
                                "rounded-sm border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-colors",
                                assignMode === m
                                  ? "border-lime-700/60 bg-lime-950/40 text-lime-300"
                                  : "border-zinc-800 bg-black/30 text-zinc-500 hover:text-zinc-300",
                              )}
                            >
                              {m === "zone" ? "A zona" : "A superviviente"}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => setAssignPanelFor(null)}
                          className="cursor-pointer text-[9px] font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
                        >
                          Cerrar ✕
                        </button>
                      </div>
                      <p className="mb-1.5 text-[9px] leading-4 text-subtle">
                        Dura {fmtDuration(durationMin)} · el objeto se consume al asignar (sin reembolso) ·
                        {" "}
                        {assignMode === "zone"
                          ? "el efecto solo aplica mientras exploras esa zona."
                          : "el efecto solo aplica a ese superviviente."}
                      </p>
                      <div className="grid max-h-44 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                        {assignMode === "zone"
                          ? accessibleZones.map((z) => {
                              const taken = itemAssignments.some((a) => a.targetType === "zone" && a.targetId === String(z.id));
                              return (
                                <button
                                  key={z.id}
                                  type="button"
                                  disabled={taken}
                                  onClick={() => {
                                    assignCraftedItem(id, "zone", String(z.id));
                                    setAssignPanelFor(null);
                                  }}
                                  title={taken ? `Ya asignado a la Zona ${z.id}` : `Asignar ${r.name} a ${z.name}`}
                                  className={cn(
                                    "flex items-center justify-between gap-2 rounded-sm border px-2 py-1.5 text-left text-[10px] transition-colors",
                                    taken
                                      ? "cursor-not-allowed border-zinc-800/60 bg-black/20 text-zinc-600"
                                      : "cursor-pointer border-zinc-800 bg-black/30 text-zinc-300 hover:border-lime-700/50 hover:bg-lime-950/20 hover:text-lime-200",
                                  )}
                                >
                                  <span className="truncate">
                                    <span className="font-mono font-bold text-zinc-500">Z{String(z.id).padStart(2, "0")}</span>{" "}
                                    {z.name}
                                  </span>
                                  {taken && <span className="shrink-0 text-[8px] font-bold uppercase text-zinc-600">asignado</span>}
                                </button>
                              );
                            })
                          : activeNpcs.length === 0
                            ? (
                              <p className="col-span-full py-2 text-center text-[10px] text-subtle">
                                No tienes supervivientes activos. Reclútalos en Equipo.
                              </p>
                            )
                            : activeNpcs.map((npc) => {
                                const taken = itemAssignments.some((a) => a.targetType === "npc" && a.targetId === npc.id);
                                return (
                                  <button
                                    key={npc.id}
                                    type="button"
                                    disabled={taken}
                                    onClick={() => {
                                      assignCraftedItem(id, "npc", npc.id);
                                      setAssignPanelFor(null);
                                    }}
                                    title={taken ? `Ya asignado a ${npc.name}` : `Asignar ${r.name} a ${npc.name}`}
                                    className={cn(
                                      "flex items-center gap-2 rounded-sm border px-2 py-1 text-left transition-colors",
                                      taken
                                        ? "cursor-not-allowed border-zinc-800/60 bg-black/20 text-zinc-600"
                                        : "cursor-pointer border-zinc-800 bg-black/30 text-zinc-300 hover:border-lime-700/50 hover:bg-lime-950/20 hover:text-lime-200",
                                    )}
                                  >
                                    <img
                                      src={npc.portrait}
                                      alt={npc.name}
                                      className="size-6 shrink-0 rounded-sm border border-zinc-800 object-cover"
                                    />
                                    <span className="min-w-0 flex-1 truncate text-[10px]">
                                      {npc.name} <span className="text-subtle">«{npc.alias}»</span>
                                    </span>
                                    {taken && <span className="shrink-0 text-[8px] font-bold uppercase text-zinc-600">asignado</span>}
                                  </button>
                                );
                              })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-[10px] leading-4 text-subtle">
          Los objetos no consumibles se ASIGNAN a una zona o a un superviviente: duran 2 h, se consumen al
          asignar y su efecto solo aplica a ese destino. Los consumibles se gastan al usarlos.
        </p>
      </section>

      {/* active assignments — what's running, where, and for how long */}
      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-3">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-300">
          Asignaciones activas · {assignments.length}
        </h3>
        {assignments.length === 0 ? (
          <p className="text-xs text-subtle">
            Nada asignado ahora mismo. Usa «Asignar» en un objeto de arriba para activarlo.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {assignments.map((a) => {
              const r = RECIPE_BY_ID[a.recipeId];
              return (
                <div key={a.id} className="flex items-center gap-3 rounded-sm border border-white/5 bg-black/40 px-3 py-2">
                  <span className="text-base">{r?.icon ?? "📦"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold uppercase tracking-wider text-zinc-200">
                      {r?.name ?? a.recipeId}
                    </p>
                    <p className="truncate text-[10px] text-subtle">
                      {a.targetType === "zone"
                        ? `Zona ${a.targetId.padStart(2, "0")} · ${getZone(Number(a.targetId)).name}`
                        : npcName(a.targetId)}
                      {" · "}
                      {a.effect}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-sm bg-lime-950/40 px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums text-lime-300">
                    {fmtDuration((a.endsAt - now) / 60000)}
                  </span>
                  <button
                    type="button"
                    onClick={() => cancelCraftedAssignment(a.id)}
                    title="Cancela la asignación ahora (sin reembolso: el objeto ya se consumió)"
                    className="shrink-0 cursor-pointer rounded-sm border border-red-900/50 bg-red-950/30 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-red-400 transition-colors hover:bg-red-900/40 hover:text-red-300"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
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
