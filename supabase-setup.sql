-- ============================================================
-- Ghar Kharcha — Supabase database setup
-- Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to run more than once.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Tables ----------
create table if not exists advances (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  amount      numeric not null,
  paid_by     text not null,          -- 'b' = Bhavneet, 'r' = Ritika
  note        text default '',
  created_at  timestamptz default now()
);

create table if not exists expenses (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  items       jsonb not null default '[]',   -- [{name, amount}, ...]
  total       numeric not null,
  logged_by   text not null,          -- 'b' / 'r' / 'c' (cook)
  note        text default '',
  created_at  timestamptz default now()
);

create table if not exists salaries (
  id        uuid primary key default gen_random_uuid(),
  month     text unique not null,     -- 'YYYY-MM'
  amount    numeric not null,
  paid_by   text not null
);

create table if not exists app_config (
  id                     int primary key default 1,
  low_balance_threshold  numeric not null default 1000,
  common_items           jsonb not null default '[]'
);

-- one shared config row, seeded with the default shopping list
insert into app_config (id, low_balance_threshold, common_items)
values (1, 1000, '["Milk","Bread","Eggs","Atta","Rice","Dal","Onion","Tomato","Potato","Mixed vegetables","Curd","Paneer","Cooking oil","Sugar","Tea","Salt","Green chilli","Ginger-garlic","Coriander","Fruits","Chicken","Spices","Ghee"]'::jsonb)
on conflict (id) do nothing;

-- ---------- Access for the app's anon key ----------
grant usage on schema public to anon, authenticated;
grant all on advances, expenses, salaries, app_config to anon, authenticated;

alter table advances   enable row level security;
alter table expenses   enable row level security;
alter table salaries   enable row level security;
alter table app_config enable row level security;

drop policy if exists "app access advances"   on advances;
drop policy if exists "app access expenses"    on expenses;
drop policy if exists "app access salaries"    on salaries;
drop policy if exists "app access app_config"  on app_config;

create policy "app access advances"   on advances   for all using (true) with check (true);
create policy "app access expenses"   on expenses   for all using (true) with check (true);
create policy "app access salaries"   on salaries   for all using (true) with check (true);
create policy "app access app_config" on app_config for all using (true) with check (true);

-- ---------- Live sync (realtime) ----------
do $$
begin
  begin execute 'alter publication supabase_realtime add table advances';   exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table expenses';   exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table salaries';   exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table app_config'; exception when duplicate_object then null; end;
end $$;

-- Done. You should see four tables under Table Editor.
