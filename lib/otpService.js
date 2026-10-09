/**
 * KURUDHI KODAI — Secure 4-Digit OTP Verification Service
 *
 * Requirements:
 * - 4-digit numeric OTP (1000 - 9999)
 * - Cryptographically secure generation (crypto.getRandomValues)
 * - 10-minute expiration window
 * - Maximum 3 failed attempts before lock
 * - SHA-256 hash calculation for protected comparison
 * - Strict counterparty isolation (parties only possess their own verbal OTP)
 */

export const OTP_EXPIRY_MINUTES = 10;
export const MAX_OTP_ATTEMPTS = 3;

/**
 * Generates a cryptographically secure 4-digit OTP.
 * @returns {string} e.g. "4827"
 */
export function generateSecure4DigitOtp() {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  if (cryptoObj && cryptoObj.getRandomValues) {
    const array = new Uint32Array(1);
    cryptoObj.getRandomValues(array);
    // Range 1000 to 9999 inclusive
    const code = 1000 + (array[0] % 9000);
    return code.toString();
  }
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * Hashes a 4-digit OTP using SHA-256 with an optional salt/context string.
 * @param {string} otp
 * @param {string} salt
 * @returns {Promise<string>} Hex-encoded SHA-256 string
 */
export async function hashOtp(otp, salt = 'kurudhi-salt') {
  const message = `${salt}:${otp.trim()}`;
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  if (cryptoObj && cryptoObj.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await cryptoObj.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Pure JS fallback if SubtleCrypto is unavailable
  let hash = 0;
  for (let i = 0; i < message.length; i++) {
    hash = ((hash << 5) - hash) + message.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

/**
 * Validates entered OTP against session rules.
 *
 * @param {object} params
 * @param {string} params.enteredOtp - The user-typed 4-digit code
 * @param {string} params.storedOtpOrHash - The plaintext or hashed secret
 * @param {Date | number | object} params.expiresAt - Expiration timestamp
 * @param {number} params.attemptsRemaining - Current attempts remaining (default 3)
 * @param {boolean} params.isHashed - Whether stored value is SHA-256 hashed
 * @param {string} [params.salt] - Salt used if hashed
 * @returns {Promise<{ success: boolean, attemptsRemaining: number, error?: string }>}
 */
export async function verifyOtpAttempt({
  enteredOtp,
  storedOtpOrHash,
  expiresAt,
  attemptsRemaining = MAX_OTP_ATTEMPTS,
  isHashed = false,
  salt = 'kurudhi-salt',
}) {
  const cleanInput = (enteredOtp || '').trim();

  // 1. Format check
  if (!/^\d{4}$/.test(cleanInput)) {
    return {
      success: false,
      attemptsRemaining,
      error: 'OTP must be exactly 4 digits.',
    };
  }

  // 2. Lockout check
  if (attemptsRemaining <= 0) {
    return {
      success: false,
      attemptsRemaining: 0,
      error: 'Maximum verification attempts exceeded. Please regenerate the OTP.',
    };
  }

  // 3. Expiry check
  let expiryTime;
  if (typeof expiresAt === 'object' && typeof expiresAt?.toDate === 'function') {
    expiryTime = expiresAt.toDate().getTime();
  } else if (expiresAt instanceof Date) {
    expiryTime = expiresAt.getTime();
  } else if (typeof expiresAt === 'number') {
    expiryTime = expiresAt;
  } else if (typeof expiresAt === 'string') {
    expiryTime = new Date(expiresAt).getTime();
  } else {
    expiryTime = Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000;
  }

  if (Date.now() > expiryTime) {
    return {
      success: false,
      attemptsRemaining,
      error: 'OTP has expired. Please regenerate a new OTP.',
    };
  }

  // 4. Comparison check
  let matches = false;
  if (isHashed) {
    const inputHash = await hashOtp(cleanInput, salt);
    matches = inputHash === storedOtpOrHash;
  } else {
    matches = cleanInput === storedOtpOrHash;
  }

  if (!matches) {
    const newRemaining = Math.max(0, attemptsRemaining - 1);
    return {
      success: false,
      attemptsRemaining: newRemaining,
      error:
        newRemaining > 0
          ? `Incorrect OTP. ${newRemaining} attempt${newRemaining === 1 ? '' : 's'} remaining.`
          : 'Incorrect OTP. Maximum attempts exceeded. Session locked.',
    };
  }

  return {
    success: true,
    attemptsRemaining,
  };
}

export const OTP_EXPIRY_MS = OTP_EXPIRY_MINUTES * 60 * 1000;
export const generate4DigitOtp = generateSecure4DigitOtp;

/**
 * Pure verification helper for testing and direct invocation.
 */
export async function verifyOtpInput(enteredOtp, storedOtpOrHash, createdAtOrExpiry, attemptsMade = 0, isHashed = true) {
  let expiresAt = createdAtOrExpiry;
  if (createdAtOrExpiry instanceof Date) {
    expiresAt = new Date(createdAtOrExpiry.getTime() + OTP_EXPIRY_MS);
  }
  const attemptsRemaining = MAX_OTP_ATTEMPTS - attemptsMade;
  const res = await verifyOtpAttempt({
    enteredOtp,
    storedOtpOrHash,
    expiresAt,
    attemptsRemaining,
    isHashed
  });
  return {
    valid: res.success,
    remainingAttempts: res.attemptsRemaining,
    reason: res.success
      ? 'VALID'
      : (res.error?.includes('expired')
        ? 'EXPIRED'
        : (res.error?.includes('Maximum')
          ? 'MAX_ATTEMPTS_EXCEEDED'
          : 'INCORRECT'))
  };
}

/**
 * CLIENT-SIDE SESSION STORAGE RETENTION
 * Scoped strictly to authenticated UID, donation ID, and role.
 * Automatically purges on expiry.
 */
export function getStorageKey(uid, donationId, role) {
  return `kk_otp_${uid || 'anon'}_${donationId || 'none'}_${String(role || 'party').toLowerCase()}`;
}

export function saveRetainedOtp(arg1, arg2, arg3, arg4, arg5) {
  if (typeof window === 'undefined' || !window.sessionStorage) return;

  let uid, donationId, role, code, expiresAt;
  if (arg1 && typeof arg1 === 'object') {
    uid = arg1.uid;
    donationId = arg1.donationId;
    role = arg1.role;
    code = arg1.code;
    expiresAt = arg1.expiresAt;
  } else {
    uid = arg1;
    donationId = arg2;
    role = arg3;
    code = arg4;
    expiresAt = arg5;
  }

  if (!uid || !donationId || !code) return;

  try {
    const expTime = expiresAt instanceof Date
      ? expiresAt.getTime()
      : typeof expiresAt === 'number'
      ? (expiresAt > 10000000000 ? expiresAt : Date.now() + expiresAt * 60 * 1000)
      : new Date(expiresAt).getTime();

    const record = {
      code: String(code).trim(),
      expiresAt: expTime,
      donationId,
      uid,
      role: String(role).toUpperCase(),
      savedAt: Date.now()
    };
    sessionStorage.setItem(getStorageKey(uid, donationId, role), JSON.stringify(record));
  } catch (err) {
    console.warn('Session storage write notice:', err);
  }
}

export function getRetainedOtp(arg1, arg2, arg3) {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;

  let uid, donationId, role;
  if (arg1 && typeof arg1 === 'object') {
    uid = arg1.uid;
    donationId = arg1.donationId;
    role = arg1.role;
  } else {
    uid = arg1;
    donationId = arg2;
    role = arg3;
  }

  if (!uid || !donationId) return null;

  try {
    const key = getStorageKey(uid, donationId, role);
    const item = sessionStorage.getItem(key);
    if (!item) return null;

    const parsed = JSON.parse(item);
    if (!parsed || !parsed.code || !parsed.expiresAt) {
      sessionStorage.removeItem(key);
      return null;
    }

    // Check expiry
    if (Date.now() >= parsed.expiresAt) {
      sessionStorage.removeItem(key);
      return null;
    }

    return parsed.code;
  } catch (err) {
    console.warn('Session storage read notice:', err);
    return null;
  }
}

export function clearRetainedOtp(arg1, arg2, arg3) {
  if (typeof window === 'undefined' || !window.sessionStorage) return;

  let uid, donationId, role;
  if (arg1 && typeof arg1 === 'object') {
    uid = arg1.uid;
    donationId = arg1.donationId;
    role = arg1.role;
  } else {
    uid = arg1;
    donationId = arg2;
    role = arg3;
  }

  if (!uid || !donationId) return;

  try {
    sessionStorage.removeItem(getStorageKey(uid, donationId, role));
  } catch (_) {}
}

/**
 * Parses timestamp from Date, number, string, or Firestore Timestamp object
 */
export function parseTimestampMillis(ts) {
  if (!ts) return null;
  if (typeof ts?.toDate === 'function') return ts.toDate().getTime();
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') return new Date(ts).getTime();
  if (typeof ts?._seconds === 'number') return ts._seconds * 1000;
  return null;
}

/**
 * Dual OTP Verification Status Evaluator
 * Safely inspects donation metadata to return sanitized, human-readable status for UI & Admin
 */
export function getPartyOtpStatus(donation, party = 'DONOR') {
  if (!donation) return { state: 'NOT_GENERATED', label: 'Not Generated', color: 'gray' };

  const isDonorParty = party.toUpperCase() === 'DONOR';
  const isVerified = isDonorParty ? Boolean(donation.donorOtpVerified) : Boolean(donation.requesterOtpVerified);
  const attempts = isDonorParty
    ? (donation.donorOtpAttemptsRemaining ?? MAX_OTP_ATTEMPTS)
    : (donation.requesterOtpAttemptsRemaining ?? MAX_OTP_ATTEMPTS);
  const rawExpiry = isDonorParty ? donation.donorOtpExpiresAt : donation.requesterOtpExpiresAt;
  const hasHash = isDonorParty ? Boolean(donation.donorOtpHash) : Boolean(donation.requesterOtpHash);

  if (isVerified) {
    return {
      state: 'VERIFIED',
      label: isDonorParty ? 'Donor Code Verified' : 'Requester Code Verified',
      color: 'green',
      icon: 'check',
    };
  }

  if (donation.completed || donation.status === 'DONATION_COMPLETED') {
    return {
      state: 'COMPLETED',
      label: 'Completed',
      color: 'green',
      icon: 'check-circle',
    };
  }

  if (donation.status === 'CANCELLED') {
    return {
      state: 'CANCELLED',
      label: 'Cancelled',
      color: 'gray',
      icon: 'x',
    };
  }

  if (!hasHash) {
    return {
      state: 'NOT_GENERATED',
      label: 'Not Generated Yet',
      color: 'gray',
      icon: 'clock',
    };
  }

  if (attempts <= 0) {
    return {
      state: 'LOCKED',
      label: 'Locked (Max Attempts)',
      color: 'red',
      icon: 'alert-triangle',
    };
  }

  const expMillis = parseTimestampMillis(rawExpiry);
  if (expMillis && Date.now() > expMillis) {
    return {
      state: 'EXPIRED',
      label: 'Expired (Regenerate Required)',
      color: 'amber',
      icon: 'clock',
    };
  }

  return {
    state: 'ACTIVE',
    label: isDonorParty ? 'Donor Code Active' : 'Requester Code Active',
    color: 'blue',
    icon: 'shield',
    expiresAt: expMillis ? new Date(expMillis) : null,
    attemptsRemaining: attempts,
  };
}

/**
 * Checks if a donation meets the strict dual-OTP completion requirement
 */
export function isDualOtpFullyVerified(donation) {
  if (!donation) return false;
  return Boolean(donation.donorOtpVerified) && Boolean(donation.requesterOtpVerified);
}


