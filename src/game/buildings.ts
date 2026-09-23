import { BALANCE } from "./balance";
import type { BuildingKey, ResourceKey } from "./types";

// ============================================================
// AFTERFALL — buildings (SAVE_VERSION 2 redesign).
//
// TWO building families:
//  1. CORE (BUILDINGS): the 6 classic buildings. GLOBAL — a single shared
//     instance per character lives in GameState.base and its bonus applies
//     in EVERY zone.
//  2. THEMATIC (ZONE_THEMATIC_BUILDINGS): 1–2 per zone, bound to the zone's
//     resource pool. LOCAL — they only boost finds in their own zone.
//     The four former "exclusive" buildings keep their exact keys
//     (invernadero, laboratorio, perforadora, hormigonera) so old
//     investments migrate untouched.
// Levels 0–10 for both families; cost/time curves are shared for now
// (first iteration) so the migration refund maps 1:1 onto paid levels.
// ============================================================

export interface BuildingDef {
  key: BuildingKey;
  name: string;
  description: string;
  icon: string;
  /** Resource boosted by this building (relative bonus). */
  specializes: ResourceKey;
}

export const BUILDINGS: BuildingDef[] = [
  {
    key: "cocina",
    name: "Cocina",
    description: "Raciones calientes y conservas bien aprovechadas. Mejora los hallazgos de Comida en todas las zonas.",
    icon: "🍲",
    specializes: "comida",
  },
  {
    key: "tanque",
    name: "Tanque de Agua",
    description: "Captación y filtrado de agua. Mejora los hallazgos de Agua en todas las zonas.",
    icon: "🚰",
    specializes: "agua",
  },
  {
    key: "almacen",
    name: "Almacén",
    description: "Chatarra ordenada y estanterías reforzadas. Mejora los hallazgos de Materiales en todas las zonas.",
    icon: "📦",
    specializes: "materiales",
  },
  {
    key: "enfermeria",
    name: "Enfermería",
    description: "Vendas, sueros y un camastro limpio. Mejora los hallazgos de Medicamentos en todas las zonas.",
    icon: "🩹",
    specializes: "medicamentos",
  },
  {
    key: "taller",
    name: "Taller",
    description: "Bancos de trabajo y herramientas finas. Mejora los hallazgos de Componentes en todas las zonas.",
    icon: "🔧",
    specializes: "componentes",
  },
  {
    key: "generador",
    name: "Generador",
    description: "Diésel, paneles y cableado recuperado. Mejora los hallazgos de Energía en todas las zonas.",
    icon: "🔌",
    specializes: "energia",
  },
];

export const BUILDING_BY_KEY: Record<BuildingKey, BuildingDef> = BUILDINGS.reduce(
  (acc, b) => {
    acc[b.key] = b;
    return acc;
  },
  {} as Record<BuildingKey, BuildingDef>,
);

/** Core building made available once this zone id is reached/unlocked
 *  (progression gate for the GLOBAL base — same gating the per-zone model
 *  used before v2, so player progression is not thrown away). */
export const CORE_BUILDING_GATE_ZONE: Record<BuildingKey, number> = {
  cocina: 1,
  tanque: 2,
  almacen: 3,
  enfermeria: 5,
  taller: 7,
  generador: 10,
};

// ============================================================
// THEMATIC BUILDINGS — 31 defs across the 20 zones (1–2 per zone).
// `specializes` always belongs to the host zone's `resources` pool.
// ============================================================
export interface ThematicDef {
  key: string;
  name: string;
  description: string;
  icon: string;
  specializes: ResourceKey;
  zone: number;
}

