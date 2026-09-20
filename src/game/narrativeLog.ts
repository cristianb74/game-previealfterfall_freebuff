// ============================================================
// AFTERFALL — narrative log module.
// Separates the player-facing "narrative" channel from the
// technical/debug log. Narrative entries are written to the SAME
// state.log array with channel:"narr" (zero save-schema churn);
// UI filters by channel.
//
// Text variants per event type × biome avoid repetition after
// many explorations: pools are large and the picker avoids
// repeating the last-used variant index per (event, biome) key.
// ============================================================

import type { GameState, ResourceKey } from "./types";

/** ---------------------------------------------------------
 * TUNABLE — log size per channel.
 * --------------------------------------------------------- */
export const NARRATIVE_CONFIG = {
  /** Max narrative entries kept in state.log alongside tech ones. */
  maxNarrEntries: 40,
} as const;

// ---------------- Biomes ----------------

export type Biome = "urbano" | "comercial" | "industrial" | "medico" | "infraestructura" | "militar";

const ZONE_BIOME: Record<number, Biome> = {
  1: "urbano",
  2: "comercial",
  3: "infraestructura",
  4: "medico",
  5: "urbano",
  6: "urbano",
  7: "industrial",
  8: "comercial",
  9: "infraestructura",
  10: "urbano",
  11: "medico",
  12: "industrial",
  13: "urbano",
  14: "infraestructura",
  15: "medico",
  16: "militar",
  17: "urbano",
  18: "industrial",
  19: "militar",
  20: "militar",
};

export function biomeOf(zoneId: number): Biome {
  return ZONE_BIOME[zoneId] ?? "urbano";
}

// ---------------- Variant pools ----------------
// Each pool: text templates keyed by biome. {zone} is replaced
// with the zone name at render time.

type Pool = Partial<Record<Biome, string[]>> & { all: string[] };

// Anti-repetition cache: last variant index used per (kind, biome).
// Module-level (session-scoped), like the survival-tier cache.
const lastIdxCache: Record<string, number> = {};

function pick(pool: Pool, biome: Biome, kind: string): string {
  const list = pool[biome] ?? pool.all;
  const key = `${kind}:${biome}`;
  let idx = Math.floor(Math.random() * list.length);
  if (list.length > 1 && lastIdxCache[key] === idx) {
    idx = (idx + 1) % list.length;
  }
  lastIdxCache[key] = idx;
  return list[idx];
}

const START: Pool = {
  urbano: [
    "Sales al amanecer entre los bloques. {zone} espera.",
    "El casco puesto, la mochila ajustada. Rumbo a {zone}.",
    "{zone} te llama otra vez: hay huecos que nadie revisó.",
  ],
  comercial: [
    "Los pasillos de {zone} crujen bajo tus botas.",
    "Huele a polvo y a latas viejas en {zone}.",
    "Cartelería medio caída, góndolas vacías: {zone}, otra vez.",
  ],
  industrial: [
    "Grúas dormidas y olor a óxido: entras en {zone}.",
    "El metal protesta con el viento. {zone} está quieta... por ahora.",
    "Naves infinitas en {zone}. Todo puede estar en cualquier parte.",
  ],
  medico: [
    "Olor a antiséptico viejo en los pasillos de {zone}.",
    "Las luces de emergencia aún parpadean en {zone}.",
    "{zone}: donde el silencio pesa más que los escombros.",
  ],
  infraestructura: [
    "El eco te delata en {zone}. Caminas más despacio.",
    "Agua goteando en la distancia. {zone} sigue viva a su manera.",
    "Turbina muerta, cables sueltos: {zone} exige respeto.",
  ],
  militar: [
    "Alambre, lonas y orden: {zone} se sintió siempre vigilada.",
    "Sillas vacías frente a mapas inútiles. Bienvenido a {zone}.",
    "{zone} guarda sus secretos bajo candado. Hoy no.",
  ],
  all: ["Empiezas la expedición por {zone}."],
};

