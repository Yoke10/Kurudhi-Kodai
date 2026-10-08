/**
 * KURUDHI KODAI — Canonical Role Definitions
 *
 * All platform roles MUST be uppercase with ZERO case inconsistency.
 */

export const ROLES = {
  USER: 'USER',
  DONOR: 'DONOR',
  ADMIN: 'ADMIN',
  SUPERADMIN: 'SUPERADMIN',
};

export const ALL_ROLES = Object.values(ROLES);

/**
 * Normalizes any role input (legacy lowercase or mixed) to canonical uppercase.
 * @param {string} role
 * @returns {string} e.g. 'USER', 'DONOR', 'ADMIN', 'SUPERADMIN'
 */
export function normalizeRole(role) {
  if (!role) return ROLES.USER;
  const upper = String(role).trim().toUpperCase();
  if (ALL_ROLES.includes(upper)) {
    return upper;
  }
  return ROLES.USER;
}

/**
 * Checks if a given role has administrative privileges.
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
