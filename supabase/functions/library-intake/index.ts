// library-intake: reads one photo intake item with Claude Haiku.
// Called by the library app as functions.invoke("library-intake", { body: { itemId } }).
// verify_jwt stays at its default (true), and withSupabase({ auth: "user" })
// requires a user JWT; ctx.supabase is scoped to that user's RLS (D4).
import { withSupabase } from "@supabase/server";
// Imported so the pinned supabase-js satisfies @supabase/server's peer dependency.
import type { SupabaseClient } from "@supabase/supabase-js";
import { handle, rpcDb, type SupabaseLike } from "./handler.ts";
import { anthropicVision, chooseVision, fakeVision } from "./vision.ts";

const vision = chooseVision((name) => Deno.env.get(name)) === "fake"
  ? fakeVision()
  : anthropicVision(Deno.env.get("ANTHROPIC_API_KEY"));

export default {
  fetch: withSupabase(
    { auth: "user" },
    (req, ctx) => handle(req, { db: rpcDb(ctx.supabase satisfies SupabaseClient as unknown as SupabaseLike), vision, now: () => new Date() }),
  ),
};
