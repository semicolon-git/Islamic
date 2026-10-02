-- Ask / eval (B2). Stores safety-scoreboard runs so the portal can show the latest run and "Run evaluation now" works
-- on read-only deployments. The committed snapshot data/eval/results.json is the offline fallback.
create table if not exists eval_runs (
  id text primary key,
  created_at timestamptz not null default now(),
  run_by text references users(id),
  ai_enabled boolean not null default false,
  summary jsonb not null default '{}'::jsonb,
  results jsonb not null default '[]'::jsonb
);
create index if not exists eval_runs_created on eval_runs (created_at desc);
