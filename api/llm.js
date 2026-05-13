export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { prompt, max_tokens = 1000 } = req.body || {};

  if (!prompt) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GROQ_API_KEY not configured' });
    return;
  }

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: Math.min(max_tokens, 2000),
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7
      })
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      res.status(groqRes.status).json({ error: err });
      return;
    }

    const data = await groqRes.json();
    const text = data.choices?.[0]?.message?.content || '';
    res.status(200).json({ text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
