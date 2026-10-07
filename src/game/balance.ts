import type {
  BuildingKey,
  GameState,
  ResourceKey,
  StatKey,
} from "./types";
import type { Biome } from "./narrativeLog";

// ============================================================
// AFTERFALL — single source of truth for tunable balance values.
// Keep this file as the ONLY place where these numbers live.
// ============================================================

export const BALANCE = {
  /** Initial resource package: 2 different types, 1–5 units (or minutes for time resources). */
  startingPackage: { count: 2, min: 1, max: 5 },
  /** Starting survival timers (minutes). ~24 h each. */
  startingFoodMin: 24 * 60,
  startingWaterMin: 24 * 60,

  maxHealth: 100,
  /** 1 Medicamento restores this much Salud. */
  medicineHealthPerUnit: 1,

  /** Maximum energía and real-time regeneration. */
  maxEnergy: 24,
  /** Minutes of real time per +1 energy point (with the app open or closed). */
  energyRegenMinutesPerPoint: 5,

  /** Exploration duration baseline (minutes). Real durations are per-zone
   *  in zones.ts (explorationMinutes), rising with each zone. */
  explorationMinutes: 1,

  /** Chance (0–1) that an exploration rolls a resource find. */
  explorationFindChance: 0.62,
  // NOTA: el valor de la EXP del auto-farm vive en `offlineFarming`
  // (farmExpForZone) — online y offline comparten ese único bloque.
  // Los runs automáticos nunca avanzan la frontera: la exploración manual
  // es la única acción que alcanza zonas nuevas.
  /** MANUAL advantage: flat +X% added to the resource find chance.
   *  Auto-farm runs never get this bonus. */
  manualFindChanceBonus: 0.15,
  /** MANUAL advantage: chance (0–1) of rolling a special event
   *  (cache, safe shelter, supply stash...). Auto-farm can never
   *  trigger these events. */
  manualSpecialEventChance: 0.08,
  /** Chance (0–1) of a survival incident (only when no resource found).
   *  La mitigan Voluntad (incidentChanceFactor) y la Protección asignada. */
  explorationIncidentChance: 0.5,
  /** Incidentes de supervivencia: causa y rango de daño CRUDO (voluntad +
   *  resistencia lo Mitigan, la Protección asignada lo baja otro 15 %).
   *  ANTES vivía hardcodeado en explorationEngine.ts — este bloque es el
   *  ÚNICO lugar para ajustar el riesgo de la exploración. */
  incidentDamage: [
    { cause: "Vidrio roto", damage: [4, 10] },
    { cause: "Escombro caído", damage: [6, 14] },
    { cause: "Estructura colapsada", damage: [9, 18] },
    { cause: "Corte con metal oxidado", damage: [4, 9] },
    { cause: "Infección", damage: [6, 12] },
    { cause: "Animal herido", damage: [4, 11] },
    { cause: "Caída de altura", damage: [8, 16] },
    { cause: "Suelo inestable", damage: [6, 13] },
  ] as const,
  /** El daño escala con el NIVEL de zona: factor = 1 + (zona − 1) × perZone
   *  (tope incidentDamageZoneMaxFactor). Z01 ×1.00 … Z20 ×1.95. */
  incidentDamageZonePerLevel: 0.05,
  incidentDamageZoneMaxFactor: 2,
  /** …y con el TIPO (biome) de zona. */
  incidentDamageBiomeFactor: {
    urbano: 1,
    comercial: 1.05,
    medico: 1.05,
    industrial: 1.1,
    infraestructura: 1.15,
    militar: 1.2,
  } as Record<Biome, number>,
  /** Resource find: min/max units for unit-type resources. */
  findUnitsMin: 1,
  findUnitsMax: 3,
  /** Tope de unidades POR RECURSO dentro de un hallazgo (si el recurso no
   *  está, manda la regla general de arriba con el bonus de Fuerza).
   *  Medicamentos: antes llegaba a 8 unidades por hallazgo (×3 si era raro
   *  = 24 medicamentos ≈ 144 $ de un solo golpe). */
  findUnitsMaxByResource: { medicamentos: 3 } as Partial<Record<ResourceKey, number>>,
  /** Peso RELATIVO del recurso al elegir QUÉ encontrar en la zona
   *  (pickWeightedResource: peso = 1 + stat × statEffectFactor, luego este
   *  multiplicador). 1 = igual que el resto; medicamentos 0.6 → −40 % de
   *  probabilidad relativa por exploración. */
  resourceFindWeights: { medicamentos: 0.6 } as Partial<Record<ResourceKey, number>>,
  /** Resource find: min/max added survival time (minutes) for Comida/Agua. */
  findTimeMin: 10,
  findTimeMax: 30,
  /** NPC discovery: tier thresholds (explorations since last NPC). */
  npcTiers: [
    { afterExplorations: 0, chance: 0 },       // 0–4: 0 %
    { afterExplorations: 5, chance: 0.02 },     // 5–9: 2 %
    { afterExplorations: 10, chance: 0.05 },    // 10–14: 5 %
    { afterExplorations: 15, chance: 0.10 },    // 15–19: 10 %
    { afterExplorations: 20, chance: 0.25 },    // 20–24: 25 %
    { afterExplorations: 25, chance: 1 },       // 25+: guaranteed
  ] as const,
  /** AUTO-farm NPC discovery: the manual chance (npcTiers) is multiplied by
   *  this factor. One roll per auto-run completion, same shared counter. */
  autoNpcChanceFactor: 0.3,
  /** Max zones with the background auto-farm active at the same time.
   *  Only gates NEW activations — farms already active in old saves above
   *  the cap keep running (never force-disabled); from then on the player
   *  must free a slot (turn one off) before activating another zone. */
  maxConcurrentAutoFarms: 6,
  /** AUTO-farm diminishing returns per SIMULTANEOUS active zones.
   *  Zones with auto ON are ranked by zone id ASCENDING (earliest/dominated
   *  zones keep the full rate; the last-unlocked zones absorb the cut) and
   *  each rank's farm EXP is multiplied by its tier factor. Applied
   *  identically online (completeAutoRun) and offline (offlineProgress)
   *  via autoFarmConcurrentFactorFor — never hardcode these factors.
   *  fromIndex is the 0-based rank where the factor starts applying. */
  autoFarmConcurrentTiers: [
    { fromIndex: 0, factor: 1.0 },  // 1st–3rd active zone → 100 %
    { fromIndex: 3, factor: 0.8 },  // 4th–6th → 80 %
    { fromIndex: 6, factor: 0.6 },  // 7th–10th → 60 %
    { fromIndex: 10, factor: 0.4 }, // 11th+ → 40 %
  ] as const,

  /** Money find base chance per exploration, and amount range. */
  moneyFindChance: 0.03,
  moneyFindMin: 5,
  moneyFindMax: 25,

  /** SCAVENGE minigame (8 fixed search points): stepped trigger chance by
   *  explorations since the last event (same pattern as npcTiers but its own
   *  independent curve — rarer than an NPC, bigger one-shot payoff).
   *  One roll per MANUAL exploration completion; AUTO runs roll the same
   *  counter at autoScavengeChanceFactor and resolve all points in chain. */
  scavengeTiers: [
    { afterExplorations: 0, chance: 0 },      // 0–4:    0 %
    { afterExplorations: 5, chance: 0.08 },   // 5–9:    8 %
    { afterExplorations: 10, chance: 0.12 },  // 10–14: 12 %
    { afterExplorations: 15, chance: 0.2 },   // 15–19: 20 %
    { afterExplorations: 20, chance: 0.3 },   // 20–24: 30 %
    { afterExplorations: 30, chance: 0.5 },   // 30–39: 50 %
    { afterExplorations: 40, chance: 1 },     // 40+:    garantizado
  ] as const,
  /** AUTO-farm SCAVENGE: the manual chance (scavengeTiers) is multiplied by
   *  this factor. One roll per auto-run completion, same shared counter. */
  autoScavengeChanceFactor: 0.25,
  /** Minigame: the player's health for the session (REAL health, floored
   *  at scavengeSessionRealHealthFloor during the event so a bad streak can
   *  never knock the player to 0 inside it). Each damage hit rolls
   *  scavengeDamageMin–Max. Reaching 0 ends the session (unbanked pending
   *  loot is lost — quit anytime instead to keep what's banked). */
  scavengeSessionRealHealthFloor: 1,
  scavengeDamageMin: 1,
  scavengeDamageMax: 4,
  /** Loot per search point: unit resources roll 1–3 units, money is flat
   *  5–20, and Comida/Agua roll simple units converted to survival MINUTES
   *  with scavengeFoodWaterMinutes (1 unit = 20 min) on grant. */
  /** Saqueo PARCIAL: presets de % de puntos que ofrece la UI (25 = 2 de 8
   *  puntos… 100 = saquear todo, el comportamiento original). */
  scavengePartialPresets: [25, 50, 75, 100] as const,
  scavengeLootUnitsMin: 1,
  scavengeLootUnitsMax: 3,
  scavengeMoneyMin: 5,
  scavengeMoneyMax: 20,
  scavengeFoodWaterMinutes: 20,

  /** Stat effectiveness factor: p = base * (1 + stat * k). */
  statEffectFactor: 0.035,

  /** NPC passive production cycle, in seconds, per type. */
  npcCycleSeconds: { B: 30, G: 25, A: 20, R: 15, D: 10 },
  /** Relative bonus multiplier added per NPC type (e.g. 0.02 → +2 %). */
  npcTypeBonus: { B: 0.02, G: 0.04, A: 0.08, R: 0.16, D: 0.24 },

  /** NPC production is much weaker than active exploration. */
  npcProductionChance: 0.1, // ~10 % effective resource opportunity per cycle
  npcMoneyChance: 0.03, // ~3 % money per cycle
  npcProductionUnitsMin: 1,
  npcProductionUnitsMax: 2,
  npcProductionTimeMin: 4, // minutes of Comida/Agua per find
  npcProductionTimeMax: 10,

  // --- CONSUMO COMIDA/AGUA (bloque único de tuning) ---
  // FOOD_PER_HOUR_PLAYER / WATER_PER_HOUR_PLAYER es el consumo por hora del
  // jugador (el valor que ya cobraba survivorUpkeepPerHour: comida y agua
  // usaban el MISMO rate — 20 min/h c/u). Se separan en dos constantes para
  // poder balancearlas por separado: hoy ambas valen 20.
  FOOD_PER_HOUR_PLAYER: 20, // minutos de comida por hora
  WATER_PER_HOUR_PLAYER: 20, // minutos de agua por hora
  /** NPC_CONSUMPTION_FACTOR: cada NPC reclutado consume el 50 % del jugador.
   *  Por NPC y hora: FOOD_PER_HOUR_PLAYER × NPC_CONSUMPTION_FACTOR
   *  × npc.consumptionMultiplier (default 1.0). */
  NPC_CONSUMPTION_FACTOR: 0.5,
  /** STAND-BY: cuánto permanece un superviviente en la lista de espera
   *  ("Por reclutar") antes de irse del refugio (timestamp-based: funciona
   *  con la app cerrada). */
  npcStandbyMs: 4 * 60 * 60 * 1000, // 4 hs
  /** Aviso de urgencia en la ficha del candidato en espera. */
  npcStandbyWarningMs: 30 * 60 * 1000, // 30 min
  /** Minimum food/water (minutes) to run NPC cycles; below this, NPCs pause
   *  y PIERDEN su bonus de especialidad hasta que haya recursos. */
  npcMinimumFoodWaterMin: 20,
  /** Tope de consumo offline (jugador + NPC) cobrado de una sola vez al
   *  volver a abrir la app: nunca se descuenta más de 24 hs de un tirón. */
  npcConsumptionOfflineCapMs: 24 * 60 * 60 * 1000,
  /** Recruitment: cost (Materiales) to recruit a candidate NPC into the shelter.
   *  0 = free recruitment. Tunable. */
  npcRecruitCostMateriales: 5,
  /** Recruitment: cost (Comida, minutes) to recruit a candidate NPC. */
  npcRecruitCostComidaMin: 60,
  /** Passive benefit of an NPC ASSIGNED to a zone: exploration duration of
   *  that zone is reduced by this fraction, scaled by NPC rarity bonus
   *  (relative to the Dorado bonus as the 1.0 reference).
   *  effective = k × (npcBonus / npcTypeBonus.Dorado). */
  npcZoneSpeedK: 0.06, // Dorado (24 %) → −6 % duration; Azul (8 %) → −2 %

  /** Offline NPC production is capped at this many hours. */
  offlineNpcCapHours: 4,
  /** TOTAL offline progression cap (hours): consumption, auto-farm EXP
   *  and survival drain all settle as if the player returned at this
   *  point. Energy regen keeps going up to the real elapsed time (it is
   *  a player-friendly exception) but never beyond maxEnergy. */
  offlineCapHours: 8,

  /** Building system. */
  buildingMaxLevel: 10,
  /** Max simultaneous constructions per zone (core + exclusive share the
   *  same quota). Only gates NEW upgrades; existing runs finish normally. */
  maxConcurrentConstructionsPerZone: 1,
  // --- PRODUCCIÓN / BONUS DE EDIFICIOS (curva geométrica) ---
  // bonus(N) = base × crecimiento^(N−1): N1 +0 % … N10 +327 %.
  // El costo crece ×1.5 por nivel y la producción solo ×1.175 → las mejoras
  // profundas rinden cada vez menos (anti-excedente).
  bonusCurveBase: 1,
  bonusCurveGrowth: 1.175,
  /** Upgrade duration scaling, in minutes (level → minutes). */
  buildingBaseMinutes: 3, // 0→1
  buildingMinutesPerLevel: 2.5, // +2.5 min per level ⇒ 10 is 27 min (< 30 min)
  // --- COSTO DE EDIFICIOS (rebalanceo v3) ---
  // costo(recurso, zona, nivel) = round(base_recurso × mult_tipo
  //   × (1 + zonaCostZoneFactor × (zona−1)) × zonaCostLevelGrowth^(nivel−1))
  // base_recurso: 25 Materiales · 12 Componentes (una mejora siempre pide
  // ambos). mult_tipo: básico ×1 · intermedio ×2.5 · avanzado ×6 (ver
  // BUILDING_TIER más abajo). Todo ajustable aquí, sin números sueltos.
  zonaCostBaseMat: 25,
  zonaCostBaseCmp: 12,
  /** Encarecimiento por profundidad de zona: +15 % por zona (n=1 → ×1). */
  zonaCostZoneFactor: 0.15,
  /** Encarecimiento por nivel: ×1.5 por nivel (N1→N10 multiplica ×38.4). */
  zonaCostLevelGrowth: 1.5,
  /** Zone-thematic buildings (LOCAL to their zone): misma curva geométrica
   *  que los core pero con ligera ventaja inicial (N1 +7 %). Su poder real
   *  viene de apilarse con el bonus global de la base en el foco de la zona. */
  thematicBonusCurveBase: 1.075,
  /** Max simultaneous constructions in the GLOBAL base (core buildings).
   *  Separate quota from the per-zone thematic one. Only gates NEW
   *  upgrades; existing runs finish normally. */
  maxConcurrentConstructionsInBase: 1,

  // --- EXP DE PROGRESIÓN (curva de desbloqueo de zonas) ---
  // Tramo de zona n (n ≥ 2): round(zoneExpBase × zoneExpGrowth^(n−1)).
  // El umbral de la zona n es la SUMA acumulada de los tramos 2..n
  // (Z1 es la zona inicial: 0 EXP). Ej. con 1500/1.28: Z2 = 1.920,
  // Z20 = 739.820 acumulados. Subir zoneExpBase ⇒ todo más lento.
  zoneExpBase: 1500,
  zoneExpGrowth: 1.28,

  // --- AUTO-FARM / OFFLINE EXP (bloque único de tuning) ---
  // farmExp(zona n, ciclo) = round(expPerCycleBase × expGrowth^(n−1)
  //   × shareOfNextZone × factorConcurrente). Un "ciclo" = una exploración
  //  completa de la zona. Con el tope de 8 h offline, el total ronda el
  //  3–5 % de la EXP que exige la siguiente zona (zonas medias; ver la
  //  tabla generada en el reporte de balance).
  // Tuning: subir expPerCycleBase ⇒ más EXP offline; bajar shareOfNextZone
  // ⇒ castigar más estar con la app cerrada. offlineCapHours sigue mandando.
  offlineFarming: {
    /** Zonas 1–3 (tramo tutorial) farmean a esta tasa plana por ciclo. */
    expPerCycleBase: 20,
    /** Escalado por profundidad: ×1.28 por zona, igual que el crecimiento
     *  de expZona (zones.ts) para que el valor del ciclo siga al mundo. */
    expGrowth: 1.28,
    /** Valor de UN ciclo como fracción de UN ciclo de la exigencia de EXP
     *  de la siguiente zona (0.1 = un ciclo farmeo rinde ~10 % de un ciclo
     *  de exploración real de la siguiente zona). */
    shareOfNextZone: 0.1,
  },
  /** Goteo EXP de NPC offline: fracción MÁXIMA de la EXP de la siguiente
   *  zona que puede aportar (junto con la ya reducida npcExpReward/12/h). */
  offlineNpcTrickleShareOfNextZone: 0.05,

  /**Unlock thresholds are derived from zone definitions (see zones.ts). */
  zoneUnlockToastLabel: "NUEVA ZONA DESBLOQUEADA",
} as const;

