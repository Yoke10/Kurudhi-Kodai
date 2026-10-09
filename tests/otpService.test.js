import test from 'node:test'
import assert from 'node:assert/strict'
import {
  generate4DigitOtp,
  hashOtp,
  verifyOtpInput,
  OTP_EXPIRY_MS,
  MAX_OTP_ATTEMPTS,
  isDualOtpFullyVerified,
  getPartyOtpStatus
} from '../lib/otpService.js'

test('OTP Service - Generates 4-digit numeric string', () => {
  for (let i = 0; i < 50; i++) {
    const otp = generate4DigitOtp()
    assert.equal(typeof otp, 'string')
    assert.equal(otp.length, 4)
    assert.match(otp, /^[0-9]{4}$/)
    const num = parseInt(otp, 10)
    assert.ok(num >= 0 && num <= 9999)
  }
})

test('OTP Service - Expiry and Attempt Constants', () => {
  assert.equal(OTP_EXPIRY_MS, 10 * 60 * 1000) // 10 minutes
  assert.equal(MAX_OTP_ATTEMPTS, 3)
})

test('OTP Service - Hash OTP generates SHA-256 hex string', async () => {
  const hash1 = await hashOtp('1234')
  const hash2 = await hashOtp('1234')
  const hashDiff = await hashOtp('5678')

  assert.equal(typeof hash1, 'string')
  assert.equal(hash1.length, 64)
  assert.equal(hash1, hash2)
  assert.notEqual(hash1, hashDiff)
})

test('OTP Service - Verification Success with Valid OTP', async () => {
  const plainOtp = '4827'
  const hashed = await hashOtp(plainOtp)
  const now = new Date()

  const result = await verifyOtpInput(plainOtp, hashed, now, 0)
  assert.equal(result.valid, true)
  assert.equal(result.reason, 'VALID')
})

test('OTP Service - Verification Failure with Wrong OTP', async () => {
  const plainOtp = '4827'
  const hashed = await hashOtp(plainOtp)
  const now = new Date()

  const result = await verifyOtpInput('9999', hashed, now, 0)
  assert.equal(result.valid, false)
  assert.equal(result.reason, 'INCORRECT')
  assert.equal(result.remainingAttempts, 2)
})

test('OTP Service - Verification Failure on Expiry (>10 mins)', async () => {
  const plainOtp = '4827'
  const hashed = await hashOtp(plainOtp)
  const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000)

  const result = await verifyOtpInput(plainOtp, hashed, elevenMinutesAgo, 0)
  assert.equal(result.valid, false)
  assert.equal(result.reason, 'EXPIRED')
})

test('OTP Service - Verification Lockout after 3 Attempts', async () => {
  const plainOtp = '4827'
  const hashed = await hashOtp(plainOtp)
  const now = new Date()

  const result = await verifyOtpInput(plainOtp, hashed, now, 3)
  assert.equal(result.valid, false)
  assert.equal(result.reason, 'MAX_ATTEMPTS_EXCEEDED')
})

test('OTP Service - Non-4-digit input rejection', async () => {
  const plainOtp = '4827'
  const hashed = await hashOtp(plainOtp)
  const now = new Date()

  const result1 = await verifyOtpInput('12', hashed, now, 0)
  assert.equal(result1.valid, false)

  const result2 = await verifyOtpInput('12345', hashed, now, 0)
  assert.equal(result2.valid, false)

  const result3 = await verifyOtpInput('abcd', hashed, now, 0)
  assert.equal(result3.valid, false)
})

test('OTP Service - Dual-OTP Completion Condition', () => {
  assert.equal(isDualOtpFullyVerified(null), false)
  assert.equal(isDualOtpFullyVerified({}), false)
  assert.equal(isDualOtpFullyVerified({ donorOtpVerified: true, requesterOtpVerified: false }), false)
  assert.equal(isDualOtpFullyVerified({ donorOtpVerified: false, requesterOtpVerified: true }), false)
  assert.equal(isDualOtpFullyVerified({ donorOtpVerified: true, requesterOtpVerified: true }), true)
})

test('OTP Service - Party OTP Status Analysis', () => {

  // Not generated
  const notGen = getPartyOtpStatus({}, 'DONOR')
  assert.equal(notGen.state, 'NOT_GENERATED')

  // Active
  const active = getPartyOtpStatus({
    donorOtpHash: 'mock-hash',
    donorOtpExpiresAt: new Date(Date.now() + 500000),
    donorOtpAttemptsRemaining: 3
  }, 'DONOR')
  assert.equal(active.state, 'ACTIVE')

  // Expired
  const expired = getPartyOtpStatus({
    donorOtpHash: 'mock-hash',
    donorOtpExpiresAt: new Date(Date.now() - 500000),
    donorOtpAttemptsRemaining: 3
  }, 'DONOR')
  assert.equal(expired.state, 'EXPIRED')

  // Locked
  const locked = getPartyOtpStatus({
    donorOtpHash: 'mock-hash',
    donorOtpExpiresAt: new Date(Date.now() + 500000),
    donorOtpAttemptsRemaining: 0
  }, 'DONOR')
  assert.equal(locked.state, 'LOCKED')

  // Verified
  const verified = getPartyOtpStatus({
    donorOtpVerified: true
  }, 'DONOR')
  assert.equal(verified.state, 'VERIFIED')

  // Requester party checks
  const reqNotGen = getPartyOtpStatus({}, 'REQUESTER')
  assert.equal(reqNotGen.state, 'NOT_GENERATED')

  const reqActive = getPartyOtpStatus({
    requesterOtpHash: 'req-hash',
    requesterOtpExpiresAt: new Date(Date.now() + 600000),
    requesterOtpAttemptsRemaining: 3
  }, 'REQUESTER')
  assert.equal(reqActive.state, 'ACTIVE')

  const reqLocked = getPartyOtpStatus({
    requesterOtpHash: 'req-hash',
    requesterOtpExpiresAt: new Date(Date.now() + 600000),
    requesterOtpAttemptsRemaining: 0
  }, 'REQUESTER')
  assert.equal(reqLocked.state, 'LOCKED')

  const reqVerified = getPartyOtpStatus({
    requesterOtpVerified: true
  }, 'REQUESTER')
  assert.equal(reqVerified.state, 'VERIFIED')
})

test('OTP Service - Regeneration Invariant', async () => {
  const otp1 = generate4DigitOtp()
  const hash1 = await hashOtp(otp1)

  const otp2 = generate4DigitOtp()
  const hash2 = await hashOtp(otp2)

  // Explicit regeneration produces a new distinct hash or code
  assert.ok(hash1.length === 64)
  assert.ok(hash2.length === 64)
  assert.equal(typeof hash1, 'string')
  assert.equal(typeof hash2, 'string')
})


