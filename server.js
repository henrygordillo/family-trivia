const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// ── Build stamp ───────────────────────────────────────────────────────────────
// Bump BUILD every time this file ships. BUILT_AT is UTC (clients localize it).
const VERSION = '3.22';
const BUILT_AT = '2026-07-19T14:28:37Z';

const app = express();
app.use(cors());
app.use(express.json());

// Reports what the LIVE backend is actually running (never hardcode this in a page).
app.get('/api/version', (req, res) => {
  res.json({ version: VERSION, builtAt: BUILT_AT });
});

// Serve the game HTML file
app.use(express.static(path.join(__dirname, 'public'), {
  // Never let the browser cache the app HTML — otherwise a fresh deploy keeps
  // running the old UI. QR images and fonts come from a CDN, so this is HTML-only.
  setHeaders: (res, fp) => { if (fp.endsWith('.html')) res.set('Cache-Control', 'no-cache, must-revalidate'); }
}));
const HTML_NOCACHE = { headers: { 'Cache-Control': 'no-cache, must-revalidate' } };

// Big Screen: /tv is nicer to type on a TV remote than /tv.html
app.get('/tv', (req, res) => res.sendFile(path.join(__dirname, 'public', 'tv.html'), HTML_NOCACHE));
// Player devices (phones, tablets) — they reach out to the judge's room themselves.
app.get('/join', (req, res) => res.sendFile(path.join(__dirname, 'public', 'join.html'), HTML_NOCACHE));   // ?code=1234 joins directly
// Legacy alias: any old /play link or bookmark still lands on the join page.
app.get('/play', (req, res) => res.redirect(301, '/join' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '')));

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ═══════════════════════════════════════════════════════════════════════════
// GAME ROOMS — Big Screen Mode
//
// Topology is deliberately simple: ONE writer (the judge's phone) and one or more
// readers (the TV). That's exactly what Server-Sent Events are for — a one-way
// push stream, built into every browser, no client library, no extra keys.
//
// Rooms live in memory and are EPHEMERAL: they die with the game (or after idle
// expiry). Nothing to clean up, and two games running at once can never collide
// because each has its own code.
// ═══════════════════════════════════════════════════════════════════════════
const rooms = new Map();          // code -> { state, clients:Set<res>, createdAt, touchedAt }
const ROOM_TTL_MS = 4 * 60 * 60 * 1000;   // reap rooms idle for 4h

// The judge's state pushes are the room's pulse. If they stop, the judge is gone —
// back-gesture, crashed tab, dead wifi — even when no client-side close ever fired.
// Short fuse when the judge was last in the FOREGROUND (silence = gone); long fuse
// when BACKGROUNDED (screen off / app switch — alive, just throttled).
const JUDGE_GONE_ACTIVE =  30 * 1000;
const JUDGE_GONE_HIDDEN = 180 * 1000;
const LOBBY_GRACE       = 15 * 60 * 1000;   // pre-game: a waiting device is patient, so don't kick it for a slow host
function reapRooms(){
  const now = Date.now();
  for (const [code, room] of rooms) {
    const idle  = now - room.touchedAt;
    // Before a game starts there's nothing to protect and viewers happily wait,
    // so be generous. Once a game is live, the tight fuse detects a judge who left.
    const limit = !room.lastActive ? LOBBY_GRACE
                : (room.judgeVisible === false ? JUDGE_GONE_HIDDEN : JUDGE_GONE_ACTIVE);
    if (idle > limit || now - room.createdAt > ROOM_TTL_MS) {
      const bye = `event: closed\ndata: {}\n\n`;   // let any viewers exit at once
      room.clients.forEach(res => { try { res.write(bye); res.end(); } catch(e){} });
      rooms.delete(code);
    }
  }
}
setInterval(reapRooms, 10 * 1000).unref?.();

function newCode(){
  // 4 digits, avoiding codes already in use. Short enough to type on a phone.
  for (let i = 0; i < 50; i++) {
    const c = String(Math.floor(1000 + Math.random() * 9000));
    if (!rooms.has(c)) return c;
  }
  return String(Date.now()).slice(-4);
}

// The TV calls this on load: create a room and get a code to display.
app.post('/api/room/new', (req, res) => {
  const code = newCode();
  rooms.set(code, { state: null, clients: new Set(), createdAt: Date.now(), touchedAt: Date.now() });
  res.json({ code });
});

// The judge already had a room (players may be in it) and has just paired a TV
// that made its own. Rather than abandon those players, the judge tells the TV to
// come over to the judge's room. The TV is a viewer; the judge owns the room.
app.post('/api/room/:code/adopt', (req, res) => {
  const room = rooms.get(req.params.code);
  const target = String((req.body && req.body.target) || '');
  if (!room) return res.status(404).json({ error: 'no such room' });
  if (!/^\d{4}$/.test(target)) return res.status(400).json({ error: 'bad target' });
  const msg = `event: adopt\ndata: ${JSON.stringify({ code: target })}\n\n`;
  room.clients.forEach(c => { try { c.write(msg); } catch(e){} });
  res.json({ ok: true, told: room.clients.size });
});

