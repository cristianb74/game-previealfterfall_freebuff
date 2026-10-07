import { BALANCE, teamFoodUpkeepPerHour, teamWaterUpkeepPerHour } from "./balance";
import { pushLog } from "./log";
import type { GameState } from "./types";

// ============================================================
// AFTERFALL — consumo de comida/agua del EQUIPO (NPC reclutados).
//
// Por NPC y hora: FOOD/WATER_PER_HOUR_PLAYER × NPC_CONSUMPTION_FACTOR
//   × npc.consumptionMultiplier (default 1.0).
// Se cobra por TIEMPO TRANSCURRIDO desde `state.lastConsumptionAt`
// (timestamps reales — funciona con la app cerrada) con tope de
// BALANCE.npcConsumptionOfflineCapMs (24 hs) para no vaciar todo de golpe.
//
// Cuando falta (o está al mínimo) comida o agua, los NPC RECLUTADOS
// PIERDEN su bonus de especialidad hasta que haya recursos (no se van,
// no mueren). El aviso vive en GameState (npcBonusLostFood/npcBonusLostWater,
// campos opcionales — saves previos nunca los tuvieron) y SOLO se loguea
// el CAMBIO: "Sin agua: los NPC no aportan bonus" / "Bonus reanudado".
//
// La parte del JUGADOR la cobra el mismo settle (una sola pasada para
// jugador + equipo): la tasa efectiva del jugador la pasa el llamador
// (onlineTick le aplica el buff Kit de provisiones; offlineProgress su
// prorrateo del buff) para que el buff siga funcionando exactamente igual.
// ============================================================

/** Colapsa consumo del equipo (jugador + NPC) al stock común:
 *  min(foodMin, waterMin) — la MISMA regla del gate npcMinimumFoodWaterMin. */
export function teamStockMin(state: Pick<GameState, "foodMin" | "waterMin">): number {
  return Math.min(state.foodMin, state.waterMin);
}

export interface ConsumptionResult {
  /** Consumo cobrado este paso (min, jugador + equipo juntos). */
  foodSpent: number;
  waterSpent: number;
  /** Marca horaria hasta la que el consumo quedó cobrado. */
  settledAt: number;
  /** Cuántos ms se cobraron (≤ tope). */
  chargedMs: number;
  /** Transiciones del aviso ocurridas EN ESTE paso (para toast/UI). */
  bonusLost: boolean;
  bonusResumed: boolean;
}

export interface SettleConsumptionOpts {
  /** Tasa efectiva del jugador (min/h). Default: BALANCE sin buff. */
  playerFoodPerHour?: number;
  playerWaterPerHour?: number;
  /** Tasa efectiva del EQUIPO (min/h, suma de NPC reclutados). Default:
   *  teamFood/WaterUpkeepPerHour(state.npcs). Las rutas la pasan ya
   *  prorrateada con el buff Kit de provisiones (igual que se venía
   *  haciendo con el consumo NPC). */
  teamFoodPerHour?: number;
  teamWaterPerHour?: number;
  /** Tope de ventana a cobrar (ms). Default: 24 hs offline. La ruta
   *  offline pasa su propio tope (BALANCE.offlineCapHours) para no
   *  romper su cap más generoso. */
  maxChargeMs?: number;
  /** A dónde adelantar el ledger (ms absoluto). Default: la marca
   *  cobrada. La ruta offline pasa `now` para PERDONAR el excedente
   *  fuera de su ventana (nunca cobra doble al volver). */
  ledgerTo?: number;
}

/** ¿Falta comida/agua para el régimen? (min/0) — la MISMA regla que pausa
 *  la producción de los NPC. */
export function resourcesShort(state: GameState): boolean {
  return state.foodMin <= BALANCE.npcMinimumFoodWaterMin || state.waterMin <= BALANCE.npcMinimumFoodWaterMin;
}

/** Aviso compacto para la UI, o null si hay recursos. */
export function bonusLostMessage(state: GameState): string | null {
  if (!resourcesShort(state)) return null;
  const food = state.foodMin <= BALANCE.npcMinimumFoodWaterMin;
  const water = state.waterMin <= BALANCE.npcMinimumFoodWaterMin;
  if (food && water) return "Sin comida ni agua: los NPC no aportan bonus";
  return food ? "Sin comida: los NPC no aportan bonus" : "Sin agua: los NPC no aportan bonus";
}

/** Recauda el consumo del JUGADOR + EQUIPO desde lastConsumptionAt hasta
 *  `now`. Idempotente: adelanta el ledger a la marca procesada. Emite el
 *  log SOLO en las transiciones del aviso (se acabó / volvió) — nunca
 *  cada tick. */
