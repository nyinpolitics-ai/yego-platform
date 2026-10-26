-- Applicant email verification + email outbound channel (PostgreSQL 15+)
-- 1. Applications gain an email verification flow: when an application is
--    submitted, a one-time verification link is emailed to the applicant.
--    The token is stored hashed (sha256); only the hash ever lives in the DB.
-- 2. outbound_messages gains an 'email' channel so every verification mail is
--    recorded truthfully, including attempts skipped because no email
--    provider (RESEND_API_KEY) is configured yet.

alter table applications
  add column if not exists email_verified_at timestamptz,
  add column if not exists email_verification_token_hash text,
  add column if not exists email_verification_expires_at timestamptz;

create unique index if not exists applications_email_token_idx
  on applications(email_verification_token_hash)
  where email_verification_token_hash is not null;

-- Email rows store the recipient in to_email; to_phone becomes nullable.
alter table outbound_messages alter column to_phone drop not null;
alter table outbound_messages add column if not exists to_email text;
alter table outbound_messages add column if not exists subject text;
alter table outbound_messages add column if not exists html text;

alter table outbound_messages drop constraint if exists outbound_messages_channel_check;
alter table outbound_messages add constraint outbound_messages_channel_check
  check (channel in ('sms', 'whatsapp', 'email'));
