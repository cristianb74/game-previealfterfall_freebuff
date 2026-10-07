import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HUD } from "@/components/game/HUD";
import { StatsGrid } from "@/components/game/StatsGrid";
import { useGame } from "@/game/GameProvider";
import { NPC_TYPE_MODIFIERS, npcCycleChance } from "@/game/npcTypes";
import {
  BALANCE,
  npcFoodUpkeepPerHour,
  npcWaterUpkeepPerHour,
  teamFoodUpkeepPerHour,
  teamWaterUpkeepPerHour,
} from "@/game/balance";
import { formatStandbyRemaining, standbyRemainingMs } from "@/game/npcStandby";
import { bonusLostMessage, stockHoursFor } from "@/game/npcConsumption";
import { vnow } from "@/game/virtualClock";
import { BUILDING_BY_KEY } from "@/game/buildings";
import { ZONES, isZoneUnlocked } from "@/game/zones";
import { RESOURCE_META } from "@/game/resources";
import type { BuildingKey, NpcSurvivor, NpcTypeCode } from "@/game/types";
import { cn } from "@/lib/utils";

// ============================================================
// Roster filter/sort controls (the roster keeps growing towards 20+).
// Real rarity order (NPC_TYPE_MODIFIERS): B Blanco < G Gris < A Azul
// < R Rojo < D Dorado — cycleSeconds/bonus both confirm D is best.
// ============================================================
const RARITY_ORDER: Record<NpcTypeCode, number> = { B: 0, G: 1, A: 2, R: 3, D: 4 };

const SPECIALTY_CHIPS: { key: BuildingKey; label: string; icon: string }[] = [
  { key: "cocina", label: "Comida", icon: "🍲" },
  { key: "tanque", label: "Agua", icon: "🚰" },
  { key: "almacen", label: "Materiales", icon: "📦" },
  { key: "enfermeria", label: "Medicamentos", icon: "🩹" },
  { key: "taller", label: "Componentes", icon: "🔧" },
  { key: "generador", label: "Energía", icon: "⚡" },
];

const SORT_OPTIONS = [
  { key: "default", label: "Orden: reclutamiento" },
  { key: "rarity_desc", label: "Rareza ↓ (Dorado→Blanco)" },
  { key: "rarity_asc", label: "Rareza ↑ (Blanco→Dorado)" },
  { key: "zone_asc", label: "Zona ↑ (Z01→Z20)" },
  { key: "zone_desc", label: "Zona ↓ (Z20→Z01)" },
] as const;
type SortMode = (typeof SORT_OPTIONS)[number]["key"];

/** Specialization → resource key (same mapping the recruited detail dialog
 *  shows inline; extracted so candidate cards can mirror that exact data). */
const NPC_SPEC_RESOURCE = {
  cocina: "comida",
  tanque: "agua",
  almacen: "materiales",
  enfermeria: "medicamentos",
  taller: "componentes",
  generador: "energia",
} as const;

// ============================================================
// CHIP DE ESPECIALIDAD — lo más visible de la ficha después del nombre.
// Un chip por especialidad: icono + recurso + bonus, con COLOR PROPIO por
// recurso. Mobile-safe: flex-wrap + max-w-full, sin scroll horizontal.
// ============================================================
const SPEC_CHIP_THEME: Record<BuildingKey, { icon: string; chip: string; pct: string }> = {
  cocina: { icon: "🍲", chip: "border-amber-500/40 bg-amber-500/10", pct: "text-amber-300" },
  tanque: { icon: "💧", chip: "border-sky-500/40 bg-sky-500/10", pct: "text-sky-300" },
  almacen: { icon: "📦", chip: "border-orange-500/40 bg-orange-500/10", pct: "text-orange-300" },
  enfermeria: { icon: "🩹", chip: "border-rose-500/40 bg-rose-500/10", pct: "text-rose-300" },
  taller: { icon: "🔧", chip: "border-emerald-500/40 bg-emerald-500/10", pct: "text-emerald-300" },
  generador: { icon: "⚡", chip: "border-yellow-500/40 bg-yellow-500/10", pct: "text-yellow-300" },
};

