/**
 * TASK 1: Simple URL Shortener
 * CodeAlpha Backend Development Internship
 *
 * Stack: Node.js + Express.js + SQLite (better-sqlite3)
 *
 * SETUP:
 *   1. Put this file inside a folder named: CodeAlpha_UrlShortener
 *   2. cd CodeAlpha_UrlShortener
 *   3. npm init -y
 *   4. npm install express better-sqlite3
 *   5. node server.js
 *   6. Open http://localhost:3000
 *
 * ENDPOINTS:
 *   POST /api/shorten        { "longUrl": "https://..." }  -> { shortCode, shortUrl }
 *   GET  /:code               -> redirects browser to the original long URL
 *   GET  /api/urls            -> list all saved urls
 *   GET  /api/urls/:code      -> stats (clicks, created_at) for one short code
 */

const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- DATABASE SETUP ----------
const db = new Database(path.join(__dirname, 'urls.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    short_code TEXT UNIQUE NOT NULL,
    long_url TEXT NOT NULL,
    clicks INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// ---------- HELPERS ----------
function generateShortCode(length = 6) {
  return crypto.randomBytes(8).toString('base64url').slice(0, length);
}

function isValidUrl(str) {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

// ---------- ROUTES ----------

// Optional simple frontend to test in browser
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family:sans-serif;max-width:500px;margin:60px auto;">
        <h2>URL Shortener</h2>
        <form id="f">
          <input id="url" type="text" placeholder="Paste long URL" style="width:100%;padding:8px;" required />
          <button type="submit" style="margin-top:10px;padding:8px 16px;">Shorten</button>
        </form>
        <p id="result"></p>
        <script>
          document.getElementById('f').addEventListener('submit', async (e) => {
            e.preventDefault();
            const longUrl = document.getElementById('url').value;
            const res = await fetch('/api/shorten', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ longUrl })
            });
            const data = await res.json();
            document.getElementById('result').innerHTML = data.shortUrl
              ? 'Short URL: <a href="' + data.shortUrl + '">' + data.shortUrl + '</a>'
              : 'Error: ' + data.error;
          });
        </script>
      </body>
    </html>
  `);
});

// Create a short URL
app.post('/api/shorten', (req, res) => {
  const { longUrl } = req.body;

  if (!longUrl || !isValidUrl(longUrl)) {
    return res.status(400).json({ error: 'Please provide a valid longUrl.' });
  }

  // If this URL was already shortened before, return the existing code (no duplicates)
  const existing = db.prepare('SELECT * FROM urls WHERE long_url = ?').get(longUrl);
  if (existing) {
    return res.json({
      shortCode: existing.short_code,
      shortUrl: `${BASE_URL}/${existing.short_code}`,
    });
  }

  let shortCode;
  let attempts = 0;
  do {
    shortCode = generateShortCode();
    attempts++;
  } while (db.prepare('SELECT 1 FROM urls WHERE short_code = ?').get(shortCode) && attempts < 5);

  db.prepare('INSERT INTO urls (short_code, long_url) VALUES (?, ?)').run(shortCode, longUrl);

  res.status(201).json({
    shortCode,
    shortUrl: `${BASE_URL}/${shortCode}`,
  });
});

// Redirect short code -> original URL
app.get('/:code', (req, res, next) => {
  const { code } = req.params;
  const row = db.prepare('SELECT * FROM urls WHERE short_code = ?').get(code);

  if (!row) return next(); // no match -> fall through to 404

  db.prepare('UPDATE urls SET clicks = clicks + 1 WHERE short_code = ?').run(code);
  res.redirect(row.long_url);
});

// List all URLs
app.get('/api/urls', (req, res) => {
  const rows = db.prepare('SELECT * FROM urls ORDER BY created_at DESC').all();
  res.json(rows);
});

// Stats for a single short code
app.get('/api/urls/:code', (req, res) => {
  const row = db.prepare('SELECT * FROM urls WHERE short_code = ?').get(req.params.code);
  if (!row) return res.status(404).json({ error: 'Short code not found.' });
  res.json(row);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

app.listen(PORT, () => {
  console.log(`URL Shortener running at ${BASE_URL}`);
});
