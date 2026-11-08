-- Supabase / Postgres schema for the keeper and the web app.
create table if not exists quotes (
  t timestamptz not null,
  block bigint,
  ticker text not null,
  issuer text not null,
  token text not null,
  session text,
  api_price numeric,
  api_multiplier numeric,
  stock_price numeric,
  unit numeric,
  quote_usd numeric,
  tokens_out numeric,
  venue text,
  primary key (t, token)
);
create index if not exists quotes_ticker_t on quotes (ticker, t desc);

create table if not exists keeper_actions (
  id bigserial primary key,
  t timestamptz not null,
  order_id text not null,
  status text not null,
  decision text not null,
  reasons text[] not null default '{}',
  wrapper text,
  router text,
  venue text,
  calldata_hash text,
  sim_source text,
  sim_result text,
  sim_error text,
  tx_hash text,
  gas_used numeric,
  shares_wad numeric,
  latencies_ms jsonb
);
-- gas, broadcast path and reference details for each decision (added after the first deploy)
alter table keeper_actions add column if not exists detail jsonb;
create index if not exists keeper_actions_order on keeper_actions (order_id, t desc);

create table if not exists orders_cache (
  id text primary key,
  owner text not null,
  side text not null,
  status text not null,
  ticker_id text not null,
  amount numeric not null,
  lim numeric not null,
  deadline timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists sessions (
  t timestamptz primary key,
  market_status text,
  open_state boolean,
  next_open timestamptz,
  next_close timestamptz
);

alter table quotes enable row level security;
alter table keeper_actions enable row level security;
alter table orders_cache enable row level security;
alter table sessions enable row level security;
create policy "public read quotes" on quotes for select using (true);
create policy "public read actions" on keeper_actions for select using (true);
create policy "public read orders" on orders_cache for select using (true);
create policy "public read sessions" on sessions for select using (true);
