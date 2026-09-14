import { BALANCE } from "./balance";
import type { BuildingKey, ResourceKey } from "./types";

// ============================================================
// AFTERFALL — buildings. Six core buildings, local per zone,
// levels 0–10, relative bonuses N1 +5 % → N10 +50 %.
// Construction uses only Materiales + Componentes.
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
    acc[b.key] = b;
    return acc;
  },
  {} as Record<BuildingKey, BuildingDef>,
);

/** Relative bonus of a building at a given level: level 5 → +25 %. */
export function buildingBonus(level: number): number {
  const clamped = Math.max(0, Math.min(BALANCE.buildingMaxLevel, level));
  return clamped * BALANCE.buildingBonusPerLevel;
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
