
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;

// Optional .env file (KEY=value per line) next to server.js. Real environment variables win.
try {
  const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (e) { /* no .env file */ }

/* ---------------- Configuration ---------------- */
const HOSTED = !!process.env.PORT || process.env.NODE_ENV === 'production';
const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || (HOSTED ? '0.0.0.0' : '127.0.0.1');
const LOCAL_ONLY = HOST === '127.0.0.1' || HOST === 'localhost';
const APP_PASSWORD = process.env.APP_PASSWORD || '';

// AI provider: Google Gemini if GEMINI_API_KEY is set, otherwise Anthropic if ANTHROPIC_API_KEY is set.
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const PROVIDER = GEMINI_KEY ? 'gemini' : ANTHROPIC_KEY ? 'anthropic' : '';
const API_KEY = GEMINI_KEY || ANTHROPIC_KEY;
const MODEL = PROVIDER === 'gemini'
  ? (process.env.GEMINI_MODEL || 'gemini-3.7-flash')
  : (process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5');

if (!LOCAL_ONLY && !APP_PASSWORD) {
  console.error('Refusing to start: this server is reachable from the internet but APP_PASSWORD is not set.');
  console.error('Set an APP_PASSWORD environment variable (or a line in .env) so strangers cannot use your AI key.');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon'
};
const NOT_SERVED = new Set(['server.js', 'package.json', 'package-lock.json', 'startcity.bat']);

/* ---------------- Helpers ---------------- */
function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('Request too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const isHttps = (req) => req.headers['x-forwarded-proto'] === 'https' || !!req.socket.encrypted;
const clientIp = (req) =>
  (HOSTED && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';

// Simple in-memory rate limiting
const buckets = { login: new Map(), run: new Map() };
function tooMany(bucket, key, max, windowMs) {
  const now = Date.now();
  let r = bucket.get(key);
  if (!r || r.reset < now) { r = { n: 0, reset: now + windowMs }; bucket.set(key, r); }
  r.n++;
  return r.n > max;
}
setInterval(() => {
  const now = Date.now();
  for (const b of Object.values(buckets)) for (const [k, v] of b) if (v.reset < now) b.delete(k);
}, 600000).unref();

/* ---------------- Password login (signed cookie) ---------------- */
const SESSION_KEY = crypto.createHash('sha256').update('aicity-session|' + APP_PASSWORD).digest();
const SESSION_SECONDS = 7 * 24 * 3600;
const sign = (exp) => crypto.createHmac('sha256', SESSION_KEY).update(String(exp)).digest('hex');
const makeToken = () => { const exp = Date.now() + SESSION_SECONDS * 1000; return exp + '.' + sign(exp); };

function validToken(tok) {
  if (!tok) return false;
  const [exp, sig] = tok.split('.');
  if (!exp || !sig || !(Number(exp) > Date.now())) return false;
  const good = sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}

function getCookie(req, name) {
  const part = String(req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(name + '='));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : '';
}

const isAuthed = (req) => !APP_PASSWORD || validToken(getCookie(req, 'aicity_session'));

function passwordOk(p) {
  const a = crypto.createHash('sha256').update(String(p)).digest();
  const b = crypto.createHash('sha256').update(APP_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

function loginPage(error) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>AI City OS</title><style>' +
    'html,body{height:100%;margin:0}body{display:grid;place-items:center;background:#f5f5f7;color:#1d1d1f;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Roboto,Helvetica,Arial,sans-serif}' +
    'form{width:min(340px,86vw);padding:28px;background:#fff;border-radius:22px;box-shadow:0 10px 40px rgba(0,0,0,.1);display:flex;flex-direction:column;gap:14px}' +
    'h1{margin:0;font-size:22px;letter-spacing:-.02em}p{margin:0;color:#6e6e73;font-size:14px}' +
    'input{font:inherit;padding:11px 13px;border:1px solid rgba(0,0,0,.12);border-radius:12px}' +
    'button{font:inherit;font-weight:600;padding:11px;border:0;border-radius:12px;background:#0a84ff;color:#fff;cursor:pointer}' +
    '.err{color:#d70015;font-size:13px}</style></head><body>' +
    '<form method="POST" action="/login"><h1>AI City OS</h1><p>Enter your password to continue.</p>' +
    '<input type="password" name="password" placeholder="Password" autocomplete="current-password" autofocus required>' +
    (error ? '<div class="err">' + error + '</div>' : '') +
    '<button type="submit">Open city</button></form></body></html>';
}

async function handleLogin(req, res) {
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(loginPage(''));
  }
  if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
  if (tooMany(buckets.login, clientIp(req), 8, 60000)) {
    res.writeHead(429, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(loginPage('Too many attempts. Wait a minute and try again.'));
  }
  let password = '';
  try {
    password = new URLSearchParams(await readBody(req, 2000)).get('password') || '';
  } catch (e) { /* ignore */ }
  if (APP_PASSWORD && passwordOk(password)) {
    const cookie = 'aicity_session=' + makeToken() + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + SESSION_SECONDS + (isHttps(req) ? '; Secure' : '');
    res.writeHead(303, { 'Set-Cookie': cookie, Location: '/' });
    return res.end();
  }
  res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(loginPage('Wrong password.'));
}

/* ---------------- AI API ---------------- */
async function handleApi(req, res, urlPath) {
  // Only pages served from this same site may call the API.
  const origin = req.headers.origin;
  if (origin) {
    let ok = false;
    try { ok = new URL(origin).host === req.headers.host; } catch (e) { /* bad origin */ }
    if (!ok) return sendJson(res, 403, { error: 'Forbidden origin' });
  }

  if (urlPath === '/api/status' && req.method === 'GET') {
    return sendJson(res, 200, { ai: !!API_KEY, provider: PROVIDER, model: MODEL });
  }

  if (urlPath === '/api/run' && req.method === 'POST') {
    if (!API_KEY) return sendJson(res, 503, { error: 'AI is not configured. Add GEMINI_API_KEY to the environment and restart.' });
    if (!String(req.headers['content-type'] || '').includes('application/json')) {
      return sendJson(res, 415, { error: 'Expected JSON' });
    }
    if (tooMany(buckets.run, clientIp(req), 30, 60000)) {
      return sendJson(res, 429, { error: 'Too many requests. Slow down for a minute.' });
    }
    let body;
    try {
      body = JSON.parse(await readBody(req, 50000));
    } catch (e) {
      return sendJson(res, 400, { error: 'Invalid request' });
    }
    const task = String(body.task || '').trim().slice(0, 8000);
    if (!task) return sendJson(res, 400, { error: 'Task is empty' });
    const agent = String(body.agent || 'Bot').slice(0, 60);
    const dept = String(body.dept || 'General').slice(0, 60);
    const system = 'You are ' + agent + ', a ' + dept + ' agent working inside AI City OS. Complete the assigned task and reply with the finished work product only. Be concise and practical. You cannot browse the web, send messages or access files; if the task needs that, say what you could not do and still give the best written output you can.';

    try {
      let r;
      if (PROVIDER === 'gemini') {
        // Gemini can be briefly overloaded: retry, then fall back to a second model.
        const FALLBACK = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash';
        const models = [MODEL, MODEL, FALLBACK];
        for (let i = 0; i < models.length; i++) {
          r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(models[i]) + ':generateContent', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': API_KEY },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: system }] },
              contents: [{ role: 'user', parts: [{ text: task }] }],
              generationConfig: { maxOutputTokens: 2000 }
            }),
            signal: AbortSignal.timeout(25000)
          });
          if (![429, 500, 503, 504].includes(r.status) || i === models.length - 1) break;
          await new Promise((ok) => setTimeout(ok, 3000));
        }
      } else {
        r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: MODEL, max_tokens: 1500, system, messages: [{ role: 'user', content: task }] }),
          signal: AbortSignal.timeout(60000)
        });
      }
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        return sendJson(res, 502, { error: (data.error && data.error.message) || 'The AI service returned an error (' + r.status + ').' });
      }
      let text = '';
      if (PROVIDER === 'gemini') {
        const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
        text = parts.map((p) => p.text || '').join('\n').trim();
        if (!text) {
          const why = (data.promptFeedback && data.promptFeedback.blockReason) || (data.candidates && data.candidates[0] && data.candidates[0].finishReason) || 'no text returned';
          return sendJson(res, 502, { error: 'Gemini returned no text (' + why + ').' });
        }
      } else {
        text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      }
      return sendJson(res, 200, { text: text || '(no output)' });
    } catch (e) {
      return sendJson(res, 502, { error: 'Could not reach the AI service: ' + (e.message || e) });
    }
  }

  return sendJson(res, 404, { error: 'Not found' });
}

