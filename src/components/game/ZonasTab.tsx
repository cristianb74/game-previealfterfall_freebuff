import { useEffect, useState } from "react";
import { useGame } from "@/game/GameProvider";
import { ZONES, zoneImage } from "@/game/zones";
import { BUILDING_BY_KEY } from "@/game/buildings";
import { NPC_TYPE_MODIFIERS, npcProductionMultiplier } from "@/game/npcTypes";
import { BUILDING_SPECIALIZATION } from "@/game/balance";
import type { BuildingKey } from "@/game/types";
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

/** Find active buildings in a zone (upgradeFinishAt != null). */
function getActiveBuildings(
  buildings:
    | Record<
        BuildingKey,
        { level: number; upgradeFinishAt: number | null }
      >
    | undefined,
) {
  if (!buildings) return [];
  const now = Date.now();
  return (
    (Object.keys(buildings) as BuildingKey[])
      .map((key) => {
        const b = buildings[key];
        if (!b.upgradeFinishAt) return null;
        const remaining = b.upgradeFinishAt - now;
        if (remaining <= 0) return null;
        const def = BUILDING_BY_KEY[key];
        return {
          key,
          name: def?.name ?? key,
          level: b.level + 1, // constructing to this level
          remaining,
        };
      })
      .filter(Boolean) as {
        key: BuildingKey;
        name: string;
        level: number;
        remaining: number;
      }[]
  );
}