export const ZONE_THEMATIC_BUILDINGS: ThematicDef[] = [
  // Z01 — Apartamentos Ruinosos (focus: comida)
  {
    key: "invernadero",
    name: "Invernadero Hidropónico",
    description: "Cultivos protegidos bajo plástico recuperado. Solo posible en la cocina comunitaria de Z01.",
    icon: "🌱",
    specializes: "comida",
    zone: 1,
  },
  // Z02 — Supermercado Saqueado (focus: comida)
  {
    key: "camara_frigorifica",
    name: "Cámara Frigorífica",
    description: "Compresores parcheados que mantienen fría la despensa del supermercado.",
    icon: "🧊",
    specializes: "comida",
    zone: 2,
  },
  {
    key: "fondo_almacen",
    name: "Fondo de Almacén",
    description: "La trastienda que nadie llegó a vaciar: cajas, estibas y cinta de embalar.",
    icon: "📦",
    specializes: "materiales",
    zone: 2,
  },
  // Z03 — Gasolinera Abandonada (focus: materiales)
  {
    key: "bodega_herramientas",
    name: "Bodega de Herramientas",
    description: "Llaves, palancas y un juego de dados intacto tras el mostrador.",
    icon: "🔧",
    specializes: "materiales",
    zone: 3,
  },
  {
    key: "bomba_succion",
    name: "Bomba de Succión",
    description: "Bombea el fondo de los tanques: restos útiles y químicos aprovechables.",
    icon: "⚙",
    specializes: "componentes",
    zone: 3,
  },
  // Z04 — Hospital Derruido (focus: medicamentos)
  {
    key: "laboratorio",
    name: "Laboratorio de Campo",
    description: "Síntesis de sueros a partir de los restos clínicos. Exclusivo del Hospital (Z04).",
    icon: "🧪",
    specializes: "medicamentos",
    zone: 4,
  },
  {
    key: "quirofano",
    name: "Quirófano Improvisado",
    description: "Luz de cirugía a media potencia y instrumental esterilizado a la vieja usanza.",
    icon: "🩺",
    specializes: "medicamentos",
    zone: 4,
  },
  // Z05 — Bloque de Oficinas (focus: componentes)
  {
    key: "sala_servidores",
    name: "Sala de Servidores",
    description: "Racks apagados con oro, cobre y placas que aún sirven.",
    icon: "🖧",
    specializes: "componentes",
    zone: 5,
  },
  // Z06 — Colegio en Ruinas (focus: materiales)
  {
    key: "bodega_mantenimiento",
    name: "Bodega de Mantenimiento",
    description: "El cuarto del conserje: pintura, tornillería y listones rescatables.",
    icon: "🧰",
    specializes: "materiales",
    zone: 6,
  },
  {
    key: "cafeteria_escolar",
    name: "Cafetería Escolar",
    description: "Ollas industriales y despensa de conserva a medio saquear.",
    icon: "🍲",
    specializes: "comida",
    zone: 6,
  },
  // Z07 — Fábrica Textil (focus: materiales)
  {
    key: "linea_ensamblaje",
    name: "Línea de Ensamblaje",
    description: "Cintas y prensas detenidas: chatarra gruesa de alta calidad.",
    icon: "🏭",
    specializes: "materiales",
    zone: 7,
  },
  {
    key: "sala_motores",
    name: "Sala de Motores",
    description: "Motores paso a paso, correas y rodamientos aprovechables.",
    icon: "⚙",
    specializes: "componentes",
    zone: 7,
  },
  // Z08 — Estación de Tren (focus: componentes)
  {
    key: "taller_ferroviario",
    name: "Taller Ferroviario",
    description: "Andén de mantenimiento: instrumental pesado y piezas de precisión.",
    icon: "🚂",
    specializes: "componentes",
    zone: 8,
  },
  {
    key: "vagon_sellado",
    name: "Vagón Sellado",
    description: "Un vagón cerrado desde el Estallido: latas apiladas en la penumbra.",
    icon: "🥫",
    specializes: "comida",
    zone: 8,
  },
  // Z09 — Depósito de Agua (focus: agua)
  {
    key: "perforadora",
    name: "Perforadora de Pozos",
    description: "Taladra el acuífero profundo del depósito. Solo construible en Z09.",
    icon: "🕳",
    specializes: "agua",
    zone: 9,
  },
  {
    key: "filtro_potabilizador",
    name: "Filtro Potabilizador",
    description: "Lechos de arena y carbón activo: limpia el agua de las cisternas.",
    icon: "🚿",
    specializes: "agua",
    zone: 9,
  },
  // Z10 — Colonia Cercada (focus: agua)
  {
    key: "aljibe_comunitario",
    name: "Aljibe Comunitario",
    description: "El aljibe que la colonia cavó antes de abandonar los muros.",
    icon: "🪣",
    specializes: "agua",
    zone: 10,
  },
  {
    key: "huerto_comunitario",
    name: "Huerto Comunitario",
    description: "Bancales entre las casas: alguien sembró para quedarse.",
    icon: "🌿",
    specializes: "comida",
    zone: 10,
  },
  // Z11 — Policlínica Militar (focus: medicamentos)
  {
    key: "esterilizador_campo",
    name: "Esterilizador de Campo",
    description: "Autoclave militar que aún sostiene presión: material médico limpio.",
    icon: "🧫",
    specializes: "medicamentos",
    zone: 11,
  },
  // Z12 — Zona Industrial Norte (focus: materiales)
  {
    key: "hormigonera",
    name: "Hormigonera Industrial",
    description: "Produce bloques prefabricados de alta resistencia. Exclusiva de la Zona Industrial (Z12).",
    icon: "🧱",
    specializes: "materiales",
    zone: 12,
  },
  {
    key: "cinta_transportadora",
    name: "Cinta Transportadora",
    description: "Motores, sensores y rodillos de la línea de expedición.",
    icon: "📟",
    specializes: "componentes",
    zone: 12,
  },
  // Z13 — Barrios Colapsados (focus: materiales)
  {
    key: "punto_acopio",
    name: "Punto de Acopio",
    description: "Un cruce defendido con barricadas: todo lo útil acaba aquí.",
    icon: "🪙",
    specializes: "materiales",
    zone: 13,
  },
  {
    key: "huerto_azotea",
    name: "Huerto en Azotea",
    description: "Macetones y regaderas sobre una azotea que aún aguanta.",
    icon: "🌱",
    specializes: "comida",
    zone: 13,
  },
  // Z14 — Central Eléctrica (focus: componentes)
  {
    key: "turbina_auxiliar",
    name: "Turbina Auxiliar",
    description: "La turbina de arranque: bobinados y válvulas en buen estado.",
    icon: "⚡",
    specializes: "componentes",
    zone: 14,
  },
  {
    key: "red_cableado",
    name: "Red de Cableado",
    description: "Kilómetros de cobre entre canalizaciones y barras de distribución.",
    icon: "🔌",
    specializes: "materiales",
    zone: 14,
  },
  // Z15 — Laboratorio Químico (focus: medicamentos)
  {
    key: "campana_sintesis",
    name: "Campana de Síntesis",
    description: "Reactivos y vidrio de laboratorio para destilar compuestos útiles.",
    icon: "🧪",
    specializes: "medicamentos",
    zone: 15,
  },
  {
    key: "boveda_reactivos",
    name: "Bóveda de Reactivos",
    description: "Armario certificado que guarda precursores y electrónica calibrada.",
    icon: "🔒",
    specializes: "componentes",
    zone: 15,
  },
  // Z16 — Depósito Militar (focus: medicamentos)
  {
    key: "contenedor_medico",
    name: "Contenedor Médico",
    description: "Suministros médicos estandarizados, sellados y apilados por lote.",
    icon: "💉",
    specializes: "medicamentos",
    zone: 16,
  },
  {
    key: "bodega_logistica",
    name: "Bodega Logística",
    description: "Estibas militares: cajones reforzados y material de embalaje.",
    icon: "📦",
    specializes: "materiales",
    zone: 16,
  },
  // Z17 — Torres Residenciales (focus: agua)
  {
    key: "cisterna_azotea",
    name: "Cisterna de Azotea",
    description: "Las cisternas altas de las torres: gravedad hace el trabajo.",
    icon: "💧",
    specializes: "agua",
    zone: 17,
  },
  // Z18 — Puerto Mercante (focus: componentes)
  {
    key: "grua_muelle",
    name: "Grúa del Muelle",
    description: "La grúa pórtico: motores, mandos y cable de acero rescatable.",
    icon: "🏗",
    specializes: "componentes",
    zone: 18,
  },
  {
    key: "chatarra_contenedores",
    name: "Chatarra de Contenedores",
    description: "Pilas de contenedores oxidados: acero a granel para llevar.",
    icon: "⚓",
    specializes: "materiales",
    zone: 18,
  },
  // Z19 — Zona de Cuarentena (focus: medicamentos)
  {
    key: "estacion_descontaminacion",
    name: "Estación de Descontaminación",
    description: "Lonas, filtros HEPA y duchas químicas de la cuarentena abandonada.",
    icon: "☣",
    specializes: "medicamentos",
    zone: 19,
  },
  // Z20 — Base Militar (focus: componentes)
  {
    key: "taller_comunicaciones",
    name: "Taller de Comunicaciones",
    description: "Radioensayo del comando: placas, antenas y equipos de precisión.",
    icon: "📡",
    specializes: "componentes",
    zone: 20,
  },
  {
    key: "deposito_raciones",
    name: "Depósito de Raciones",
    description: "El almacén de víveres de la base: raciones por años, ordenadas.",
    icon: "🥫",
    specializes: "comida",
    zone: 20,
  },
];

