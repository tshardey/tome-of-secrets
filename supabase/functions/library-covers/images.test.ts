import assert from "node:assert/strict";
import { fetchImages, hostAllowed, MAX_IMAGE_BYTES, MAX_IMAGES, MAX_REDIRECTS, sniffType } from "./images.ts";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const GIF = new TextEncoder().encode("GIF89a\x01\x00\x01\x00");
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50]);

const OL = (id: number) => `https://covers.openlibrary.org/b/id/${id}-L.jpg`;

type Route = (init?: RequestInit) => Promise<Response> | Response;

/** A fetch that answers from a route table and records each URL it was asked for. */
function routes(table: Record<string, Route>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const route = table[url];
    if (!route) return Promise.reject(new TypeError("no route"));
    return Promise.resolve(route(init));
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const image = (bytes: Uint8Array): Route => () => new Response(bytes.slice(), { status: 200 });
const redirect = (location: string, status = 302): Route => () =>
  new Response(null, { status, headers: { location } });

Deno.test("limits are as decided (D5)", () => {
  assert.equal(MAX_IMAGES, 6);
  assert.equal(MAX_IMAGE_BYTES, 2 * 1024 * 1024);
  assert.equal(MAX_REDIRECTS, 3);
});

Deno.test("hostAllowed: https, default port, no user info, allowlisted hosts only", () => {
  for (const ok of [
    "https://covers.openlibrary.org/b/id/1-L.jpg",
    "https://ia800100.us.archive.org/x.jpg",
    "https://archive.org/download/x/y.jpg",
    "https://books.google.com/books/content?id=a",
    "https://books.googleusercontent.com/books/content?id=a",
    "https://covers.openlibrary.org:443/b/id/1-L.jpg", // the default port, normalised away
  ]) assert.ok(hostAllowed(ok), ok);
  for (const bad of [
    "http://covers.openlibrary.org/b/id/1-L.jpg",
    "https://covers.openlibrary.org:8443/b/id/1-L.jpg",
    "https://archive.org.evil.example/",
    "https://evilarchive.org/x.jpg",
    "https://127.0.0.1/",
    "https://localhost/",
    "https://user@evil.example/",
    "https://user@covers.openlibrary.org/",
    "https://user:pw@covers.openlibrary.org/",
    "https://openlibrary.org/b/id/1-L.jpg",
    "https://google.com/",
    "ftp://covers.openlibrary.org/x.jpg",
    "not a url",
    "",
  ]) assert.ok(!hostAllowed(bad), bad);
});

Deno.test("sniffType recognises the four image types by magic bytes, and nothing else", () => {
  assert.equal(sniffType(JPEG), "image/jpeg");
  assert.equal(sniffType(PNG), "image/png");
  assert.equal(sniffType(GIF), "image/gif");
  assert.equal(sniffType(new TextEncoder().encode("GIF87a\x01\x00")), "image/gif");
  assert.equal(sniffType(WEBP), "image/webp");
  assert.equal(sniffType(new TextEncoder().encode("<html><body>gone</body></html>")), null);
  assert.equal(sniffType(new TextEncoder().encode("RIFF\x04\x00\x00\x00WAVEfmt ")), null);
  assert.equal(sniffType(new Uint8Array([])), null);
  assert.equal(sniffType(new Uint8Array([0xff, 0xd8])), null);
});

Deno.test("a two-hop chain covers.openlibrary.org -> archive.org -> ia*.us.archive.org is followed", async () => {
  const { fetchImpl, calls } = routes({
    [OL(1000001)]: redirect("https://archive.org/download/m_1000001/1000001-L.jpg"),
    "https://archive.org/download/m_1000001/1000001-L.jpg": redirect("https://ia800100.us.archive.org/view/1000001-L.jpg", 301),
    "https://ia800100.us.archive.org/view/1000001-L.jpg": image(JPEG),
  });
  const out = await fetchImages([OL(1000001)], fetchImpl);
  assert.equal(out.length, 1);
  assert.equal(out[0].index, 0);
  assert.equal(out[0].mediaType, "image/jpeg");
  assert.deepEqual(out[0].bytes, JPEG);
  assert.equal(calls.length, 3);
  for (const c of calls) assert.equal(c.init?.redirect, "manual");
});

Deno.test("a relative Location is resolved against the current hop", async () => {
  const { fetchImpl } = routes({
    [OL(1000002)]: redirect("/b/id/1000002-M.jpg"),
    "https://covers.openlibrary.org/b/id/1000002-M.jpg": image(PNG),
  });
  const out = await fetchImages([OL(1000002)], fetchImpl);
  assert.equal(out.length, 1);
  assert.equal(out[0].mediaType, "image/png");
});

Deno.test("a redirect off the allowlist drops the image and never fetches that host", async () => {
  for (const target of ["https://evil.example/x.jpg", "http://ia800100.us.archive.org/x.jpg", "https://127.0.0.1/x.jpg"]) {
    const { fetchImpl, calls } = routes({
      [OL(1000003)]: redirect("https://archive.org/download/x"),
      "https://archive.org/download/x": redirect(target),
      [target]: image(JPEG),
    });
    const out = await fetchImages([OL(1000003)], fetchImpl);
    assert.deepEqual(out, [], target);
    assert.ok(!calls.some((c) => c.url === target), target);
  }
});

Deno.test("an initial URL off the allowlist is never fetched", async () => {
  const { fetchImpl, calls } = routes({ "https://evil.example/x.jpg": image(JPEG) });
  assert.deepEqual(await fetchImages(["https://evil.example/x.jpg"], fetchImpl), []);
  assert.equal(calls.length, 0);
});

Deno.test("a chain longer than MAX_REDIRECTS is dropped; one of exactly MAX_REDIRECTS is followed", async () => {
  const hop = (n: number) => `https://ia80010${n}.us.archive.org/x.jpg`;
  const table = (hops: number) => {
    const t: Record<string, Route> = {};
    let from = OL(1000004);
    for (let n = 0; n < hops; n++) {
      t[from] = redirect(hop(n));
      from = hop(n);
    }
    t[from] = image(JPEG);
    return t;
  };
  const exact = routes(table(MAX_REDIRECTS));
  assert.equal((await fetchImages([OL(1000004)], exact.fetchImpl)).length, 1);
  const over = routes(table(MAX_REDIRECTS + 1));
  assert.deepEqual(await fetchImages([OL(1000004)], over.fetchImpl), []);
  assert.equal(over.calls.length, MAX_REDIRECTS + 1);
});

Deno.test("a redirect without a Location, a 404 and a non-image body are dropped", async () => {
  const { fetchImpl } = routes({
    [OL(1)]: () => new Response(null, { status: 302 }),
    [OL(2)]: () => new Response("missing", { status: 404 }),
    [OL(3)]: () => new Response("<html>not an image</html>", { status: 200 }),
    [OL(4)]: image(GIF),
  });
  const out = await fetchImages([OL(1), OL(2), OL(3), OL(4)], fetchImpl);
  assert.deepEqual(out.map((i) => [i.index, i.mediaType]), [[3, "image/gif"]]);
});

/** A pull-only stream of `total` bytes in `chunk`-sized pieces that counts what was produced. */
function countingBody(total: number, chunk: number) {
  const state = { produced: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (state.produced >= total) return controller.close();
      const n = Math.min(chunk, total - state.produced);
      const bytes = new Uint8Array(n);
      if (state.produced === 0) bytes.set(JPEG.subarray(0, Math.min(n, JPEG.length)));
      state.produced += n;
      controller.enqueue(bytes);
    },
    cancel() {
      state.cancelled = true;
    },
  }, { highWaterMark: 0 });
  return { stream, state };
}

