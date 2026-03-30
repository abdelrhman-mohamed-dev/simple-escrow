-- Run this in the Supabase SQL Editor

create table transactions (
  id bigint generated always as identity primary key,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  type text not null check (type in ('receive', 'send')),
  method text not null check (method in ('bank', 'wallet')),
  party text not null,
  created_at timestamptz default now()
);

-- Allow public read/write (no auth for now)
alter table transactions enable row level security;

create policy "Allow all access"
  on transactions
  for all
  using (true)
  with check (true);
