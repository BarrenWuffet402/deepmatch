/**
 * /api/heygen-sessions
 *
 * GET  → list HeyGen Video Agent sessions from May 11 2026+, enriched with video_id + status
 * GET  ?session_id=xxx → get one session's video_id + video URL (for import)
 */

const AGENT_URL  = process.env.HEYGEN_VIDEO_AGENT_ENDPOINT || "https://api.heygen.com/v3/video-agents";
const STATUS_URL = process.env.HEYGEN_STATUS_ENDPOINT      || "https://api.heygen.com/v1/video_status.get";

// Only show sessions from May 11, 2026 00:00 UTC onwards
const CUTOFF_TS = 1778457600;

function apiKey() {
  const k = process.env.HEYGEN_API_KEY;
  if (!k) throw new Error("HEYGEN_API_KEY not set");
  return k;
}

async function fetchSession(session_id) {
  const r = await fetch(`${AGENT_URL}/${encodeURIComponent(session_id)}`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  const d = await r.json();
  return d.data || {};
}

async function fetchVideoStatus(video_id) {
  const r = await fetch(`${STATUS_URL}?video_id=${encodeURIComponent(video_id)}`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  const d = await r.json();
  return d.data || {};
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { session_id } = req.query;

  // ── Single session: resolve to video_id + video URL ───────────────────────
  if (session_id) {
    const session = await fetchSession(session_id);
    const videoId = session.video_id || null;
    let videoUrl = null;
    let videoStatus = null;

    if (videoId) {
      const vs = await fetchVideoStatus(videoId);
      videoStatus = vs.status || null;
      videoUrl    = vs.video_url || null;
    }

    return res.status(200).json({
      session_id,
      title:        session.title || `Session ${session_id.slice(0, 8)}`,
      agent_status: session.status || "unknown",
      video_id:     videoId,
      video_status: videoStatus,
      video_url:    videoUrl,
    });
  }

  // ── List sessions: filter to cutoff date, enrich with video_id in parallel ─
  const listRes = await fetch(AGENT_URL, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  const listData = await listRes.json();
  if (!listRes.ok) return res.status(500).json({ error: "Could not list sessions" });

  // Filter to May 11 2026+ only
  const recent = (listData.data || []).filter(s => (s.created_at || 0) >= CUTOFF_TS);

  // Enrich each session with video_id + status by fetching individually in parallel
  const enriched = await Promise.all(
    recent.map(async (s) => {
      try {
        const detail = await fetchSession(s.session_id);
        const videoId = detail.video_id || null;

        let videoStatus = null;
        if (videoId) {
          const vs = await fetchVideoStatus(videoId);
          videoStatus = vs.status || null;
        }

        return {
          session_id:   s.session_id,
          title:        s.title || `Session ${s.session_id.slice(0, 8)}`,
          created_at:   s.created_at,
          agent_status: detail.status || "generating",
          video_id:     videoId,
          video_status: videoStatus,   // "completed" | "processing" | null
        };
      } catch {
        return {
          session_id:   s.session_id,
          title:        s.title || `Session ${s.session_id.slice(0, 8)}`,
          created_at:   s.created_at,
          agent_status: "unknown",
          video_id:     null,
          video_status: null,
        };
      }
    })
  );

  return res.status(200).json({ sessions: enriched });
}
