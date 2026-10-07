import { BALANCE } from "./balance";
import { pushLog } from "./log";
import { npcDisplayName } from "./npcData";
import type { GameState, NpcSurvivor } from "./types";

// ============================================================
// AFTERFALL — STAND-BY de candidatos ("Por reclutar").
//
// Cada candidato se encuentra con `foundAt` y `expiresAt = foundAt +
// BALANCE.npcStandbyMs` (4 hs). El cálculo usa TIMESTAMPS REALES, nunca
// timers en memoria: cerrar la app cuenta, y al abrir (y en cada tick)
// se purga a los vencidos con el registro "X se fue del refugio".
// Los reclutados/ignorados salen de la lista por otras rutas y nunca
// pasan por aquí.
// ============================================================

/** Alinea foundAt/expiresAt de un candidato. Saves previos sin foundAt:
 *  foundAt = ahora y expiresAt = ahora + npcStandbyMs (4 hs completas de
 *  ventanilla — la migración debe ser generosa con quienes ya tenían el
 *  NPC guardado antes de este sistema). */
export function ensureStandby(npc: NpcSurvivor, now: number): void {
  if (typeof npc.foundAt !== "number" || !Number.isFinite(npc.foundAt)) {
    npc.foundAt = now;
  }
  if (typeof npc.expiresAt !== "number" || !Number.isFinite(npc.expiresAt)) {
    npc.expiresAt = npc.foundAt + BALANCE.npcStandbyMs;
  }
}

export interface StandbyPurgeResult {
  /** Los candidatos que se fueron (ya eliminados del array). */
  left: NpcSurvivor[];
}

/** Elimina los candidatos vencidos y registra "X se fue del refugio".
 *  Idempotente: un candidato solo puede irse una vez (al eliminarlo del
 *  array deja de existir). Los reclutados (status «active») y los que el
 *  jugador ignoró (ya eliminados) nunca caen aquí.
 *  `migrateOnly`: solo alinea foundAt/expiresAt SIN emitir log (uso en
 *  loadGame, donde el estado aún no pasó por el repair del log). */
export function purgeExpiredCandidates(
  state: GameState,
  now: number,
  migrateOnly = false,
): StandbyPurgeResult {
  const left: NpcSurvivor[] = [];
  const keep: NpcSurvivor[] = [];
  for (const npc of state.npcs) {
    if ((npc.status ?? "active") !== "candidate") {
      keep.push(npc);
      continue;
    }
    ensureStandby(npc, now);
    if (now >= (npc.expiresAt ?? now + 1)) {
      left.push(npc);
    } else {
      keep.push(npc);
    }
  }
  if (left.length > 0) {
    state.npcs = keep;
    for (const npc of left) {
      delete state.npcCycles[npc.id];
      // Las asignaciones crafteadas a un candidato ya murieron solas
      // (solo targets «active»); no hay nada que limpiar.
    }
    if (!migrateOnly) {
      for (const npc of left) {
        pushLog(state, {
          zona: "global",
          origen: "auto",
          category: "NPC_ACTION",
          subtype: "se_fue",
          fields: {
            npc: `${npc.id}·${npc.name}`,
            motivo: "vencimiento_standby",
            nombre: npc.name,
          },
          mensaje: `${npcDisplayName(npc)} se fue del refugio`,
        });
      }
    }
  }
  return { left };
}

/** Remaining ms of standby for a candidate (≥ 0 once deadline passed). */
export function standbyRemainingMs(npc: Pick<NpcSurvivor, "expiresAt">, now: number): number {
  if (typeof npc.expiresAt !== "number" || !Number.isFinite(npc.expiresAt)) return 0;
  return Math.max(0, npc.expiresAt - now);
}

/** "2h 35m" / "45m" — el tiempo que le queda de espera al candidato. */
export function formatStandbyRemaining(ms: number): string {
  const totalMin = Math.ceil(Math.max(0, ms) / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Devuelve el próximo vencimiento pendiente (ms absoluto) o null. */
export function nextStandbyExpiry(state: GameState): number | null {
  let next: number | null = null;
  for (const npc of state.npcs) {
    if ((npc.status ?? "active") !== "candidate") continue;
    if (typeof npc.expiresAt === "number" && Number.isFinite(npc.expiresAt)) {
      if (next == null || npc.expiresAt < next) next = npc.expiresAt;
    }
  }
  return next;
}