// The TV subscribes here. Stays open; the server pushes every state change.
app.get('/api/room/:code/stream', (req, res) => {
  const room = rooms.get(req.params.code);
  if (!room) return res.status(404).json({ error: 'no such room' });

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',        // don't let a proxy buffer the stream
  });
  res.flushHeaders?.();

  room.clients.add(res);
  // NOTE: viewers deliberately do NOT refresh touchedAt — only the JUDGE's state
  // pushes keep a room alive, so a room dies when the judge leaves, not the viewers.

  // Send whatever we already have, so a screen joining mid-game isn't blank.
  if (room.state) res.write(`event: state\ndata: ${JSON.stringify(room.state)}\n\n`);
  else            res.write(`event: waiting\ndata: {}\n\n`);

  broadcastViewers(room);

  // Keep-alive: proxies drop idle connections, and Render is behind one.
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch(e){} }, 25000);

  req.on('close', () => {
    clearInterval(ping);
    room.clients.delete(res);
    broadcastViewers(room);
  });
});

// How many screens are watching this room right now.
function broadcastViewers(room){
  const msg = `event: viewers\ndata: ${JSON.stringify({ n: room.clients.size })}\n\n`;
  room.clients.forEach(c => { try { c.write(msg); } catch(e){} });
}

// The phone pushes state here. Body IS the public snapshot — it must never
// contain an answer; that's enforced on the client by publicState()'s allow-list.
app.post('/api/room/:code/state', (req, res) => {
  let room = rooms.get(req.params.code);
  if (!room) {
    // Self-heal: if the server restarted (in-memory rooms wiped), the judge's
    // heartbeat lands here and re-creates its OWN room under the same code, so
    // viewers reconnect instead of being kicked out of a live game. Only the
    // room owner ever POSTs state, so re-creating here is safe.
    room = { state: null, clients: new Set(), createdAt: Date.now(), touchedAt: Date.now() };
    rooms.set(req.params.code, room);
  }
  room.state = req.body;
  room.touchedAt = Date.now();
  room.judgeVisible = !(req.body && req.body.visible === false);   // false only when the judge backgrounded
  room.lastActive   =  !!(req.body && req.body.active  === true);   // is a game actually in progress?
  const payload = `event: state\ndata: ${JSON.stringify(room.state)}\n\n`;
  room.clients.forEach(c => { try { c.write(payload); } catch(e){} });
  res.json({ ok: true, listeners: room.clients.size });
});

// Does this code exist? The phone checks before claiming it.
app.get('/api/room/:code', (req, res) => {
  const room = rooms.get(req.params.code);
  if (!room) return res.status(404).json({ error: 'no such room' });
  // The state rides along on this poll too. The stream is the fast path, but a
  // viewer whose stream died (or got orphaned by a server restart) must still be
  // able to catch up — otherwise it sits on "waiting" forever while the room looks
  // perfectly healthy. Same answer-free payload the stream sends.
  res.json({ code: req.params.code, listeners: room.clients.size,
             hasState: !!room.state, state: room.state || null });
});

// Game over — tear the room down.
app.post('/api/room/:code/close', (req, res) => {
  const room = rooms.get(req.params.code);
  if (room) {
    const bye = `event: closed\ndata: {}\n\n`;
    room.clients.forEach(c => { try { c.write(bye); c.end(); } catch(e){} });
    rooms.delete(req.params.code);
  }
  res.json({ ok: true });
});

// ── Anthropic proxy ───────────────────────────────────────────────────────────
app.post('/api/claude', async (req, res) => {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Claude API error:', err);
    res.status(500).json({ error: 'Claude API request failed' });
  }
});

