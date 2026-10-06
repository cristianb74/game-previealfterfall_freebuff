import { BALANCE } from "./balance";
import type { BuildingKey, ResourceKey } from "./types";

// ============================================================
// AFTERFALL — world zones. Exactly 20, unlocked progressively by EXP.
// Names, images, descriptions and rewards are editable here.
// Zone images: /assets/stages/stage-XX.svg (rendered with object-fit: cover).
//
// REBALANCEO v3 — los umbrales de desbloqueo ya NO son números sueltos:
// se derivan de la curva expZona(n) = round(B × r^(n−1)) definida en
// BALANCE (zoneExpBase / zoneExpGrowth). Z1 sigue siendo la zona inicial
// (0 EXP); la exigencia es CUMULATIVA (sumar todos los tramos previos).
// ============================================================

/** EXP needed to cross from zone n−1 into zone n (n ≥ 2; Z1 = 0). */
export function zoneExpRequirement(n: number): number {
  if (n <= 1) return 0;
  return Math.round(BALANCE.zoneExpBase * Math.pow(BALANCE.zoneExpGrowth, n - 1));
}

/** Legacy v2 unlock thresholds (acumulado), CONGELADOS para la migración:
 *  nunca rebalancear estos números — preservan las zonas ya desbloqueadas
 *  de las partidas antiguas (ver migrateV2ToV3 en saveSystem.ts). */
export const LEGACY_UNLOCK_EXP_V2: Record<number, number> = {
  1: 0,
  2: 150,
  3: 450,
  4: 900,
  5: 1600,
  6: 2600,
  7: 4000,
  8: 5800,
  9: 8000,
  10: 10800,
  11: 14000,
  12: 17800,
  13: 22300,
  14: 27500,
  15: 33500,
  16: 40500,
  17: 48500,
  18: 57500,
  19: 67500,
  20: 79000,
};

/** Mayor zona que LEGACY_UNLOCK_EXP_V2 concede para una EXP total dada. */
export function legacyUnlockFloorV2(expTotal: number): number {
  let floor = 1;
  for (const z of ZONES) {
    if (expTotal >= (LEGACY_UNLOCK_EXP_V2[z.id] ?? Infinity)) {
      floor = Math.max(floor, z.id);
    }
  }
  return floor;
}

/** EXP que falta para desbloquear la siguiente zona del estado (0 si ya
 *  está la última). Helper compartido por offline y online tick. */
export function nextZoneExpRequirement(state: { expTotal: number }): number {
  const next = ZONES.find((z) => state.expTotal < z.unlockExp);
  return next ? next.unlockExp - state.expTotal : 0;
}

/** ¿Está desbloqueada la zona para este estado? Curva nueva O floor
 *  migrado — NADIE pierde zonas. Toda lectura de gates (UI, acciones,
 *  coreBuildingUnlocked) debe usar esto en vez de comparar unlockExp.
 *  El fallback re-deriva el floor v2 para documentos aún sin migrar. */
export function isZoneUnlocked(
  state: { expTotal: number; unlockedZoneFloor?: number },
  zoneId: number,
): boolean {
  const z = getZone(zoneId);
  if (state.expTotal >= z.unlockExp) return true;
  const floor = Math.max(1, state.unlockedZoneFloor ?? legacyUnlockFloorV2(state.expTotal));
  return z.id <= floor;
}

/** Primera zona NO desbloqueada (respeta el floor migrado); null si ya
 *  están las 20. Para barras de progreso y etiquetas de HUD. */
export function nextLockedZoneFor(state: { expTotal: number; unlockedZoneFloor?: number }): ZoneDef | null {
  return ZONES.find((z) => !isZoneUnlocked(state, z.id)) ?? null;
}

export interface ZoneDef {
  id: number; // 1–20
  name: string;
  description: string;
  /** Total EXP needed to unlock this zone (cumulative; derived from the
   *  v3 EXP curve below — do not edit per-row). */
  unlockExp: number;
  /** Exploration duration in minutes. */
  explorationMinutes: number;
  /** EXP reward for the player per completed exploration. */
  playerExpReward: number;
  /** EXP reward gained by the assigned NPC per completed player exploration. */
  npcExpReward: number;
  /** Possible resources (weighted by their associated stats). */
  resources: ResourceKey[];
  /** Zone specialization: finds of this resource are amplified here.
   *  Chosen from the zone's own resource pool (thematic focus). */
  focus: ResourceKey;
}

