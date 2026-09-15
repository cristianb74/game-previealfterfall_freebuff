import { useGame } from "@/game/GameProvider";
import { ZONES, zoneImage } from "@/game/zones";
import { cn } from "@/lib/utils";

export function ZonasTab() {
  const { state, setCurrentZone } = useGame();

  if (!state) return null;
  const unlockedMax = ZONES.reduce(
    (acc, z) => (state.expTotal >= z.unlockExp ? Math.max(acc, z.id) : acc),
    1,
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-[10px] uppercase tracking-[0.25em] text-zinc-500">
        Zonas desbloqueadas · {unlockedMax}/20 · toca una zona para viajar
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ZONES.map((z) => {
          const unlocked = z.id <= unlockedMax;
          const isCurrent = state.currentZoneId === z.id;
          const assignedNpc = z.id <= unlockedMax ? state.zones[z.id]?.assignedNpcId : null;
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
                {isCurrent && (
                  <span className="absolute right-1.5 top-1.5 rounded-sm bg-green-600/90 px-1 text-[8px] font-black uppercase text-black">
                    Actual
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
                <p className="text-[9px] uppercase tracking-wider text-zinc-500">
                  {unlocked ? `${z.explorationMinutes} min · +${z.playerExpReward} EXP` : `🔒 ${z.unlockExp.toLocaleString("es")} EXP`}
                </p>
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
