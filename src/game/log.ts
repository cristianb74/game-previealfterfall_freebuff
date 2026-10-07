import type { GameState, Screen } from "./types";

/** Shared fields required on every log entry: zona and origen. */
export interface LogCommonFields {
  /** Zona afectada por el evento ("Z01", "Z02", ... o "global"). */
  zona: string;
  /** ¿Dónde se produjo el evento: manual = acción del usuario, auto = ciclo automático. */
  origen: "manual" | "auto";
}

/** Scalar value a log line can carry. */
export type LogFieldValue = string | number | boolean;

/** Structured value rendered as `{...}` in the line (e.g. recursos/materiales_usados). */
export type LogFieldObject = Readonly<Record<string, string | number>>;

export type LogFieldInput = LogFieldValue | LogFieldObject;

export type LogFieldRecord = Readonly<Record<string, LogFieldInput>>;

/**
 * Representa una línea de registro uniforme con el esquema:
 *   [HH:MM:SS] [CATEGORIA #id] subtipo | zona=Z01 | origen=manual | campo=valor | ...
 */
export type LogCategory =
  | "CLICK"
  | "AUTO_EXPLORER"
  | "NPC_ACTION"
  | "CRAFTEO"
  | "MERCADER"
  | "USO_ITEM"
  | "SCAVENGE"
  | "EXP"
  | "NPC CHECK"
  | "SCAVENGE CHECK"
  | "RECURSO"
  | "ENERGÍA"
  | "CONSTR"
  | "ZONA"
  | "INICIO";

/**
 * Represents a single line of the game log, in the format:
 *   [HH:MM:SS] [CATEGORY #id] subtype | zona=Z01 | origen=manual | campo=valor | ...
 * `zona` and `origen` are ALWAYS present (normalized by pushLog — "global"
 * when the event does not belong to a zone). The remaining dynamic pairs live
 * in `fields`. Optional narrative text is preserved for the player-facing summary.
 */
export interface LogEvent extends LogCommonFields {
  /** Global correlative event id for the whole session, assigned by pushLog. */
  event_id: number;
  /** Hora de ejecución del evento en el reloj real del sistema (HH:MM:SS, 24h). */
  hora: string;
  /** Categoría de la línea de log (API pública permitida). */
  category: LogCategory;
  /** Subtipo o tipo de evento dentro de la categoría. Nunca repite la categoría. */
  subtype: string;
  /** Dynamic campo=valor pairs carried in the line. */
  fields: LogFieldRecord;
  /** Player-facing narrative text (preserved when it exists). */
  mensaje?: string;
}

/** Evento tal como lo entrega el call-site (pushLog añade event_id y hora).
 *  `zona` es intencionalmente flexible: acepta id numérico, "Z01", "Base", o
 *  undefined (→ "global"); pushLog la normaliza SIEMPRE (nunca queda hueca
 *  ni placeholder). `evento_id`/`hora` NO se pasan: los asigna pushLog. */
export type LogInput = Omit<
  LogEvent,
  "event_id" | "hora" | "zona"
> & {
  zona?: string | number | null;
};

/** Tope de entradas técnicas en state.log (el overflow se descarta). */
export const MAX_LOG_ENTRIES = 60;

/**
 * Subtipo por defecto de cada categoría. Existe para que una línea NUNCA
 * pueda caer al placeholder `[CATEGORIA] CATEGORIA`: si el call-site no pasa
 * subtipo, o pasa uno igual a la categoría, se usa este valor real.
 */
const DEFAULT_SUBTYPE: Record<LogCategory, string> = {
  CLICK: "click",
  AUTO_EXPLORER: "ciclo_iniciado",
  NPC_ACTION: "hallazgo",
  CRAFTEO: "inicio",
  MERCADER: "operacion",
  USO_ITEM: "usado",
  SCAVENGE: "hallazgo",
  EXP: "evento",
  "NPC CHECK": "check",
  "SCAVENGE CHECK": "check",
  RECURSO: "hallazgo",
  ENERGÍA: "cambio",
  CONSTR: "completada",
  ZONA: "cambio",
  INICIO: "inicio_ciclo",
};

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

/**
 * Convierte un timestamp epoch en milisegundos a HH:MM:SS del reloj real de
 * 24 horas. Acepta también el caso legado de un "contador" en segundos o
 * milisegundos relativos muy grandes (multiplicadores de velocidad): siempre
 * se recorta a un rango horario válido (00–23) en vez de imprimir 6 dígitos.
 */
