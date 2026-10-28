import { STATES } from '@/lib/nigeria'

export type Role =
  | 'Super Administrator'
  | 'National YEGO Administrator'
  | 'Regional Coordinator'
  | 'State Coordinator'
  | 'LGA Coordinator'
  | 'Verification Officer'
  | 'Training Officer'
  | 'YEGO Guard'
  | 'Partner/Observer'

export type ScopeKind = 'national' | 'zone' | 'state' | 'lga' | 'self' | 'training'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: Role
  kind: 'command' | 'guard'
  scope_kind: ScopeKind
  scope_zone: string | null
  scope_state: string | null
  scope_lga: string | null
  application_id: string | null
  must_change_password: boolean
}

export function zoneStates(zone: string): string[] {
  return STATES.filter((state) => state.zone === zone).map((state) => state.name)
}

export function stateZone(state: string): string | undefined {
  return STATES.find((item) => item.name === state)?.zone
}

export function canAccessState(user: AuthUser, state: string | null | undefined): boolean {
  if (!state) return false
  switch (user.scope_kind) {
    case 'national':
      return true
    case 'zone':
      return !!user.scope_zone && zoneStates(user.scope_zone).includes(state)
    case 'state':
      return user.scope_state === state
    case 'lga':
      return user.scope_state === state
    case 'self':
      return user.scope_state === state
    default:
      return false
  }
}

export function canAccessLga(user: AuthUser, state: string, lga: string): boolean {
  if (!canAccessState(user, state)) return false
  if (user.scope_kind === 'lga') return user.scope_lga === lga
  return true
}

export interface ScopeClause {
  sql: string
  params: unknown[]
}

/**
 * Build a SQL predicate for a scoped geography. `paramIndex` is the 1-based
 * position of the first parameter to use.
 */
export function scopeClause(
  user: AuthUser,
  stateColumn: string,
  lgaColumn: string,
  paramIndex: number,
): ScopeClause {
  switch (user.scope_kind) {
    case 'national':
      return { sql: 'true', params: [] }
    case 'zone':
      return { sql: `${stateColumn} = any($${paramIndex})`, params: [zoneStates(user.scope_zone ?? '')] }
    case 'state':
    case 'self':
      return { sql: `${stateColumn} = $${paramIndex}`, params: [user.scope_state] }
    case 'lga':
      return {
        sql: `${stateColumn} = $${paramIndex} and ${lgaColumn} = $${paramIndex + 1}`,
        params: [user.scope_state, user.scope_lga],
      }
    default:
      return { sql: 'false', params: [] }
  }
}

export function scopeLabel(user: AuthUser): string {
  switch (user.scope_kind) {
    case 'national':
      return 'National'
    case 'zone':
      return `${user.scope_zone ?? 'Zone'} zone`
    case 'state':
      return user.scope_state ?? 'State'
    case 'lga':
      return [user.scope_lga, user.scope_state].filter(Boolean).join(', ')
    case 'training':
      return 'Training Centre'
    case 'self':
      return [user.scope_lga, user.scope_state].filter(Boolean).join(', ') || 'Assigned polling unit'
    default:
      return 'Restricted'
  }
}

export function assertStateAccess(user: AuthUser, state: string): void {
  if (!canAccessState(user, state)) {
    throw new Error('You do not have access to records in this state.')
  }
}
