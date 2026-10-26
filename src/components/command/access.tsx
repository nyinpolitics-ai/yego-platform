import { useEffect, useMemo, useState } from 'react'
import { KeyRound, Plus, Search, ShieldCheck, UserRound } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/yego/fields'
import { createCommandUser, listCommandUsers, setUserActive, setUserRole, type CommandUserRow } from '@/lib/demo-store'
import { ROLES } from '@/lib/fixtures'
import { fmtDate, timeAgo } from '@/lib/format'
import { CAPABILITY_LABELS, ROLE_MATRIX, type Capability } from '@/lib/permissions'
import { STATES, ZONES } from '@/lib/nigeria'
import { useDB } from '@/lib/demo-store'
import { cn } from '@/lib/utils'
import { StatCard } from './shared'

const COMMAND_ROLE_OPTIONS = [
  'Super Administrator',
  'National YEGO Administrator',
  'Regional Coordinator',
  'State Coordinator',
  'LGA Coordinator',
  'Verification Officer',
  'Training Officer',
] as const

const ZONE_NAMES = ZONES as readonly string[]

function scopeLabelFor(user: CommandUserRow): string {
  switch (user.scopeKind) {
    case 'national':
      return 'National'
    case 'zone':
      return `${user.scopeZone ?? 'Zone'} zone`
    case 'state':
      return `${user.scopeState ?? 'State'} State`
    case 'lga':
      return `${user.scopeLga ?? 'LGA'}, ${user.scopeState ?? ''}`
    case 'training':
      return 'Training Centre'
    default:
      return user.scopeKind
  }
}