export function formatTime(timestamp: number): string {
  const ms = Number.isFinite(timestamp) ? timestamp : Date.now();
  const d = new Date(ms);
  if (!Number.isNaN(d.getTime())) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  // Fallback extremo: timestamp sin sentido → reduced modulo 24 h.
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600) % 24;
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${pad(hours)}:${pad(minutes)}:${pad(totalSeconds % 60)}`;
}

/**
 * Normaliza la zona a "Z01"/"Z02"/... o "global". Acepta el id numérico
 * suelto ("1"), la forma ya formateada ("z1"), la base global y vacío.
 */
export function normalizeZona(zona?: string | number | null): string {
  const raw = zona == null ? "" : String(zona).trim();
  if (!raw) return "global";
  if (/^\d+$/.test(raw)) return `Z${raw.padStart(2, "0")}`;
  if (/^z\d+$/i.test(raw)) return `Z${raw.slice(1).padStart(2, "0")}`;
  if (/^base/i.test(raw)) return "global";
  return raw;
}

/** Subtipo utilizable: nunca vacío y nunca igual a la categoría. */
export function normalizeSubtype(category: LogCategory, subtype?: string | null): string {
  const raw = (subtype ?? "").trim();
  if (!raw) return DEFAULT_SUBTYPE[category] ?? "evento";
  if (raw.toUpperCase() === category.toUpperCase()) {
    return DEFAULT_SUBTYPE[category] ?? "evento";
  }
  return raw;
}

/** Formatea un valor de campo; los objetos se serializan como `{...}`. */
export function formatField(value: LogFieldInput): string {
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
}

/**
 * Campos RESERVADOS: siempre los escribe la base del evento (zona/origen) o
 * el propio pushLog (event_id/hora/category/subtype). Si llegan duplicados
 * dentro de `fields` se descartan para que CADA CAMPO APAREZCA UNA SOLA VEZ
 * por línea (p.ej. el viejo `[EXP] auto_fin | zona=Z02 | ... | zona=Z02`).
 */
const RESERVED_FIELDS = new Set(["zona", "origen", "event_id", "hora", "category", "subtype"]);

function formatFields(fields: LogFieldRecord): string {
  return Object.entries(fields)
    .filter(([key]) => !RESERVED_FIELDS.has(key))
    .map(([key, value]) => `${key}=${formatField(value)}`)
    .join(" | ");
}

/** Descarta null/undefined y redondea floats "sucios" (54.68399999999999 → 54.684). */
function sanitizeFields(fields: LogFieldRecord | undefined): Record<string, LogFieldInput> {
  const out: Record<string, LogFieldInput> = {};
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (value == null) continue;
    if (RESERVED_FIELDS.has(key)) continue; // zona/origen ya van en la base
    out[key] = value;
  }
  return out;
}

/** Redondea a 3 decimales los números que arrastran error de coma flotante. */
export function roundField(value: LogFieldInput): LogFieldInput {
  if (typeof value !== "number") return value;
  return Math.round(value * 1000) / 1000;
}

/**
 * Construye el texto completo de la línea:
 *   [HH:MM:SS] [CATEGORIA #id] subtipo | zona=Z01 | origen=manual | campo=valor | ...
 * Es la MISMA función que usa el export .txt, así el reporte y la UI nunca
 * divergen. Las líneas viejas (sin event_id) se reconstruyen igual.
 */
export function formatLogLine(event: LogEvent): string {
  const id = Number.isFinite(event.event_id) ? event.event_id : 0;
  const head = `[${event.hora ?? "--:--:--"}] [${event.category} #${id}] ${normalizeSubtype(
    event.category,
    event.subtype,
  )}`;
  const tail = [
    `zona=${normalizeZona(event.zona)}`,
    `origen=${event.origen === "auto" ? "auto" : "manual"}`,
    formatFields(event.fields ?? {}),
  ]
    .filter((part) => part.length > 0)
    .join(" | ");
  return `${head} | ${tail}`;
}

/**
 * ÚNICO punto de entrada de eventos al log. Normaliza event_id correlativo
 * (uno global para toda la sesión), hora real, zona, origen y subtipo, de
 * modo que ninguna línea pueda degradarse a `[X] X` ni `[X]` sin zona.
 */
export function pushLog(state: GameState, event: LogInput): LogEvent {
  const entry: LogEvent = {
    event_id: state.nextLogEventId++,
    hora: formatTime(Date.now()),
    category: event.category,
    subtype: normalizeSubtype(event.category, event.subtype),
    zona: normalizeZona(event.zona),
    origen: event.origen === "auto" ? "auto" : "manual",
    fields: sanitizeFields(event.fields),
    ...(event.mensaje !== undefined ? { mensaje: event.mensaje } : {}),
  };
  state.log.unshift(entry);
  if (state.log.length > MAX_LOG_ENTRIES) {
    state.log.length = MAX_LOG_ENTRIES;
  }
  return entry;
}

/**
 * Evento [CLICK]: toda interacción manual que dispara (o intenta disparar)
 * lógica de juego, incluidos los clicks bloqueados/deshabilitados.
 */
export function pushClick(
  state: GameState,
  boton: string,
  opts: {
    zona?: string | number | null;
    resultado?: "ejecutado" | "bloqueado";
    motivo?: string;
    extra?: LogFieldRecord;
    /** Texto narrativo opcional (si no se pasa, Registro muestra el subtipo). */
    mensaje?: string;
  } = {},
): LogEvent {
  return pushLog(state, {
    zona: opts.zona ?? "global",
    origen: "manual",
    category: "CLICK",
    subtype: opts.resultado === "bloqueado" ? "bloqueado" : "ejecutado",
    fields: {
      boton,
      resultado: opts.resultado ?? "ejecutado",
      ...(opts.motivo ? { motivo: opts.motivo } : {}),
      ...(opts.extra ?? {}),
    },
    ...(opts.mensaje !== undefined ? { mensaje: opts.mensaje } : {}),
  });
}

/**
 * Pantalla de la barra inferior a la que pertenece la actividad de un evento
 * de log (para el punto/badge de "actividad nueva"). Devuelve null para el
 * ruido que nunca debe encender el indicador: clicks y acción propia del
 * jugador en el momento, checks de probabilidad y producción rutinaria.
 * Para NPC_ACTION el hallazgo de un NPC asignado sí cuenta (pantalla Equipo).
 */
export function activityScreenFor(category: LogCategory, subtype?: string): Screen | null {
  switch (category) {
    case "EXP":
    case "AUTO_EXPLORER":
    case "SCAVENGE":
    case "SCAVENGE CHECK":
    case "ZONA":
    case "RECURSO":
      return "zonas";
    case "NPC_ACTION":
      return subtype === "hallazgo" || subtype === "contador_reiniciado" ? "equipo" : null;
    case "CONSTR":
    case "CRAFTEO":
      return "base";
    case "MERCADER":
      return "mercader";
    case "USO_ITEM":
      return "mochila";
    default:
      return null;
  }
}
