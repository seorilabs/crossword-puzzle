create extension if not exists pgcrypto;

create table if not exists public.content_packs (
  id uuid primary key default gen_random_uuid(),
  app_id text not null,
  slug text not null,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  version integer not null default 1 check (version > 0),
  manifest jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_id, slug, version)
);

create table if not exists public.puzzles (
  id uuid primary key default gen_random_uuid(),
  app_id text not null,
  pack_id uuid not null references public.content_packs(id) on delete cascade,
  puzzle_id text not null,
  puzzle_date date not null,
  difficulty text not null check (difficulty in ('easy', 'normal', 'hard')),
  payload jsonb not null,
  metrics jsonb not null default '{}'::jsonb,
  quality jsonb,
  source_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_id, puzzle_id),
  unique (app_id, puzzle_date, difficulty)
);

create index if not exists content_packs_app_status_idx
  on public.content_packs (app_id, status, published_at desc);

create index if not exists puzzles_app_date_idx
  on public.puzzles (app_id, puzzle_date desc);

alter table public.content_packs enable row level security;
alter table public.puzzles enable row level security;

drop policy if exists "Public read published crossword packs" on public.content_packs;
create policy "Public read published crossword packs"
  on public.content_packs
  for select
  to anon, authenticated
  using (
    app_id = 'crossword-puzzle'
    and status = 'published'
    and published_at is not null
    and published_at <= now()
  );

drop policy if exists "Public read published crossword puzzles" on public.puzzles;
create policy "Public read published crossword puzzles"
  on public.puzzles
  for select
  to anon, authenticated
  using (
    app_id = 'crossword-puzzle'
    and exists (
      select 1
      from public.content_packs
      where content_packs.id = puzzles.pack_id
        and content_packs.app_id = puzzles.app_id
        and content_packs.status = 'published'
        and content_packs.published_at is not null
        and content_packs.published_at <= now()
    )
  );

grant usage on schema public to anon, authenticated;
grant select on public.content_packs, public.puzzles to anon, authenticated;