type ZoneRow = Omit<ZoneDef, "id" | "unlockExp"> & { id: number };

const ZONE_ROWS: ZoneRow[] = [
  { id: 1, name: "Apartamentos Ruinosos", description: "Bloques de viviendas derruidos. Restos de vidas cotidianas entre el polvo.", explorationMinutes: 1, playerExpReward: 12, npcExpReward: 4, resources: ["materiales", "comida", "agua", "medicamentos"], focus: "comida" },
  { id: 2, name: "Supermercado Saqueado", description: "Estanterías volcadas y latas olvidadas tras los mostradores.", explorationMinutes: 2, playerExpReward: 20, npcExpReward: 6, resources: ["comida", "agua", "materiales", "componentes"], focus: "comida" },
  { id: 3, name: "Gasolinera Abandonada", description: "Tanques vacíos, químicos derramados y herramientas útiles.", explorationMinutes: 3, playerExpReward: 28, npcExpReward: 9, resources: ["materiales", "componentes", "dinero"], focus: "materiales" },
  { id: 4, name: "Hospital Derruido", description: "Pasillos colapsados y botiquines escondidos en la oscuridad.", explorationMinutes: 4, playerExpReward: 36, npcExpReward: 12, resources: ["medicamentos", "materiales"], focus: "medicamentos" },
  { id: 5, name: "Bloque de Oficinas", description: "Torres grises donde aún zumba algún equipo con suerte.", explorationMinutes: 5, playerExpReward: 45, npcExpReward: 15, resources: ["componentes", "dinero", "materiales"], focus: "componentes" },
  { id: 6, name: "Colegio en Ruinas", description: "Aulas cubiertas de ceniza y refugios improvisados.", explorationMinutes: 6, playerExpReward: 55, npcExpReward: 18, resources: ["comida", "materiales", "medicamentos"], focus: "materiales" },
  { id: 7, name: "Fábrica Textil", description: "Maquinaria pesada y bobinas de material resistente.", explorationMinutes: 7, playerExpReward: 66, npcExpReward: 22, resources: ["materiales", "componentes"], focus: "materiales" },
  { id: 8, name: "Estación de Tren", description: "Vagones sellados y almacenes con suministros retenidos.", explorationMinutes: 8, playerExpReward: 78, npcExpReward: 26, resources: ["comida", "componentes", "dinero"], focus: "componentes" },
  { id: 9, name: "Depósito de Agua", description: "Cisternas gigantes. Todavía queda algo abajo.", explorationMinutes: 9, playerExpReward: 92, npcExpReward: 30, resources: ["agua", "materiales"], focus: "agua" },
  { id: 10, name: "Colonia Cercada", description: "Otros supervivientes levantaron muros. Algunos ya no están.", explorationMinutes: 10, playerExpReward: 106, npcExpReward: 35, resources: ["comida", "agua", "materiales", "medicamentos"], focus: "agua" },
  { id: 11, name: "Policlínica Militar", description: "Equipos médicos militares entre escombros irradiados.", explorationMinutes: 12, playerExpReward: 122, npcExpReward: 40, resources: ["medicamentos", "componentes"], focus: "medicamentos" },
  { id: 12, name: "Zona Industrial Norte", description: "Naves enormes. Grúas quietas sobre hierro oxidado.", explorationMinutes: 14, playerExpReward: 140, npcExpReward: 46, resources: ["materiales", "componentes", "dinero"], focus: "materiales" },
  { id: 13, name: "Barrios Colapsados", description: "Callejones inestables donde la estructura cruje con el viento.", explorationMinutes: 16, playerExpReward: 158, npcExpReward: 52, resources: ["materiales", "comida"], focus: "materiales" },
  { id: 14, name: "Central Eléctrica", description: "Turbinas muertas y baterías con una última carga.", explorationMinutes: 18, playerExpReward: 178, npcExpReward: 58, resources: ["componentes", "dinero", "materiales"], focus: "componentes" },
  { id: 15, name: "Laboratorio Químico", description: "Firmado con símbolos de radiación. Los equipos siguen ahí.", explorationMinutes: 20, playerExpReward: 200, npcExpReward: 66, resources: ["componentes", "medicamentos"], focus: "medicamentos" },
  { id: 16, name: "Depósito Militar", description: "Contenedores sellados con suministros estandarizados.", explorationMinutes: 22, playerExpReward: 224, npcExpReward: 74, resources: ["materiales", "comida", "medicamentos"], focus: "medicamentos" },
  { id: 17, name: "Torres Residenciales", description: "Rascacielos huecos. Subir y bajar cuesta horas.", explorationMinutes: 24, playerExpReward: 250, npcExpReward: 82, resources: ["materiales", "componentes", "agua"], focus: "agua" },
  { id: 18, name: "Puerto Mercante", description: "Contenedores apilados hasta el horizonte, oxidados por la bruma.", explorationMinutes: 26, playerExpReward: 280, npcExpReward: 92, resources: ["materiales", "componentes", "dinero"], focus: "componentes" },
  { id: 19, name: "Zona de Cuarentena", description: "Lonas plásticas, filtros y silencio. Algo pasó aquí dentro.", explorationMinutes: 28, playerExpReward: 315, npcExpReward: 104, resources: ["medicamentos", "componentes", "dinero"], focus: "medicamentos" },
  { id: 20, name: "Base Militar", description: "El último bastión organizado. Comando de la resistencia.", explorationMinutes: 30, playerExpReward: 360, npcExpReward: 120, resources: ["materiales", "comida", "agua", "medicamentos", "componentes", "dinero"], focus: "componentes" },
];

