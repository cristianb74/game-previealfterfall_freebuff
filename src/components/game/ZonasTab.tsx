import { useEffect, useState } from "react";
import { useGame } from "@/game/GameProvider";
import { ZONES, zoneImage, zoneImageFallback } from "@/game/zones";
import { THEMATIC_BY_KEY } from "@/game/buildings";
import { vnow } from "@/game/virtualClock";
import { currentEnergy } from "@/game/energySystem";
import { NPC_TYPE_MODIFIERS, npcProductionMultiplier, zoneBonusBreakdown } from "@/game/npcTypes";
import { BALANCE, BUILDING_SPECIALIZATION } from "@/game/balance";
import { activeAssignments } from "@/game/crafting/craftedEffects";
import { RECIPE_BY_ID } from "@/game/crafting/recipes";
import { RESOURCE_META } from "@/game/resources";
import type { BuildingKey, CraftedAssignment } from "@/game/types";
import { cn } from "@/lib/utils";

function fmtCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Active THEMATIC constructions of a zone (upgradeFinishAt != null). */
function getActiveBuildings(
  thematic: Record<string, { level: number; upgradeFinishAt: number | null }> | undefined,
) {
  const now = vnow();
  const list: { key: string; name: string; level: number; remaining: number }[] = [];
  if (thematic) {
    for (const key of Object.keys(thematic)) {
      const b = thematic[key];
      if (!b.upgradeFinishAt) continue;
      const remaining = b.upgradeFinishAt - now;
      if (remaining <= 0) continue;
      list.push({
        key,
        name: THEMATIC_BY_KEY[key]?.name ?? key,
        level: b.level + 1, // constructing to this level
        remaining,
      });
    }
  }
  return list;
}

/** MAX badge: every THEMATIC building of the zone reached max level
 *  (in-flight upgrades don't count — the badge appears when nothing is
 *  left to start). In-game source of truth: state.zones[id].thematic. */
function isZoneMaxedZone(
  thematic: Record<string, { level: number; upgradeFinishAt: number | null }> | undefined,
): boolean {
  if (!thematic) return false;
  const entries = Object.values(thematic);
  if (entries.length === 0) return false;
  return entries.every((b) => b.level >= BALANCE.buildingMaxLevel && !b.upgradeFinishAt);
}

/** Golden MAX badge for fully upgraded zones. */
function ZoneMaxBadge() {
  return (
    <span className="absolute right-1.5 bottom-1.5 z-10 flex items-center gap-0.5 rounded-sm border border-amber-400/70 bg-black/80 px-1.5 py-0.5 shadow-[0_0_8px_1px_rgba(251,191,36,0.45)]">
      <span aria-hidden className="text-[8px] leading-none">★</span>
      <span className="text-[8px] font-black uppercase leading-none tracking-widest text-amber-400">
        Max
      </span>
    </span>
  );
}

/** NPC indicator for a zone card. */
function NpcIndicator({
  npcId,
}: {
  npcId: string | null;
}) {
  const { state } = useGame();
  if (!state) return null;

  const npc = npcId ? state.npcs.find((n) => n.id === npcId) : null;

  if (!npc) {
    return (
      <span className="mb-1 w-fit rounded-sm border border-zinc-800/60 bg-black/40 px-1 text-[7px] font-bold uppercase tracking-wider text-subtle">
        Sin NPC
      </span>
    );
  }

  const typeInfo = NPC_TYPE_MODIFIERS[npc.type];
  // v2: the multiplier reads state.base (global) + zones[id].thematic (local).
  const totalBonus = npcProductionMultiplier(
    npc,
    state,
    BUILDING_SPECIALIZATION[npc.specialization as BuildingKey],
  );
  const bonusPct = Math.round((totalBonus - 1) * 100);

  return (
    <span
      className="mb-1 w-fit rounded-sm px-1.5 py-0.5 text-[7px] font-bold leading-none tracking-wider"
      style={{ backgroundColor: typeInfo.color + "22", color: typeInfo.color, border: `1px solid ${typeInfo.color}44` }}
    >
      👤 {npc.id} · {typeInfo.label.toUpperCase()}
      {bonusPct != null && <span className="text-[6px] opacity-80"> · +{bonusPct}%</span>}
    </span>
  );
}

/** Short per-recipe effect labels for the zone-assignment badges (the full
 *  recipe.effect lines are too long for a card badge). Zone-targeted only —
 *  NPC-targeted assignments get their own Equipo-screen indicator later. */
const ZONE_ASSIGN_SHORT: Record<string, string> = {
  linterna: "−10% duración",
  mapa: "+5% recursos",
  mochila_recoleccion: "+10% materiales",
  kit_tecnico: "+10% componentes",
  iman: "+8% componentes",
  detector: "+10% especiales",
  escaner: "+10% dinero",
  guantes: "−10% heridas",
  proteccion: "−15% daño",
};

