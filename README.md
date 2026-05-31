# Family Trivia Night — Backend

Node.js/Express backend proxy for the Family Trivia Night app.

## Environment Variables (set in Render)

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Your Supabase service role key |

## Endpoints

- `POST /api/claude` — Anthropic proxy
- `GET /api/players` — Get all players
- `POST /api/players` — Create a player
- `POST /api/attempts` — Record an attempt
- `GET /api/attempts/:player_id` — Get player attempts
- `POST /api/questions/check` — Check if question was asked before
- `POST /api/questions` — Record a question
- `GET /api/questions/recent/:category` — Get recent questions by category
- `GET /health` — Health check