export const ZONES: ZoneDef[] = ZONE_ROWS.map((row) => ({ ...row, unlockExp: 0 }));

// Thresholds: cumulative sum of the v3 curve (Z1 = 0; n ≥ 2 adds
// round(zoneExpBase × zoneExpGrowth^(n−1))). Single source of tuning:
// BALANCE.zoneExpBase / BALANCE.zoneExpGrowth.
{
  let acc = 0;
  for (let n = 1; n <= ZONES.length; n++) {
    acc += zoneExpRequirement(n);
    ZONES[n - 1].unlockExp = acc;
  }
}

/** Zone focus bonus by depth band (tunable here, applied in explorationEngine
 *  and npcProductionMultiplier). Z1–5 +15 % · Z6–10 +20 % · Z11–15 +25 % ·
 *  Z16–20 +30 %. */
export function zoneFocusBonus(zoneId: number): number {
  if (zoneId <= 5) return 0.15;
  if (zoneId <= 10) return 0.2;
  if (zoneId <= 15) return 0.25;
  return 0.3;
}

// Building that becomes available when each zone unlocks.
const ZONE_BUILDINGS: Partial<Record<number, BuildingKey>> = {
  1: "cocina",
  2: "tanque",
  3: "almacen",
  5: "enfermeria",
  7: "taller",
  10: "generador",
};


export function getZone(id: number): ZoneDef {
  return ZONES[Math.min(Math.max(id, 1), ZONES.length) - 1];
}

export function zoneImage(id: number): string {
  const n = String(getZone(id).id).padStart(2, "0");
  // Codecs: prefer PNG for the stage artwork (1440×900). The asset folder
  // retains filenames per stage (stage-01, stage-02, ...) so the HREF stays
  // static per zone and does not shift when one stage is swapped.
  return `/assets/stages/stage-${n}.png`;
}

// image field kept out of ZoneDef data rows; provided by this helper

export function zoneBuildingUnlock(id: number): BuildingKey | null {
  return ZONE_BUILDINGS[id] ?? null;
}

/** Frontier = highest zone the player has ever reached. Tracked durably
 *  via pendingZoneUnlock so traveling back to old zones never disturbs it. */
export function frontierZoneId(state: { pendingZoneUnlock: number | null }): number {
  return state.pendingZoneUnlock ?? 1;
}

export { ZONE_BUILDINGS as ZONE_BUILDING_MAP };
export { BALANCE };
