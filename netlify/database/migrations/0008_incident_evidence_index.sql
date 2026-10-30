-- 0008: performance index for incident evidence lookups.
-- Additive only: creates an index; no columns, rows or statuses are modified.
-- The admin incident list and loadIncident fetch evidence per incident; the
-- composite lookup below avoids sequential scans on incident_evidence.

create index if not exists incident_evidence_incident_idx on incident_evidence(incident_id);
