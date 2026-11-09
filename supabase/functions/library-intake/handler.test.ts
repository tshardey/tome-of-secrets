import assert from "node:assert/strict";
import { backoffAt, handle, type IntakeDb, MAX_PHOTO_BYTES, rpcDb, type SupabaseLike } from "./handler.ts";
import type { Extraction, VisionClient, VisionResult } from "./vision.ts";

const ITEM = "0b6f4f6e-6a3c-4c1e-9d55-2f1f0f3a9b10";
const CLAIM = "7d1f3a52-8e0b-4b6e-a7c4-5a1e9c2d4f01";
const NOW = new Date("2026-11-08T12:00:00.000Z");
const COVER = "hh/item/cover.jpg";
const TITLE = "hh/item/title.jpg";

const EXTRACTION: Extraction = {
  isBook: true,
  title: "An Invented Title",
  subtitle: null,
  authors: ["A. Writer"],
  editionClues: [],
  publisher: null,
  isbn: null,
  confidence: "high",
};

type Claim = Awaited<ReturnType<IntakeDb["claim"]>>;

function claimed(over: Partial<Claim> = {}): Claim {
  return {
    outcome: "claimed",
    claimToken: CLAIM,
    attempts: 1,
    coverPath: COVER,
    titlePagePath: null,
    retryAt: null,
    ...over,
  };
}

function fakeDb(claim: Claim | (() => never), photos: Record<string, Uint8Array | null> = {}) {
  const calls = {
    claim: [] as string[],
    finish: [] as unknown[][],
    release: [] as unknown[][],
    download: [] as string[],
  };
  const db: IntakeDb = {
    claim(itemId) {
      calls.claim.push(itemId);
      return Promise.resolve(typeof claim === "function" ? claim() : claim);
    },
    finish(...args) {
      calls.finish.push(args);
      return Promise.resolve(true);
    },
    release(...args) {
      calls.release.push(args);
      return Promise.resolve(args[3] ? "pending" : "failed");
    },
    download(path) {
      calls.download.push(path);
      return Promise.resolve(path in photos ? photos[path] : new Uint8Array([0xff, 0xd8, 0xff]));
    },
  };
  return { db, calls };
}

function fakeVision(result: VisionResult) {
  const reads: Uint8Array[][] = [];
  const vision: VisionClient = {
    read(images) {
      reads.push(images);
      return Promise.resolve(result);
    },
  };
  return { vision, reads };
}

const post = (body: unknown) =>
  new Request("http://localhost/library-intake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

async function run(db: IntakeDb, vision: VisionClient, req = post({ itemId: ITEM })) {
  const res = await handle(req, { db, vision, now: () => NOW });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const OK: VisionResult = { kind: "ok", extraction: EXTRACTION, usage: { inputTokens: 2000, outputTokens: 150 } };

Deno.test("GET gives 405 and claims nothing", async () => {
  const { db, calls } = fakeDb(claimed());
  const { vision } = fakeVision(OK);
  const res = await run(db, vision, new Request("http://localhost/library-intake"));
  assert.equal(res.status, 405);
  assert.equal(calls.claim.length, 0);
});

Deno.test("a body without a UUID gives 400 and claims nothing", async () => {
  for (const body of [{}, { itemId: "not-a-uuid" }, { itemId: 42 }, "not json", { itemId: `${ITEM}x` }]) {
    const { db, calls } = fakeDb(claimed());
    const { vision } = fakeVision(OK);
    const res = await run(db, vision, post(body));
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(calls.claim.length, 0);
  }
});

for (const outcome of ["busy", "done", "retry_later", "failed", "daily_cap"]) {
  Deno.test(`claim outcome ${outcome} is returned with no download or vision call`, async () => {
    const { db, calls } = fakeDb(claimed({ outcome, claimToken: null, coverPath: null }));
    const { vision, reads } = fakeVision(OK);
    const res = await run(db, vision);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { outcome });
    assert.deepEqual(calls.claim, [ITEM]);
    assert.equal(calls.download.length, 0);
    assert.equal(reads.length, 0);
    assert.equal(calls.finish.length + calls.release.length, 0);
  });
}

Deno.test("claim then vision ok finishes with the extraction and usage", async () => {
  const { db, calls } = fakeDb(claimed());
  const { vision, reads } = fakeVision(OK);
  const res = await run(db, vision);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { outcome: "ready" });
  assert.equal(reads.length, 1);
  assert.deepEqual(calls.finish, [[ITEM, CLAIM, EXTRACTION, { inputTokens: 2000, outputTokens: 150 }]]);
  assert.equal(calls.release.length, 0);
});

