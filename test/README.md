# Family Trivia — test suite

Node scripts that verify the game logic. **These never ship.** They are not part of
the app, are not served, and have no effect on the deployed site. They read
`public/index.html`, load the real game script behind DOM stubs, and exercise it.

## Running

From the repo root:

```bash
node test/harness.js public/index.html          # play 60 simulated games
node test/leak_test.js                          # answers must never reach the TV
node test/tv_render_test.js                     # scoreboard renders from a wire snapshot
node test/tv_full_test.js                       # full board renders, display-only
node test/sync_test.js                          # two devices stay in sync, no echo
```

(The last four expect `index.html` in the working directory — copy it in, or adjust
the path at the top of each file.)

## What each one does

**`harness.js`** — the regression net. Loads the real game code and plays 60 complete
games: every player count (1–5) × every category count (4/5/6) × 4 seeds. Everything
is deterministic, so the same code always produces the same result. It fingerprints
each game (scores, streaks, blocked tiles, rounds, whether the game ended cleanly)
and can write that fingerprint to a file.

**`baseline.txt`** — the fingerprint of known-good behaviour. After changing game
logic, regenerate and diff:

```bash
node test/harness.js public/index.html /tmp/after.txt
diff test/baseline.txt /tmp/after.txt      # no output = behaviour unchanged
```

If you *intend* to change behaviour, regenerate the baseline and commit it.

**`leak_test.js`** — the important one. The whole premise of Big Screen Mode is that
the judge sees something the room does not. This asserts that `publicState()` — the
snapshot sent to the TV — never contains the answer, the explanation, or any past
answer, in any game phase. The answer appears only after the judge reveals.

**`tv_render_test.js`** — proves the scoreboard rendered from a serialised snapshot is
byte-identical to the one rendered from local state.

**`tv_full_test.js`** — proves the TV can build the whole board from a snapshot with
**zero click handlers** (display-only), while the phone builds the same board fully
interactive.

**`sync_test.js`** — simulates two devices. The phone plays; the TV subscribes. Checks
the TV tracks scores/streaks/tiles, never sees the answer early, and — critically —
does not echo received state back into an infinite broadcast loop.

## Coverage, honestly

Covered: turn rotation, steal selection, scoring, streaks, round boundaries, blocked
tiles, game-end conditions, the public/private state split, two-device sync.

**Not covered:** anything visual. Rendering, layout, tile taps, modals, the timer, and
actual browser behaviour are invisible to these tests. After a refactor, still play one
real game.