Deno.test("2 MiB + 1 byte is dropped without reading past the cap", async () => {
  const CHUNK = 64 * 1024;
  const exact = countingBody(MAX_IMAGE_BYTES + 1, CHUNK);
  const big = countingBody(8 * MAX_IMAGE_BYTES, CHUNK);
  const fits = countingBody(MAX_IMAGE_BYTES, CHUNK);
  const { fetchImpl } = routes({
    [OL(1)]: () => new Response(exact.stream, { status: 200 }),
    [OL(2)]: () => new Response(big.stream, { status: 200 }),
    [OL(3)]: () => new Response(fits.stream, { status: 200 }),
  });
  const out = await fetchImages([OL(1), OL(2), OL(3)], fetchImpl);
  assert.deepEqual(out.map((i) => i.index), [2]);
  assert.equal(out[0].bytes.byteLength, MAX_IMAGE_BYTES);
  assert.ok(exact.state.produced <= MAX_IMAGE_BYTES + CHUNK);
  assert.ok(big.state.produced <= MAX_IMAGE_BYTES + CHUNK, String(big.state.produced));
  assert.ok(big.state.cancelled);
});

Deno.test("a Content-Length over the cap is dropped without reading the body", async () => {
  const body = countingBody(8 * MAX_IMAGE_BYTES, 64 * 1024);
  const { fetchImpl } = routes({
    [OL(1)]: () =>
      new Response(body.stream, { status: 200, headers: { "content-length": String(8 * MAX_IMAGE_BYTES) } }),
  });
  assert.deepEqual(await fetchImages([OL(1)], fetchImpl), []);
  assert.equal(body.state.produced, 0);
});