Deno.test("two images are passed cover first", async () => {
  const cover = new Uint8Array([1]);
  const title = new Uint8Array([2]);
  const { db, calls } = fakeDb(claimed({ titlePagePath: TITLE }), { [COVER]: cover, [TITLE]: title });
  const { vision, reads } = fakeVision(OK);
  await run(db, vision);
  assert.deepEqual(calls.download, [COVER, TITLE]);
  assert.equal(reads[0].length, 2);
  assert.equal(reads[0][0], cover);
  assert.equal(reads[0][1], title);
});

Deno.test("a missing photo releases photo_missing with no vision call", async () => {
  const { db, calls } = fakeDb(claimed(), { [COVER]: null });
  const { vision, reads } = fakeVision(OK);
  const res = await run(db, vision);
  assert.deepEqual(res.body, { outcome: "failed" });
  assert.equal(reads.length, 0);
  assert.equal(calls.release.length, 1);
  assert.deepEqual(calls.release[0].slice(0, 4), [ITEM, CLAIM, "photo_missing", null]);
  assert.equal(calls.release[0][4], undefined);
});

Deno.test("a missing title page also releases photo_missing", async () => {
  const { db, calls } = fakeDb(claimed({ titlePagePath: TITLE }), { [TITLE]: null });
  const { vision, reads } = fakeVision(OK);
  const res = await run(db, vision);
  assert.deepEqual(res.body, { outcome: "failed" });
  assert.equal(reads.length, 0);
  assert.equal(calls.release[0][2], "photo_missing");
});

Deno.test("a 2 MiB + 1 byte photo releases photo_missing with no vision call", async () => {
  const { db, calls } = fakeDb(claimed(), { [COVER]: new Uint8Array(MAX_PHOTO_BYTES + 1) });
  const { vision, reads } = fakeVision(OK);
  const res = await run(db, vision);
  assert.deepEqual(res.body, { outcome: "failed" });
  assert.equal(reads.length, 0);
  assert.equal(calls.release.length, 1);
  assert.deepEqual(calls.release[0].slice(0, 4), [ITEM, CLAIM, "photo_missing", null]);
  assert.equal(calls.release[0][4], undefined);
});

Deno.test("a photo of exactly 2 MiB is read", async () => {
  const { db } = fakeDb(claimed(), { [COVER]: new Uint8Array(MAX_PHOTO_BYTES) });
  const { vision, reads } = fakeVision(OK);
  const res = await run(db, vision);
  assert.deepEqual(res.body, { outcome: "ready" });
  assert.equal(reads.length, 1);
});

Deno.test("vision retry with retry-after 90 on attempt 1 backs off 90 s", async () => {
  const { db, calls } = fakeDb(claimed({ attempts: 1 }));
  const { vision } = fakeVision({ kind: "retry", retryAfterSeconds: 90 });
  const res = await run(db, vision);
  assert.deepEqual(res.body, { outcome: "retry_later" });
  assert.equal(calls.release.length, 1);
  const [item, claim, error, retryAt] = calls.release[0];
  assert.deepEqual([item, claim, error], [ITEM, CLAIM, null]);
  assert.equal((retryAt as Date).toISOString(), "2026-11-08T12:01:30.000Z");
});

Deno.test("a retry on the last attempt reports failed", async () => {
  const { db } = fakeDb(claimed({ attempts: 3 }));
  db.release = () => Promise.resolve("failed");
  const { vision } = fakeVision({ kind: "retry", retryAfterSeconds: null });
  const res = await run(db, vision);
  assert.deepEqual(res.body, { outcome: "failed" });
});

Deno.test("backoffAt: 30 s base, doubling, retry-after floor, 10 minute cap", () => {
  const secs = (d: Date) => (d.getTime() - NOW.getTime()) / 1000;
  assert.equal(secs(backoffAt(NOW, 1, 90)), 90);
  assert.equal(secs(backoffAt(NOW, 1, null)), 30);
  assert.equal(secs(backoffAt(NOW, 2, null)), 60);
  assert.equal(secs(backoffAt(NOW, 3, null)), 120);
  assert.equal(secs(backoffAt(NOW, 2, 12)), 60);
  assert.equal(secs(backoffAt(NOW, 1, 5000)), 600);
  assert.equal(secs(backoffAt(NOW, 12, null)), 600);
});

