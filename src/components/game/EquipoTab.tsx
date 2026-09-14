import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HUD } from "@/components/game/HUD";
import { StatsGrid } from "@/components/game/StatsGrid";
import { useGame } from "@/game/GameProvider";
import { NPC_TYPE_MODIFIERS, npcCycleChance } from "@/game/npcTypes";
import { BUILDING_BY_KEY } from "@/game/buildings";
import { ZONES } from "@/game/zones";
import { RESOURCE_META } from "@/game/resources";
import type { NpcSurvivor } from "@/game/types";
import { cn } from "@/lib/utils";

export function EquipoTab() {
  const { state, assignNpc } = useGame();
  const [detail, setDetail] = useState<string | null>(null);
  if (!state) return null;

  const assigned = state.npcs.filter((n) => n.assignedZoneId);
  const unassigned = state.npcs.filter((n) => !n.assignedZoneId);
  const ordered = [...assigned, ...unassigned];
  const npc = detail != null ? state.npcs.find((n) => n.id === detail) : null;
  const unlockedMax = ZONES.reduce(
    (acc, z) => (state.expTotal >= z.unlockExp ? Math.max(acc, z.id) : acc),
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
      <p className="px-1 text-[10px] uppercase tracking-[0.25em] text-zinc-500">
        EQUIPO · {state.npcs.length} · {assigned.length} asignados
      </p>

      {state.npcs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-800 bg-[#101213] p-6 text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-zinc-400">Sin supervivientes</p>
          <p className="mt-2 text-xs leading-5 text-zinc-600">
            Explora zonas para encontrar supervivientes que automaticen la recolección.
            El primero suele aparecer en las primeras 10 exploraciones.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ordered.map((n) => {
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
                    <span className="shrink-0 text-[10px] font-bold text-zinc-500">{n.id}</span>
                  </div>
                  <p className="truncate text-[11px] text-zinc-400">{n.profession}</p>
                  <p className="truncate text-[10px] uppercase tracking-wider text-zinc-600">
                    {n.assignedZoneId
                      ? working
                        ? `● ${zoneName}`
                        : `◌ ${zoneName} · sin suministros`
                      : "○ Sin asignar"}
                  </p>
                  <StatsGrid stats={n.stats} className="mt-1.5" />
                  <p className="mt-1 truncate text-[9px] text-zinc-600">{totalsLabel(n)}</p>
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
                    <span className="ml-2 text-xs text-zinc-500">{npc.id}</span>
                  </span>
                </DialogTitle>
                <DialogDescription className="text-zinc-500">
                  {NPC_TYPE_MODIFIERS[npc.type].label} · ciclo {NPC_TYPE_MODIFIERS[npc.type].cycleSeconds}s · bonus +
                  {Math.round(NPC_TYPE_MODIFIERS[npc.type].bonus * 100)}%
                </DialogDescription>
              </DialogHeader>
              <StatsGrid stats={npc.stats} />
              <p className="text-xs text-zinc-500">
                Especialización:{" "}
                <span className="text-zinc-300">
                  {BUILDING_BY_KEY[npc.specialization].name} ({RESOURCE_META[
                    (
                      {
                        cocina: "comida",
                        tanque: "agua",
                        almacen: "materiales",
                        enfermeria: "medicamentos",
                        taller: "componentes",
                        generador: "energia",
                      } as const
                    )[npc.specialization]
                  ].label}
                  )
                </span>
              </p>
              <div className="rounded-md border border-white/5 bg-black/40 p-2 text-[11px] text-zinc-500">
                <p className="mb-1 font-bold uppercase tracking-wider text-zinc-400">Producción acumulada</p>
                <p>{totalsLabel(npc)}</p>
              </div>
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
                      <span className="shrink-0 text-[10px] text-zinc-500">
                        {isSelf ? "✔ Asignado" : occupant ? `Ocupado (${occupant})` : "Libre"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] leading-4 text-zinc-600">
                Máximo 1 superviviente por zona. Los NPC asignados a zonas distintas trabajan a la vez.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
