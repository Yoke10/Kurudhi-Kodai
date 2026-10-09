/**
 * KURUDHI KODAI — Donation State Machine
 */

export const DONATION_STATES = {
  DONOR_MATCHED: 'DONOR_MATCHED',
  DONOR_ACCEPTED: 'DONOR_ACCEPTED',
  CONTACT_ESTABLISHED: 'CONTACT_ESTABLISHED',
  OTP_PENDING: 'OTP_PENDING',
  DONOR_CONFIRMED: 'DONOR_CONFIRMED',
  REQUESTER_CONFIRMED: 'REQUESTER_CONFIRMED',
  DONATION_COMPLETED: 'DONATION_COMPLETED',
  CANCELLED: 'CANCELLED',
};

export const ALLOWED_DONATION_TRANSITIONS = {
  [DONATION_STATES.DONOR_MATCHED]: [
    DONATION_STATES.DONOR_ACCEPTED,
    DONATION_STATES.CANCELLED,
  ],
  [DONATION_STATES.DONOR_ACCEPTED]: [
    DONATION_STATES.CONTACT_ESTABLISHED,
    DONATION_STATES.OTP_PENDING,
    DONATION_STATES.CANCELLED,
  ],
  [DONATION_STATES.CONTACT_ESTABLISHED]: [
    DONATION_STATES.OTP_PENDING,
    DONATION_STATES.CANCELLED,
  ],
  [DONATION_STATES.OTP_PENDING]: [
    DONATION_STATES.DONOR_CONFIRMED,
    DONATION_STATES.REQUESTER_CONFIRMED,
    DONATION_STATES.DONATION_COMPLETED,
    DONATION_STATES.CANCELLED,
  ],
  [DONATION_STATES.DONOR_CONFIRMED]: [
    DONATION_STATES.DONATION_COMPLETED,
    DONATION_STATES.CANCELLED,
  ],
  [DONATION_STATES.REQUESTER_CONFIRMED]: [
    DONATION_STATES.DONATION_COMPLETED,
    DONATION_STATES.CANCELLED,
  ],
  [DONATION_STATES.DONATION_COMPLETED]: [],
  [DONATION_STATES.CANCELLED]: [],
};

export function normalizeDonationStatus(rawStatus) {
  if (!rawStatus) return DONATION_STATES.OTP_PENDING;
  const s = String(rawStatus).trim().toUpperCase();

  switch (s) {
    case 'MATCHED':
    case 'DONOR_MATCHED':
      return DONATION_STATES.DONOR_MATCHED;
    case 'ACCEPTED':
    case 'DONOR_ACCEPTED':
      return DONATION_STATES.DONOR_ACCEPTED;
    case 'CONTACT_ESTABLISHED':
      return DONATION_STATES.CONTACT_ESTABLISHED;
    case 'OTP_PENDING':
    case 'PENDING':
      return DONATION_STATES.OTP_PENDING;
    case 'DONOR_CONFIRMED':
      return DONATION_STATES.DONOR_CONFIRMED;
    case 'REQUESTER_CONFIRMED':
      return DONATION_STATES.REQUESTER_CONFIRMED;
    case 'COMPLETED':
    case 'DONATION_COMPLETED':
      return DONATION_STATES.DONATION_COMPLETED;
    case 'CANCELLED':
    case 'CANCELED':
      return DONATION_STATES.CANCELLED;
    default:
      return DONATION_STATES.OTP_PENDING;
  }
}

export function isValidDonationTransition(current, next) {
  const normCurrent = normalizeDonationStatus(current);
  const normNext = normalizeDonationStatus(next);

  if (normCurrent === normNext) return true;

  const allowed = ALLOWED_DONATION_TRANSITIONS[normCurrent];
  return Boolean(allowed && allowed.includes(normNext));
}

/**
 * Definitive list of active, non-terminal ongoing donation states
 */
export const ACTIVE_DONATION_STATES = [
  DONATION_STATES.DONOR_MATCHED,
  DONATION_STATES.DONOR_ACCEPTED,
  DONATION_STATES.CONTACT_ESTABLISHED,
  DONATION_STATES.OTP_PENDING,
  DONATION_STATES.DONOR_CONFIRMED,
  DONATION_STATES.REQUESTER_CONFIRMED,
];

export const TERMINAL_DONATION_STATES = [
  DONATION_STATES.DONATION_COMPLETED,
  DONATION_STATES.CANCELLED,
];

/**
 * Checks if a donation record represents an active ongoing commitment
 * @param {object | string} donationOrStatus
 * @returns {boolean}
 */
export function isDonationActive(donationOrStatus) {
  if (!donationOrStatus) return false;
  if (typeof donationOrStatus === 'object') {
    if (donationOrStatus.completed === true) return false;
    const status = normalizeDonationStatus(donationOrStatus.status);
    if (status === DONATION_STATES.DONATION_COMPLETED || status === DONATION_STATES.CANCELLED) {
      return false;
    }
    return ACTIVE_DONATION_STATES.includes(status);
  }
  const status = normalizeDonationStatus(donationOrStatus);
  return ACTIVE_DONATION_STATES.includes(status);
}

/**
 * Checks if a donation record is successfully finalized and completed
 * @param {object | string} donationOrStatus
 * @returns {boolean}
 */
export function isDonationCompleted(donationOrStatus) {
  if (!donationOrStatus) return false;
  if (typeof donationOrStatus === 'object') {
    if (donationOrStatus.completed === true) return true;
    return normalizeDonationStatus(donationOrStatus.status) === DONATION_STATES.DONATION_COMPLETED;
  }
  return normalizeDonationStatus(donationOrStatus) === DONATION_STATES.DONATION_COMPLETED;
}

/**
 * Checks if a donation record has been cancelled
 * @param {object | string} donationOrStatus
 * @returns {boolean}
 */
export function isDonationCancelled(donationOrStatus) {
  if (!donationOrStatus) return false;
  const status = typeof donationOrStatus === 'object'
    ? normalizeDonationStatus(donationOrStatus.status)
    : normalizeDonationStatus(donationOrStatus);
  return status === DONATION_STATES.CANCELLED;
}

/**
 * Validates if a donation is in an active state that permits cancellation
 * @param {object | string} donationOrStatus
 * @returns {boolean}
 */
export function isDonationCancellable(donationOrStatus) {
  return isDonationActive(donationOrStatus);
}
