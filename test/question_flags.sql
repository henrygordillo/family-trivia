-- Bad questions, captured at the moment the host throws one away.
--
-- Until now a bad question vanished on regen and left no trace, so "roughly three
-- bad ones in five or six games" could not be turned into anything actionable.
-- This records what was wrong, and enough context to tell whether the problem is
-- one category, one tier, one difficulty mode, or one ruleset version.
--
-- Deliberately NOT captured: "too hard" / "too easy". Difficulty is measured from
-- hit rates across hundreds of attempts by the ruleset calibration; a single
-- host's impression of one question would be noise competing with a system that
-- already answers that question properly.

create table if not exists question_flags (
  id                        uuid primary key default gen_random_uuid(),
  flagged_at                timestamptz not null default now(),

  -- what was thrown away
  question                  text        not null,
  answer                    text,
  explanation               text,

  -- why. Constrained on purpose: free text cannot be counted.
  --   wrong_answer  the answer is factually incorrect
  --   ambiguous     more than one answer is defensibly right
  --   unclear       badly worded, or cannot be answered as asked
  --   repeat        we have had this one before  -> a DEDUP miss, not a quality
  --                 failure. The question may be fine. Count it separately.
  --   other         regenerated without a reason. Watch this rate: if it runs
  --                 high the reason list is wrong and the list is what to fix.
  reason              text        not null
    check (reason in ('wrong_answer','ambiguous','unclear','repeat','other')),

  -- context, so the counts can be sliced
  category                  text,
  tier                      int,
  mode                      text,          -- easy | normal | hard
  difficulty_ruleset_version int,
  model                     text
);

create index if not exists question_flags_reason_idx  on question_flags (reason);
create index if not exists question_flags_cat_idx     on question_flags (category, tier);
create index if not exists question_flags_version_idx on question_flags (difficulty_ruleset_version);
create index if not exists question_flags_time_idx    on question_flags (flagged_at desc);