// ── Players ───────────────────────────────────────────────────────────────────
app.get('/api/players', async (req, res) => {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .order('nickname');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/players', async (req, res) => {
  const { first_name, last_name, nickname, email } = req.body;
  if (!first_name || !last_name || !nickname || !email) {
    return res.status(400).json({ error: 'first_name, last_name, nickname and email are required' });
  }
  const { data, error } = await supabase
    .from('players')
    .insert({ first_name, last_name, nickname, email })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Player update ────────────────────────────────────────────────────────────
app.put('/api/players/:id', async (req, res) => {
  const { first_name, last_name, nickname, email } = req.body;
  if (!first_name || !last_name || !nickname) {
    return res.status(400).json({ error: 'All fields required' });
  }
  const updates = { first_name, last_name, nickname };
  if (email) updates.email = email;
  const { data, error } = await supabase
    .from('players')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Attempts ──────────────────────────────────────────────────────────────────
app.post('/api/attempts', async (req, res) => {
  const { player_id, category, tier, correct, pts, is_steal, mode, difficulty_ruleset_version } = req.body;
  const row = { player_id, category, tier, correct, pts };
  if (is_steal !== undefined) row.is_steal = is_steal;
  if (mode !== undefined) row.mode = mode;
  if (difficulty_ruleset_version !== undefined) row.difficulty_ruleset_version = difficulty_ruleset_version;
  const { data, error } = await supabase
    .from('attempts')
    .insert(row)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/attempts/:player_id', async (req, res) => {
  const { data, error } = await supabase
    .from('attempts')
    .select('*')
    .eq('player_id', req.params.player_id)
    .order('attempted_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Questions (deduplication) ─────────────────────────────────────────────────
app.post('/api/questions/check', async (req, res) => {
  const { fingerprint } = req.body;
  const { data, error } = await supabase
    .from('questions')
    .select('id')
    .eq('fingerprint', fingerprint)
    .single();
  if (error && error.code !== 'PGRST116') {
    return res.status(500).json({ error: error.message });
  }
  res.json({ exists: !!data });
});

app.post('/api/questions', async (req, res) => {
  const { category, tier, fingerprint, answer } = req.body;
  const row = { category, tier, fingerprint };
  if (answer !== undefined) row.answer = answer;
  const { data, error } = await supabase
    .from('questions')
    .insert(row)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/questions/recent/:category', async (req, res) => {
  const { data, error } = await supabase
    .from('questions')
    .select('fingerprint, answer, asked_at')
    .eq('category', req.params.category)
    .order('asked_at', { ascending: false })
    .limit(30);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Stats: all-time by-tier aggregate (server-side) ────────────────────────────
app.get('/api/stats/tiers', async (req, res) => {
  let q = supabase.from('attempts')
    .select('tier, correct, is_steal, mode, category, attempted_at')
    .order('attempted_at', { ascending: true });
  const rs = req.query.ruleset;
  if (rs !== undefined && rs !== '') q = q.eq('difficulty_ruleset_version', Number(rs));
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  // Each difficulty mode is measured SEPARATELY, against its own (nudged) targets.
  // Mixing them would make a correct ruleset look mis-calibrated.
  // Legacy rows have mode null — treat those as normal.
  const mode = req.query.mode || 'normal';
  const all = data || [];
  const rows = all.filter(r => (r.mode || 'normal') === mode);
  const excluded = all.length - rows.length;
  const byTier = {}, byCat = {}, byCatTier = {}, byMode = {};
  const steals = { att: 0, ok: 0 };
  let total = 0, totalOK = 0;
  rows.forEach(r => {
    const t = r.tier, cat = r.category || '(uncategorized)';
    if (!byTier[t]) byTier[t] = { att: 0, ok: 0 };
    byTier[t].att++; total++;
    if (r.correct) { byTier[t].ok++; totalOK++; }
    if (!byCat[cat]) byCat[cat] = { att: 0, ok: 0 };
    byCat[cat].att++; if (r.correct) byCat[cat].ok++;
    if (!byCatTier[cat]) byCatTier[cat] = {};
    if (!byCatTier[cat][t]) byCatTier[cat][t] = { att: 0, ok: 0 };
    byCatTier[cat][t].att++; if (r.correct) byCatTier[cat][t].ok++;
    const m = r.mode || 'normal';
    byMode[m] = (byMode[m] || 0) + 1;
    if (r.is_steal) { steals.att++; if (r.correct) steals.ok++; }
  });
  // Trend: split time-ordered answers into up to 10 sequential buckets (drift over time)
  const trend = [];
  if (rows.length) {
    const B = Math.min(10, rows.length);
    const size = Math.ceil(rows.length / B);
    for (let i = 0; i < rows.length; i += size) {
      const chunk = rows.slice(i, i + size);
      const ok = chunk.filter(r => r.correct).length;
      trend.push({ n: chunk.length, ok, pct: Math.round(ok / chunk.length * 100) });
    }
  }
  // Trend for EVERY mode. Each bucket carries its per-tier mix so the client can work out
  // the bucket's EXPECTED rate and plot the gap from target (0 = on target for every mode).
  const trendByMode = {};
  ['easy', 'normal', 'hard'].forEach(m => {
    const mrows = all.filter(r => (r.mode || 'normal') === m);
    const buckets = [];
    if (mrows.length) {
      const B = Math.min(10, mrows.length);
      const size = Math.ceil(mrows.length / B);
      for (let i = 0; i < mrows.length; i += size) {
        const chunk = mrows.slice(i, i + size);
        const ok = chunk.filter(r => r.correct).length;
        const byTier = {};
        chunk.forEach(r => {
          if (!byTier[r.tier]) byTier[r.tier] = { att: 0, ok: 0 };
          byTier[r.tier].att++;
          if (r.correct) byTier[r.tier].ok++;
        });
        buckets.push({ n: chunk.length, ok, pct: Math.round(ok / chunk.length * 100), byTier });
      }
    }
    trendByMode[m] = buckets;
  });

  const modeCounts = {};
  all.forEach(r => { const m = r.mode || 'normal'; modeCounts[m] = (modeCounts[m] || 0) + 1; });

  // Tier stats for EVERY mode — the top table compares all three side by side.
  // (byCat / byCatTier / trend stay single-mode: per-mode category data is far too thin.)
  const tiersByMode = { easy: {}, normal: {}, hard: {} };
  all.forEach(r => {
    const m = r.mode || 'normal';
    if (!tiersByMode[m]) tiersByMode[m] = {};
    if (!tiersByMode[m][r.tier]) tiersByMode[m][r.tier] = { att: 0, ok: 0 };
    tiersByMode[m][r.tier].att++;
    if (r.correct) tiersByMode[m][r.tier].ok++;
  });

  res.json({ byTier, byCat, byCatTier, byMode, steals, total, totalOK, trend, excluded, mode, modeCounts, tiersByMode, trendByMode,
    categoriesAll: [...new Set(all.map(r => r.category).filter(Boolean))].sort(),
    totalAll: all.length });
});

// ── Difficulty rulesets: list versions for the stats dropdown ──────────────────
// Lifetime stats per player, for the roster: hit rate + attempts ("picks").
// One call for every player, so the roster doesn't fan out N requests.
app.get('/api/stats/lifetime', async (req, res) => {
  const { data, error } = await supabase
    .from('attempts')
    .select('player_id, correct');
  if (error) return res.status(500).json({ error: error.message });
  const byPlayer = {};
  (data || []).forEach(a => {
    if (!a.player_id) return;
    if (!byPlayer[a.player_id]) byPlayer[a.player_id] = { attempts: 0, correct: 0 };
    byPlayer[a.player_id].attempts++;
    if (a.correct) byPlayer[a.player_id].correct++;
  });
  const out = {};
  Object.entries(byPlayer).forEach(([id, s]) => {
    out[id] = {
      attempts: s.attempts,
      correct: s.correct,
      pct: s.attempts > 0 ? Math.round((s.correct / s.attempts) * 100) : null
    };
  });
  res.json(out);
});

// The ACTIVE ruleset = highest version. Creating a new version is how you publish a change.
// (Interim: an explicit is_active flag is the eventual design — see notes.)
app.get('/api/rulesets/active', async (req, res) => {
  const { data, error } = await supabase
    .from('difficulty_rulesets')
    .select('*')
    .order('difficulty_ruleset_version', { ascending: false })
    .limit(1);
  if (error) return res.status(500).json({ error: error.message });
  res.json((data && data[0]) || null);
});

app.get('/api/rulesets', async (req, res) => {
  const { data, error } = await supabase
    .from('difficulty_rulesets')
    .select('*')
    .order('difficulty_ruleset_version', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// ── Health check ──────────────────────────────────────────────────────────────
// ── Games (records each game; used for category dedup + game-level history) ─────
app.post('/api/games', async (req, res) => {
  const { categories, difficulty_ruleset_version, num_players } = req.body;
  const row = { categories };
  if (difficulty_ruleset_version !== undefined) row.difficulty_ruleset_version = difficulty_ruleset_version;
  if (num_players !== undefined) row.num_players = num_players;
  const { data, error } = await supabase.from('games').insert(row).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Which categories have actually been PLAYED lately. Read from attempts, not
// games, because a game row is written the moment tiles are dealt — so dealing a
// board you dislike and re-rolling used to burn five categories for nothing.
// An attempt only exists once somebody answered, which is the real signal.
app.get('/api/categories/recent', async (req, res) => {
  const want = Math.min(30, Math.max(1, Number(req.query.limit) || 20));
  const { data, error } = await supabase
    .from('attempts')
    .select('category, attempted_at')
    .order('attempted_at', { ascending: false })   // this table stamps attempted_at, not created_at
    .limit(400);
  if (error) return res.status(500).json({ error: error.message });
  const seen = [];
  for (const row of (data || [])) {
    if (row.category && !seen.includes(row.category)) seen.push(row.category);
    if (seen.length >= want) break;
  }
  res.json(seen);
});

app.get('/api/games/recent', async (req, res) => {
  const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 4));
  const { data, error } = await supabase
    .from('games')
    .select('categories, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── Fallback to game ──────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'), HTML_NOCACHE);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Trivia Night server running on port ${PORT}`));