// ============================================================
// CONSUMO DEL EQUIPO (helpers compartidos). Suma lo que consume el
// JUGADOR por hora + la suma de TODOS los NPC RECLUTADOS (status «active»);
// los candidatos en lista de espera NO consumen. Se usan en onlineTick,
// offlineProgress y la UI (Mochila/Equipo), así ninguna ruta puede divergir.
// ============================================================

export type ConsumingNpc = {
  status?: "candidate" | "active";
  consumptionMultiplier?: number;
};

/** Cada NPC reclutado: player rate × factor × su multiplicador propio. */
export function npcUpkeepPerHour(
  npc: ConsumingNpc,
  which: "food" | "water",
): number {
  if ((npc.status ?? "active") !== "active") return 0;
  const rate = which === "food" ? BALANCE.FOOD_PER_HOUR_PLAYER : BALANCE.WATER_PER_HOUR_PLAYER;
  const mult = typeof npc.consumptionMultiplier === "number" ? npc.consumptionMultiplier : 1;
  return rate * BALANCE.NPC_CONSUMPTION_FACTOR * mult;
}

/** Consumo por hora (min) de UN NPC reclutado: comida/agua =
 *  FOOD/WATER_PER_HOUR_PLAYER × NPC_CONSUMPTION_FACTOR × mult. */