/** Active zone-assignment badges for one zone card: normal-flow wrap row at
 *  the top of the card body (after the image header) — they push the content
 *  below down instead of overlapping anything. Live countdown reuses the
 *  tab's 1 s re-render + fmtCountdown — expiry just stops matching. */
function ZoneAssignBadges({ assignments, now }: { assignments: CraftedAssignment[]; now: number }) {
  if (assignments.length === 0) return null;
  return (
    <div className="mb-1 flex w-full flex-wrap gap-1">
      {assignments.map((a) => {
        const recipe = RECIPE_BY_ID[a.recipeId];
        return (
          <span
            key={a.id}
            title={`${recipe?.name ?? a.recipeId} · ${a.effect}`}
            className="flex items-center gap-1 rounded-sm border border-lime-800/50 bg-black/80 px-1 py-0.5 shadow-[0_0_6px_1px_rgba(0,0,0,0.7)]"
          >
            <span aria-hidden className="text-[8px] leading-none">{recipe?.icon ?? "📦"}</span>
            <span className="text-[7px] font-bold uppercase leading-none tracking-wider text-lime-300">
              {ZONE_ASSIGN_SHORT[a.recipeId] ?? recipe?.name ?? a.recipeId}
            </span>
            <span className="font-mono text-[8px] font-bold leading-none tabular-nums text-lime-400">
              {fmtCountdown(a.endsAt - now)}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** Bloque colapsable de HUD por zona: especialización + bonus activos del
 *  recurso foco desglosados por fuente (Construcciones, NPC asignado, Ítems
 *  crafteados) y el total combinado. Todo se lee del estado REAL con
 *  zoneBonusBreakdown, así que se actualiza en vivo al construir, asignar/
 *  quitar NPC o activar/vencer un ítem (el re-render de 1 s ya refresca). */
function ZoneBonusBlock({ zoneId, now }: { zoneId: number; now: number }) {
  const { state } = useGame();
  const [open, setOpen] = useState(false);
  if (!state) return null;
  const bd = zoneBonusBreakdown(state, zoneId, now);
  const pct = (v: number) => `+${Math.round(v * 100)}%`;

  return (
    <div className="shrink-0 overflow-hidden rounded-md border border-zinc-800/70 bg-[#0d0f10]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-1 px-2 py-1 text-left transition-colors hover:bg-zinc-900/60"
      >
        <span className="truncate text-[8px] font-bold uppercase tracking-widest text-subtle">
          ⚡ Bonus de zona · {RESOURCE_META[bd.focus].label} {open ? "▾" : "▸"}
        </span>
        <span className="shrink-0 font-mono text-[9px] font-bold tabular-nums text-green-400">
          {pct(bd.totalPct)}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-0.5 border-t border-zinc-800/70 px-2 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[9px] uppercase tracking-wider text-zinc-400">
              Especialización
            </span>
            <span className="shrink-0 font-mono text-[9px] tabular-nums text-zinc-300">
              {pct(bd.focusPct)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[9px] uppercase tracking-wider text-zinc-400">
              Construcciones
            </span>
            <span className="shrink-0 font-mono text-[9px] tabular-nums text-zinc-300">
              {bd.constructionsPct > 0 ? pct(bd.constructionsPct) : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[9px] uppercase tracking-wider text-zinc-400">
              NPC asignado
            </span>
            <span className="shrink-0 font-mono text-[9px] tabular-nums text-zinc-300">
              {bd.npcPct > 0 ? pct(bd.npcPct) : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[9px] uppercase tracking-wider text-zinc-400">
              Ítems crafteados
            </span>
            <span className="shrink-0 font-mono text-[9px] tabular-nums text-zinc-300">
              {bd.items.length > 0 ? pct(bd.itemsPct) : "—"}
            </span>
          </div>
          {bd.items.map((it) => (
            <p key={it.recipeId} className="pl-1 text-[8px] leading-[11px] text-subtle">
              · {RECIPE_BY_ID[it.recipeId]?.name ?? it.recipeId}
              {it.onNpc ? " (NPC)" : ""} · {pct(it.pct)}
            </p>
          ))}
          <div className="mt-0.5 flex items-center justify-between gap-2 border-t border-zinc-800/70 pt-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-300">
              Total combinado
            </span>
            <span className="shrink-0 font-mono text-[10px] font-bold tabular-nums text-green-400">
              {pct(bd.totalPct)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// Module-level double-tap tracker (reset per mount is not critical for tap timing).
const _lastTap = new Map<number, number>();

export function ZonasTab() {
  const {
    state,
    setCurrentZone,
    setScreen,
    maxUnlockedZoneId,
    savedZonasScrollRef,
    toggleAutoExplore,
    startExploration,
  } = useGame();
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!state) return null;
  const unlockedMax = maxUnlockedZoneId;
  const nextZone = ZONES.find((z) => z.id === unlockedMax + 1);
  // Same source Mochila reads: activeAssignments filters endsAt > now, so
  // expired assignments vanish from the cards on the next 1 s re-render.
  const zoneAssignmentsNow = activeAssignments(state, vnow());

  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-[10px] uppercase tracking-[0.25em] text-subtle">
        Zonas desbloqueadas · {unlockedMax}/20 · toca para explorar ·
        doble toque para abrir las instalaciones
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ZONES.map((z) => {
          const zoneMaxed = isZoneMaxedZone(state.zones[z.id]?.thematic);
          const unlocked = z.id <= unlockedMax;
          const isCurrent = state.currentZoneId === z.id;
          const isExploring = state.explorationStates[z.id] != null;
          const autoEnabled = state.autoExplored[z.id] ?? false;
          const autoRunning = state.autoFarms[z.id] != null;
          const assignedNpc = unlocked ? state.zones[z.id]?.assignedNpcId : null;
          const expReady =
            !unlocked &&
            nextZone?.id === z.id &&
            state.expTotal >= z.unlockExp;

          const activeBuildings = getActiveBuildings(state.zones[z.id]?.thematic);
          const now = vnow();
          const zoneAssignments = zoneAssignmentsNow.filter(
            (a) => a.targetType === "zone" && a.targetId === String(z.id),
          );

          // min-h (no fixed h): the card grows taller when the assignment
          // badges wrap to multiple lines — nothing ever overlaps.
          return (
            <div key={z.id} className="flex min-h-[202px] flex-col gap-1 sm:min-h-[218px]">
              <button
                onDoubleClick={() => {
                  if (!unlocked) return;
                  savedZonasScrollRef.current = window.scrollY;
                  setCurrentZone(z.id);
                  setScreen("instalaciones");
                }}
                onClick={() => {
                  if (!unlocked) return;
                  // Double-tap guard: if onDoubleClick already fired, skip single-tap
                  const prev = _lastTap.get(z.id) ?? 0;
                  const now = vnow();
                  _lastTap.set(z.id, now);
                  if (now - prev < 300) return;
                  setCurrentZone(z.id);
                  // Start exploration if not already exploring and has energy
                  const zExploring = state.explorationStates[z.id] != null;
                  const energy = currentEnergy(state, now);
                  if (!zExploring && energy >= 1 && state.health > 0) {
                    startExploration(z.id);
                  }
                }}
                className={cn(
                  "group relative flex flex-1 flex-col overflow-hidden rounded-lg border text-left transition-colors",
                  isCurrent
                    ? "border-green-500/70"
                    : unlocked
                      ? zoneMaxed
                        ? "border-amber-500/40 hover:border-amber-400/70 active:border-amber-400"
                        : "border-zinc-800 hover:border-green-500/60 active:border-green-500"
                      : "border-zinc-800/60 opacity-45",
                )}
              >
                <div className="relative h-20 w-full shrink-0 sm:h-24 bg-[#0a0c0d]">
                  <img
                    src={zoneImage(z.id)}
                    alt={z.name}
                    className="absolute inset-0 size-full object-cover"
                    style={{ objectFit: "cover" }}
                    loading="lazy"
                    onError={(e) => {
                      const t = e.currentTarget as HTMLImageElement;
                      if (t.src && t.src.includes(".webp")) {
                        t.src = zoneImageFallback(z.id);
                      }
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0c0e0f] via-[#0c0e0f]/30 to-transparent" />
                  <span className="absolute left-1.5 top-1.5 rounded-sm bg-black/70 px-1 text-[9px] font-bold tabular-nums text-zinc-300">
                    {String(z.id).padStart(2, "0")}
                  </span>
                  {isExploring && state.explorationStates[z.id] && (
                    <span className="absolute right-1.5 top-1.5 rounded-sm bg-green-600/95 px-1.5 py-0.5 text-right text-black shadow-[0_0_8px_1px_rgba(34,197,94,0.55)]">
                      <span className="block text-[8px] font-black uppercase leading-none tracking-wider">
                        Explorando
                      </span>
                      <span className="block font-mono text-[11px] font-black leading-tight tabular-nums">
                        {fmtCountdown(
                          state.explorationStates[z.id].finishAt - vnow(),
                        )}
                      </span>
                    </span>
                  )}
                  {isCurrent && !isExploring && (
                    <span className="absolute right-1.5 top-1.5 rounded-sm bg-green-600/90 px-1 text-[8px] font-black uppercase text-black">
                      Actual
                    </span>
                  )}
                  {!unlocked && (
                    <span className="absolute right-1.5 top-1.5 rounded-sm bg-black/70 px-1 text-[9px] font-bold text-zinc-400">
                      🔒
                    </span>
                  )}
                  {/* MAX badge (fully upgraded zone) — stays as an image
                      overlay; badges and NPC chip moved into normal flow. */}
                  {unlocked && zoneMaxed && <ZoneMaxBadge />}
                </div>
                <div className="flex flex-1 flex-col p-2">
                  {/* ASIGNACIONES activas (flujo normal, wrap) y luego el
                      chip de NPC — nunca tapan EXPLORANDO ni nada más. */}
                  {unlocked && zoneAssignments.length > 0 && (
                    <ZoneAssignBadges assignments={zoneAssignments} now={now} />
                  )}
                  {unlocked && <NpcIndicator npcId={assignedNpc} />}
                  <p className="truncate text-[11px] font-bold leading-[14px] text-zinc-200">
                    {z.name}
                  </p>
                  <p className="truncate text-[9px] uppercase leading-[12px] tracking-wider text-subtle">
                    {unlocked
                      ? `${z.explorationMinutes} min · +${z.playerExpReward} EXP`
                      : expReady
                        ? "Alcanza la siguiente zona ›"
                        : `🔒 ${z.unlockExp.toLocaleString("es")} EXP`}
                  </p>

                  {/* Construction status slot: always reserves the same
                      space (44px + margin) so the presence or absence of
                      the "Construyendo" bar never shifts the card size. */}
                  <div
                    className={cn(
                      "mt-1.5 h-11 shrink-0 overflow-hidden rounded-sm px-1.5 py-1",
                      unlocked && activeBuildings.length > 0
                        ? "border border-amber-800/40 bg-amber-950/50"
                        : unlocked && zoneMaxed
                          ? "border border-amber-900/25 bg-amber-950/20"
                          : "invisible border border-transparent",
                    )}
                  >
                    {activeBuildings.length === 0 && zoneMaxed && (
                      <>
                        <p className="text-[8px] font-bold uppercase leading-[11px] tracking-wider text-amber-500/90">
                          ★ Instalaciones al máximo
                        </p>
                        <p className="text-[9px] leading-[13px] text-amber-700">
                          Nada más que mejorar en esta zona.
                        </p>
                      </>
                    )}
                    {activeBuildings.length > 0 && (
                      <>
                        <p className="text-[8px] font-bold uppercase leading-[11px] tracking-wider text-amber-500">
                          🔨 Construyendo
                        </p>
                        <p className="text-[10px] font-bold leading-[14px] tabular-nums text-amber-300">
                          {activeBuildings[0].name} N{activeBuildings[0].level}{" "}
                          <span className="font-mono text-amber-400">
                            {fmtCountdown(activeBuildings[0].remaining)}
                          </span>
                        </p>
                        {activeBuildings.length > 1 && (
                          <p className="text-[8px] leading-[11px] text-amber-600">
                            +{activeBuildings.length - 1} construcción
                            {activeBuildings.length - 1 > 1 ? "es" : ""} activa
                            {activeBuildings.length - 1 > 1 ? "s" : ""}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </button>

              {unlocked && <ZoneBonusBlock zoneId={z.id} now={now} />}

              {unlocked ? (
                <button
                  type="button"
                  onClick={() => toggleAutoExplore(z.id)}
                  className={cn(
                    "flex h-[26px] shrink-0 items-center justify-between rounded-md border px-2 text-left transition-colors",
                    autoEnabled
                      ? "border-green-700/60 bg-green-950/30"
                      : "border-zinc-800/60 bg-[#0d0f10] hover:border-zinc-700",
                  )}
                >
                  <span
                    className={cn(
                      "text-[8px] font-bold uppercase tracking-widest",
                      autoEnabled ? "text-green-500" : "text-subtle",
                    )}
                  >
                    {autoEnabled && autoRunning
                      ? "▶ Auto"
                      : autoEnabled
                        ? "Auto ON"
                        : "Auto"}
                  </span>
                  <span
                    className={cn(
                      "relative h-3.5 w-7 shrink-0 rounded-full transition-colors",
                      autoEnabled ? "bg-green-600" : "bg-zinc-800",
                    )}
                    aria-hidden
                  >
                    <span
                      className={cn(
                        "absolute left-0.5 top-0.5 size-2.5 rounded-full bg-zinc-200 transition-transform",
                        autoEnabled ? "translate-x-3" : "translate-x-0",
                      )}
                    />
                  </span>
                </button>
              ) : (
                <div className="h-[26px] shrink-0" aria-hidden />
              )}
            </div>
          );
        })}
      </div>
      <p className="px-1 text-[10px] leading-4 text-subtle">
        Toca una zona para explorarla. Doble toque para abrir sus
        instalaciones (edificios temáticos de la zona). La exploración puede
        realizarse en varias zonas a la vez.
      </p>
    </div>
  );
}
