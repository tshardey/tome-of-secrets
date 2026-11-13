// library-tagger: tags one queued book with Claude (Plan 7 D7, D8).
// Called by the library app as functions.invoke("library-tagger", { body: { jobId } }).
//
// Auth (D8, as library-covers): verify_jwt stays at its default (true), and
// verifyAuth({ auth: "user" }) requires a valid user JWT before anything else
// runs. The only Supabase client is createContextClient with that token, so
// every RPC runs as the caller and checks library.is_member itself.
// withSupabase isn't used because it always builds an admin client from the
// secret key; `secretKeys: {}` keeps @supabase/server from reading
// SUPABASE_SECRET_KEY(S) at all.
import { createContextClient, verifyAuth } from "@supabase/server/core";
// Also pins @supabase/server's supabase-js peer to the version in deno.json.
import { corsHeaders } from "@supabase/supabase-js/cors";
import { handle, rpcDb, type SupabaseLike } from "./handler.ts";
import { anthropicTagger, chooseTagger, fakeTagger } from "./tagger.ts";

const ENV = { secretKeys: {} };

/** The published ToS tag list (GitHub Pages: _config.yml url + baseurl). */
const DEFAULT_TOS_TAGS_URL = "https://tshardey.github.io/tome-of-secrets/assets/data/bookTags.json";
const tosTagsUrl = Deno.env.get("LIBRARY_TOS_TAGS_URL") || DEFAULT_TOS_TAGS_URL;

const tagger = chooseTagger((name) => Deno.env.get(name)) === "fake"
  ? fakeTagger()
  : anthropicTagger(Deno.env.get("ANTHROPIC_API_KEY"));

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
    console.error("library-tagger client failed", (err as { code?: string })?.code ?? "unknown");
    return Response.json({ error: "internal" }, { status: 500 });
  }
  return handle(req, {
    db: rpcDb(supabase),
    tagger,
    fetchImpl: (input, init) => fetch(input, init),
    tosTagsUrl,
    now: () => new Date(),
  });
}

export default {
  fetch: (req: Request) => serve(req).then(withCors),
};
