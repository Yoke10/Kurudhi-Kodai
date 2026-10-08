import test from 'node:test'
import assert from 'node:assert/strict'
import {
  checkForDuplicateRequest,
  formatDuplicateWarningMessage
} from '../lib/duplicateDetection.js'

test('Duplicate Detection - Detects Exact Match on Active Request', () => {
  const existingRequests = [
    {
      id: 'req-1',
      bloodGroup: 'O+',
      city: 'Chennai',
      hospitalName: 'Apollo Hospitals',
      status: 'ACTIVE',
      createdAt: new Date()
    }
  ]

  const newRequest = {
    bloodGroup: 'O+',
    city: 'Chennai',
    hospitalName: 'Apollo Hospitals'
  }

  const result = checkForDuplicateRequest(newRequest, existingRequests)
  assert.equal(result.isPossibleDuplicate, true)
  assert.equal(result.matches.length, 1)
  assert.equal(result.matches[0].id, 'req-1')
})

test('Duplicate Detection - Ignores Completed or Cancelled Requests', () => {
  const existingRequests = [
    {
      id: 'req-2',
      bloodGroup: 'O+',
      city: 'Chennai',
      hospitalName: 'Apollo Hospitals',
      status: 'FULFILLED',
      createdAt: new Date()
    },
    {
      id: 'req-3',
      bloodGroup: 'O+',
      city: 'Chennai',
      hospitalName: 'Apollo Hospitals',
      status: 'CANCELLED',
      createdAt: new Date()
    }
  ]

  const newRequest = {
    bloodGroup: 'O+',
    city: 'Chennai',
    hospitalName: 'Apollo Hospitals'
  }

  const result = checkForDuplicateRequest(newRequest, existingRequests)
  assert.equal(result.isPossibleDuplicate, false)
  assert.equal(result.matches.length, 0)
})

test('Duplicate Detection - Tolerates Different Hospitals or Cities', () => {
  const existingRequests = [
    {
      id: 'req-4',
      bloodGroup: 'O+',
      city: 'Madurai',
      hospitalName: 'Meenakshi Mission',
      status: 'ACTIVE',
      createdAt: new Date()
    }
  ]

  const newRequest = {
    bloodGroup: 'O+',
    city: 'Chennai',
    hospitalName: 'Apollo Hospitals'
  }

  const result = checkForDuplicateRequest(newRequest, existingRequests)
  assert.equal(result.isPossibleDuplicate, false)
})

test('Duplicate Detection - Warning Message Formatter', () => {
  const match = {
    id: 'req-1',
    bloodGroup: 'A+',
    hospitalName: 'MIOT',
    city: 'Chennai'
  }
  const msg = formatDuplicateWarningMessage([match])
  assert.ok(msg.includes('MIOT'))
  assert.ok(msg.includes('Chennai'))
})
