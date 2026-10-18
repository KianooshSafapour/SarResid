/**
 * Section/page role gates mirrored from the live AppShell permission map
 * (chunk f58febe0f4682bee.js — WORKSPACES + per-page map).
 * Managers (OWNER/GM/ADMIN) can always access everything.
 */
export const MANAGER_ROLES = ['OWNER', 'GM', 'ADMIN', 'EXEC'] // isManager()

function allowed(role: string | undefined | null, roles: string[]): boolean {
  if (!role) return false
  if (roles.includes('*')) return true
  return MANAGER_ROLES.slice(0, 3).includes(role) || roles.includes(role)
}

export const STORE_ROLES = {
  floorplan: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'SK', 'MERCH'],
  planograms: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'MERCH', 'SK'],
  zones: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'MERCH', 'SK'],
  pricecheck: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM'],
  waste: ['OWNER', 'GM', 'ADMIN', 'EXEC', 'PM', 'SK', 'MERCH'],
}

export const canFloorplan = (role?: string | null) => allowed(role, STORE_ROLES.floorplan)
export const canPlanogram = (role?: string | null) => allowed(role, STORE_ROLES.planograms)
export const canZones = (role?: string | null) => allowed(role, STORE_ROLES.zones)
export const canPriceCheck = (role?: string | null) => allowed(role, STORE_ROLES.pricecheck)
export const canWaste = (role?: string | null) => allowed(role, STORE_ROLES.waste)

/** hr/personnel page: OWNER/GM/ADMIN only */
export const canPersonnel = (role?: string | null) => !!role && ['OWNER', 'GM', 'ADMIN'].includes(role)
/** hr/shifts page: OWNER/GM/ADMIN/EXEC */
export const canShifts = (role?: string | null) => !!role && ['OWNER', 'GM', 'ADMIN', 'EXEC'].includes(role)
/** hr/leaves page: everyone (self-service + manager approvals) */
export const canLeaves = (role?: string | null) => !!role
/** hr/payroll page: OWNER/GM/ADMIN (managePayroll capability) */
export const canPayroll = (role?: string | null) => !!role && ['OWNER', 'GM', 'ADMIN'].includes(role)

/** reports section: OWNER/GM/ADMIN/EXEC/ACC/PM */
export const canReports = (role?: string | null) => allowed(role, ['OWNER', 'GM', 'ADMIN', 'EXEC', 'ACC', 'PM'])

/** system section: OWNER/GM/ADMIN */
export const canSystem = (role?: string | null) => !!role && ['OWNER', 'GM', 'ADMIN'].includes(role)
/** admin/settings PUT: OWNER/ADMIN (live client gate) */
export const canSettingsWrite = (role?: string | null) => !!role && ['OWNER', 'ADMIN'].includes(role)
