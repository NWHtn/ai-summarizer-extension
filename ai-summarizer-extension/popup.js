// popup.js — AI Summarizer Extension
// Calls your own proxy server — OpenAI key never touches the client

const PROXY_URL = 'http://localhost:3000/summarize'; // swap for your deployed URL later

// ─── DOM refs ────────────────────────────────────────────────────────────────
const btn            = document.getElementById('summarize-btn');
const pageInfo       = document.getElementById('page-info');
const textPreview    = document.getElementById('text-preview');
const previewContent = document.getElementById('preview-content');
const summaryBox     = document.getElementById('summary-box');
const summaryText    = document.getElementById('summary-text');
const errorBox       = document.getElementById('error-box');
const charCount      = document.getElementById('char-count');

// ─── State ───────────────────────────────────────────────────────────────────
let extractedText = null;
let phase = 'extract'; // 'extract' | 'summarize'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function setError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.add('visible');
}
function clearError() {
  errorBox.classList.remove('visible');
  errorBox.textContent = '';
}
function setLoading(label) {
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>${label}`;
}
function setBtn(label) {
  btn.disabled = false;
  btn.innerHTML = label;
}

// ─── Extract visible text from active tab ────────────────────────────────────
async function extractPageText() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found.');

  pageInfo.textContent = tab.url;
  pageInfo.classList.add('visible');

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const clone = document.body.cloneNode(true);
      clone.querySelectorAll('script, style, noscript, svg').forEach(el => el.remove());
      return (clone.innerText || clone.textContent || '').replace(/\s{3,}/g, '\n\n').trim();
    }
  });

  const text = results?.[0]?.result ?? '';
  if (!text) throw new Error('Could not extract text — the page may be empty or restricted.');
  return text;
}

// ─── Main button handler ──────────────────────────────────────────────────────
btn.addEventListener('click', async () => {
  clearError();

  if (phase === 'extract') {
    // Phase 1: extract text from page
    summaryBox.classList.remove('visible');
    textPreview.classList.remove('visible');
    setLoading('Extracting…');

    try {
      extractedText = await extractPageText();
      const snippet = extractedText.slice(0, 400) + (extractedText.length > 400 ? '…' : '');
      previewContent.textContent = snippet;
      charCount.textContent = `${extractedText.length.toLocaleString()} chars`;
      textPreview.classList.add('visible');

      phase = 'summarize';
      setBtn('Summarize with AI ✦');
    } catch (err) {
      setError('⚠ ' + (err.message || 'Unknown error.'));
      setBtn('Extract Page Text');
    }

  } else {
    // Phase 2: send to proxy → get summary
    await summarizeText(extractedText);
  }
});

// ─── Call proxy server ────────────────────────────────────────────────────────
async function summarizeText(text) {
  setLoading('Summarizing…');
  summaryBox.classList.remove('visible');

  try {
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error || `Server error ${res.status}`);
    }

    summaryText.textContent = data.summary;
    summaryBox.classList.add('visible');
    setBtn('Summarize Again ↺');

  } catch (err) {
    // Friendly message if the proxy isn't running yet
    const msg = err.message.includes('Failed to fetch')
      ? 'Could not reach the proxy server. Is it running on localhost:3000?'
      : err.message;
    setError('⚠ ' + msg);
    setBtn('Summarize with AI ✦');
  }
}