export const THEMATIC_BY_KEY: Record<string, ThematicDef> = ZONE_THEMATIC_BUILDINGS.reduce(
  (acc, b) => {
    acc[b.key] = b;
    return acc;
  },
  {} as Record<string, ThematicDef>,
);

/** zoneId → thematic defs of that zone (ordered as declared). */
export const THEMATIC_BY_ZONE: Record<number, ThematicDef[]> = ZONE_THEMATIC_BUILDINGS.reduce(
  (acc, b) => {
    (acc[b.zone] ??= []).push(b);
    return acc;
  },
  {} as Record<number, ThematicDef[]>,
);

// ============================================================
// BONUSES
// ============================================================

/** Relative bonus of a GLOBAL core building at a given level: N5 → +25 %.
 *  Applies in every zone. */
export function buildingBonus(level: number): number {
  const clamped = Math.max(0, Math.min(BALANCE.buildingMaxLevel, level));
  return clamped * BALANCE.buildingBonusPerLevel;
}

/** Relative bonus of a zone THEMATIC building at a given level
 *  (LOCAL to its zone). Same curve as core in this first iteration —
 *  their extra power comes from stacking with the global base bonus on
 *  the zone's focus resource. */
export function thematicBonus(level: number): number {
  const clamped = Math.max(0, Math.min(BALANCE.buildingMaxLevel, level));
  return clamped * BALANCE.thematicBonusPerLevel;
}