/* ---------------- Server ---------------- */
const server = http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000');

  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch (e) {
    res.writeHead(400);
    return res.end('Bad request');
  }

  if (urlPath === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }

  if (urlPath === '/login') {
    handleLogin(req, res).catch(() => { res.writeHead(500); res.end(); });
    return;
  }

  if (!isAuthed(req)) {
    if (urlPath.startsWith('/api/')) return sendJson(res, 401, { error: 'Please sign in first.' });
    res.writeHead(302, { Location: '/login' });
    return res.end();
  }

  if (urlPath.startsWith('/api/')) {
    handleApi(req, res, urlPath).catch(() => sendJson(res, 500, { error: 'Server error' }));
    return;
  }

  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.normalize(path.join(ROOT, urlPath));
  const base = path.basename(filePath);
  if (!filePath.startsWith(ROOT + path.sep) || base.startsWith('.') || NOT_SERVED.has(base.toLowerCase())) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('Port ' + PORT + ' is already in use. Close the other program and try again.');
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('AI City OS running at http://localhost:' + PORT + (LOCAL_ONLY ? ' (this computer only)' : ' (online mode, password protected)'));
  console.log(API_KEY ? 'AI tasks: ON (' + PROVIDER + ', model ' + MODEL + ')' : 'AI tasks: OFF (add GEMINI_API_KEY to enable)');
});