const FIND: Pool = {
  urbano: [
    "Entre muñecos rotos y libros hinchados encontraste {amount} de {res}.",
    "Un cajón que no miró nadie: {amount} de {res} para el refugio.",
    "Bajo una cama volcada, {amount} de {res}. La ciudad aún da.",
  ],
  comercial: [
    "Estantería escondida detrás del mostrador: {amount} de {res}.",
    "Alguien lo pasó de largo. Tú no: {amount} de {res}.",
    "Entre vidrios y carritos, {amount} de {res} bien guardados.",
  ],
  industrial: [
    "Contenedor sin inventario: {amount} de {res} dentro.",
    "Casillero de operario intacto — {amount} de {res}.",
    "Bajo lona y cinta de peligro, {amount} de {res}.",
  ],
  medico: [
    "Botiquín de pared, mitad lleno: {amount} de {res}.",
    "Carro de urgencias volcado... con {amount} de {res} dentro.",
    "Archivo de farmacia: {amount} de {res} sin reclamar.",
  ],
  infraestructura: [
    "Panel abierto, caja sellada: {amount} de {res}.",
    "Los viejos sistemas escondían {amount} de {res}.",
    "Sala técnica: {amount} de {res} entre papeles sueltos.",
  ],
  militar: [
    "Ración estándar sin abrir: {amount} de {res}.",
    "Suministro estandarizado, lote sin destino: {amount} de {res}.",
    "Taquilla con candado forzado hace años: {amount} de {res}.",
  ],
  all: ["Hallaste {amount} de {res}."],
};

const DAMAGE: Pool = {
  urbano: [
    "El suelo cedió un instante. {cause}: -{damage} de salud.",
    "Una reja cayó cerca. Muy cerca. {cause}: -{damage} de salud.",
    "Algo se movió en la oscuridad y no era el viento. {cause}: -{damage}.",
  ],
  comercial: [
    "El techo del pasillo dijo basta. {cause}: -{damage} de salud.",
    "Vidrio en todas partes, y uno de ellos en tu brazo. {cause}: -{damage}.",
  ],
  industrial: [
    "La grúa soltó una pieza oxidada. {cause}: -{damage} de salud.",
    "Chatarra afilada donde no debía. {cause}: -{damage}.",
  ],
  medico: [
    "Un frasco roto, un corte tonto. {cause}: -{damage} de salud.",
    "La camilla se vino abajo contigo encima. {cause}: -{damage}.",
  ],
  infraestructura: [
    "Chispazo de un cable que no estaba muerto. {cause}: -{damage}.",
    "El agua del suelo escondía un pozo. {cause}: -{damage} de salud.",
  ],
  militar: [
    "Bengala de emergencia activada sola. {cause}: -{damage}.",
    "Trampa vieja, todavía eficaz. {cause}: -{damage} de salud.",
  ],
  all: ["{cause}: -{damage} de salud."],
};

const EVENT: Pool = {
  all: [
    "Caché escondido bajo un escombro — intacto desde el Estallido.",
    "Botiquín de campaña olvidado en una taquilla oxidada.",
    "Refugio seguro: una noche sin peligros, con agua caliente.",
    "Despensa saqueada a medias — quedó lo que nadie quiso mover.",
    "Taller intacto: herramientas finas y componentes a mano.",
    "Bolsas de cemento y chatarra seleccionada en un contenedor sellado.",
  ],
};

const RARE: Pool = {
  all: [
    "Un hallazgo excepcional: {amount} de {res}, en estado casi perfecto.",
    "Golpe de suerte de los que ya no ocurren: {amount} de {res}.",
    "Coleccionista muerto hace años te regaló su tesoro: {amount} de {res}.",
  ],
};

const NPC_FOUND: Pool = {
  all: [
    "Una figura te observaba desde la escalera. {npc} levanta las manos: quiere hablar.",
    "Te siguieron tres manzanas. Al final, {npc} pidió unirse.",
    "{npc} salió de un escondite con las manos vacías y la mirada alerta.",
    "Un disparo al aire, luego silencio. {npc} apareció con las palmas abiertas.",
  ],
};

const ZONE_UNLOCK: Pool = {
  all: [
    "Los mapas vuelven a crecer: {zone} es accesible.",
    "Firmaste el avance con sudor y vendas. {zone} desbloqueada.",
    "Hay un mundo más allá. {zone} espera tus botas.",
  ],
};

const BUILD_DONE: Pool = {
  all: [
    "Los martillos callaron: {building} está en pie (N{level}).",
    "{building} N{level} — el refugio respira un poco mejor.",
    "Olor a obra fresca. {building} N{level} lista para usarse.",
  ],
};