export function npcFoodUpkeepPerHour(npc: ConsumingNpc): number {
  return npcUpkeepPerHour(npc, "food");
}
export function npcWaterUpkeepPerHour(npc: ConsumingNpc): number {
  return npcUpkeepPerHour(npc, "water");
}

/** Consumo total por hora del equipo (SIN el jugador). */
export function teamFoodUpkeepPerHour(npcs: ConsumingNpc[]): number {
  return npcs.reduce((acc, n) => acc + npcFoodUpkeepPerHour(n), 0);
}
export function teamWaterUpkeepPerHour(npcs: ConsumingNpc[]): number {
  return npcs.reduce((acc, n) => acc + npcWaterUpkeepPerHour(n), 0);
}

// ============================================================
// TIPOS DE EDIFICIO (rebalanceo v3): cada edificio pertenece a un tier
// (básico / intermedio / avanzado) que multiplica su costo base.
// Los 6 CORE (base global) son intermedios; los temáticos se clasifican
// por su rol: generadores de recursos puros = básicos, transformadores /
// taller = intermedios, edificios de dinero y alta tecnología = avanzados.
// Cambiar una clasificación aquí es rebalancear ese edificio en un sitio.
// ============================================================
export type BuildingTierKey = "basico" | "intermedio" | "avanzado";

