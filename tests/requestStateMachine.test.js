import test from 'node:test'
import assert from 'node:assert/strict'
import {
  REQUEST_STATUS,
  canTransitionRequest,
  getNextRequestStatuses,
  isRequestOpenForMatching,
  normalizeRequestStatus
} from '../lib/requestStateMachine.js'

test('Request State Machine - Status Constants', () => {
  assert.equal(REQUEST_STATUS.SUBMITTED, 'SUBMITTED')
  assert.equal(REQUEST_STATUS.ACTIVE, 'ACTIVE')
  assert.equal(REQUEST_STATUS.MATCHING, 'MATCHING')
  assert.equal(REQUEST_STATUS.PARTIALLY_FULFILLED, 'PARTIALLY_FULFILLED')
  assert.equal(REQUEST_STATUS.FULFILLED, 'FULFILLED')
  assert.equal(REQUEST_STATUS.EXPIRED, 'EXPIRED')
  assert.equal(REQUEST_STATUS.CANCELLED, 'CANCELLED')
  assert.equal(REQUEST_STATUS.REJECTED, 'REJECTED')
})

test('Request State Machine - Valid Transitions', () => {
  assert.equal(canTransitionRequest(REQUEST_STATUS.SUBMITTED, REQUEST_STATUS.ACTIVE), true)
  assert.equal(canTransitionRequest(REQUEST_STATUS.SUBMITTED, REQUEST_STATUS.REJECTED), true)
  assert.equal(canTransitionRequest(REQUEST_STATUS.SUBMITTED, REQUEST_STATUS.CANCELLED), true)

  assert.equal(canTransitionRequest(REQUEST_STATUS.ACTIVE, REQUEST_STATUS.MATCHING), true)
  assert.equal(canTransitionRequest(REQUEST_STATUS.ACTIVE, REQUEST_STATUS.CANCELLED), true)
  assert.equal(canTransitionRequest(REQUEST_STATUS.ACTIVE, REQUEST_STATUS.EXPIRED), true)

  assert.equal(canTransitionRequest(REQUEST_STATUS.MATCHING, REQUEST_STATUS.PARTIALLY_FULFILLED), true)
  assert.equal(canTransitionRequest(REQUEST_STATUS.MATCHING, REQUEST_STATUS.FULFILLED), true)

  assert.equal(canTransitionRequest(REQUEST_STATUS.PARTIALLY_FULFILLED, REQUEST_STATUS.FULFILLED), true)
})

test('Request State Machine - Invalid Transitions', () => {
  assert.equal(canTransitionRequest(REQUEST_STATUS.FULFILLED, REQUEST_STATUS.ACTIVE), false)
  assert.equal(canTransitionRequest(REQUEST_STATUS.CANCELLED, REQUEST_STATUS.MATCHING), false)
  assert.equal(canTransitionRequest(REQUEST_STATUS.REJECTED, REQUEST_STATUS.ACTIVE), false)
  assert.equal(canTransitionRequest(REQUEST_STATUS.EXPIRED, REQUEST_STATUS.SUBMITTED), false)
})

test('Request State Machine - isRequestOpenForMatching', () => {
  assert.equal(isRequestOpenForMatching(REQUEST_STATUS.ACTIVE), true)
  assert.equal(isRequestOpenForMatching(REQUEST_STATUS.MATCHING), true)
  assert.equal(isRequestOpenForMatching(REQUEST_STATUS.PARTIALLY_FULFILLED), true)

  assert.equal(isRequestOpenForMatching(REQUEST_STATUS.FULFILLED), false)
  assert.equal(isRequestOpenForMatching(REQUEST_STATUS.CANCELLED), false)
  assert.equal(isRequestOpenForMatching(REQUEST_STATUS.REJECTED), false)
  assert.equal(isRequestOpenForMatching(REQUEST_STATUS.EXPIRED), false)
})

test('Request State Machine - Legacy Status Normalization', () => {
  assert.equal(normalizeRequestStatus('received'), REQUEST_STATUS.SUBMITTED)
  assert.equal(normalizeRequestStatus('accepted'), REQUEST_STATUS.ACTIVE)
  assert.equal(normalizeRequestStatus('completed'), REQUEST_STATUS.FULFILLED)
  assert.equal(normalizeRequestStatus('rejected'), REQUEST_STATUS.REJECTED)
  assert.equal(normalizeRequestStatus('ACTIVE'), REQUEST_STATUS.ACTIVE)
})
