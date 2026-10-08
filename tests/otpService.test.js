import test from 'node:test'
import assert from 'node:assert/strict'
import {
  generate4DigitOtp,
  hashOtp,
  verifyOtpInput,
  OTP_EXPIRY_MS,
  MAX_OTP_ATTEMPTS
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