export const BUILDING_TIER_MULTIPLIER: Record<BuildingTierKey, number> = {
  basico: 1,
  intermedio: 2.5,
  avanzado: 6,
};

export const BUILDING_TIER: Record<string, BuildingTierKey> = {
  // CORE (base global)
  cocina: "intermedio",
  tanque: "intermedio",
  almacen: "intermedio",
  enfermeria: "intermedio",
  taller: "intermedio",
  generador: "intermedio",
  // Temáticos — generadores / almacenaje simples = básicos
  invernadero: "basico",
  huerto_urbano: "basico",
  campo_cultivo: "basico",
  colmena: "basico",
  hongos: "basico",
  canales: "basico",
  captador_rocio: "basico",
  planta_desalinizadora: "basico",
  cisterna: "basico",
  chatarreria: "basico",
  depósito_chatarras: "basico",
  contenedor_sellado: "basico",
  botiquin_campamento: "basico",
  puesto_medico: "basico",
  mesa_botiquines: "basico",
  invernadero_atomico: "basico",
  vivero_quimico: "basico",
  cultivo_resistente: "basico",
  equipo_hierro: "basico",
  alambique_rustico: "basico",
  colector_solar: "basico",
  deposito_diesel: "basico",
  panel_cristal: "basico",
  tanque_bio: "basico",
  invernadero_cerrado: "basico",
  recogida_lluvia: "basico",
  purificador_portatil: "basico",
  reactor_piezo: "basico",
  horno_lena: "basico",
  zaranda: "basico",
  balsa_filtrado: "basico",
  pozo_manual: "basico",
  destileria: "basico",
  cámara_fungícola: "basico",
  compresor_aire: "basico",
  fermentador: "basico",
  tren_hierro: "basico",
  andamio: "basico",
  sinfon_inundacion: "basico",
  zona_marisma: "basico",
  cisterna_bunker: "basico",
  zona_verde: "basico",
  arco_aire: "basico",
  huerto_jaula: "basico",
  condensador_mina: "basico",
  campo_militar: "basico",
  cultivo_mar: "basico",
  plants_marea: "basico",
  hidroponia_mar: "basico",
  muelles_bio: "basico",
  plants_puertos: "basico",
  colector_cuartel: "basico",
  invernadero_hidro: "basico",
  // Temáticos — transformadores, crafteo, logística = intermedios
  camara_frigorifica: "intermedio",
  despensa_comunal: "intermedio",
  pescaderia: "intermedio",
  depósito_componentes: "intermedio",
  banco_componentes: "intermedio",
  vagon_componentes: "intermedio",
  laboratorio_portatil: "intermedio",
  nucleo_sintetico: "intermedio",
  laboratorio_abandonado: "intermedio",
  torre_perforadora: "intermedio",
  hormigonera: "intermedio",
  rotiseria: "intermedio",
  laboratorio_farmaceutico: "intermedio",
  despensa_secreta: "intermedio",
  banco_semillas: "intermedio",
  laboratorio_limpio: "intermedio",
  horno_ceramico: "intermedio",
  cisterna_acero: "intermedio",
  cisterna_concreto: "intermedio",
  redestilador: "intermedio",
  balsa_componentes: "intermedio",
  despensa_bunker: "intermedio",
  cocina_militar: "intermedio",
  estanque_quimico: "intermedio",
  tanque_marea: "intermedio",
  biofiltro_marino: "intermedio",
  planta_desalinizadora_militar: "intermedio",
  despensa_militar: "intermedio",
  cocina_cuartel: "intermedio",
  granja_piscifactoria: "intermedio",
  destileria_militar: "intermedio",
  sistemas_puertos: "intermedio",
  almacen_cuartel: "intermedio",
  // Temáticos — dinero y alta tecnología = avanzados
  punto_venta: "avanzado",
  subasta_negra: "avanzado",
  mineria_bitcoin: "avanzado",
  oficina_contable: "avanzado",
  comercio_barrial: "avanzado",
  taquilla_apuestas: "avanzado",
  sala_recreativa: "avanzado",
  banco_datos: "avanzado",
  laboratorio_dinero: "avanzado",
  fabrica_dinero: "avanzado",
  central_enlace: "avanzado",
  central_baterias: "avanzado",
  sala_servidores: "avanzado",
  calculo_ia: "avanzado",
  central_prision: "avanzado",
  laboratorio_armas: "avanzado",
  central_reactor: "avanzado",
  sala_maquinas: "avanzado",
  taller_mecanico: "avanzado",
  laboratorio_chemical: "avanzado",
  bodega_nueva: "avanzado",
  oficina_bunker: "avanzado",
  sala_comando: "avanzado",
  laboratorio_suelo: "avanzado",
  laboratorio_jaula: "avanzado",
  laboratorio_mina: "avanzado",
  laboratorio_cuartel: "avanzado",
  taller_bunker: "avanzado",
  fabrica_municion: "avanzado",
  laboratorio_armado: "avanzado",
  central_radiologica: "avanzado",
  taller_cuarTEL: "avanzado",
};