/** Minimal fake timers: setTimeout callbacks run only when tick() passes their time. */
function fakeTimers() {
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let now = 0;
  let next = 1;
  globalThis.setTimeout = ((fn: () => void, ms?: number) => {
    const id = next++;
    timers.set(id, { at: now + (ms ?? 0), fn });
    return id;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id?: number) => {
    if (id !== undefined) timers.delete(id);
  }) as typeof clearTimeout;
  return {
    pending: () => timers.size,
    tick(ms: number) {
      now += ms;
      for (const [id, t] of [...timers]) {
        if (t.at <= now) {
          timers.delete(id);
          t.fn();
        }
      }
    },
    restore() {
      globalThis.setTimeout = realSet;
      globalThis.clearTimeout = realClear;
    },
  };
}

const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

Deno.test("a rejected fetch and a slow fetch are dropped; the rest keep their original index", async () => {
  const clock = fakeTimers();
  try {
    let slowSignal: AbortSignal | undefined;
    const { fetchImpl } = routes({
      [OL(1)]: image(JPEG),
      [OL(2)]: () => Promise.reject(new TypeError("connection reset")),
      [OL(3)]: (init) => {
        slowSignal = init?.signal ?? undefined;
        return new Promise<Response>(() => {}); // never answers
      },
      [OL(4)]: image(PNG),
      [OL(5)]: image(WEBP),
    });
    const pending = fetchImages([OL(1), OL(2), OL(3), OL(4), OL(5)], fetchImpl);
    await flush();
    clock.tick(9_999);
    await flush();
    clock.tick(1);
    const out = await pending;
    assert.deepEqual(out.map((i) => [i.index, i.mediaType]), [[0, "image/jpeg"], [3, "image/png"], [4, "image/webp"]]);
    assert.ok(slowSignal?.aborted, "the slow request is aborted");
    assert.equal(clock.pending(), 0, "no timer left behind");
  } finally {
    clock.restore();
  }
});

Deno.test("downloads run at most 3 at a time", async () => {
  let inFlight = 0;
  let peak = 0;
  const fetchImpl = (async () => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await Promise.resolve();
    await Promise.resolve();
    inFlight--;
    return new Response(JPEG.slice(), { status: 200 });
  }) as typeof fetch;
  const urls = [1, 2, 3, 4, 5, 6].map(OL);
  const out = await fetchImages(urls, fetchImpl);
  assert.equal(out.length, 6);
  assert.deepEqual(out.map((i) => i.index), [0, 1, 2, 3, 4, 5]);
  assert.ok(peak <= 3, String(peak));
  assert.ok(peak >= 2, String(peak));
});