export function AccessView() {
  const { session } = useDB()
  const [users, setUsers] = useState<CommandUserRow[] | null>(null)
  const [q, setQ] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [roleEdit, setRoleEdit] = useState<CommandUserRow | null>(null)

  async function load() {
    try {
      setUsers(await listCommandUsers())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load accounts.')
      setUsers([])
    }
  }

  useEffect(() => {
    let cancelled = false
    listCommandUsers()
      .then((rows) => {
        if (!cancelled) setUsers(rows)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Could not load accounts.')
          setUsers([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    if (!users) return []
    const needle = q.trim().toLowerCase()
    return users.filter((u) => !needle || `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(needle))
  }, [users, q])

  const active = users?.filter((u) => u.active).length ?? 0
  const superAdmins = users?.filter((u) => u.role === 'Super Administrator' && u.active).length ?? 0

  return (
    <div className="space-y-4">
      <section aria-label="Access summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Command accounts" value={users?.length ?? '…'} tone="primary" />
        <StatCard label="Active" value={active} />
        <StatCard label="Super Administrators" value={superAdmins} sub="must always be ≥ 1 active" />
        <StatCard label="Roles defined" value={ROLES.length} sub="9 roles in the access matrix" />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="relative w-64 text-xs font-semibold">
          Search
          <Search className="absolute bottom-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            className="mt-1 h-9 pl-8"
            placeholder="Name, email or role"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus /> Create Command account
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[54rem] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="p-3 font-semibold">Account</th>
              <th className="p-3 font-semibold">Role</th>
              <th className="p-3 font-semibold">Scope</th>
              <th className="p-3 font-semibold">Last seen</th>
              <th className="p-3 font-semibold">Status</th>
              <th className="p-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((u) => (
              <tr key={u.id} className={cn(!u.active && 'opacity-60')}>
                <td className="p-3">
                  <p className="font-semibold">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </td>
                <td className="p-3">
                  <span className="font-medium">{u.role}</span>
                </td>
                <td className="p-3 text-xs">{scopeLabelFor(u)}</td>
                <td className="p-3 text-xs text-muted-foreground">
                  {u.lastSeenAt ? timeAgo(u.lastSeenAt) : 'Never signed in'}
                </td>
                <td className="p-3">
                  {u.active ? (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Deactivated
                    </Badge>
                  )}
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => setRoleEdit(u)}>
                      <UserRound /> Role
                    </Button>
                    {u.email === session?.email ? (
                      <Button size="sm" variant="ghost" disabled title="You cannot deactivate your own account">
                        Deactivate
                      </Button>
                    ) : u.active ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-700 hover:bg-red-50 hover:text-red-800"
                        onClick={() => {
                          void setUserActive(u.id, false)
                            .then(() => {
                              toast.success(`${u.name} deactivated.`)
                              return load()
                            })
                            .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Failed.'))
                        }}
                      >
                        Deactivate
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          void setUserActive(u.id, true)
                            .then(() => {
                              toast.success(`${u.name} re-activated.`)
                              return load()
                            })
                            .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Failed.'))
                        }}
                      >
                        Re-activate
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {users && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  No accounts match that search.
                </td>
              </tr>
            )}
            {!users && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  Loading accounts…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="rounded-lg border bg-card p-4 sm:p-5">
        <h2 className="flex items-center gap-2 font-bold">
          <ShieldCheck className="size-4 text-primary" /> Capability matrix
        </h2>
        <p className="text-xs text-muted-foreground">
          Capabilities are enforced in the server repository, not only in the UI.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(ROLE_MATRIX).map(([role, caps]) => (
            <div key={role} className="rounded-md border p-3">
              <p className="text-sm font-bold">{role}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {(caps as Capability[]).map((cap) => (
                  <span key={cap} className="rounded-full border bg-muted px-2 py-0.5 text-[11px] font-medium">
                    {CAPABILITY_LABELS[cap]}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          void load()
        }}
      />
      {roleEdit && (
        <RoleDialog
          user={roleEdit}
          onClose={() => setRoleEdit(null)}
          onSaved={() => {
            setRoleEdit(null)
            void load()
          }}
        />
      )}
    </div>
  )
}

function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<string>('State Coordinator')
  const [scopeZone, setScopeZone] = useState('')
  const [scopeState, setScopeState] = useState('')
  const [scopeLga, setScopeLga] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [generated, setGenerated] = useState<string | null>(null)

  const lgas = STATES.find((s) => s.name === scopeState)?.lgas ?? []
  const needsZone = role === 'Regional Coordinator'
  const needsState = role === 'State Coordinator' || role === 'LGA Coordinator'
  const needsLga = role === 'LGA Coordinator'

  function reset() {
    setName('')
    setEmail('')
    setRole('State Coordinator')
    setScopeZone('')
    setScopeState('')
    setScopeLga('')
    setPassword('')
    setGenerated(null)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) reset()
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Command account</DialogTitle>
          <DialogDescription>
            The scope is derived from the role. Leave the password empty to have a strong one generated and shown once.
          </DialogDescription>
        </DialogHeader>

        {generated ? (
          <div className="space-y-3">
            <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
              <p className="font-semibold">Account created.</p>
              <p className="mt-1">
                One-time password for <strong>{email}</strong>:
              </p>
              <code className="mt-1 block select-all rounded bg-white px-2 py-1 font-mono text-sm">{generated}</code>
              <p className="mt-2 text-xs">Copy it now: it is not stored in plain text and cannot be shown again.</p>
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  reset()
                  onCreated()
                  onOpenChange(false)
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="grid gap-3">
              <label className="text-xs font-semibold">
                Full name
                <Input
                  className="mt-1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Amina Yusuf"
                  maxLength={120}
                />
              </label>
              <label className="text-xs font-semibold">
                Email
                <Input
                  className="mt-1"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@yego.ng"
                  maxLength={200}
                />
              </label>
              <label className="text-xs font-semibold">
                Role
                <NativeSelect
                  className="mt-1"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  options={[...COMMAND_ROLE_OPTIONS]}
                />
              </label>
              {needsZone && (
                <label className="text-xs font-semibold">
                  Geopolitical zone
                  <NativeSelect
                    className="mt-1"
                    placeholder="Select a zone"
                    value={scopeZone}
                    onChange={(e) => setScopeZone(e.target.value)}
                    options={[...ZONE_NAMES]}
                  />
                </label>
              )}
              {needsState && (
                <label className="text-xs font-semibold">
                  State
                  <NativeSelect
                    className="mt-1"
                    placeholder="Select a state"
                    value={scopeState}
                    onChange={(e) => {
                      setScopeState(e.target.value)
                      setScopeLga('')
                    }}
                    options={STATES.map((s) => s.name)}
                  />
                </label>
              )}
              {needsLga && (
                <label className="text-xs font-semibold">
                  LGA
                  <NativeSelect
                    className="mt-1"
                    placeholder={scopeState ? 'All LGAs' : 'Select a state first'}
                    value={scopeLga}
                    onChange={(e) => setScopeLga(e.target.value)}
                    options={lgas}
                    disabled={!lgas.length}
                  />
                </label>
              )}
              <label className="text-xs font-semibold">
                Password{' '}
                <span className="font-normal text-muted-foreground">(optional; leave empty to auto-generate)</span>
                <Input
                  className="mt-1"
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 10 characters"
                  maxLength={200}
                />
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                disabled={busy || !name.trim() || !email.trim()}
                onClick={() => {
                  setBusy(true)
                  void createCommandUser({
                    name,
                    email,
                    role,
                    scopeZone: needsZone ? scopeZone : undefined,
                    scopeState: needsState ? scopeState : undefined,
                    scopeLga: needsLga ? scopeLga : undefined,
                    password: password ? password : undefined,
                  })
                    .then((result) => {
                      setGenerated(result.generatedPassword ?? null)
                      if (result.generatedPassword) return
                      toast.success('Account created.')
                      reset()
                      onCreated()
                      onOpenChange(false)
                    })
                    .catch((error: unknown) =>
                      toast.error(error instanceof Error ? error.message : 'Could not create the account.'),
                    )
                    .finally(() => setBusy(false))
                }}
              >
                <KeyRound /> Create account
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function RoleDialog({ user, onClose, onSaved }: { user: CommandUserRow; onClose: () => void; onSaved: () => void }) {
  const [role, setRole] = useState(user.role)
  const [scopeZone, setScopeZone] = useState(user.scopeZone ?? '')
  const [scopeState, setScopeState] = useState(user.scopeState ?? '')
  const [scopeLga, setScopeLga] = useState(user.scopeLga ?? '')
  const [busy, setBusy] = useState(false)

  const lgas = STATES.find((s) => s.name === scopeState)?.lgas ?? []
  const needsZone = role === 'Regional Coordinator'
  const needsState = role === 'State Coordinator' || role === 'LGA Coordinator'
  const needsLga = role === 'LGA Coordinator'
  const changed =
    role !== user.role ||
    (needsZone && scopeZone !== (user.scopeZone ?? '')) ||
    (needsState && scopeState !== (user.scopeState ?? '')) ||
    (needsLga && scopeLga !== (user.scopeLga ?? ''))

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Change role: {user.name}</DialogTitle>
          <DialogDescription>
            Current: <strong>{user.role}</strong> · {scopeLabelFor(user)}. Changing the role updates the geographic
            scope to match.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="text-xs font-semibold">
            Role
            <NativeSelect
              className="mt-1"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              options={[...COMMAND_ROLE_OPTIONS]}
            />
          </label>
          {needsZone && (
            <label className="text-xs font-semibold">
              Geopolitical zone
              <NativeSelect
                className="mt-1"
                placeholder="Select a zone"
                value={scopeZone}
                onChange={(e) => setScopeZone(e.target.value)}
                options={[...ZONE_NAMES]}
              />
            </label>
          )}
          {needsState && (
            <label className="text-xs font-semibold">
              State
              <NativeSelect
                className="mt-1"
                placeholder="Select a state"
                value={scopeState}
                onChange={(e) => {
                  setScopeState(e.target.value)
                  setScopeLga('')
                }}
                options={STATES.map((s) => s.name)}
              />
            </label>
          )}
          {needsLga && (
            <label className="text-xs font-semibold">
              LGA
              <NativeSelect
                className="mt-1"
                placeholder={scopeState ? 'All LGAs' : 'Select a state first'}
                value={scopeLga}
                onChange={(e) => setScopeLga(e.target.value)}
                options={lgas}
                disabled={!lgas.length}
              />
            </label>
          )}
          <p className="text-xs text-muted-foreground">
            Joined {fmtDate(user.createdAt)}. The change takes effect immediately and is written to the audit log.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !changed}
            onClick={() => {
              setBusy(true)
              void setUserRole(user.id, role, {
                scopeZone: needsZone ? scopeZone : undefined,
                scopeState: needsState ? scopeState : undefined,
                scopeLga: needsLga ? scopeLga : undefined,
              })
                .then(() => {
                  toast.success(`${user.name} is now ${role}.`)
                  onSaved()
                })
                .catch((error: unknown) =>
                  toast.error(error instanceof Error ? error.message : 'Could not update the role.'),
                )
                .finally(() => setBusy(false))
            }}
          >
            Save role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
