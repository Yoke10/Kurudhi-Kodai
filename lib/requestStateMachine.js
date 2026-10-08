/**
 * KURUDHI KODAI — Blood Request State Machine & Unit Management
 */

export const REQUEST_STATES = {
  SUBMITTED: 'SUBMITTED',
  ACTIVE: 'ACTIVE',
  MATCHING: 'MATCHING',
  PARTIALLY_FULFILLED: 'PARTIALLY_FULFILLED',
  FULFILLED: 'FULFILLED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
};

// Map of allowed transitions from current state -> set of next states
export const ALLOWED_REQUEST_TRANSITIONS = {
  [REQUEST_STATES.SUBMITTED]: [
    REQUEST_STATES.ACTIVE,
    REQUEST_STATES.REJECTED,
    REQUEST_STATES.CANCELLED,
  ],
  [REQUEST_STATES.ACTIVE]: [
    REQUEST_STATES.MATCHING,
    REQUEST_STATES.PARTIALLY_FULFILLED,
    REQUEST_STATES.FULFILLED,
    REQUEST_STATES.CANCELLED,
    REQUEST_STATES.EXPIRED,
  ],
  [REQUEST_STATES.MATCHING]: [
    REQUEST_STATES.PARTIALLY_FULFILLED,
    REQUEST_STATES.FULFILLED,
    REQUEST_STATES.CANCELLED,
    REQUEST_STATES.EXPIRED,
  ],
  [REQUEST_STATES.PARTIALLY_FULFILLED]: [
    REQUEST_STATES.FULFILLED,
    REQUEST_STATES.EXPIRED,
    REQUEST_STATES.CANCELLED,
  ],
  [REQUEST_STATES.FULFILLED]: [],
  [REQUEST_STATES.EXPIRED]: [],
  [REQUEST_STATES.CANCELLED]: [],
  [REQUEST_STATES.REJECTED]: [],
};

/**
 * Normalizes legacy or mixed status strings to canonical REQUEST_STATES
 * @param {string} rawStatus
 * @returns {string}
 */
export function normalizeRequestStatus(rawStatus) {
  if (!rawStatus) return REQUEST_STATES.SUBMITTED;
  const s = String(rawStatus).trim().toUpperCase();

  switch (s) {
    case 'RECEIVED':
    case 'PENDING':
    case 'SUBMITTED':
      return REQUEST_STATES.SUBMITTED;
    case 'ACCEPTED':
    case 'ACTIVE':
    case 'VERIFIED':
      return REQUEST_STATES.ACTIVE;
    case 'MATCHING':
      return REQUEST_STATES.MATCHING;
    case 'PARTIALLY_FULFILLED':
      return REQUEST_STATES.PARTIALLY_FULFILLED;
    case 'COMPLETED':
    case 'FULFILLED':
      return REQUEST_STATES.FULFILLED;
    case 'REJECTED':
      return REQUEST_STATES.REJECTED;
    case 'CANCELLED':
    case 'CANCELED':
      return REQUEST_STATES.CANCELLED;
    case 'EXPIRED':
      return REQUEST_STATES.EXPIRED;
    default:
      return REQUEST_STATES.SUBMITTED;
  }
}

/**
 * Validates whether transition from currentState to nextState is legally allowed.
 * @param {string} current
 * @param {string} next
 * @returns {boolean}
 */
export function isValidRequestTransition(current, next) {
  const normCurrent = normalizeRequestStatus(current);
  const normNext = normalizeRequestStatus(next);

  if (normCurrent === normNext) return true; // Idempotent

  const allowed = ALLOWED_REQUEST_TRANSITIONS[normCurrent];
  return Boolean(allowed && allowed.includes(normNext));
}

/**
 * Checks if a blood request is currently open for donor matching and pledges.
 * @param {object} request
 * @returns {boolean}
 */
export function isRequestAcceptingDonors(request) {
  if (!request) return false;
  const status = normalizeRequestStatus(request.status || request.Verified);

  if (
    status === REQUEST_STATES.FULFILLED ||
    status === REQUEST_STATES.EXPIRED ||
    status === REQUEST_STATES.CANCELLED ||
    status === REQUEST_STATES.REJECTED
  ) {
    return false;
  }

  // Check expiration timestamp
  const expiresAt = request.expiresAt;
  if (expiresAt) {
    const expireDate = typeof expiresAt.toDate === 'function' ? expiresAt.toDate() : new Date(expiresAt);
    if (!isNaN(expireDate.getTime()) && expireDate < new Date()) {
      return false;
    }
  }

  // Check units
  const unitsNeeded = parseInt(request.unitsNeeded || request.UnitsNeeded || 0, 10);
  const unitsDonated = parseInt(request.unitsDonated || request.UnitsDonated || 0, 10);
  if (unitsNeeded > 0 && unitsDonated >= unitsNeeded) {
    return false;
  }

  return status === REQUEST_STATES.ACTIVE || status === REQUEST_STATES.MATCHING || status === REQUEST_STATES.PARTIALLY_FULFILLED;
}

export const REQUEST_STATUS = REQUEST_STATES;
export const canTransitionRequest = isValidRequestTransition;
export const getNextRequestStatuses = (current) => ALLOWED_REQUEST_TRANSITIONS[normalizeRequestStatus(current)] || [];
export const isRequestOpenForMatching = (statusOrReq) =>
  typeof statusOrReq === 'string'
    ? isRequestAcceptingDonors({ status: statusOrReq })
    : isRequestAcceptingDonors(statusOrReq);

