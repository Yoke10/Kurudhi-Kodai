/**
 * KURUDHI KODAI — Canonical Role & Capability Definitions
 *
 * System roles represent authorization privileges strictly:
 * - USER
 * - ADMIN
 * - SUPERADMIN
 *
 * DONOR is NOT a system role. Donor identity is a user capability/profile
 * stored under `donors/{uid}`.
 */

export const ROLES = {
  USER: 'USER',
  ADMIN: 'ADMIN',
  SUPERADMIN: 'SUPERADMIN',
};

export const ALL_ROLES = Object.values(ROLES);

/**
 * Normalizes any role input (legacy lowercase or mixed) to canonical uppercase system role.
 * Any legacy 'DONOR' or unprivileged value safely normalizes to 'USER'.
 * @param {string} role
 * @returns {string} e.g. 'USER', 'ADMIN', 'SUPERADMIN'
 */
export function normalizeRole(role) {
  if (!role) return ROLES.USER;
  const upper = String(role).trim().toUpperCase();
  if (upper === ROLES.SUPERADMIN) return ROLES.SUPERADMIN;
  if (upper === ROLES.ADMIN) return ROLES.ADMIN;
  // All other values including legacy 'DONOR', 'donor', 'USER', or unknown map to USER
  return ROLES.USER;
}

/**
 * Checks if a given role has administrative privileges (ADMIN or SUPERADMIN).
 * @param {string} role
 * @returns {boolean}
 */
export function isAdminRole(role) {
  const norm = normalizeRole(role);
  return norm === ROLES.ADMIN || norm === ROLES.SUPERADMIN;
}

/**
 * Checks if a given role is strictly superadmin.
 * @param {string} role
 * @returns {boolean}
 */
export function isSuperAdminRole(role) {
  return normalizeRole(role) === ROLES.SUPERADMIN;
}

/**
 * Checks if an entity has a valid donor profile capability.
 * @param {object|null|undefined} donorProfile
 * @returns {boolean}
 */
export function hasDonorProfile(donorProfile) {
  return Boolean(
    donorProfile &&
    (donorProfile.id || donorProfile.uid || donorProfile.name || donorProfile.Name || donorProfile.bloodGroup || donorProfile.BloodGroup)
  );
}

/**
 * Safely resolves an existing user document role during migration.
 * If user has legacy role 'DONOR', checks audit logs for an authoritative
 * previous privileged role before falling back to USER.
 * @param {object} userDocData
 * @param {Array<object>} auditLogs
 * @returns {string} canonical uppercase role
 */
export function resolveMigratedRole(userDocData, auditLogs = []) {
  if (!userDocData) return ROLES.USER;
  const rawRole = String(userDocData.role || '').trim().toUpperCase();
  if (rawRole === ROLES.SUPERADMIN || rawRole === ROLES.ADMIN) {
    return rawRole;
  }
  if (rawRole === 'DONOR' || rawRole === 'USER' || !rawRole) {
    // Check if audit logs record an authoritative previous privileged role
    if (Array.isArray(auditLogs) && auditLogs.length > 0) {
      for (const log of auditLogs) {
        const assignedRole = String(log.details?.role || log.metadata?.newRole || log.metadata?.role || '').trim().toUpperCase();
        if (assignedRole === ROLES.SUPERADMIN) return ROLES.SUPERADMIN;
        if (assignedRole === ROLES.ADMIN) return ROLES.ADMIN;
      }
    }
    return ROLES.USER;
  }
  return ROLES.USER;
}
