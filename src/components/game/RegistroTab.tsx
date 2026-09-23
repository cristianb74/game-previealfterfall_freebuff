import { useCallback, useMemo, useState } from "react";
import { useGame } from "@/game/GameProvider";
import { getZone } from "@/game/zones";
import { NPC_TYPE_MODIFIERS } from "@/game/npcTypes";
import { vnow } from "@/game/virtualClock";
import { GAME_INFO } from "@/game/gameConfig";
import { BALANCE } from "@/game/balance";
import { BUILDING_BY_KEY, buildingBonus, THEMATIC_BY_KEY, thematicBonus } from "@/game/buildings";
import { currentEnergy, nextEnergyRegenAt } from "@/game/energySystem";
import type { BuildingKey } from "@/game/types";

const BUILDING_ORDER: BuildingKey[] = ["cocina", "tanque", "almacen", "enfermeria", "taller", "generador"];
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function fmtTs(t: number): string {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function fmtDate(t: number): string {
  return new Date(t).toLocaleString("es-ES", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const KIND_COLORS: Record<string, string> = {
  resource: "text-green-400",
  exp: "text-blue-400",
  damage: "text-red-400",
  npc: "text-purple-400",
  zone: "text-amber-400",
  build: "text-orange-400",
  info: "text-zinc-400",
};

const KIND_LABELS: Record<string, string> = {
  resource: "RECURSO",
  exp: "EXP",
  damage: "DAÑO",
  npc: "NPC",
  zone: "ZONA",
  build: "CONSTR",
  info: "INFO",
};

export function RegistroTab() {
  const { state } = useGame();
  const [copied, setCopied] = useState(false);
  /** Log channel filter: tech (debug) | narr (player-facing) | both. */
  const [channelFilter, setChannelFilter] = useState<"tech" | "narr" | "both">("both");

  const now = vnow();

  /** Build the full summary header for export. */
  const summary = useMemo(() => {
    if (!state) return "";
    const lines: string[] = [];
    lines.push("=== AFTERFALL — REPORTE DE PRUEBA ===");
    lines.push(`Versión: ${GAME_INFO.version}`);
    lines.push(`Fecha: ${fmtDate(Date.now())}`);
    lines.push(`Zona actual: ${String(state.currentZoneId).padStart(2, "0")} · ${getZone(state.currentZoneId).name}`);
    lines.push(`EXP total: ${Math.round(state.expTotal)}`);
    lines.push(`Dinero: $${Math.floor(state.resources.dinero)}`);
    lines.push(`Salud: ${state.health}/${BALANCE.maxHealth}`);
    lines.push("");
    lines.push("--- RECURSOS ACTUALES ---");
    lines.push(`Materiales: ${Math.floor(state.resources.materiales)}`);
    lines.push(`Comida: ${Math.floor(state.foodMin)} min`);
    lines.push(`Agua: ${Math.floor(state.waterMin)} min`);
    lines.push(`Medicamentos: ${Math.floor(state.resources.medicamentos)}`);
    lines.push(`Componentes: ${Math.floor(state.resources.componentes)}`);
    const energy = currentEnergy(state, vnow());
    lines.push(`Energía: ${Math.floor(energy)}/${BALANCE.maxEnergy}`);
    const nextAt = nextEnergyRegenAt(state);
    const nextRegenMs = Math.max(0, nextAt - vnow());
    const nextRegenMin = Math.ceil(nextRegenMs / 60000);
    lines.push(`Última regeneración de energía: ${fmtDate(state.lastEnergyRegenAt)}`);
    lines.push(`Próxima regeneración en: ${nextRegenMin} min`);
    lines.push("");
    lines.push("--- EXPLORACIONES ---");
    lines.push(`Exploraciones manuales totales: ${state.manualExplorationsDone ?? 0}`);
    const autoDone = (state.explorationsDone ?? 0) - (state.manualExplorationsDone ?? 0);
    lines.push(`Exploraciones automáticas totales: ${Math.max(0, autoDone)}`);
    lines.push(`Exploraciones totales: ${state.explorationsDone ?? 0}`);
    lines.push(`Exploraciones desde último NPC: ${state.explorationsSinceLastNPC ?? 0}`);
    lines.push(`Próximo exploration ID: ${state.nextExplorationId ?? 1}`);
    lines.push("");
    lines.push("--- SUPERVIVIENTE ---");
    lines.push(`${state.survivor.name} · ${state.survivor.profession}`);
    const stats = state.survivor.stats;
    lines.push(`Fuerza: ${stats.fuerza} · Resistencia: ${stats.resistencia} · Agilidad: ${stats.agilidad}`);
    lines.push(`Percepción: ${stats.percepcion} · Inteligencia: ${stats.inteligencia} · Voluntad: ${stats.voluntad}`);
    lines.push("");
    lines.push(`--- NPC (${state.npcs.length}) ---`);
    for (const npc of state.npcs) {
      const typeInfo = NPC_TYPE_MODIFIERS[npc.type];
      const zone = npc.assignedZoneId ? `Z${String(Number(npc.assignedZoneId)).padStart(2, "0")}` : "Sin asignar";
      lines.push(`${npc.id} · ${npc.name} «${npc.alias}» · ${typeInfo.label} · ${zone} · Esp: ${npc.specialization}`);
    }
    lines.push("");
    lines.push("--- BASE GLOBAL (comunes · aplican en todas las zonas) ---");
    {
      const builds: string[] = [];
      for (const key of BUILDING_ORDER) {
        const b = state.base?.[key];
        const def = BUILDING_BY_KEY[key];
        if (b && (b.level > 0 || b.upgradeFinishAt)) {
          const bonus = Math.round(buildingBonus(b.level) * 100);
          builds.push(`${def.name} N${b.level} (+${bonus}%)${b.upgradeFinishAt ? " [construyendo...]" : ""}`);
        }
      }
      lines.push(builds.length > 0 ? builds.join(" · ") : "Sin construcciones aún");
    }
    lines.push("");
    lines.push("--- INSTALACIONES POR ZONA (temáticos · solo su zona) ---");
    for (const zid of Object.keys(state.zones).map(Number).sort((a, b) => a - b)) {
      const zs = state.zones[zid];
      const zone = getZone(zid);
      const builds: string[] = [];
      for (const key of Object.keys(zs.thematic ?? {})) {
        const b = zs.thematic[key];
        const def = THEMATIC_BY_KEY[key];
        if (b.level > 0 || b.upgradeFinishAt) {
          const bonus = Math.round(thematicBonus(b.level) * 100);
          builds.push(`${def?.name ?? key} N${b.level} (+${bonus}%)${b.upgradeFinishAt ? " [construyendo...]" : ""}`);
        }
      }
      if (builds.length > 0) {
        lines.push(`Z${String(zid).padStart(2, "0")} ${zone.name}: ${builds.join(" · ")}`);
      }
    }
    lines.push("");
    lines.push("--- HISTORIAL CRONOLÓGICO ---");
    return lines.join("\n");
  }, [state]);

  /** Full log text for clipboard / download — sorted ascending by timestamp. */
  const fullLog = useMemo(() => {
    if (!state) return "";
    // Sort ascending (oldest first) for chronological reading
    const sorted = [...state.log].sort((a, b) => a.t - b.t);
    const logLines = sorted.map(
      (e) => `[${fmtTs(e.t)}] ${e.msg}`,
    );
    return summary + "\n" + logLines.join("\n");
  }, [state, summary]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(fullLog);
      setCopied(true);
      toast.success("Registro copiado al portapapeles");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar");
    }
  }, [fullLog]);

  const handleExport = useCallback(() => {
    const blob = new Blob([fullLog], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `afterfall-log-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Archivo descargado");
  }, [fullLog]);

  if (!state) return null;

  const energy = currentEnergy(state, now);
  const nextAt = nextEnergyRegenAt(state);
  const nextRegenMs = Math.max(0, nextAt - now);
  const nextRegenMin = Math.ceil(nextRegenMs / 60000);
  const autoDone = Math.max(0, (state.explorationsDone ?? 0) - (state.manualExplorationsDone ?? 0));

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="px-1 text-[10px] uppercase tracking-[0.25em] text-subtle">
          📋 Registro de prueba · {state.log.length} eventos
        </p>
        <div className="flex gap-1.5">
          <button
            onClick={handleCopy}
            className={cn(
              "rounded-md border px-2 py-1 text-[9px] font-bold uppercase tracking-wider transition-colors",
              copied
                ? "border-green-700 bg-green-950/40 text-green-400"
                : "border-zinc-800 bg-[#0d0f10] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
            )}
          >
            {copied ? "✓ Copiado" : "Copiar"}
          </button>
          <button
            onClick={handleExport}
            className="rounded-md border border-zinc-800 bg-[#0d0f10] px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
          >
            Exportar .txt
          </button>
        </div>
      </div>

      {/* Player snapshot */}
      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-3">
        <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-zinc-400">
          Estado del jugador
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
          <div className="text-faint">Zona actual</div>
          <div className="text-zinc-200">
            {String(state.currentZoneId).padStart(2, "0")} · {getZone(state.currentZoneId).name}
          </div>
          <div className="text-faint">EXP total</div>
          <div className="text-zinc-200">{Math.round(state.expTotal)}</div>
          <div className="text-faint">Salud</div>
          <div className="text-zinc-200">{state.health}/{BALANCE.maxHealth}</div>
          <div className="text-faint">Dinero</div>
          <div className="text-green-400">${Math.floor(state.resources.dinero)}</div>
          <div className="text-faint">Energía</div>
          <div className="text-zinc-200">{Math.floor(energy)}/{BALANCE.maxEnergy}</div>
          <div className="text-faint">Próxima regen</div>
          <div className="text-zinc-200">{nextRegenMin} min</div>
          <div className="text-faint">Materiales</div>
          <div className="text-zinc-200">{Math.floor(state.resources.materiales)}</div>
          <div className="text-faint">Comida</div>
          <div className="text-zinc-200">{Math.floor(state.foodMin)} min</div>
          <div className="text-faint">Agua</div>
          <div className="text-zinc-200">{Math.floor(state.waterMin)} min</div>
          <div className="text-faint">Medicamentos</div>
          <div className="text-zinc-200">{Math.floor(state.resources.medicamentos)}</div>
          <div className="text-faint">Componentes</div>
          <div className="text-zinc-200">{Math.floor(state.resources.componentes)}</div>
          <div className="text-faint">NPC</div>
          <div className="text-zinc-200">{state.npcs.length} obtenidos</div>
        </div>
      </section>

      {/* Exploration stats */}
      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-3">
        <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-zinc-400">
          Exploraciones
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
          <div className="text-faint">Manuales</div>
          <div className="text-zinc-200">{state.manualExplorationsDone ?? 0}</div>
          <div className="text-faint">Automáticas</div>
          <div className="text-zinc-200">{autoDone}</div>
          <div className="text-faint">Totales</div>
          <div className="text-zinc-200">{state.explorationsDone ?? 0}</div>
          <div className="text-faint">Desde último NPC</div>
          <div className="text-zinc-200">{state.explorationsSinceLastNPC ?? 0}</div>
          <div className="text-faint">Próximo ID</div>
          <div className="text-zinc-200">#{state.nextExplorationId ?? 1}</div>
        </div>
      </section>

      {/* Exploration & NPC diagnostics */}
      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-3">
        <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-zinc-400">
          Diagnóstico activo
        </p>
        <div className="flex flex-col gap-1.5">
          {Object.keys(state.explorationStates).map(Number).filter((zid) => state.explorationStates[zid]).length > 0 ? (
            Object.keys(state.explorationStates).map(Number).filter((zid) => state.explorationStates[zid]).map((zid) => {
              const run = state.explorationStates[zid]!;
              const remaining = Math.max(0, Math.ceil((run.finishAt - now) / 1000));
              return (
                <div key={zid} className="flex items-center justify-between text-[10px]">
                  <span className="text-green-400">
                    [EXP #{run.expId ?? "?"}] Z{String(zid).padStart(2, "0")} exploración activa
                  </span>
                  <span className="font-mono text-zinc-300">restante {remaining}s</span>
                </div>
              );
            })
          ) : (
            <p className="text-[10px] text-subtle">Sin exploraciones activas</p>
          )}
          {Object.keys(state.autoFarms ?? {}).map(Number).filter((zid) => state.autoFarms[zid]).map((zid) => {
            const run = state.autoFarms[zid]!;
            const remaining = Math.max(0, Math.ceil((run.finishAt - now) / 1000));
            return (
              <div key={zid} className="flex items-center justify-between text-[10px]">
                <span className="text-green-500">
                  [EXP #{run.expId ?? "?"}] Z{String(zid).padStart(2, "0")} auto-farm activo
                </span>
                <span className="font-mono text-zinc-300">restante {remaining}s</span>
              </div>
            );
          })}
          <div className="mt-1 flex items-center justify-between rounded-sm bg-[#0d0f10] px-2 py-1 text-[10px]">
            <span className="text-zinc-400">Contador NPC</span>
            <span className="font-mono text-zinc-200">{state.explorationsSinceLastNPC ?? 0} / {BALANCE.npcTiers[BALANCE.npcTiers.length - 1].afterExplorations}</span>
          </div>
        </div>
      </section>

      {/* NPC list */}
      {state.npcs.length > 0 && (
        <section className="rounded-lg border border-zinc-800 bg-[#101213] p-3">
          <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-zinc-400">
            NPC obtenidos
          </p>
          <div className="flex flex-col gap-1">
            {state.npcs.map((npc) => {
              const typeInfo = NPC_TYPE_MODIFIERS[npc.type];
              const zone = npc.assignedZoneId
                ? `Z${String(Number(npc.assignedZoneId)).padStart(2, "0")}`
                : "Libre";
              return (
                <div
                  key={npc.id}
                  className="flex items-center gap-2 rounded-sm bg-[#0d0f10] px-2 py-1 text-[10px]"
                >
                  <span style={{ color: typeInfo.color }} className="font-bold">
                    {npc.id}
                  </span>
                  <span className="text-zinc-300">{npc.name}</span>
                  <span className="text-subtle">«{npc.alias}»</span>
                  <span
                    className="ml-auto rounded-sm px-1 text-[8px] font-bold uppercase"
                    style={{ color: typeInfo.color }}
                  >
                    {typeInfo.label}
                  </span>
                  <span
                    className={cn(
                      "rounded-sm px-1 text-[8px] font-bold",
                      npc.assignedZoneId
                        ? "bg-green-900/40 text-green-400"
                        : "bg-zinc-800 text-subtle",
                    )}
                  >
                    {zone}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Chronological log — displayed descending (newest first) for live view */}
      <section className="rounded-lg border border-zinc-800 bg-[#101213] p-3">
        <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-zinc-400">
          Historial cronológico
        </p>
        {/* Channel filter */}
        <div className="mb-2 grid grid-cols-3 gap-1 rounded-md border border-zinc-800 bg-black/40 p-1">
          {(
            [
              { key: "narr" as const, label: "Narrativo" },
              { key: "tech" as const, label: "Técnico" },
              { key: "both" as const, label: "Ambos" },
            ]
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setChannelFilter(opt.key)}
              className={cn(
                "rounded-sm px-2 py-1 text-[9px] font-bold uppercase tracking-widest transition-colors",
                channelFilter === opt.key
                  ? "bg-green-600/90 text-black"
                  : "text-subtle hover:text-zinc-300",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="max-h-[50vh] overflow-y-auto rounded-sm bg-black/40 p-2 font-mono text-[10px] leading-5">
          {(() => {
            const filtered = state.log.filter((e) => {
              const ch = e.channel ?? "tech";
              if (channelFilter === "both") return true;
              return ch === channelFilter;
            });
            if (filtered.length === 0) {
              return <p className="text-subtle">Sin eventos en este canal</p>;
            }
            return filtered.map((e, i) => (
              <div key={i} className="flex gap-2 border-b border-zinc-900 py-0.5">
                <span className="shrink-0 text-subtle">[{fmtTs(e.t)}]</span>
                <span
                  className={
                    e.channel === "narr"
                      ? "italic text-green-300/90"
                      : "text-zinc-300"
                  }
                >
                  {e.msg}
                </span>
              </div>
            ));
          })()}
        </div>
      </section>
    </div>
  );
}
