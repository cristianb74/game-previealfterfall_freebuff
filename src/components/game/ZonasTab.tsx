import { useEffect, useState } from "react";
import { useGame } from "@/game/GameProvider";
import { frontierZoneId, ZONES, zoneImage } from "@/game/zones";
import { cn } from "@/lib/utils";

function fmtCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ZonasTab() {
  const { state, setCurrentZone, maxUnlockedZoneId } = useGame();
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!state) return null;
  const unlockedMax = maxUnlockedZoneId;
  const exploringZoneId = state.exploration?.zoneId ?? null;
  const nextZone = ZONES.find((z) => z.id === unlockedMax + 1);

  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-[10px] uppercase tracking-[0.25em] text-zinc-500">
        Zonas desbloqueadas · {unlockedMax}/20 · toca una zona para viajar
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ZONES.map((z) => {
          const unlocked = z.id <= unlockedMax;
          const isCurrent = state.currentZoneId === z.id;
          const isExploring = exploringZoneId === z.id;
          const autoFarmZone = state.autoExplore && z.id === frontierZoneId(state) - 1;
          const isAutoRunning = autoFarmZone && state.autoRun != null;
          const assignedNpc = z.id <= unlockedMax ? state.zones[z.id]?.assignedNpcId : null;
          // For a locked zone: if its EXP is already covered, show it as ready to unlock.
          const expReady = !unlocked && nextZone?.id === z.id && state.expTotal >= z.unlockExp;

          return (
            <button
              key={z.id}
              onClick={() => unlocked && setCurrentZone(z.id)}
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
                {/* exploring badge with live countdown */}
                {isExploring && state.exploration && (
                  <span className="absolute right-1.5 top-1.5 rounded-sm bg-green-600/95 px-1.5 py-0.5 text-right text-black shadow-[0_0_8px_1px_rgba(34,197,94,0.55)]">
                    <span className="block text-[8px] font-black uppercase leading-none tracking-wider">
                      Explorando
                    </span>
                    <span className="block font-mono text-[11px] font-black leading-tight tabular-nums">
                      {fmtCountdown(state.exploration.finishAt - Date.now())}
                    </span>
                  </span>
                )}
                {isCurrent && !isExploring && (
                  <span className="absolute right-1.5 top-1.5 rounded-sm bg-green-600/90 px-1 text-[8px] font-black uppercase text-black">
                    Actual
                  </span>
                )}
                {autoFarmZone && !isExploring && (
                  <span className="absolute left-1.5 bottom-1.5 rounded-sm bg-green-950/90 px-1 text-[8px] font-bold uppercase tracking-wider text-green-400">
                    ▶ Automática
                  </span>
                )}
                {!unlocked && (
                  <span className="absolute right-1.5 top-1.5 rounded-sm bg-black/70 px-1 text-[9px] font-bold text-zinc-400">
                    🔒
                  </span>
                )}
                {assignedNpc && (
                  <span className="absolute bottom-1.5 right-1.5 rounded-sm bg-black/70 px-1 text-[8px] font-bold text-green-400">
                    {assignedNpc}
                  </span>
                )}
              </div>
              <div className="p-2">
                <p className="truncate text-[11px] font-bold text-zinc-200">{z.name}</p>
                {autoFarmZone ? (
                  <p className={cn(
                    "text-[9px] font-bold uppercase tracking-wider",
                    isAutoRunning ? "text-green-500" : "text-zinc-500",
                  )}>
                    ▶ Exploración automática
                  </p>
                ) : (
                  <p className="text-[9px] uppercase tracking-wider text-zinc-500">
                    {unlocked
                      ? `${z.explorationMinutes} min · +${z.playerExpReward} EXP`
                      : expReady
                        ? "Alcanza la siguiente zona ›"
                        : `🔒 ${z.unlockExp.toLocaleString("es")} EXP`}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <p className="px-1 text-[10px] leading-4 text-zinc-600">
        Al viajar cambias de zona al instante: explora allí, construye sus edificios y asigna
        supervivientes. Cada zona guarda sus propias construcciones.
      </p>
    </div>
  );
}
