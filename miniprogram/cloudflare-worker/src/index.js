const MODEL = "@cf/myshell-ai/melotts";
const MAX_TEXT_LENGTH = 64;
const WORD_PATTERN = /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/;
const JSON_HEADERS = {
  "access-control-allow-origin": "*",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
};

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, "cache-control": "no-store", ...headers },
  });
}

async function cacheKey(requestUrl, text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return new Request(`${new URL(requestUrl).origin}/__tts_cache/v2/${hash}`, { method: "GET" });
}

function normalizeText(value) {
  if (typeof value !== "string") return "";
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS" && url.pathname === "/api/tts") {
      return new Response(null, {
        status: 204,
        headers: {
          ...JSON_HEADERS,
          "access-control-allow-headers": "content-type",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-max-age": "86400",
        },
      });
    }
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "cichang-tts", model: MODEL });
    }
    if (request.method !== "POST" || url.pathname !== "/api/tts") return json({ error: "Not found" }, 404);
    if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      return json({ error: "Expected application/json" }, 415);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Expected valid JSON" }, 400);
    }

    const text = normalizeText(body?.text);
    if (!text || text.length > MAX_TEXT_LENGTH || !WORD_PATTERN.test(text)) {
      return json({ error: "text must be a short English word or phrase" }, 400);
    }

    const key = await cacheKey(request.url, text);
    const cache = typeof caches === "undefined" ? null : caches.default;
    const cached = cache ? await cache.match(key) : null;
    if (cached) {
      const response = new Response(cached.body, cached);
      response.headers.set("x-tts-cache", "HIT");
      return response;
    }

    const rateLimit = await env.TTS_RATE_LIMITER.limit({ key: "tts-generation" });
    if (!rateLimit.success) {
      return json({ error: "Too many pronunciation requests; please retry shortly" }, 429, { "retry-after": "60" });
    }

    try {
      const result = await env.AI.run(MODEL, { prompt: text, lang: "en" });
      const audio = result?.audio;
      if (typeof audio !== "string" || !audio.length || audio.length > 8 * 1024 * 1024) {
        throw new Error("MeloTTS returned invalid audio");
      }

      const signature = atob(audio.slice(0, 16));
      const contentType = signature.startsWith("RIFF") && signature.slice(8, 12) === "WAVE"
        ? "audio/wav"
        : "audio/mpeg";

      const response = json(
        { audio, contentType },
        200,
        { "cache-control": "public, max-age=31536000, immutable", "x-tts-cache": "MISS" },
      );
      if (cache) ctx.waitUntil(cache.put(key, response.clone()));
      return response;
    } catch (error) {
      console.error(JSON.stringify({
        message: "tts_generation_failed",
        error: error instanceof Error ? error.message : String(error),
      }));
      return json({ error: "Pronunciation generation is temporarily unavailable" }, 503, { "retry-after": "30" });
    }
  },
};
