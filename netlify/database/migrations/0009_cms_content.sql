-- Content Management System (PostgreSQL 15+)
-- 1. content_items: every news item, announcement, training note, video,
--    program or event published through the Command Centre CMS. Soft-deleted
--    rows are kept (deleted_at) so accidental deletions are recoverable.
-- 2. 'Content Administrator' joins the fixed role list so Super Administrators
--    can create content-only staff accounts through the existing workflow.
-- 3. A partial unique index stops duplicate content notifications when a
--    publication request is retried.
--
-- The migration is additive: no existing row is modified, and the role
-- constraint is widened (never narrowed).

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'Super Administrator', 'National YEGO Administrator', 'Regional Coordinator',
    'State Coordinator', 'LGA Coordinator', 'Verification Officer',
    'Training Officer', 'Content Administrator', 'YEGO Guard', 'Partner/Observer'
  ));

CREATE TABLE IF NOT EXISTS content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  category text NOT NULL
    CHECK (category IN (
      'News', 'Announcements & Updates', 'Training & Development',
      'Videos & Media', 'Programs & Initiatives', 'Upcoming Events'
    )),
  audience text NOT NULL DEFAULT 'public'
    CHECK (audience IN ('public', 'applicants', 'guards', 'all')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  featured_image text,
  gallery jsonb NOT NULL DEFAULT '[]',
  attachments jsonb NOT NULL DEFAULT '[]',
  video_url text,
  resource_url text,
  event_start_at timestamptz,
  event_location text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by_label text NOT NULL DEFAULT 'System',
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by_label text,
  published_at timestamptz,
  published_by uuid REFERENCES users(id) ON DELETE SET NULL,
  published_by_label text,
  notify_in_app boolean NOT NULL DEFAULT FALSE,
  notify_email boolean NOT NULL DEFAULT FALSE,
  notification_sent_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_items_listing_idx
  ON content_items(status, published_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS content_items_public_idx
  ON content_items(published_at DESC)
  WHERE deleted_at IS NULL AND status = 'published' AND audience = 'public';
CREATE INDEX IF NOT EXISTS content_items_category_idx
  ON content_items(category)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS content_items_created_idx
  ON content_items(created_at DESC);

-- Drop the previous updated_at trigger handle if re-run on a fresh database
-- (create ... if not exists above already guarantees idempotency for the
-- table); the trigger keeps updated_at truthful for content edits.
DROP TRIGGER IF EXISTS content_items_updated_at ON content_items;
CREATE TRIGGER content_items_updated_at BEFORE UPDATE ON content_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Exactly one in-app content notification per user per content item, so a
-- retried publication can never create duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_content_once_idx
  ON notifications(user_id, entity_id)
  WHERE kind = 'content' AND entity_id IS NOT NULL;
