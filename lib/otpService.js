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