// ============================================================
// CONSUMO DEL EQUIPO (helpers compartidos). Suma lo que consume el
// JUGADOR por hora + la suma de TODOS los NPC RECLUTADOS (status «active»);
// los candidatos en lista de espera NO consumen. Se usan en onlineTick,
// offlineProgress y la UI (Mochila/Equipo), así ninguna ruta puede divergir.
// ============================================================

/** Consumo por hora (min) de UN NPC reclutado: comida/agua =
 *  *_PER_HOUR_PLAYER × NPC_CONSUMPTION_FACTOR × consumptionMultiplier. */
export function npcFoodUpkeepPerHour(npc: { status?: string; consumptionMultiplier?: number }): number {
  if ((npc.status ?? "active") !== "active") return 0;
  const mult = typeof npc.consumptionMultiplier === "number" ? npc.consumptionMultiplier : 1;
  return BALANCE.FOOD_PER_HOUR_PLAYER * BALANCE.NPC_CONSUMPTION_FACTOR * mult;
}
export function npcWaterUpkeepPerHour(npc: { status?: string; consumptionMultiplier?: number }): number {
  if ((npc.status ?? "active") !== "active") return 0;
  const mult = typeof npc.consumptionMultiplier === "number" ? npc.consumptionMultiplier : 1;
  return BALANCE.WATER_PER_HOUR_PLAYER * BALANCE.NPC_CONSUMPTION_FACTOR * mult;
}

