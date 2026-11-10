// library-intake: reads one photo intake item with Claude Haiku.
// Called by the library app as functions.invoke("library-intake", { body: { itemId } }).
//
// Auth (D4): verify_jwt stays at its default (true), and verifyAuth({ auth: "user" })
// requires a valid user JWT before anything else runs. The only Supabase client
// is createContextClient with that token, so every RPC and storage read runs
// under the caller's RLS. withSupabase isn't used because it always builds an
// admin client from the secret key; `secretKeys: {}` keeps @supabase/server from
// reading SUPABASE_SECRET_KEY(S) at all.
import { createContextClient, verifyAuth } from "@supabase/server/core";
// Also pins @supabase/server's supabase-js peer to the version in deno.json.
import { corsHeaders } from "@supabase/supabase-js/cors";
import { handle, rpcDb, type SupabaseLike } from "./handler.ts";
import { anthropicVision, chooseVision, fakeVision } from "./vision.ts";

const ENV = { secretKeys: {} };

const vision = chooseVision((name) => Deno.env.get(name)) === "fake"
  ? fakeVision()
  : anthropicVision(Deno.env.get("ANTHROPIC_API_KEY"));

function withCors(res: Response): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(corsHeaders)) out.headers.set(k, v);
  return out;
}

async function serve(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  const { data: auth, error } = await verifyAuth(req, { auth: "user", env: ENV });
  if (error || !auth?.token) {
    return Response.json({ error: error?.code ?? "unauthorized" }, { status: error?.status ?? 401 });
  }

  let supabase: SupabaseLike;
  try {
    supabase = createContextClient({ auth: { token: auth.token }, env: ENV }) as unknown as SupabaseLike;
  } catch (err) {
    console.error("library-intake client failed", (err as { code?: string })?.code ?? "unknown");
    return Response.json({ error: "internal" }, { status: 500 });
  }
  return handle(req, { db: rpcDb(supabase), vision, now: () => new Date() });
}

export default {
  fetch: (req: Request) => serve(req).then(withCors),
};
