import assert from "node:assert/strict";
import { allowedTosTags, EXCLUDED_TOS_TAGS, loadTosTagList, type TosTagDef } from "./tos-tags.ts";

// Shaped like bookTags.json: real category names, some invented ids.
const LIST: TosTagDef[] = [
  { id: "fantasy", label: "Fantasy", category: "genre" },
  { id: "cozy", label: "Cozy", category: "content" },
  { id: "invented-content", label: "Invented", category: "content" },
  { id: "new-author", label: "New", category: "content", scope: "reader" },
  { id: "epistolary", label: "Letters", category: "form" },
  { id: "special-edition", label: "Special", category: "form" },
  { id: "audio", label: "Audiobook", category: "form", derivedFromType: "audiobook" },
  { id: "borrowed", label: "Borrowed", category: "provenance" },
  { id: "re-read", label: "Re-read", category: "provenance", scope: "reader" },
  { id: "award-winning", label: "Award", category: "provenance" },
  { id: "recommended", label: "Chosen", category: "agency", scope: "reader" },
];

Deno.test("allowedTosTags: genre, content, form and award-winning only", () => {
  assert.deepEqual(allowedTosTags(LIST), ["fantasy", "cozy", "invented-content", "epistolary", "award-winning"]);
  assert.deepEqual([...EXCLUDED_TOS_TAGS], ["special-edition"]);
});

const ok = (list: unknown) => (() => Promise.resolve(Response.json(list))) as typeof fetch;

Deno.test("loadTosTagList: parses the list, then caches for the hour", async () => {
  let calls = 0;
  const f = (() => {
    calls++;
    return Promise.resolve(Response.json(LIST));
  }) as typeof fetch;
  const url = "https://example.test/cache-a.json";
  assert.deepEqual(await loadTosTagList(url, f), LIST);
  assert.deepEqual(await loadTosTagList(url, f), LIST);
  assert.equal(calls, 1);
  // a different url is a different entry
  await loadTosTagList("https://example.test/cache-b.json", f);
  assert.equal(calls, 2);
});

Deno.test("loadTosTagList: refetches after an hour", async () => {
  let calls = 0;
  let t = 1_000_000;
  const f = (() => {
    calls++;
    return Promise.resolve(Response.json(LIST));
  }) as typeof fetch;
  const url = "https://example.test/cache-c.json";
  await loadTosTagList(url, f, { now: () => t });
  t += 3_599_000;
  await loadTosTagList(url, f, { now: () => t });
  assert.equal(calls, 1);
  t += 2_000;
  await loadTosTagList(url, f, { now: () => t });
  assert.equal(calls, 2);
});

Deno.test("loadTosTagList: a timeout rejects and is not cached", async () => {
  const hang = ((_u: unknown, init?: RequestInit) =>
    new Promise((_res, rej) => {
      init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
    })) as typeof fetch;
  const url = "https://example.test/timeout.json";
  await assert.rejects(loadTosTagList(url, hang, { timeoutMs: 20 }));
  assert.deepEqual(await loadTosTagList(url, ok(LIST)), LIST);
});

Deno.test("loadTosTagList: a bad status or shape rejects", async () => {
  await assert.rejects(
    loadTosTagList("https://example.test/s.json", (() => Promise.resolve(new Response("x", { status: 500 }))) as typeof fetch),
  );
  await assert.rejects(loadTosTagList("https://example.test/t.json", ok({ not: "a list" })));
  await assert.rejects(loadTosTagList("https://example.test/u.json", ok([{ id: 1 }])));
});