export function settleConsumption(
  state: GameState,
  now: number,
  opts: SettleConsumptionOpts = {},
): ConsumptionResult {
  // Backfill de saves previos: el consumo siempre se venía cobrando del
  // delta del tick → arrancar desde lastTickAt (no cobra doble ni regala).
  if (typeof state.lastConsumptionAt !== "number" || !Number.isFinite(state.lastConsumptionAt)) {
    state.lastConsumptionAt = state.lastTickAt ?? now;
  }
  const rawMs = Math.max(0, now - state.lastConsumptionAt);
  const capMs = opts.maxChargeMs ?? BALANCE.npcConsumptionOfflineCapMs;
  const chargedMs = Math.min(rawMs, capMs);
  const hours = chargedMs / 3_600_000;
  const playerFood = (opts.playerFoodPerHour ?? BALANCE.FOOD_PER_HOUR_PLAYER) * hours;
  const playerWater = (opts.playerWaterPerHour ?? BALANCE.WATER_PER_HOUR_PLAYER) * hours;
  const teamFood = (opts.teamFoodPerHour ?? teamFoodUpkeepPerHour(state.npcs)) * hours;
  const teamWater = (opts.teamWaterPerHour ?? teamWaterUpkeepPerHour(state.npcs)) * hours;

  if (chargedMs > 0) {
    state.foodMin = Math.max(0, state.foodMin - playerFood - teamFood);
    state.waterMin = Math.max(0, state.waterMin - playerWater - teamWater);
  }
  const settledAt = opts.ledgerTo ?? state.lastConsumptionAt + chargedMs;
  state.lastConsumptionAt = settledAt;

  // Transición del aviso (el CAMBIO es el evento importante):
  const foodOut = state.foodMin <= BALANCE.npcMinimumFoodWaterMin;
  const waterOut = state.waterMin <= BALANCE.npcMinimumFoodWaterMin;
  const prevFoodLost = state.npcBonusLostFood === true;
  const prevWaterLost = state.npcBonusLostWater === true;

  const lostFood = foodOut && !prevFoodLost;
  const resumedFood = !foodOut && prevFoodLost;
  const lostWater = waterOut && !prevWaterLost;
  const resumedWater = !waterOut && prevWaterLost;
  state.npcBonusLostFood = foodOut;
  state.npcBonusLostWater = waterOut;

  // UN log por transición (combinado si ocurren a la vez).
  if (lostFood || lostWater) {
    const both = (lostFood && (lostWater || prevWaterLost || waterOut)) ||
      (lostWater && (lostFood || prevFoodLost || foodOut));
    const recurso = both ? "comida y agua" : lostFood ? "comida" : "agua";
    pushLog(state, {
      zona: "global",
      origen: "auto",
      category: "NPC_ACTION",
      subtype: "bonus_perdido",
      fields: { recurso, motivo: "sin_recursos" },
      mensaje: `Sin ${recurso}: los NPC no aportan bonus`,
    });
  }
  if (resumedFood || resumedWater) {
    const both = resumedFood && resumedWater;
    const recurso = both ? "comida y agua" : resumedFood ? "comida" : "agua";
    pushLog(state, {
      zona: "global",
      origen: "auto",
      category: "NPC_ACTION",
      subtype: "bonus_reanudado",
      fields: { recurso },
      mensaje: `Bonus de especialidad reanudado (${recurso} disponible)`,
    });
  }

  return {
    foodSpent: Math.round((playerFood + teamFood) * 1000) / 1000,
    waterSpent: Math.round((playerWater + teamWater) * 1000) / 1000,
    settledAt,
    chargedMs,
    bonusLost: lostFood || lostWater,
    bonusResumed: resumedFood || resumedWater,
  };
}

/** Cuánto dura el STOCK de comida/agua con el consumo ACTUAL
 *  (jugador + equipo) — para la UI: "Agua para 6h". */
export function stockHoursFor(
  state: Pick<GameState, "foodMin" | "waterMin" | "npcs">,
): { foodHours: number; waterHours: number } {
  const foodRate = BALANCE.FOOD_PER_HOUR_PLAYER + teamFoodUpkeepPerHour(state.npcs);
  const waterRate = BALANCE.WATER_PER_HOUR_PLAYER + teamWaterUpkeepPerHour(state.npcs);
  return {
    foodHours: foodRate > 0 ? state.foodMin / foodRate : Infinity,
    waterHours: waterRate > 0 ? state.waterMin / waterRate : Infinity,
  };
}
