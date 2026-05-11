/**
 * /api/heygen — HeyGen video generation proxy
 *
 * POST { mode, script, slug, title, portrait?, looks_id?, voice_id? }
 *   mode "standard"  → v2/video/generate (explicit avatar + voice)
 *   mode "agent"     → v3/video-agents   (AI-driven, embeds looks/voice hints in prompt)
 *   → { video_id, slug, title }
 *
 * GET  ?video_id=xxx → poll status → { status, video_url?, thumbnail? }
 */

const GENERATE_URL = "https://api.heygen.com/v2/video/generate";
const AGENT_URL    = process.env.HEYGEN_VIDEO_AGENT_ENDPOINT || "https://api.heygen.com/v3/video-agents";
const STATUS_URL   = process.env.HEYGEN_STATUS_ENDPOINT     || "https://api.heygen.com/v1/video_status.get";

function apiKey() {
  const k = process.env.HEYGEN_API_KEY;
  if (!k) throw new Error("HEYGEN_API_KEY not set");
  return k;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  // ── GET: poll status ──────────────────────────────────────────────────────
  if (req.method === "GET") {
    const { video_id, session_id } = req.query;

    // Agent session poll: if we have session_id but no video_id yet,
    // check the agent session to find the video_id once it starts rendering.
    if (session_id && !video_id) {
      const r = await fetch(`${AGENT_URL}/${encodeURIComponent(session_id)}`, {
        headers: { Authorization: `Bearer ${apiKey()}` },
      });
      const d = await r.json();
      if (!r.ok) return res.status(200).json({ status: "processing" });

      const agentStatus = d.data?.status || "generating";
      const foundVideoId = d.data?.video_id || null;

      if (foundVideoId) {
        // Hand off: return the video_id so client switches to standard polling
        return res.status(200).json({ status: "has_video_id", video_id: foundVideoId });
      }
      if (agentStatus === "failed") return res.status(200).json({ status: "failed" });
      return res.status(200).json({ status: "processing", agent_status: agentStatus });
    }

    // Standard video status poll
    if (!video_id) return res.status(400).json({ error: "video_id or session_id required" });

    const r = await fetch(`${STATUS_URL}?video_id=${encodeURIComponent(video_id)}`, {
      headers: { Authorization: `Bearer ${apiKey()}` },
    });
    const d = await r.json();
    if (!r.ok) return res.status(200).json({ status: "processing" });

    return res.status(200).json({
      status:    d.data?.status,
      video_url: d.data?.video_url || null,
      thumbnail: d.data?.thumbnail_url || null,
      duration:  d.data?.duration || null,
    });
  }

  // ── GET sessions: list recent HeyGen agent sessions for import ────────────
  // (accessed via GET /api/heygen?action=sessions)
  if (req.method === "GET" && req.query.action === "sessions") {
    const r = await fetch(AGENT_URL, { headers: { Authorization: `Bearer ${apiKey()}` } });
    const d = await r.json();
    return res.status(200).json({ sessions: d.data || [] });
  }

  // ── POST: generate ────────────────────────────────────────────────────────
  if (req.method === "POST") {
    const {
      mode     = "standard",
      script,
      slug,
      title,
      portrait = true,
      looks_id,
      voice_id,
    } = req.body || {};

    if (!script?.trim()) return res.status(400).json({ error: "script is required" });
    if (!slug || !/^[a-z0-9-]+$/.test(slug))
      return res.status(400).json({ error: "slug must be lowercase letters, numbers, hyphens" });

    const defaultAvatarId = process.env.HEYGEN_AVATAR_ID;
    const defaultVoiceId  = process.env.HEYGEN_VOICE_ID;
    const effectiveLooks  = looks_id  || defaultAvatarId;
    const effectiveVoice  = voice_id  || defaultVoiceId;

    // ── Standard mode (v2) ──────────────────────────────────────────────────
    if (mode === "standard") {
      if (!effectiveLooks || !effectiveVoice)
        return res.status(500).json({ error: "HEYGEN_AVATAR_ID / HEYGEN_VOICE_ID not configured" });

      const dimension = portrait ? { width: 720, height: 1280 } : { width: 1280, height: 720 };

      const r = await fetch(GENERATE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          video_inputs: [{
            character: { type: "avatar", avatar_id: effectiveLooks, avatar_style: "normal" },
            voice:     { type: "text",   input_text: script.trim(), voice_id: effectiveVoice },
          }],
          dimension,
        }),
      });
      const d = await r.json();
      if (!r.ok || d.error)
        return res.status(r.status).json({ error: d?.error || "Generation failed" });

      return res.status(200).json({ video_id: d.data.video_id, slug, title, mode: "standard" });
    }

    // ── Agent mode (v3) ─────────────────────────────────────────────────────
    if (mode === "agent") {
      // Build a rich prompt that embeds looks + voice hints naturally
      const looksHint = effectiveLooks ? `Avatar appearance ID: ${effectiveLooks}.` : "";
      const voiceHint = effectiveVoice ? `Voice ID: ${effectiveVoice}.` : "";
      const orientation = portrait
        ? "Produce the video in portrait orientation (9:16) suitable for mobile."
        : "Produce the video in landscape orientation (16:9).";

      const agentPrompt = [
        script.trim(),
        looksHint,
        voiceHint,
        orientation,
      ].filter(Boolean).join(" ");

      const r = await fetch(AGENT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: agentPrompt }),
      });
      const d = await r.json();
      if (!r.ok || d.error)
        return res.status(r.status).json({ error: d?.error?.message || d?.error || "Agent generation failed" });

      return res.status(200).json({
        video_id:   d.data.video_id,
        session_id: d.data.session_id,
        slug,
        title,
        mode: "agent",
      });
    }

    return res.status(400).json({ error: `Unknown mode: ${mode}` });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