const NPC_FIND: Pool = {
  all: [
    "{npc} volvió con {amount} de {res} y una sonrisa cansada.",
    "{npc} escribió en su libreta: {amount} de {res} más.",
    "Otro día, otro hallazgo. {npc} trajo {amount} de {res}.",
  ],
};

const SURVIVAL_WARN: Pool = {
  all: [
    "Las reservas de {meter} bajan. La barriga manda sobre la valentía.",
    "{meter} en zona de riesgo: nadie piensa claro con hambre.",
    "El estómago cruje más fuerte que los escombros: poca {meter}.",
  ],
};

// ---------------- Push helpers ----------------

function pushNarr(state: GameState, msg: string, kind: GameState["log"][number]["kind"], t: number = Date.now()): void {
  state.log.unshift({ t, msg, kind, channel: "narr" });
  // Trim narrative overflow only (keep tech log untouched).
  let narrCount = 0;
  for (let i = 0; i < state.log.length; i++) {
    if (state.log[i].channel === "narr") narrCount++;
  }
  if (narrCount > NARRATIVE_CONFIG.maxNarrEntries) {
    // Remove the OLDEST narrative entry (highest index, since log is unshifted).
    for (let i = state.log.length - 1; i >= 0; i--) {
      if (state.log[i].channel === "narr") {
        state.log.splice(i, 1);
        break;
      }
    }
  }
}

function fill(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

/** Resource display name for narrative text. */
function resName(r: ResourceKey): string {
  switch (r) {
    case "materiales": return "materiales";
    case "agua": return "agua embotellada";
    case "comida": return "comida";
    case "medicamentos": return "medicinas";
    case "componentes": return "componentes";
    case "energia": return "baterías";
    case "dinero": return "dinero";
  }
}

/** Amount label: time resources show "N min". */
function amountLabel(r: ResourceKey, amount: number): string {
  return r === "comida" || r === "agua" ? `${amount} min` : `${amount}`;
}

// ---------------- Public API ----------------

/** Narrative line for starting an exploration in a zone. */
export function narrExplorationStart(state: GameState, zoneId: number, zoneName: string): void {
  pushNarr(state, fill(pick(START, biomeOf(zoneId), "start"), { zone: zoneName }), "info");
}

/** Narrative line for a resource find. */
export function narrResourceFind(
  state: GameState,
  zoneId: number,
  resource: ResourceKey,
  amount: number,
  rare: boolean,
): void {
  const vars = { res: resName(resource), amount: amountLabel(resource, amount) };
  const pool = rare ? RARE : FIND;
  pushNarr(state, fill(pick(pool, biomeOf(zoneId), rare ? "rare" : "find"), vars), "resource");
}

/** Narrative line for an incident. */
export function narrDamage(state: GameState, zoneId: number, cause: string, damage: number): void {
  pushNarr(state, fill(pick(DAMAGE, biomeOf(zoneId), "damage"), { cause, damage }), "damage");
}

/** Narrative line for a manual special event. */
export function narrEvent(state: GameState, text: string): void {
  pushNarr(state, text, "exp");
}

/** Narrative line for finding an NPC survivor. */
export function narrNpcFound(state: GameState, npcName: string, npcAlias: string): void {
  pushNarr(state, fill(pick(NPC_FOUND, "urbano", "npcfound"), { npc: `${npcName} «${npcAlias}»` }), "npc");
}

/** Narrative line for a zone unlock. */
export function narrZoneUnlock(state: GameState, zoneName: string): void {
  pushNarr(state, fill(pick(ZONE_UNLOCK, "urbano", "unlock"), { zone: zoneName }), "zone");
}

/** Narrative line for a building completion. */
export function narrBuildDone(state: GameState, buildingName: string, level: number): void {
  pushNarr(state, fill(pick(BUILD_DONE, "urbano", "build"), { building: buildingName, level }), "build");
}

/** Narrative line for an NPC production find. */
export function narrNpcFind(state: GameState, npcName: string, resource: ResourceKey, amount: number): void {
  pushNarr(
    state,
    fill(pick(NPC_FIND, "urbano", "npcfind2"), { npc: npcName, res: resName(resource), amount: amountLabel(resource, amount) }),
    "npc",
  );
}

/** Narrative warning when survival tier worsens. */
export function narrSurvivalWarn(state: GameState, meter: "comida" | "agua"): void {
  pushNarr(state, fill(pick(SURVIVAL_WARN, "urbano", "surv"), { meter }), "damage");
}
