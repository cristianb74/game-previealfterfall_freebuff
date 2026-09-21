import { BALANCE } from "./balance";
import type { BuildingKey, ResourceKey } from "./types";

// Exclusive building keys extend the six core keys. Existing saves only
// contain the 6 core keys per zone; exclusive buildings are added by the
// save migration (N0) for their host zone.
export type ExclusiveBuildingKey = "invernadero" | "perforadora" | "laboratorio" | "hormigonera";

export type AnyBuildingKey = BuildingKey | ExclusiveBuildingKey;

// ============================================================
// AFTERFALL — buildings. Six core buildings, local per zone,
// levels 0–10, relative bonuses N1 +5 % → N10 +50 %.
// Construction uses only Materiales + Componentes.
// ============================================================

export interface BuildingDef {
  key: AnyBuildingKey;
  name: string;
  description: string;
  icon: string;
  /** Resource boosted by this building (relative bonus). */
  specializes: ResourceKey;
  /** When set, this building only exists in that zone. */
  exclusiveToZone?: number;
}

export const BUILDINGS: BuildingDef[] = [
  {
    key: "cocina",
    name: "Cocina",
    description: "Raciones calientes y conservas bien aprovechadas. Mejora los hallazgos de Comida en la zona.",
    icon: "🍲",
    specializes: "comida",
  },
  {
    key: "tanque",
    name: "Tanque de Agua",
    description: "Captación y filtrado de agua. Mejora los hallazgos de Agua en la zona.",
    icon: "🚰",
    specializes: "agua",
  },
  {
    key: "almacen",
    name: "Almacén",
    description: "Chatarra ordenada y estanterías reforzadas. Mejora los hallazgos de Materiales en la zona.",
    icon: "📦",
    specializes: "materiales",
  },
  {
    key: "enfermeria",
    name: "Enfermería",
    description: "Vendas, sueros y un camastro limpio. Mejora los hallazgos de Medicamentos en la zona.",
    icon: "🩹",
    specializes: "medicamentos",
  },
  {
    key: "taller",
    name: "Taller",
    description: "Bancos de trabajo y herramientas finas. Mejora los hallazgos de Componentes en la zona.",
    icon: "🔧",
    specializes: "componentes",
  },
  {
    key: "generador",
    name: "Generador",
    description: "Diésel, paneles y cableado recuperado. Mejora los hallazgos de Energía en la zona.",
    icon: "🔌",
    specializes: "energia",
  },
];

export const BUILDING_BY_KEY: Record<BuildingKey, BuildingDef> = BUILDINGS.reduce(
  (acc, b) => {
    acc[b.key as BuildingKey] = b;
    return acc;
  },
  {} as Record<BuildingKey, BuildingDef>,
);

// ============================================================
// EXCLUSIVE BUILDINGS — one per host zone, thematically tied.
// They specialize the same resource as the zone's focus and add
// a flat +4 %/level on top of the core building bonus.
// ============================================================
export const EXCLUSIVE_BUILDINGS: BuildingDef[] = [
  {
    key: "invernadero",
    name: "Invernadero Hidropónico",
    description: "Cultivos protegidos bajo plástico recuperado. Solo posible en la cocina comunitaria de Z01.",
    icon: "🌱",
    specializes: "comida",
    exclusiveToZone: 1,
  },
  {
    key: "perforadora",
    name: "Perforadora de Pozos",
    description: "Taladra el acuífero profundo del depósito. Solo construible en Z09.",
    icon: "🕳",
    specializes: "agua",
    exclusiveToZone: 9,
  },
  {
    key: "laboratorio",
    name: "Laboratorio de Campo",
    description: "Síntesis de sueros a partir de los restos clínicos. Exclusivo del Hospital (Z04).",
    icon: "🧪",
    specializes: "medicamentos",
    exclusiveToZone: 4,
  },
  {
    key: "hormigonera",
    name: "Hormigonera Industrial",
    description: "Produce bloques prefabricados de alta resistencia. Exclusiva de la Zona Industrial (Z12).",
    icon: "🧱",
    specializes: "materiales",
    exclusiveToZone: 12,
  },
];

export const EXCLUSIVE_BUILDING_BY_ZONE: Partial<Record<number, BuildingDef>> = EXCLUSIVE_BUILDINGS.reduce(
  (acc, b) => {
    if (b.exclusiveToZone != null) acc[b.exclusiveToZone] = b;
    return acc;
  },
  {} as Partial<Record<number, BuildingDef>>,
);

export const EXCLUSIVE_BUILDING_KEYS: ExclusiveBuildingKey[] = EXCLUSIVE_BUILDINGS.map((b) => b.key as ExclusiveBuildingKey);

export const BUILDING_BY_KEY_ANY: Record<AnyBuildingKey, BuildingDef> = [...BUILDINGS, ...EXCLUSIVE_BUILDINGS].reduce(
  (acc, b) => {
    acc[b.key as AnyBuildingKey] = b;
    return acc;
  },
  {} as Record<AnyBuildingKey, BuildingDef>,
);

/** Relative bonus of a building at a given level: level 5 → +25 %.
 *  Exclusive buildings add +4 %/level on top (stronger per level). */
export function buildingBonus(level: number): number {
  const clamped = Math.max(0, Math.min(BALANCE.buildingMaxLevel, level));
  return clamped * BALANCE.buildingBonusPerLevel;
}

/** Bonus of an exclusive building at a given level (+4 %/level). */
export const EXCLUSIVE_BONUS_PER_LEVEL = 0.04;

export function exclusiveBuildingBonus(level: number): number {
  const clamped = Math.max(0, Math.min(BALANCE.buildingMaxLevel, level));
  return clamped * EXCLUSIVE_BONUS_PER_LEVEL;
}

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

/** How many buildings in a zone are currently under construction
 *  (core buildings + zone-exclusive building share the same per-zone quota).
 *  Existing runs in old saves above the limit are allowed to finish. */
export function activeConstructionsInZone(z: {
  buildings: Record<string, { upgradeFinishAt: number | null }>;
  exclusiveBuilding?: { upgradeFinishAt: number | null } | undefined;
}): number {
  let n = 0;
  for (const b of Object.values(z.buildings)) {
    if (b.upgradeFinishAt != null) n += 1;
  }
  if (z.exclusiveBuilding?.upgradeFinishAt != null) n += 1;
  return n;
}