// ============================================================
// COSTS / TIMES — shared curve for both families in this first
// iteration (tunable via playtest; a differentiated curve can hook in
// here later without touching callers).
// ============================================================

export function buildingUpgradeCost(level: number): {
  materiales: number;
  componentes: number;
} {
  return {
    materiales: Math.round(
      BALANCE.buildingCostMaterialBase + BALANCE.buildingCostMaterialPerLevel * level,
    ),
    componentes: Math.round(
      BALANCE.buildingCostComponentBase + BALANCE.buildingCostComponentPerLevel * level,
    ),
  };
}

/** Upgrade duration in minutes for level → level+1. Always under ~30 min. */
export function buildingUpgradeMinutes(level: number): number {
  return BALANCE.buildingBaseMinutes + BALANCE.buildingMinutesPerLevel * level;
}

export function buildingCostLabel(cost: { materiales: number; componentes: number }): string {
  return `${cost.materiales} MAT · ${cost.componentes} CMP`;
}

/** Cumulative cost of bringing a building from N0 to Nlevel (for the
 *  save-v2 migration refund of duplicate core-building copies). */
export function cumulativeUpgradeCost(level: number): {
  materiales: number;
  componentes: number;
} {
  let materiales = 0;
  let componentes = 0;
  for (let l = 0; l < level; l++) {
    const c = buildingUpgradeCost(l);
    materiales += c.materiales;
    componentes += c.componentes;
  }
  return { materiales, componentes };
}

// ============================================================
// CONCURRENCY QUOTAS
// ============================================================

/** How many THEMATIC buildings of a zone are currently under construction. */
export function activeThematicConstructions(z: {
  thematic: Record<string, { upgradeFinishAt: number | null }>;
}): number {
  let n = 0;
  for (const b of Object.values(z.thematic ?? {})) {
    if (b.upgradeFinishAt != null) n += 1;
  }
  return n;
}

/** How many CORE (global base) buildings are currently under construction. */
export function activeConstructionsInBase(base: {
  [key in BuildingKey]: { upgradeFinishAt: number | null };
} | Record<string, { upgradeFinishAt: number | null; level: number; key: BuildingKey }>): number {
  let n = 0;
  for (const b of Object.values(base)) {
    if (b?.upgradeFinishAt != null) n += 1;
  }
  return n;
}
