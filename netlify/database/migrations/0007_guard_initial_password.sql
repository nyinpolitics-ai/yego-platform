-- Applicant login hardening (officials' correction round 5)
-- 1. users gains must_change_password. A Guard account starts in "initial
--    password" state: the applicant signs in with their Application ID as the
--    username and the phone number from their application as the initial
--    password. On that first successful sign-in they must choose a real
--    password (stored scrypt-hashed) before the portal unlocks. The phone
--    number itself is never stored as a password credential.
-- 2. Grandfather policy for existing applicants (required so the new
--    email-verification gate does not lock out legitimate existing users):
--    every application that already has a linked Guard account is marked
--    email-verified, because those applicants already passed the previous
--    portal gate. Applications without a linked account start unverified and
--    verify through the emailed link, exactly like new applicants.

alter table users add column if not exists must_change_password boolean not null default false;

update users set must_change_password = true where kind = 'guard';

update applications a
set email_verified_at = coalesce(a.email_verified_at, now())
where exists (select 1 from users u where u.application_id = a.id);