/** Consumo total por hora del equipo (SIN el jugador). */
export function teamFoodUpkeepPerHour(npcs: { status?: string; consumptionMultiplier?: number }[]): number {
  return npcs.reduce((acc, n) => acc + npcFoodUpkeepPerHour(n), 0);
}
export function teamWaterUpkeepPerHour(npcs: { status?: string; consumptionMultiplier?: number }[]): number {
  return npcs.reduce((acc, n) => acc + npcWaterUpkeepPerHour(n), 0);
}
  return BUILDING_TIER[key] ?? "intermedio";
}

/** AUTO-farm diminishing-returns helpers. Shared by the online tick
 *  (completeAutoRun) and the offline simulation (offlineProgress) so the
 *  two paths can never drift apart. */

/** Factor for a 0-based active-zone rank (ascending zone id order). */
export function autoFarmFactorForActiveIndex(rank: number): number {
  let factor = 1;
  for (const tier of BALANCE.autoFarmConcurrentTiers) {
    if (rank >= tier.fromIndex) factor = tier.factor;
  }
  return factor;
}

/** ONE offline/auto-farm cycle's EXP for zone n (shared by the online
 *  tick's completeAutoRun and the offline simulation — the two paths can
 *  never drift apart). Target: 8 h offline ≈ 3–5 % of the next zone's EXP
 *  requirement (see BALANCE.offlineFarming for the tuning block). */
