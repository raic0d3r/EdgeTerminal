-- Initial Edge Terminal schema sketch. Review policies before production.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status text not null default 'inactive'
    check (status in ('inactive','trialing','active','past_due','canceled','unpaid')),
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.trade_journal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check (symbol in ('XAU/USD','XAG/USD')),
  side text not null check (side in ('long','short')),
  entry_price numeric,
  exit_price numeric,
  quantity numeric,
  notes text,
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.trade_journal enable row level security;

create policy "Users read own profile"
on public.profiles for select to authenticated
using (auth.uid() = id);

create policy "Users update own profile"
on public.profiles for update to authenticated
using (auth.uid() = id) with check (auth.uid() = id);

-- Subscription writes should be performed only by a trusted server/webhook using
-- a service role. Do not add client INSERT/UPDATE policies to subscriptions.
create policy "Users read own subscription"
on public.subscriptions for select to authenticated
using (auth.uid() = user_id);

create policy "Users read own journal"
on public.trade_journal for select to authenticated
using (auth.uid() = user_id);
create policy "Users add own journal entries"
on public.trade_journal for insert to authenticated
with check (auth.uid() = user_id);
create policy "Users update own journal"
on public.trade_journal for update to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own journal"
on public.trade_journal for delete to authenticated
using (auth.uid() = user_id);

-- Add a trusted auth.users trigger to create profiles before launch.
-- Test RLS and webhook behavior in a non-production project first.