function SpecialtyChip({
  buildingKey,
  bonusPct,
  size = "lg",
}: {
  buildingKey: BuildingKey;
  /** Bonus relativo del tipo de NPC (el mismo que aplican los ciclos de
   *  producción). 0.08 → "+8%". */
  bonusPct: number;
  size?: "lg" | "sm";
}) {
  const resource = NPC_SPEC_RESOURCE[buildingKey];
  const meta = RESOURCE_META[resource];
  const theme = SPEC_CHIP_THEME[buildingKey];
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 font-bold",
        size === "lg" ? "text-[12px]" : "text-[10px]",
        theme.chip,
        "text-zinc-100",
      )}
    >
      <span aria-hidden className="shrink-0">{theme.icon}</span>
      <span className="truncate">{meta.label}</span>
      <span className={cn("shrink-0 tabular-nums", theme.pct)}>
        +{Math.round(bonusPct * 100)}%
      </span>
    </span>
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** "6h 12m" / "45m" / "2d 3h" — duración del stock con el consumo actual. */
function formatHours(h: number): string {
  if (!Number.isFinite(h)) return "sin consumo";
  if (h <= 0) return "0m";
  const totalMin = Math.ceil(h * 60);
  const d = Math.floor(totalMin / 1440);
  const rest = totalMin % 1440;
  const hh = Math.floor(rest / 60);
  const mm = rest % 60;
  if (d > 0) return `${d}d ${hh}h`;
  if (hh > 0) return `${hh}h ${mm}m`;
  return `${mm}m`;
}