export function farmExpForZone(zoneId: number): number {
  const n = Math.max(1, zoneId);
  const f = BALANCE.offlineFarming;
  return Math.max(
    1,
    Math.round(f.expPerCycleBase * Math.pow(f.expGrowth, n - 1) * f.shareOfNextZone),
  );
}

/** Diminishing-returns factor for ONE zone's auto-farm, given how many
 *  zones currently have auto ON. Inactive zones always return 1 (this
 *  must never touch manual exploration rewards). */
export function autoFarmConcurrentFactorFor(
  state: Pick<GameState, "autoExplored">,
  zoneId: number,
): number {
  if (!state.autoExplored[zoneId]) return 1;
  const activeZoneIds = Object.keys(state.autoExplored)
    .map(Number)
    .filter((id) => state.autoExplored[id])
    .sort((a, b) => a - b);
  const rank = activeZoneIds.indexOf(zoneId);
  if (rank < 0) return 1;
  return autoFarmFactorForActiveIndex(rank);
}

/** Which building boosts which resource. */
export const BUILDING_SPECIALIZATION: Record<BuildingKey, ResourceKey> = {
  cocina: "comida",
  tanque: "agua",
  almacen: "materiales",
  enfermeria: "medicamentos",
  taller: "componentes",
  generador: "energia",
};

