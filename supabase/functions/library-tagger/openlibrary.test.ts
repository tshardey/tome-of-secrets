import assert from "node:assert/strict";
import { OPEN_LIBRARY_TIMEOUT_MS, openLibrarySeries, validIsbn } from "./openlibrary.ts";

// Invented ISBN-13s with a deliberately wrong check digit.
const A = "9780000000001";
const B = "9780000000018";
const C = "9780000000025";
const D = "9780000000032";
const E = "9780000000049";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Responder = Response | Error | ((signal?: AbortSignal | null) => Promise<Response>);

function stub(responses: Responder[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = responses[calls.length - 1] ?? json({}, 404);
    if (r instanceof Error) return Promise.reject(r);
    if (typeof r === "function") return r(init?.signal);
    return Promise.resolve(r);
  }) as typeof fetch;
  return { calls, fetchImpl };
}

async function quiet<T>(fn: (errors: unknown[][]) => Promise<T>): Promise<T> {
  const orig = console.error;
  const errors: unknown[][] = [];
  console.error = (...a: unknown[]) => {
    errors.push(a);
  };
  try {
    return await fn(errors);
  } finally {
    console.error = orig;
  }
}

Deno.test("validIsbn: 13 digits or 9 digits plus a digit or X", () => {
  assert.equal(validIsbn(A), true);
  assert.equal(validIsbn("012345678X"), true);
  assert.equal(validIsbn("0123456789"), true);
  assert.equal(validIsbn("12345"), false);
  assert.equal(validIsbn("97800000000x1"), false);
  assert.equal(validIsbn("../etc/passwd"), false);
});

Deno.test("openLibrarySeries: returns the edition's series and sends the right request", async () => {
  const { calls, fetchImpl } = stub([json({ series: ["Saltglass Archive"] })]);
  assert.deepEqual(await openLibrarySeries([A], fetchImpl), ["Saltglass Archive"]);
  assert.equal(calls[0].url, `https://openlibrary.org/isbn/${A}.json`);
  assert.equal(new Headers(calls[0].init?.headers).get("user-agent"), "tos-library-tagger");
  assert.notEqual(calls[0].init?.redirect, "manual");
  assert.ok(calls[0].init?.signal instanceof AbortSignal);
});

Deno.test("openLibrarySeries: falls through a 404 to the next ISBN and stops at the first hit", async () => {
  const { calls, fetchImpl } = stub([
    json({}, 404),
    json({ series: ["Ember Loom"] }),
    json({ series: ["Wrenfold Tales"] }),
  ]);
  assert.deepEqual(await openLibrarySeries([A, B, C], fetchImpl), ["Ember Loom"]);
  assert.equal(calls.length, 2);
});

Deno.test("openLibrarySeries: an edition without a usable series is skipped", async () => {
  const { calls, fetchImpl } = stub([json({ series: [] }), json({ series: ["Thornmere Cycle"] })]);
  assert.deepEqual(await openLibrarySeries([A, B], fetchImpl), ["Thornmere Cycle"]);
  assert.equal(calls.length, 2);
});

Deno.test("openLibrarySeries: bad bodies and shapes mean no data", async () => {
  const cases: Response[] = [
    new Response("<html>nope</html>", { status: 200 }),
    json({}),
    json({ series: "x" }),
    json({ series: [1] }),
    json({ series: ["ok", 2] }),
    json([]),
    json(null),
    json({ series: ["x"] }, 500),
  ];
  for (const c of cases) {
    await quiet(async () => {
      assert.deepEqual(await openLibrarySeries([A], stub([c]).fetchImpl), []);
    });
  }
});

Deno.test("openLibrarySeries: a thrown fetch means no data and logs only the error name", async () => {
  await quiet(async (errors) => {
    const { fetchImpl } = stub([new TypeError(`boom ${A} https://openlibrary.org/isbn/${A}.json`)]);
    assert.deepEqual(await openLibrarySeries([A], fetchImpl), []);
    const logged = JSON.stringify(errors);
    assert.ok(logged.includes("TypeError"));
    assert.ok(!logged.includes(A));
    assert.ok(!logged.includes("openlibrary.org"));
    assert.ok(!logged.includes("boom"));
  });
});

Deno.test("openLibrarySeries: a timeout gives no data and stops trying further ISBNs", async () => {
  await quiet(async (errors) => {
    const waits = (signal?: AbortSignal | null) =>
      new Promise<Response>((_, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason));
      });
    const { calls, fetchImpl } = stub([waits, json({ series: ["Ember Loom"] })]);
    // The caller-provided signal stands in for the module's 2,500 ms one, so the test is fast.
    const signal = AbortSignal.timeout(30);
    const t0 = Date.now();
    assert.deepEqual(await openLibrarySeries([A, B], fetchImpl, signal), []);
    assert.ok(Date.now() - t0 < 1000);
    assert.equal(calls.length, 1);
    assert.ok(JSON.stringify(errors).includes("TimeoutError"));
    assert.ok(!JSON.stringify(errors).includes(A));
  });
});

Deno.test("openLibrarySeries: the default signal is one shared, unaborted 2,500 ms timeout", async () => {
  assert.equal(OPEN_LIBRARY_TIMEOUT_MS, 2500);
  const seen: AbortSignal[] = [];
  const fetchImpl = ((_u: unknown, init?: RequestInit) => {
    seen.push(init!.signal!);
    return Promise.resolve(json({}, 404));
  }) as typeof fetch;
  await openLibrarySeries([A, B], fetchImpl);
  assert.equal(seen.length, 2);
  assert.equal(seen[0], seen[1]);
  assert.equal(seen[0].aborted, false);
});

Deno.test("openLibrarySeries: invalid ISBNs are skipped without a fetch; at most four are tried", async () => {
  const none = stub([]);
  assert.deepEqual(await openLibrarySeries(["abc", "", "12"], none.fetchImpl), []);
  assert.equal(none.calls.length, 0);

  const many = stub([]);
  assert.deepEqual(await openLibrarySeries([A, "bad", B, C, D, E], many.fetchImpl), []);
  assert.equal(many.calls.length, 4);
  assert.ok(many.calls[3].url.includes(D));
});

Deno.test("openLibrarySeries: at most three names, whitespace-collapsed and clipped to 200", async () => {
  const long = "x".repeat(300);
  const { fetchImpl } = stub([json({ series: ["  Ember \n  Loom ", long, "Wrenfold Tales", "Extra"] })]);
  const out = await openLibrarySeries([A], fetchImpl);
  assert.equal(out.length, 3);
  assert.equal(out[0], "Ember Loom");
  assert.equal(out[1].length, 200);
});
