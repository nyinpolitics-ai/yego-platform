-- Warning resolution workflow + outbound notification queue (PostgreSQL 15+)
-- 1. Early warnings gain a resolution workflow so the Command early-warning
--    board can escalate, publish and close a warning without losing history.
-- 2. outbound_messages records every outbound SMS/WhatsApp the platform tries
--    to deliver, truthfully, including the attempts that were skipped because
--    no provider is configured.

alter table early_warnings
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references users(id) on delete set null,
  add column if not exists resolution_note text;

create index if not exists early_warnings_open_idx on early_warnings(created_at desc) where resolved_at is null;

create table if not exists outbound_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('sms', 'whatsapp')),
  to_phone text not null,
  template text not null,
  body text not null,
  related_type text,
  related_id text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  provider text,
  provider_message_id text,
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists outbound_messages_status_idx on outbound_messages(status, created_at);
create index if not exists outbound_messages_related_idx on outbound_messages(related_type, related_id);
