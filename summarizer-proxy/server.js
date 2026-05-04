require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());          // allow requests from the Chrome extension
app.use(express.json());  // parse JSON body

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'AI Summarizer proxy is running' });
});

// ─── Summarize endpoint ───────────────────────────────────────────────────────
app.post('/summarize', async (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "text" field in request body.' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Server is missing OPENAI_API_KEY.' });
  }

  try {
    const truncated = text.slice(0, 8000); // stay within token budget

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 300,
        messages: [
          {
            role: 'system',
            content: 'You are a concise web page summarizer. Return 3-5 bullet points covering the key ideas. Be direct and factual. Use • as the bullet character.'
          },
          {
            role: 'user',
            content: `Summarize this page content:\n\n${truncated}`
          }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err?.error?.message || 'OpenAI request failed.' });
    }

    const data    = await response.json();
    const summary = data.choices?.[0]?.message?.content ?? 'No summary returned.';

    return res.json({ summary });

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

app.listen(PORT, () => {
  console.log(`✓ Summarizer proxy running on http://localhost:${PORT}`);
});
