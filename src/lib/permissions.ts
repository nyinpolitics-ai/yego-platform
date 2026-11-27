// Role → capability map for the Command Centre. Enforced in the UI for the
// preview; milestone 2 enforces the same map server-side.
export type Capability =
  | 'view:analytics'
  | 'view:incidents'
  | 'report:incidents'
  | 'screen:applicants'
  | 'approve:verification'
  | 'assign:polling-units'
  | 'verify:incidents'
  | 'refer:incidents'
  | 'view:early-warning'
  | 'raise:early-warning'
  | 'send:national'
  | 'send:state'
  | 'manage:training'
  | 'manage:roles'
  | 'view:content'
  | 'create:content'
  | 'edit:content'
  | 'publish:content'
  | 'unpublish:content'
  | 'archive:content'
  | 'delete:content'
  | 'upload:media'
  | 'view:content-status'

const ALL: Capability[] = [
  'view:analytics',
  'view:incidents',
  'report:incidents',
  'screen:applicants',
  'approve:verification',
  'assign:polling-units',
  'verify:incidents',
  'refer:incidents',
  'view:early-warning',
  'raise:early-warning',
  'send:national',
  'send:state',
  'manage:training',
  'manage:roles',
  'view:content',
  'create:content',
  'edit:content',
  'publish:content',
  'unpublish:content',
  'archive:content',
  'delete:content',
  'upload:media',
  'view:content-status',
]

// The full content-management set. A Content Administrator can run the whole
// publishing workflow (direct publishing, no approval queue) but receives no
// operational or people-data capability from this list.
const CONTENT: Capability[] = [
  'view:content',
  'create:content',
  'edit:content',
  'publish:content',
  'unpublish:content',
  'archive:content',
  'delete:content',
  'upload:media',
  'view:content-status',
]

const MATRIX: Record<string, Capability[]> = {
  'Super Administrator': ALL,
  'National YEGO Administrator': ALL.filter((c) => c !== 'manage:roles'),
  'Regional Coordinator': ['view:analytics', 'view:incidents', 'report:incidents', 'screen:applicants', 'assign:polling-units', 'view:early-warning', 'raise:early-warning', 'send:state'],
  'State Coordinator': ALL.filter((c) => c !== 'manage:roles'),
  'LGA Coordinator': ['view:analytics', 'view:incidents', 'report:incidents', 'screen:applicants', 'view:early-warning', 'raise:early-warning', 'send:state'],
  'Verification Officer': ['view:analytics', 'view:incidents', 'screen:applicants', 'approve:verification', 'verify:incidents', 'refer:incidents', 'view:early-warning'],
  'Training Officer': ['view:analytics', 'manage:training'],
  'Content Administrator': CONTENT,
}

export function can(role: string | undefined, cap: Capability) {
  return !!role && (MATRIX[role]?.includes(cap) ?? false)
}

export const CAPABILITY_LABELS: Record<Capability, string> = {
  'view:analytics': 'View dashboards',
  'view:incidents': 'View incident queue',
  'report:incidents': 'Report an incident',
  'screen:applicants': 'Screen applicants',
  'approve:verification': 'Approve verification',
  'assign:polling-units': 'Assign polling units',
  'verify:incidents': 'Verify incidents',
  'refer:incidents': 'Refer to agencies',
  'view:early-warning': 'View early warnings',
  'raise:early-warning': 'Raise early warnings',
  'send:national': 'National broadcasts',
  'send:state': 'State/LGA messages',
  'manage:training': 'Manage training',
  'manage:roles': 'Manage users & roles',
  'view:content': 'View content management',
  'create:content': 'Create content',
  'edit:content': 'Edit content',
  'publish:content': 'Publish content directly',
  'unpublish:content': 'Unpublish content',
  'archive:content': 'Archive content',
  'delete:content': 'Delete or restore content',
  'upload:media': 'Upload permitted media & documents',
  'view:content-status': 'View content publication status',
}

export const ALL_CAPABILITIES = ALL
export const ROLE_MATRIX = MATRIX