export function EquipoTab() {
  const { state, assignNpc, recruitNpc, ignoreNpc, expelNpc } = useGame();
  const [detail, setDetail] = useState<string | null>(null);
  const [confirmExpel, setConfirmExpel] = useState<string | null>(null);
  const [showMarketplace, setShowMarketplace] = useState<string | null>(null);
  /** Specialty filter (OR between checked chips; empty = all). */
  const [filterSpecs, setFilterSpecs] = useState<Set<BuildingKey>>(() => new Set());
  /** Assignment filter (OR; both unchecked = show everyone). */
  const [filterAssignment, setFilterAssignment] = useState({ assigned: false, unassigned: false });
  const [sortMode, setSortMode] = useState<SortMode>("default");
  if (!state) return null;

  // Recruitment flow: candidates are NOT assignable until recruited.
  const candidates = state.npcs.filter((n) => (n.status ?? "active") === "candidate");
  const active = state.npcs.filter((n) => (n.status ?? "active") === "active");
  const assigned = active.filter((n) => n.assignedZoneId);
  const unassigned = active.filter((n) => !n.assignedZoneId);
  const ordered = [...assigned, ...unassigned];
  const matCost = BALANCE.npcRecruitCostMateriales;
  const foodCost = BALANCE.npcRecruitCostComidaMin;
  const npc = detail != null ? state.npcs.find((n) => n.id === detail) : null;
  // STAND-BY: timestamps REALES (el tick actualiza el state cada segundo,
  // así el countdown corre sin timers extra). Menos de 30 min → alerta.
  const now = vnow();
  // CONSUMO del equipo (solo NPC reclutados) con la duración del stock.
  const stock = stockHoursFor(state);
  const lowStock = (h: number) => h < 1; // menos de 1 h de stock
  const nutrition = bonusLostMessage(state);

  /** Apply filters then sort (ordered is a fresh array — safe to mutate). */
  const rosterList = ordered.filter((n) => {
    const matchesSpec = filterSpecs.size === 0 || filterSpecs.has(n.specialization);
    const noAssignmentFilter = !filterAssignment.assigned && !filterAssignment.unassigned;
    const matchesAssignment =
      noAssignmentFilter ||
      (filterAssignment.assigned && n.assignedZoneId != null) ||
      (filterAssignment.unassigned && n.assignedZoneId == null);
    return matchesSpec && matchesAssignment;
  });
  const zoneNum = (n: NpcSurvivor) => (n.assignedZoneId ? Number(n.assignedZoneId) : null);
  const byDiscovery = (a: NpcSurvivor, b: NpcSurvivor) => a.discoveredAt - b.discoveredAt;
  switch (sortMode) {
    case "rarity_desc":
      rosterList.sort((a, b) => RARITY_ORDER[b.type] - RARITY_ORDER[a.type] || byDiscovery(a, b));
      break;
    case "rarity_asc":
      rosterList.sort((a, b) => RARITY_ORDER[a.type] - RARITY_ORDER[b.type] || byDiscovery(a, b));
      break;
    case "zone_asc":
      rosterList.sort((a, b) => (zoneNum(a) ?? 99) - (zoneNum(b) ?? 99) || byDiscovery(a, b));
      break;
    case "zone_desc":
      rosterList.sort((a, b) => (zoneNum(b) ?? -1) - (zoneNum(a) ?? -1) || byDiscovery(a, b));
      break;
  }
  const hasActiveFilters =
    filterSpecs.size > 0 || filterAssignment.assigned || filterAssignment.unassigned;
  const toggleSpecFilter = (k: BuildingKey) =>
    setFilterSpecs((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const unlockedMax = ZONES.reduce(
    (acc, z) => (isZoneUnlocked(state, z.id) ? Math.max(acc, z.id) : acc),
    1,
  );

  const totalsLabel = (n: NpcSurvivor): string => {
    const entries = (Object.entries(n.productionTotals) as [keyof typeof n.productionTotals, number][]).filter(
      ([, v]) => v > 0,
    );
    if (entries.length === 0) return "Sin producción aún";
    return entries
      .map(([k, v]) => {
        const isTime = k === "comida" || k === "agua";
        return `+${v}${isTime ? " min" : ""} ${RESOURCE_META[k].label}`;
      })
      .join(" · ");
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-[10px] uppercase tracking-[0.25em] text-subtle">
        EQUIPO · {active.length} · {assigned.length} asignados
      </p>

      {/* CONSUMO del equipo por hora + cuánto alcanza el stock actual. */}
      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">
            Consumo del equipo
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { label: RESOURCE_META.comida.label, hours: stock.foodHours },
                { label: RESOURCE_META.agua.label, hours: stock.waterHours },
              ] as const
            ).map(({ label, hours }) => (
              <span
                key={label}
                className={cn(
                  "whitespace-nowrap rounded-sm border px-2 py-0.5 text-[10px] font-bold tabular-nums",
                  lowStock(hours)
                    ? "border-red-500/60 bg-red-500/10 text-red-300"
                    : "border-zinc-700 bg-black/40 text-zinc-300",
                )}
              >
                {label} para {formatHours(hours)}
              </span>
            ))}
          </div>
        </div>
        <p className="mt-1 text-[10px] text-subtle">
          ▣ {round1(teamFoodUpkeepPerHour(state.npcs))} min/h · ◍ {round1(teamWaterUpkeepPerHour(state.npcs))} min/h (solo NPC reclutados)
        </p>
        {nutrition && <p className="mt-1 text-[10px] font-bold text-red-400">⚠ {nutrition}</p>}
      </section>

      {/* Filter/sort controls (sticky-feel header row above the roster) */}
      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-2.5">
        <div className="flex flex-col gap-2">
          {/* Specialty chips — multi-select OR filter */}
          <div className="flex flex-wrap gap-1">
            {SPECIALTY_CHIPS.map((s) => {
              const on = filterSpecs.has(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggleSpecFilter(s.key)}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-colors",
                    on
                      ? "border-green-500/70 bg-green-950/40 text-green-300"
                      : "border-zinc-800 bg-black/30 text-subtle hover:border-zinc-600 hover:text-zinc-300",
                  )}
                >
                  <span aria-hidden>{s.icon}</span>
                  {s.label}
                </button>
              );
            })}
          </div>
          {/* Assignment chips + sort dropdown on one row */}
          <div className="flex items-center gap-1.5">
            {(
              [
                { key: "assigned" as const, label: `Asignados ${assigned.length}` },
                { key: "unassigned" as const, label: `Sin asignar ${unassigned.length}` },
              ]
            ).map((f) => {
              const on = filterAssignment[f.key];
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilterAssignment((p) => ({ ...p, [f.key]: !p[f.key] }))}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-colors",
                    on
                      ? "border-green-500/70 bg-green-950/40 text-green-300"
                      : "border-zinc-800 bg-black/30 text-subtle hover:border-zinc-600 hover:text-zinc-300",
                  )}
                >
                  {f.label}
                </button>
              );
            })}
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="ml-auto max-w-[46%] shrink-0 rounded-sm border border-zinc-800 bg-black/40 px-1.5 py-1 text-[9px] font-bold uppercase tracking-wider text-zinc-300 outline-none focus:border-green-500/50"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key} className="bg-[#101213] text-zinc-200">
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {hasActiveFilters && (
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[9px] uppercase tracking-wider text-subtle">
                Mostrando {rosterList.length} de {ordered.length}
              </span>
              <button
                type="button"
                onClick={() => {
                  setFilterSpecs(new Set());
                  setFilterAssignment({ assigned: false, unassigned: false });
                }}
                className="text-[9px] font-bold uppercase tracking-wider text-green-500/80 hover:text-green-400"
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Candidates awaiting recruitment */}
      {candidates.length > 0 && (
        <section className="rounded-lg border border-amber-900/50 bg-[#12100c] p-3">
          <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-amber-400">
            Por reclutar · {candidates.length}
          </p>
          <div className="flex flex-col gap-2">
            {candidates.map((n) => {
              const info = NPC_TYPE_MODIFIERS[n.type];
              const canAfford =
                state.resources.materiales >= matCost && state.foodMin >= foodCost;
              // STAND-BY: countdown desde timestamps REALES (funciona con la
              // app cerrada); menos de 30 min → resaltado de alerta.
              const remainMs = standbyRemainingMs(n, now);
              const urgent = remainMs > 0 && remainMs < BALANCE.npcStandbyWarningMs;
              return (
                <div
                  key={n.id}
                  className={cn(
                    "flex items-center gap-3 rounded-md border bg-black/40 p-2.5",
                    urgent ? "border-red-500/60" : "border-amber-900/40",
                  )}
                >
                  <div className="relative shrink-0">
                    <img
                      src={n.portrait}
                      alt={n.name}
                      className="size-12 rounded-sm border border-zinc-800 object-cover"
                      loading="lazy"
                    />
                    <span
                      className="absolute -bottom-1 -right-1 rounded-sm border border-black px-1 text-[8px] font-black"
                      style={{ backgroundColor: info.color, color: "#000" }}
                    >
                      {n.type}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-bold text-zinc-100">
                        {n.name} «{n.alias}»
                      </p>
                      <span
                        className={cn(
                          "shrink-0 whitespace-nowrap rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider tabular-nums",
                          urgent
                            ? "border-red-500/60 bg-red-500/10 text-red-300"
                            : "border-zinc-700 bg-black/40 text-zinc-400",
                        )}
                      >
                        Se va en {formatStandbyRemaining(remainMs)}
                      </span>
                    </div>
                    <p className="truncate text-[10px] text-subtle">
                      {n.profession} · {n.id}
                    </p>
                    {/* ESPECIALIDAD = lo más visible después del nombre:
                        chip grande con icono + recurso + bonus. */}
                    <div className="mt-1.5">
                      <SpecialtyChip buildingKey={n.specialization} bonusPct={info.bonus} />
                    </div>
                    <p className="mt-1 text-[9px] text-subtle">
                      Costo: {matCost} ⚒ · {foodCost} min ▣
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button
                      size="sm"
                      disabled={!canAfford}
                      onClick={() => recruitNpc(n.id)}
                      className="border border-amber-500/40 bg-amber-600/90 font-bold uppercase tracking-wider text-black hover:bg-amber-500"
                    >
                      Reclutar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => ignoreNpc(n.id)}
                      className="border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
                    >
                      Ignorar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[9px] leading-4 text-subtle">
            Los supervivientes encontrados explorando necesitan ser reclutados antes
            de poder asignarlos a una zona.
          </p>
        </section>
      )}

      {state.npcs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-800 bg-[#101213] p-6 text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-zinc-400">Sin supervivientes</p>
          <p className="mt-2 text-xs leading-5 text-subtle">
            Explora zonas para encontrar supervivientes que automaticen la recolección.
            El primero suele aparecer en las primeras 10 exploraciones.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {rosterList.map((n) => {
            const info = NPC_TYPE_MODIFIERS[n.type];
            const zoneName = n.assignedZoneId ? ZONES[Number(n.assignedZoneId) - 1]?.name : null;
            const working = n.assignedZoneId != null && state.foodMin > 20 && state.waterMin > 20;
            return (
              <button
                key={n.id}
                onClick={() => setDetail(n.id)}
                className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-[#101213] p-3 text-left transition-colors hover:border-zinc-600"
              >
                <div className="relative shrink-0">
                  <img
                    src={n.portrait}
                    alt={n.name}
                    className="size-14 rounded-sm border border-zinc-800 object-cover"
                    loading="lazy"
                  />
                  <span
                    className="absolute -bottom-1 -right-1 rounded-sm border border-black px-1 text-[8px] font-black"
                    style={{ backgroundColor: info.color, color: "#000" }}
                  >
                    {n.type}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-bold text-zinc-100">
                      {n.name} «{n.alias}»
                    </p>
                    <span className="shrink-0 text-[10px] font-bold text-subtle">{n.id}</span>
                  </div>
                  <p className="truncate text-[11px] text-zinc-400">{n.profession}</p>
                  {/* Mismo estilo de chip que los candidatos (consistencia). */}
                  <div className="mt-1">
                    <SpecialtyChip buildingKey={n.specialization} bonusPct={info.bonus} size="sm" />
                  </div>
                  {(() => {
                    const foodH = npcFoodUpkeepPerHour(n);
                    const waterH = npcWaterUpkeepPerHour(n);
                    if (foodH <= 0) return null;
                    const mult = typeof n.consumptionMultiplier === "number" ? n.consumptionMultiplier : 1;
                    return (
                      <p className="mt-1 truncate text-[10px] text-subtle">
                        Consume ▣ {round1(foodH)} min/h · ◍ {round1(waterH)} min/h{mult !== 1 ? ` (×${mult})` : ""}
                      </p>
                    );
                  })()}
                  <p className="truncate text-[10px] uppercase tracking-wider text-subtle">
                    {n.assignedZoneId
                      ? nutrition
                        ? `◌ ${zoneName} · bonus perdido`
                        : working
                          ? `● ${zoneName}`
                          : `◌ ${zoneName} · sin suministros`
                      : "○ Sin asignar"}
                  </p>
                  <StatsGrid stats={n.stats} className="mt-1.5" />
                  <p className="mt-1 truncate text-[9px] text-subtle">{totalsLabel(n)}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* detail dialog: assignment */}
      <Dialog open={npc != null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-sm rounded-lg border-zinc-800 bg-[#101213] text-zinc-200">
          {npc && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3 tracking-wider text-zinc-100">
                  <img src={npc.portrait} alt={npc.name} className="size-12 rounded-sm border border-zinc-800 object-cover" />
                  <span>
                    {npc.name} «{npc.alias}»
                    <span className="ml-2 text-xs text-faint">{npc.id}</span>
                  </span>
                </DialogTitle>
                <DialogDescription className="text-faint">
                  {NPC_TYPE_MODIFIERS[npc.type].label} · ciclo {NPC_TYPE_MODIFIERS[npc.type].cycleSeconds}s · bonus +
                  {Math.round(NPC_TYPE_MODIFIERS[npc.type].bonus * 100)}%
                </DialogDescription>
              </DialogHeader>
              <StatsGrid stats={npc.stats} />
              <div>
                <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-subtle">
                  Especialidad
                </p>
                <SpecialtyChip buildingKey={npc.specialization} bonusPct={NPC_TYPE_MODIFIERS[npc.type].bonus} />
              </div>
              <div className="rounded-md border border-white/5 bg-black/40 p-2 text-[11px] text-subtle">
                <p className="mb-1 font-bold uppercase tracking-wider text-zinc-400">Producción acumulada</p>
                <p>{totalsLabel(npc)}</p>
              </div>
              {/* Candidates cannot be assigned until recruited. */}
              {(npc.status ?? "active") === "candidate" ? (
                <div
                  className={cn(
                    "rounded-md border p-3 text-center",
                    standbyRemainingMs(npc, now) < BALANCE.npcStandbyWarningMs
                      ? "border-red-500/60 bg-red-950/20"
                      : "border-amber-900/40 bg-amber-950/20",
                  )}
                >
                  <p
                    className={cn(
                      "text-xs font-bold uppercase tracking-widest",
                      standbyRemainingMs(npc, now) < BALANCE.npcStandbyWarningMs
                        ? "text-red-400"
                        : "text-amber-400",
                    )}
                  >
                    Se va en {formatStandbyRemaining(standbyRemainingMs(npc, now))}
                  </p>
                  <p className="mt-1 text-[10px] text-subtle">
                    Recluta a este superviviente desde la lista "Por reclutar" para
                    poder asignarlo a una zona. Si vence el plazo, se irá del refugio.
                  </p>
                </div>
              ) : (
                <>
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Asignar a zona</p>
              <div className="max-h-52 overflow-y-auto rounded-md border border-white/5">
                {ZONES.filter((z) => z.id <= unlockedMax).map((z) => {
                  const zoneState = state.zones[z.id];
                  const occupant = zoneState?.assignedNpcId;
                  const isSelf = occupant === npc.id;
                  return (
                    <button
                      key={z.id}
                      onClick={() => {
                        assignNpc(npc.id, isSelf ? null : z.id);
                        setDetail(null);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-green-950/20",
                        isSelf ? "text-green-400" : "text-zinc-300",
                      )}
                    >
                      <span className="truncate">
                        {String(z.id).padStart(2, "0")} · {z.name}
                      </span>
                      <span className="shrink-0 text-[10px] text-subtle">
                        {isSelf ? "✔ Asignado" : occupant ? `Ocupado (${occupant})` : "Libre"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] leading-4 text-subtle">
                Máximo 1 superviviente por zona. Los NPC asignados a zonas distintas trabajan a la vez.
                Bonus pasivo: mientras trabaja en una zona, sus exploraciones son más rápidas
                (según su rareza).
              </p>
                </>
              )}

              {/* NPC Management */}
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDetail(null);
                    setTimeout(() => setConfirmExpel(npc.id), 100);
                  }}
                  className="flex-1 border-red-800/60 text-red-400 hover:border-red-600 hover:bg-red-950/30 hover:text-red-300"
                >
                  Expulsar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDetail(null);
                    setTimeout(() => setShowMarketplace(npc.id), 100);
                  }}
                  className="flex-1 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                >
                  Poner a la venta
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm expel dialog */}
      <Dialog open={confirmExpel != null} onOpenChange={(o) => !o && setConfirmExpel(null)}>
        <DialogContent className="max-w-sm rounded-lg border-zinc-800 bg-[#101213] text-zinc-200">
          {confirmExpel && (() => {
            const npc = state.npcs.find((n) => n.id === confirmExpel);
            if (!npc) return null;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-red-400">Expulsar superviviente</DialogTitle>
                  <DialogDescription className="text-faint">
                    ¿Seguro que quieres expulsar a este superviviente?
                  </DialogDescription>
                </DialogHeader>
                <div className="rounded-md border border-red-900/40 bg-red-950/20 p-3">
                  <p className="text-sm font-bold text-zinc-200">
                    {npc.name} «{npc.alias}» ({npc.id})
                  </p>
                  <p className="mt-1 text-xs text-faint">
                    {NPC_TYPE_MODIFIERS[npc.type].label} · {npc.profession}
                  </p>
                  <p className="mt-2 text-[10px] text-red-400">
                    Esta acción es permanente y no recibirás ninguna recompensa.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setConfirmExpel(null)}
                    className="flex-1 border-zinc-700 text-zinc-300"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => {
                      expelNpc(confirmExpel);
                      setConfirmExpel(null);
                    }}
                    className="flex-1 border border-red-500/40 bg-red-600/90 text-white hover:bg-red-500"
                  >
                    Expulsar
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* NPC Marketplace placeholder */}
      <Dialog open={showMarketplace != null} onOpenChange={(o) => !o && setShowMarketplace(null)}>
        <DialogContent className="max-w-sm rounded-lg border-zinc-800 bg-[#101213] text-zinc-200">
          {showMarketplace && (() => {
            const npc = state.npcs.find((n) => n.id === showMarketplace);
            if (!npc) return null;
            const info = NPC_TYPE_MODIFIERS[npc.type];
            return (
              <>
                <DialogHeader>
                  <DialogTitle>Mercado de NPC</DialogTitle>
                  <DialogDescription className="text-faint">
                    Próximamente — intercambio entre jugadores
                  </DialogDescription>
                </DialogHeader>
                <div className="rounded-md border border-zinc-700 bg-[#0d0f10] p-3">
                  <div className="flex items-center gap-3">
                    <img src={npc.portrait} alt={npc.name} className="size-10 rounded-sm border border-zinc-800 object-cover" />
                    <div>
                      <p className="text-sm font-bold text-zinc-200">{npc.name} «{npc.alias}»</p>
                      <p className="text-[10px] text-subtle">{npc.id}</p>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                    <div className="text-faint">Rareza</div>
                    <div style={{ color: info.color }} className="font-bold">{info.label}</div>
                    <div className="text-faint">Especialidad</div>
                    <div className="text-zinc-300">{BUILDING_BY_KEY[npc.specialization].name}</div>
                    <div className="text-faint">Valor base</div>
                    <div className="text-amber-400">—</div>
                    <div className="text-faint">Estado</div>
                    <div className="text-zinc-400">En refugio</div>
                  </div>
                </div>
                <div className="rounded-md border border-amber-800/40 bg-amber-950/20 p-3 text-center">
                  <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
                    Mercado de NPC próximamente
                  </p>
                  <p className="mt-1 text-[10px] text-subtle">
                    El sistema futuro permitirá publicar NPC a la venta.
                    El propietario podrá pedir como máximo 2 tipos de recursos.
                  </p>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
