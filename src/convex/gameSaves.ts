import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// ============================================================
// AFTERFALL — cloud save.
// One `gameSaves` document per user (keyed by the auth UID).
// The full GameState travels as `state` (v.any) and is migrated
// client-side according to `version` — same pipeline as the
// local IndexedDB save.
// ============================================================

/** Fetch the signed-in user's cloud save. Returns null if none. */
export const getSave = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await ctx.db
      .query("gameSaves")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
  },
});

/**
 * SaveProgress() — upsert the user's cloud save with the full game state.
 * Called debounced from the client after important changes.
 */
export const saveProgress = mutation({
  args: {
    state: v.any(),
    version: v.number(),
    clientSavedAt: v.number(),
  },
  handler: async (ctx, { state, version, clientSavedAt }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("No autenticado");

    const existing = await ctx.db
      .query("gameSaves")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();

    const savedAt = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { state, version, savedAt, clientSavedAt });
      return existing._id;
    }
    return await ctx.db.insert("gameSaves", {
      userId,
      state,
      version,
      savedAt,
      clientSavedAt,
    });
  },
});

/** DeleteProgress() — remove the user's cloud save (e.g. after erasing the game). */
export const deleteProgress = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("No autenticado");
    const existing = await ctx.db
      .query("gameSaves")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return true;
  },
});

/** Which auth methods have server-side credentials configured. */
export const authStatus = query({
  args: {},
  handler: async () => {
    return {
      googleConfigured: !!(
        process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ),
    };
  },
});
