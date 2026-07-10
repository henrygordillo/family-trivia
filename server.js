const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serve the game HTML file
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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
  const rows = data || [];
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
  res.json({ byTier, byCat, byCatTier, byMode, steals, total, totalOK, trend });
});

// ── Difficulty rulesets: list versions for the stats dropdown ──────────────────
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
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Family Trivia server running on port ${PORT}`));