/** NPC indicator for a zone card. */
function NpcIndicator({
  npcId,
  zoneId,
  buildings,
}: {
  npcId: string | null;
  zoneId: number;
  buildings?: Record<BuildingKey, { level: number; upgradeFinishAt: number | null }>;
}) {
  const { state } = useGame();
  if (!state) return null;

  const npc = npcId ? state.npcs.find((n) => n.id === npcId) : null;

  if (!npc) {
    return (
      <span className="absolute bottom-1.5 left-1.5 rounded-sm bg-black/70 px-1 text-[7px] font-bold uppercase tracking-wider text-zinc-600">
        Sin NPC
      </span>
    );
  }

  const typeInfo = NPC_TYPE_MODIFIERS[npc.type];
  // Build a proper ZoneProgressState for the bonus calculation.
  const zoneState = buildings
    ? {
        buildings: Object.fromEntries(
          (Object.keys(buildings) as BuildingKey[]).map((k) => [k, { key: k, ...buildings[k] }]),
        ) as Record<BuildingKey, { key: BuildingKey; level: number; upgradeFinishAt: number | null }>,
        assignedNpcId: npcId,
      }
    : null;
  const totalBonus = zoneState ? npcProductionMultiplier(npc, zoneState, BUILDING_SPECIALIZATION[npc.specialization]) : null;
  const bonusPct = totalBonus != null ? Math.round((totalBonus - 1) * 100) : null;

  return (
    <span
      className="absolute bottom-1.5 left-1.5 rounded-sm px-1.5 py-0.5 text-[7px] font-bold leading-none tracking-wider shadow-[0_0_6px_1px_rgba(0,0,0,0.7)]"
      style={{ backgroundColor: typeInfo.color + "22", color: typeInfo.color, border: `1px solid ${typeInfo.color}44` }}
    >
      👤 {npc.id} · {typeInfo.label.toUpperCase()}
      {bonusPct != null && <span className="text-[6px] opacity-80"> · +{bonusPct}%</span>}
    </span>
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
    toggleAutoExplore,
  } = useGame();
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!state) return null;
  const unlockedMax = maxUnlockedZoneId;
  const nextZone = ZONES.find((z) => z.id === unlockedMax + 1);

  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-[10px] uppercase tracking-[0.25em] text-zinc-500">
        Zonas desbloqueadas · {unlockedMax}/20 · toca una zona para viajar ·
        doble toque para abrir la base
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ZONES.map((z) => {
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

          const zoneBuildings = state.zones[z.id]?.buildings;
          const activeBuildings = getActiveBuildings(zoneBuildings);

          return (
            <div key={z.id} className="flex flex-col gap-1">
              <button
                onDoubleClick={() => {
                  if (!unlocked) return;
                  setCurrentZone(z.id);
                  setScreen("base");
                }}
                onClick={() => {
                  if (!unlocked) return;
                  // Double-tap guard: if onDoubleClick already fired, skip single-tap
                  const prev = _lastTap.get(z.id) ?? 0;
                  const now = Date.now();
                  _lastTap.set(z.id, now);
                  if (now - prev < 300) return;
                  setCurrentZone(z.id);
                }}
                className={cn(
                  "group relative overflow-hidden rounded-lg border text-left transition-colors",
                  isCurrent
                    ? "border-green-500/70"
                    : unlocked
                      ? "border-zinc-800 hover:border-green-500/60 active:border-green-500"
                      : "border-zinc-800/60 opacity-45",
                )}
              >
                <div className="relative h-20 w-full sm:h-24">
                  <img
                    src={zoneImage(z.id)}
                    alt={z.name}
                    className="absolute inset-0 size-full object-cover"
                    style={{ objectFit: "cover" }}
                    loading="lazy"
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
                          state.explorationStates[z.id].finishAt - Date.now(),
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
                  {/* NPC indicator */}
                  {unlocked && (
                    <NpcIndicator
                      npcId={assignedNpc}
                      zoneId={z.id}
                      buildings={zoneBuildings}
                    />
                  )}
                </div>
                <div className="p-2">
                  <p className="truncate text-[11px] font-bold text-zinc-200">
                    {z.name}
                  </p>
                  <p className="text-[9px] uppercase tracking-wider text-zinc-500">
                    {unlocked
                      ? `${z.explorationMinutes} min · +${z.playerExpReward} EXP`
                      : expReady
                        ? "Alcanza la siguiente zona ›"
                        : `🔒 ${z.unlockExp.toLocaleString("es")} EXP`}
                  </p>

                  {/* Construction status indicator */}
                  {unlocked && activeBuildings.length > 0 && (
                    <div className="mt-1.5 rounded-sm border border-amber-800/40 bg-amber-950/50 px-1.5 py-1">
                      <p className="text-[8px] font-bold uppercase tracking-wider text-amber-500">
                        🔨 Construyendo
                      </p>
                      <p className="text-[10px] font-bold tabular-nums text-amber-300">
                        {activeBuildings[0].name} N{activeBuildings[0].level}{" "}
                        <span className="font-mono text-amber-400">
                          {fmtCountdown(activeBuildings[0].remaining)}
                        </span>
                      </p>
                      {activeBuildings.length > 1 && (
                        <p className="text-[8px] text-amber-600">
                          +{activeBuildings.length - 1} construcción
                          {activeBuildings.length - 1 > 1 ? "es" : ""} activa
                          {activeBuildings.length - 1 > 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </button>

              {unlocked && (
                <button
                  type="button"
                  onClick={() => toggleAutoExplore(z.id)}
                  className={cn(
                    "flex items-center justify-between rounded-md border px-2 py-1 text-left transition-colors",
                    autoEnabled
                      ? "border-green-700/60 bg-green-950/30"
                      : "border-zinc-800/60 bg-[#0d0f10] hover:border-zinc-700",
                  )}
                >
                  <span
                    className={cn(
                      "text-[8px] font-bold uppercase tracking-widest",
                      autoEnabled ? "text-green-500" : "text-zinc-600",
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
              )}
            </div>
          );
        })}
      </div>
      <p className="px-1 text-[10px] leading-4 text-zinc-600">
        Al viajar cambias de zona al instante. Cada zona guarda sus propias
        construcciones. Doble toque sobre una zona abre directamente su base.
      </p>
    </div>
  );
}
