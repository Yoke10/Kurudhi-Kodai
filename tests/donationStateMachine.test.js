import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DONATION_STATES,
  ALLOWED_DONATION_TRANSITIONS,
  normalizeDonationStatus,
  isValidDonationTransition
} from '../lib/donationStateMachine.js'

test('Donation State Machine - States Defined', () => {
  assert.equal(DONATION_STATES.DONOR_MATCHED, 'DONOR_MATCHED')
  assert.equal(DONATION_STATES.DONOR_ACCEPTED, 'DONOR_ACCEPTED')
  assert.equal(DONATION_STATES.CONTACT_ESTABLISHED, 'CONTACT_ESTABLISHED')
  assert.equal(DONATION_STATES.OTP_PENDING, 'OTP_PENDING')
  assert.equal(DONATION_STATES.DONATION_COMPLETED, 'DONATION_COMPLETED')
  assert.equal(DONATION_STATES.CANCELLED, 'CANCELLED')
})

test('Donation State Machine - Valid Transitions', () => {
  assert.equal(isValidDonationTransition(DONATION_STATES.DONOR_MATCHED, DONATION_STATES.DONOR_ACCEPTED), true)
  assert.equal(isValidDonationTransition(DONATION_STATES.DONOR_ACCEPTED, DONATION_STATES.OTP_PENDING), true)
  assert.equal(isValidDonationTransition(DONATION_STATES.OTP_PENDING, DONATION_STATES.DONATION_COMPLETED), true)
  assert.equal(isValidDonationTransition(DONATION_STATES.OTP_PENDING, DONATION_STATES.CANCELLED), true)
  assert.equal(isValidDonationTransition(DONATION_STATES.DONOR_CONFIRMED, DONATION_STATES.DONATION_COMPLETED), true)
})

test('Donation State Machine - Terminal States Cannot Transition', () => {
  assert.equal(isValidDonationTransition(DONATION_STATES.DONATION_COMPLETED, DONATION_STATES.OTP_PENDING), false)
  assert.equal(isValidDonationTransition(DONATION_STATES.DONATION_COMPLETED, DONATION_STATES.CANCELLED), false)
  assert.equal(isValidDonationTransition(DONATION_STATES.CANCELLED, DONATION_STATES.DONOR_ACCEPTED), false)
})

test('Donation State Machine - Legacy Normalization', () => {
  assert.equal(normalizeDonationStatus('accepted'), DONATION_STATES.DONOR_ACCEPTED)
  assert.equal(normalizeDonationStatus('completed'), DONATION_STATES.DONATION_COMPLETED)
  assert.equal(normalizeDonationStatus('cancelled'), DONATION_STATES.CANCELLED)
  assert.equal(normalizeDonationStatus('pending'), DONATION_STATES.OTP_PENDING)
})
