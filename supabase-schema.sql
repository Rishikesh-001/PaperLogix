create table if not exists public.paperlogix_mt5_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  metaapi_account_id text not null unique,
  name text not null,
  login_suffix text not null,
  server text not null check (server = 'MetaQuotes-Demo'),
  balance numeric(20, 8) not null default 0,
  currency text not null default 'USD',
  last_sync timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists paperlogix_mt5_accounts_owner_idx
  on public.paperlogix_mt5_accounts (owner_id);

create table if not exists public.paperlogix_mt5_deals (
  account_id uuid not null references public.paperlogix_mt5_accounts (id) on delete cascade,
  deal_id text not null,
  symbol text not null,
  deal_time timestamptz not null,
  side text not null check (side in ('BUY', 'SELL')),
  volume numeric(20, 8) not null default 0,
  pnl numeric(20, 8) not null default 0,
  setup text not null default 'Unclassified',
  status text not null default 'flag',
  position_id text,
  primary key (account_id, deal_id)
);

alter table public.paperlogix_mt5_accounts enable row level security;
alter table public.paperlogix_mt5_deals enable row level security;

drop policy if exists "Users can read their PaperLogix MT5 accounts"
  on public.paperlogix_mt5_accounts;
create policy "Users can read their PaperLogix MT5 accounts"
  on public.paperlogix_mt5_accounts
  for select
  using (auth.uid() = owner_id);

drop policy if exists "Users can read deals for their PaperLogix MT5 accounts"
  on public.paperlogix_mt5_deals;
create policy "Users can read deals for their PaperLogix MT5 accounts"
  on public.paperlogix_mt5_deals
  for select
  using (
    exists (
      select 1
      from public.paperlogix_mt5_accounts account
      where account.id = paperlogix_mt5_deals.account_id
        and account.owner_id = auth.uid()
    )
  );
