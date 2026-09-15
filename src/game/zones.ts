import { BALANCE } from "./balance";
import type { BuildingKey, ResourceKey } from "./types";

// ============================================================
// AFTERFALL — world zones. Exactly 20, unlocked progressively by EXP.
// Names, images, descriptions and rewards are editable here.
// Zone images: /assets/stages/stage-XX.svg (rendered with object-fit: cover).
// ============================================================

export interface ZoneDef {
  id: number; // 1–20
  name: string;
  description: string;
  /** Total EXP needed to unlock this zone. */
  unlockExp: number;
  /** Exploration duration in minutes. */
  explorationMinutes: number;
  /** EXP reward for the player per completed exploration. */
  playerExpReward: number;
  /** EXP reward gained by the assigned NPC per completed player exploration. */
  npcExpReward: number;
  /** Possible resources (weighted by their associated stats). */
  resources: ResourceKey[];
}

export const ZONES: ZoneDef[] = [
  { id: 1, name: "Apartamentos Ruinosos", description: "Bloques de viviendas derruidos. Restos de vidas cotidianas entre el polvo.", unlockExp: 0, explorationMinutes: 1, playerExpReward: 12, npcExpReward: 4, resources: ["materiales", "comida", "agua", "medicamentos"] },
  { id: 2, name: "Supermercado Saqueado", description: "Estanterías volcadas y latas olvidadas tras los mostradores.", unlockExp: 150, explorationMinutes: 2, playerExpReward: 20, npcExpReward: 6, resources: ["comida", "agua", "materiales", "componentes"] },
  { id: 3, name: "Gasolinera Abandonada", description: "Tanques vacíos, químicos derramados y herramientas útiles.", unlockExp: 450, explorationMinutes: 3, playerExpReward: 28, npcExpReward: 9, resources: ["materiales", "componentes", "energia"] },
  { id: 4, name: "Hospital Derruido", description: "Pasillos colapsados y botiquines escondidos en la oscuridad.", unlockExp: 900, explorationMinutes: 4, playerExpReward: 36, npcExpReward: 12, resources: ["medicamentos", "materiales"] },
  { id: 5, name: "Bloque de Oficinas", description: "Torres grises donde aún zumba algún equipo con suerte.", unlockExp: 1600, explorationMinutes: 5, playerExpReward: 45, npcExpReward: 15, resources: ["componentes", "energia", "materiales"] },
  { id: 6, name: "Colegio en Ruinas", description: "Aulas cubiertas de ceniza y refugios improvisados.", unlockExp: 2600, explorationMinutes: 6, playerExpReward: 55, npcExpReward: 18, resources: ["comida", "materiales", "medicamentos"] },
  { id: 7, name: "Fábrica Textil", description: "Maquinaria pesada y bobinas de material resistente.", unlockExp: 4000, explorationMinutes: 7, playerExpReward: 66, npcExpReward: 22, resources: ["materiales", "componentes"] },
  { id: 8, name: "Estación de Tren", description: "Vagones sellados y almacenes con suministros retenidos.", unlockExp: 5800, explorationMinutes: 8, playerExpReward: 78, npcExpReward: 26, resources: ["comida", "componentes", "dinero"] },
  { id: 9, name: "Depósito de Agua", description: "Cisternas gigantes. Todavía queda algo abajo.", unlockExp: 8000, explorationMinutes: 9, playerExpReward: 92, npcExpReward: 30, resources: ["agua", "materiales"] },
  { id: 10, name: "Colonia Cercada", description: "Otros supervivientes levantaron muros. Algunos ya no están.", unlockExp: 10800, explorationMinutes: 10, playerExpReward: 106, npcExpReward: 35, resources: ["comida", "agua", "materiales", "medicamentos"] },
  { id: 11, name: "Policlínica Militar", description: "Equipos médicos militares entre escombros irradiados.", unlockExp: 14000, explorationMinutes: 12, playerExpReward: 122, npcExpReward: 40, resources: ["medicamentos", "componentes"] },
  { id: 12, name: "Zona Industrial Norte", description: "Naves enormes. Grúas quietas sobre hierro oxidado.", unlockExp: 17800, explorationMinutes: 14, playerExpReward: 140, npcExpReward: 46, resources: ["materiales", "componentes", "energia"] },
  { id: 13, name: "Barrios Colapsados", description: "Callejones inestables donde la estructura cruje con el viento.", unlockExp: 22300, explorationMinutes: 16, playerExpReward: 158, npcExpReward: 52, resources: ["materiales", "comida"] },
  { id: 14, name: "Central Eléctrica", description: "Turbinas muertas y baterías con una última carga.", unlockExp: 27500, explorationMinutes: 18, playerExpReward: 178, npcExpReward: 58, resources: ["energia", "componentes"] },
  { id: 15, name: "Laboratorio Químico", description: "Firmado con símbolos de radiación. Los equipos siguen ahí.", unlockExp: 33500, explorationMinutes: 20, playerExpReward: 200, npcExpReward: 66, resources: ["componentes", "medicamentos"] },
  { id: 16, name: "Depósito Militar", description: "Contenedores sellados con suministros estandarizados.", unlockExp: 40500, explorationMinutes: 22, playerExpReward: 224, npcExpReward: 74, resources: ["materiales", "comida", "medicamentos"] },
  { id: 17, name: "Torres Residenciales", description: "Rascacielos huecos. Subir y bajar cuesta horas.", unlockExp: 48500, explorationMinutes: 24, playerExpReward: 250, npcExpReward: 82, resources: ["materiales", "componentes", "agua"] },
  { id: 18, name: "Puerto Mercante", description: "Contenedores apilados hasta el horizonte, oxidados por la bruma.", unlockExp: 57500, explorationMinutes: 26, playerExpReward: 280, npcExpReward: 92, resources: ["materiales", "componentes", "dinero"] },
  { id: 19, name: "Zona de Cuarentena", description: "Lonas plásticas, filtros y silencio. Algo pasó aquí dentro.", unlockExp: 67500, explorationMinutes: 28, playerExpReward: 315, npcExpReward: 104, resources: ["medicamentos", "componentes", "energia"] },
  { id: 20, name: "Base Militar", description: "El último bastión organizado. Comando de la resistencia.", unlockExp: 79000, explorationMinutes: 30, playerExpReward: 360, npcExpReward: 120, resources: ["materiales", "comida", "agua", "medicamentos", "componentes", "energia"] },
];

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
  return `/assets/stages/stage-${n}.svg`;
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