/** Stat → resource mapping from the design document. */
export const STAT_RESOURCE: Record<StatKey, ResourceKey> = {
  fuerza: "materiales",
  resistencia: "agua",
  agilidad: "comida",
  percepcion: "medicamentos",
  inteligencia: "componentes",
  voluntad: "energia",
};

/** Inverse: resource → the stat that governs its discovery. */
export const RESOURCE_STAT: Record<ResourceKey, StatKey> = {
  materiales: "fuerza",
  agua: "resistencia",
  comida: "agilidad",
  medicamentos: "percepcion",
  componentes: "inteligencia",
  energia: "voluntad",
  dinero: "percepcion",
};

/** Zone order → building made available when the zone unlocks. */
export const ZONE_BUILDING: Record<number, BuildingKey> = {
  1: "cocina",
  2: "tanque",
  3: "almacen",
  5: "enfermeria",
  7: "taller",
  10: "generador",
};

/** Resource unit prices for the merchant (money sink). */
export const RESOURCE_PRICES: Partial<Record<ResourceKey, number>> = {
  materiales: 8,
  medicamentos: 12,
  componentes: 16,
  comida: 6, // per 10 min of food
  agua: 6, // per 10 min of water
};

/** Sell prices to the merchant (~50% of buy price). */
export const MERCHANT_SELL_PRICES: Partial<Record<ResourceKey, { amount: number; price: number; label: string }>> = {
  materiales: { amount: 1, price: 4, label: "Vender 1 Materiales" },
  medicamentos: { amount: 1, price: 6, label: "Vender 1 Medicamentos" },
  componentes: { amount: 1, price: 8, label: "Vender 1 Componentes" },
  comida: { amount: 30, price: 7, label: "Vender 30 min Comida" },
  agua: { amount: 30, price: 7, label: "Vender 30 min Agua" },
};

/** Save migration (v1→v2): duplicate core-building levels collapsed into
 *  the global base are refunded at this factor of their cumulative cost
 *  (1 = full refund, nothing the player paid is lost). */
export const migrationRefundFactor = 1.0;

/** Merchant battery: +energy on purchase. Not a ResourceKey — goes through
 *  gainEnergy() to respect the regen system invariants (see energySystem.ts).
 *  Blocked when energy + amount would exceed maxEnergy (no partial waste). */
export const MERCHANT_BATTERY_OFFER = { label: "Batería", price: 100, energy: 10 } as const;
