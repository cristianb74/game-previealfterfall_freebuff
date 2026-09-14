import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { ConvexReactClient } from "convex/react";
import { anyApi } from "convex/server";
import { toast } from "sonner";
import type { GameState } from "./types";
import { SAVE_VERSION } from "./gameConfig";
import {
  loadGame,
  saveGame,
  deleteSave as deleteLocalSave,
  type SaveEnvelope,
} from "./saveSystem";

// ============================================================
// AFTERFALL — cloud save bridge (Convex).
// Mirrors the local save into the per-user cloud document and
// resolves conflicts with "newest wins" (by client timestamp).
// ============================================================

export type CloudSaveDoc = Doc<"gameSaves">;

export type CloudSyncResult =
  | { kind: "pushed"; savedAt: number }
  | { kind: "restored"; state: GameState }
  | { kind: "in-sync" }
  | { kind: "signed-out" };

/** Fetch the user's cloud save document (null if signed out / empty). */

let convexClient: ConvexReactClient | null = null;

/** Inject the app's Convex client once (called from GameProvider). */
export function setConvexClient(client: ConvexReactClient): void {
  convexClient = client;
}

/** Fetch the user's cloud save document (null if signed out / empty). */
export async function fetchCloudSave(): Promise<CloudSaveDoc | null> {
  try {
    // anyApi: server-side `anyApi` used from the client keeps the query
    // untyped but functional (getSave returns null when signed out).
    return (await requireClient().query(anyApi.gameSaves.getSave, {})) as CloudSaveDoc | null;
  } catch {
    // Not signed in or network failure — treat as "no cloud save".
    return null;
  }
}

function requireClient(): ConvexReactClient {
  if (!convexClient) throw new Error("Convex client not initialised");
  return convexClient;
}

/**
 * SaveProgress() — upload the given state to the cloud (if signed in).
 * Fire-and-forget friendly: failures surface a toast, never throw.
 */
export async function pushCloudSave(state: GameState): Promise<void> {
  const client = requireClient();
  try {
    await client.mutation(api.gameSaves.saveProgress, {
      state,
      version: SAVE_VERSION,
      clientSavedAt: state.lastTickAt,
    });
  } catch (err) {
    // Unauthenticated users simply have no cloud save — stay silent.
    const msg = err instanceof Error ? err.message : String(err);
    if (!/unauthenticated|no autenticado/i.test(msg)) {
      console.warn("[cloudSave] push failed:", msg);
      toast.error("No se pudo sincronizar con la nube", { description: msg });
    }
  }
}

/**
 * LoadProgress() — download the cloud save into the game.
 * Conflict policy: whichever save (cloud vs local) has the newer
 * client timestamp wins; the loser is overwritten.
 */
export async function pullCloudSave(): Promise<CloudSyncResult> {
  const client = requireClient();
  const doc = await fetchCloudSave();
  if (!doc || !doc.state) return { kind: "signed-out" };

  const local = await loadGame();
  const cloudState = doc.state as GameState;
  const cloudAt = doc.clientSavedAt ?? doc.savedAt;
  const localAt = local?.state.lastTickAt ?? 0;

  if (local && localAt > cloudAt) {
    // Local is newer — push it up to the cloud.
    await client.mutation(api.gameSaves.saveProgress, {
      state: local.state,
      version: SAVE_VERSION,
      clientSavedAt: local.state.lastTickAt,
    });
    return { kind: "pushed", savedAt: cloudAt };
  }

  if (local && localAt === cloudAt) return { kind: "in-sync" };

  // Cloud is newer (or no local save) — restore it locally.
  const envelope: SaveEnvelope = {
    version: doc.version ?? SAVE_VERSION,
    savedAt: cloudAt,
    state: cloudState,
  };
  await saveGame(cloudState);
  return { kind: "restored", state: envelope.state };
}

/** DeleteProgress() — wipe both local and cloud saves. */
export async function wipeAllSaves(): Promise<void> {
  await deleteLocalSave();
  try {
    const client = requireClient();
    await client.mutation(api.gameSaves.deleteProgress, {});
  } catch {
    // Signed out — nothing to delete remotely.
  }
}
