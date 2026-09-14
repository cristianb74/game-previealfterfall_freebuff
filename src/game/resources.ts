import type { ResourceKey, ResourceMeta, StatKey } from "./types";

export const RESOURCE_META: Record<ResourceKey, ResourceMeta> = {
  materiales: { key: "materiales", label: "Materiales", short: "MAT", icon: "⚒", kind: "unit" },
  agua: { key: "agua", label: "Agua", short: "AGUA", icon: "◍", kind: "time" },
  comida: { key: "comida", label: "Comida", short: "COM", icon: "▣", kind: "time" },
  medicamentos: { key: "medicamentos", label: "Medicamentos", short: "MED", icon: "✚", kind: "unit" },
  componentes: { key: "componentes", label: "Componentes", short: "CMP", icon: "⚙", kind: "unit" },
  energia: { key: "energia", label: "Energía", short: "NRG", icon: "⚡", kind: "energy" },
  dinero: { key: "dinero", label: "Dinero", short: "$", icon: "$", kind: "money" },
};

export const STAT_META: Record<StatKey, { label: string; short: string }> = {
  fuerza: { label: "Fuerza", short: "FUE" },
  resistencia: { label: "Resistencia", short: "RES" },
  agilidad: { label: "Agilidad", short: "AGI" },
  percepcion: { label: "Percepción", short: "PER" },
  inteligencia: { label: "Inteligencia", short: "INT" },
  voluntad: { label: "Voluntad", short: "VOL" },
};

export const STAT_ORDER: StatKey[] = [
  "fuerza",
  "resistencia",
  "agilidad",
  "percepcion",
  "inteligencia",
  "voluntad",
];

export function resourceLabel(key: ResourceKey): string {
  return RESOURCE_META[key].label;
}
