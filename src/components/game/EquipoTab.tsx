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
  const { state, assignNpc, expelNpc } = useGame();
  const [detail, setDetail] = useState<string | null>(null);
  const [confirmExpel, setConfirmExpel] = useState<string | null>(null);
  const [showMarketplace, setShowMarketplace] = useState<string | null>(null);
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
                  <DialogDescription className="text-zinc-500">
                    ¿Seguro que quieres expulsar a este superviviente?
                  </DialogDescription>
                </DialogHeader>
                <div className="rounded-md border border-red-900/40 bg-red-950/20 p-3">
                  <p className="text-sm font-bold text-zinc-200">
                    {npc.name} «{npc.alias}» ({npc.id})
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
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
                  <DialogDescription className="text-zinc-500">
                    Próximamente — intercambio entre jugadores
                  </DialogDescription>
                </DialogHeader>
                <div className="rounded-md border border-zinc-700 bg-[#0d0f10] p-3">
                  <div className="flex items-center gap-3">
                    <img src={npc.portrait} alt={npc.name} className="size-10 rounded-sm border border-zinc-800 object-cover" />
                    <div>
                      <p className="text-sm font-bold text-zinc-200">{npc.name} «{npc.alias}»</p>
                      <p className="text-[10px] text-zinc-500">{npc.id}</p>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                    <div className="text-zinc-500">Rareza</div>
                    <div style={{ color: info.color }} className="font-bold">{info.label}</div>
                    <div className="text-zinc-500">Especialidad</div>
                    <div className="text-zinc-300">{BUILDING_BY_KEY[npc.specialization].name}</div>
                    <div className="text-zinc-500">Valor base</div>
                    <div className="text-amber-400">—</div>
                    <div className="text-zinc-500">Estado</div>
                    <div className="text-zinc-400">En refugio</div>
                  </div>
                </div>
                <div className="rounded-md border border-amber-800/40 bg-amber-950/20 p-3 text-center">
                  <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
                    Mercado de NPC próximamente
                  </p>
                  <p className="mt-1 text-[10px] text-zinc-600">
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
