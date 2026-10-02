import type { GameState, Screen } from "./types";
import { vnow } from "./virtualClock";

/** Shared fields required on every log entry: zona and origen. */
export interface LogCommonFields {
  /** Zona afectada por el evento (Z01, Z02, ...), undefined si no aplica. */
  zona?: string;
  /** ¿Dónde se produjo el evento: manual = acción del usuario, auto = ciclo automático. */
  origen: "manual" | "auto";
}

export type LogFieldValue = string | number | boolean;

export type LogFieldRecord = Readonly<Record<string, LogFieldValue>>;

/**
 * Representa una línea de registro uniforme con el esquema:
 *   [HH:MM:SS] [CATEGORIA] subtipo | campo=valor | campo=valor | ...
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
 *   [HH:MM:SS] [CATEGORY] subtype | campo=valor | campo=valor | ...
 * Fields zona and origen are required whenever applicable and are carried
 * as top-level properties; the rest of the dynamic pairs live in `fields`.
 * Optional narrative text is preserved for the player-facing summary.
 */
export interface LogEvent extends LogCommonFields {
  /** Global correlative event id for the whole session, assigned by pushLog. */
  event_id: number;
  /** Hora de ejecución del evento en el reloj virtual del juego. */
  hora: string;
  /** Categoría de la línea de log (API pública permitida). */
  category: LogCategory;
  /** Subtipo o tipo de evento dentro de la categoría. */
  subtype: string;
  /** Dynamic campo=valor pairs carried in the line. */
  fields: Readonly<Record<string, LogFieldValue>>;
  /** Player-facing narrative text (preserved when it exists). */
  mensaje?: string;
}

function formatField(value: LogFieldValue): string {
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

function formatFields(fields: Readonly<Record<string, LogFieldValue>>): string {
  const entries = Object.entries(fields);
  if (entries.length === 0) return "";
  return entries.map(([key, value]) => `${key}=${formatField(value)}`).join(" | ");
}

/**
 * Generates the body of a log line in the required format.
 */
function buildLine(event: LogEvent): string {
  const fieldsPart = formatFields(event.fields);
  const suffix = fieldsPart ? ` | ${fieldsPart}` : "";
  return `[${event.hora}] [${event.category}] ${event.subtype}${suffix}`;
}

/**
 * Appends a log event to the state history and returns the created record.
 */
export function pushLog(
  state: GameState,
  event: Omit<LogEvent, "event_id" | "hora">,
): LogEvent {
  const logEntry: LogEvent = {
    ...event,
    event_id: state.nextLogEventId++,
    hora: formatTime(vnow()),
  };
  state.log.unshift(logEntry);
  if (state.log.length > 60) {
    state.log = state.log.slice(0, 60);
  }
  return logEntry;
}

/**
 * Converts a timestamp in milliseconds to HH:MM:SS according to the game's
 * virtual clock.
 */
export function formatTime(timestamp: number): string {
  const totalSeconds = Math.floor(timestamp / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

/**
 * Pantalla de la barra inferior a la que pertenece la actividad de un evento
 * de log (para el punto/badge de "actividad nueva"). Devuelve null para el
 * ruido que nunca debe encender el indicador: ticks de producción/regeneración,
 * checks de probabilidad y acciones iniciadas por el propio jugador en el
 * momento (CLICK/INICIO). Para NPC_ACTION solo el hallazgo (y el reinicio de
 * contador que lo acompaña) cuenta como actividad: los "find" de producción
 * y las acciones de gestión ocurren en pantalla o son rutina.
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
