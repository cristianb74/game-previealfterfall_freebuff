// AFTERFALL — game configuration. Edit zone names and world constants here.
// UI must read from these modules, never hardcode balance.

export const GAME_INFO = {
  title: "AFTERFALL",
  subtitle: "Protocolo de supervivencia",
  tagline: "Explora · Encuentra · Mejora · Desbloquea · Automatiza",
  version: "1.0.0",
  saveKey: "afterfall_save_v1",
} as const;

export const WORLD = {
  /** Exact zone count — do not change without updating zones.ts. */
  zoneCount: 20,
  /** Final zone. */
  finalZoneId: 20,
  finalZoneName: "Base Militar",
} as const;

/** Save format version — bump on breaking state shape changes. */
export const SAVE_VERSION = 1;
