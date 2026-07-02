-- Run this once in your Supabase project's SQL editor (Database > SQL Editor > New query)

create table if not exists ledger_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

-- Row Level Security: each user can only ever see/edit their own rows,
-- even though the app uses the public "anon" key.
alter table ledger_data enable row level security;

create policy "Users can read own data"
  on ledger_data for select
  using (auth.uid() = user_id);

create policy "Users can insert own data"
  on ledger_data for insert
  with check (auth.uid() = user_id);

create policy "Users can update own data"
  on ledger_data for update
  using (auth.uid() = user_id);

create policy "Users can delete own data"
  on ledger_data for delete
  using (auth.uid() = user_id);