Deno.test("misconfigured releases with a null error and a null retry", async () => {
  const { db, calls } = fakeDb(claimed());
  const { vision } = fakeVision({ kind: "misconfigured" });
  const res = await run(db, vision);
  assert.deepEqual(res.body, { outcome: "misconfigured" });
  assert.equal(calls.release.length, 1);
  assert.deepEqual(calls.release[0].slice(0, 4), [ITEM, CLAIM, null, null]);
});

Deno.test("fail releases with its code and usage", async () => {
  const usage = { inputTokens: 1800, outputTokens: 2048 };
  const { db, calls } = fakeDb(claimed());
  const { vision } = fakeVision({ kind: "fail", code: "vision_unreadable", usage });
  const res = await run(db, vision);
  assert.deepEqual(res.body, { outcome: "failed" });
  assert.deepEqual(calls.release, [[ITEM, CLAIM, "vision_unreadable", null, usage]]);
});

Deno.test("a claim raising 42501 gives 403", async () => {
  const { db, calls } = fakeDb(() => {
    throw { code: "42501", message: "not_authorized" };
  });
  const { vision, reads } = fakeVision(OK);
  const res = await run(db, vision);
  assert.equal(res.status, 403);
  assert.equal(reads.length, 0);
  assert.equal(calls.download.length, 0);
});

Deno.test("an unexpected error gives 500 with no detail", async () => {
  const { db } = fakeDb(() => {
    throw new Error("secret detail");
  });
  const { vision } = fakeVision(OK);
  const res = await run(db, vision);
  assert.equal(res.status, 500);
  assert.ok(!JSON.stringify(res.body ?? "").includes("secret detail"));
});

Deno.test("an error after the claim releases it for a retry, best effort", async () => {
  const { db, calls } = fakeDb(claimed({ attempts: 1 }));
  db.download = () => Promise.reject(new Error("network"));
  const { vision, reads } = fakeVision(OK);
  const res = await run(db, vision);
  assert.equal(res.status, 500);
  assert.equal(reads.length, 0);
  assert.equal(calls.release.length, 1);
  assert.equal(calls.release[0][2], null);
  assert.equal((calls.release[0][3] as Date).toISOString(), "2026-11-08T12:00:30.000Z");
});

Deno.test("a finish whose claim went stale reports busy, not ready", async () => {
  const { db } = fakeDb(claimed());
  db.finish = () => Promise.resolve(false);
  const { vision } = fakeVision(OK);
  const res = await run(db, vision);
  assert.deepEqual(res.body, { outcome: "busy" });
});

Deno.test("rpcDb maps the claim row and the release arguments", async () => {
  const calls: { schema: string; fn: string; args: Record<string, unknown> }[] = [];
  const replies: Record<string, unknown> = {
    claim_intake_item: [{
      outcome: "claimed",
      claim_token: CLAIM,
      attempts: 2,
      cover_path: COVER,
      title_page_path: null,
      retry_at: null,
    }],
    release_intake_item: "pending",
  };
  const client: SupabaseLike = {
    schema(schema) {
      return {
        rpc(fn, args) {
          calls.push({ schema, fn, args });
          return Promise.resolve({ data: replies[fn], error: null });
        },
      };
    },
    storage: { from: () => ({ download: () => Promise.resolve({ data: null, error: null }) }) },
  };
  const db = rpcDb(client);

  assert.deepEqual(await db.claim(ITEM), {
    outcome: "claimed",
    claimToken: CLAIM,
    attempts: 2,
    coverPath: COVER,
    titlePagePath: null,
    retryAt: null,
  });
  assert.deepEqual(calls[0], { schema: "library", fn: "claim_intake_item", args: { p_item: ITEM } });

  const usage = { inputTokens: 10, outputTokens: 2 };
  assert.equal(await db.release(ITEM, CLAIM, null, null), "pending");
  assert.equal(await db.release(ITEM, CLAIM, null, new Date("2026-11-08T12:01:30.000Z"), usage), "pending");
  assert.equal(await db.release(ITEM, CLAIM, "vision_refused", null, usage), "pending");
  assert.deepEqual(calls.slice(1).map((c) => [c.schema, c.fn, c.args]), [
    ["library", "release_intake_item", { p_item: ITEM, p_claim: CLAIM, p_error: null, p_retry_at: null, p_usage: null }],
    ["library", "release_intake_item", {
      p_item: ITEM,
      p_claim: CLAIM,
      p_error: null,
      p_retry_at: "2026-11-08T12:01:30.000Z",
      p_usage: usage,
    }],
    ["library", "release_intake_item", {
      p_item: ITEM,
      p_claim: CLAIM,
      p_error: "vision_refused",
      p_retry_at: null,
      p_usage: usage,
    }],
  ]);
});
