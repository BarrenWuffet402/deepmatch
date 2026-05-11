/**
 * /api/heygen-sessions
 *
 * GET  → list recent HeyGen Video Agent sessions (last 20)
 * GET  ?session_id=xxx → get one session's video_id + status
 */

const AGENT_URL  = process.env.HEYGEN_VIDEO_AGENT_ENDPOINT || "https://api.heygen.com/v3/video-agents";
const STATUS_URL = process.env.HEYGEN_STATUS_ENDPOINT      || "https://api.heygen.com/v1/video_status.get";

function apiKey() {
  const k = process.env.HEYGEN_API_KEY;
  if (!k) throw new Error("HEYGEN_API_KEY not set");
  return k;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { session_id } = req.query;

  // ── Single session: resolve to video_id + video status ──────────────────
  if (session_id) {
    const r = await fetch(`${AGENT_URL}/${encodeURIComponent(session_id)}`, {
      headers: { Authorization: `Bearer ${apiKey()}` },
    });
    const d = await r.json();
    if (!r.ok) return res.status(200).json({ error: "Session not found" });

    const videoId = d.data?.video_id || null;
    let videoUrl = null;
    let videoStatus = null;

    if (videoId) {
      const vr = await fetch(`${STATUS_URL}?video_id=${encodeURIComponent(videoId)}`, {
        headers: { Authorization: `Bearer ${apiKey()}` },
      });
      const vd = await vr.json();
      videoStatus = vd.data?.status || null;
      videoUrl    = vd.data?.video_url || null;
    }

    return res.status(200).json({
      session_id,
      title:        d.data?.title || `Session ${session_id.slice(0, 8)}`,
      agent_status: d.data?.status || "unknown",
      video_id:     videoId,
      video_status: videoStatus,
      video_url:    videoUrl,
    });
  }

  // ── List sessions ─────────────────────────────────────────────────────────
  const r = await fetch(AGENT_URL, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  const d = await r.json();
  if (!r.ok) return res.status(500).json({ error: "Could not list sessions" });

  const sessions = (d.data || []).map(s => ({
    session_id:  s.session_id,
    title:       s.title || `Session ${s.session_id?.slice(0, 8)}`,
    created_at:  s.created_at,
    agent_status: s.status || "unknown",
    video_id:    s.video_id || null,
  }));

  return res.status(200).json({ sessions });
}
