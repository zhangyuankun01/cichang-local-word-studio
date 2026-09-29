const MODEL = "@cf/myshell-ai/melotts";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") return Response.json({ ok: true, service: "cichang-tts" });
    if (request.method !== "POST" || url.pathname !== "/api/tts") return Response.json({ error: "Not found" }, { status: 404 });
    let body;
    try { body = await request.json(); } catch { return Response.json({ error: "Expected JSON" }, { status: 400 }); }
    const text = String(body.text || "").trim();
    if (!text || text.length > 120) return Response.json({ error: "text must contain 1 to 120 characters" }, { status: 400 });
    try {
      const result = await env.AI.run(MODEL, { prompt: text, lang: "en" });
      let audio = result && result.audio;
      if (audio instanceof Uint8Array || audio instanceof ArrayBuffer) {
        const bytes = audio instanceof Uint8Array ? audio : new Uint8Array(audio);
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        audio = btoa(binary);
      }
      if (typeof audio !== "string" || !audio.length) return Response.json({ error: "MeloTTS returned no audio" }, { status: 502 });
      const header = atob(audio.slice(0, 8));
      const contentType = header.startsWith("RIFF") ? "audio/wav" : "audio/mpeg";
      return Response.json({ audio, contentType }, { headers: { "cache-control": "public, max-age=31536000, immutable" } });
    } catch (error) {
      return Response.json({ error: "TTS generation failed", detail: String(error && error.message || error).slice(0, 300) }, { status: 502 });
    }
  },
};
