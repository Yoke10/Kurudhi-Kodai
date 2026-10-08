import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateDonorCooldown,
  scoreDonorForRequest,
  matchDonorsForRequest,
  SCORING_WEIGHTS,
  normalizeCity,
  normalizeArea
} from '../lib/matchingEngine.js'

test('Matching Engine - Cooldown Calculation (90 Days)', () => {
  const ninetyOneDaysAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000)
  const eligibility = calculateDonorCooldown(ninetyOneDaysAgo)
  assert.equal(eligibility.isEligible, true)
  assert.equal(eligibility.daysRemaining, 0)

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const ineligible = calculateDonorCooldown(thirtyDaysAgo)
  assert.equal(ineligible.isEligible, false)
  assert.ok(ineligible.daysRemaining > 0 && ineligible.daysRemaining <= 60)

  const neverDonated = calculateDonorCooldown(null)
  assert.equal(neverDonated.isEligible, true)
  assert.equal(neverDonated.daysRemaining, 0)
})

test('Matching Engine - Incompatible Blood Group returns Score 0', () => {
  const donor = {
    bloodGroup: 'A+',
    city: 'Chennai',
    area: 'Velachery',
    availabilityStatus: 'AVAILABLE'
  }
  const request = {
    bloodGroup: 'B+',
    city: 'Chennai',
    area: 'Velachery'
  }
  const result = scoreDonorForRequest(donor, request)
  assert.equal(result.score, 0)
  assert.equal(result.isCompatible, false)
})

test('Matching Engine - Cooldown Ineligible returns Score 0', () => {
  const donor = {
    bloodGroup: 'O+',
    city: 'Chennai',
    area: 'Velachery',
    availabilityStatus: 'AVAILABLE',
    lastDonationAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days ago
  }
  const request = {
    bloodGroup: 'O+',
    city: 'Chennai',
    area: 'Velachery'
  }
  const result = scoreDonorForRequest(donor, request)
  assert.equal(result.score, 0)
  assert.equal(result.isEligible, false)
})

test('Matching Engine - Full Score Breakdown for Same Area & City', () => {
  const donor = {
    bloodGroup: 'O+',
    city: 'Chennai',
    area: 'Velachery',
    availabilityStatus: 'AVAILABLE',
    lastDonationAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
    successfulDonations: 3,
    cancelledDonations: 0
  }
  const request = {
    bloodGroup: 'O+',
    city: 'Chennai',
    area: 'Velachery'
  }
  const result = scoreDonorForRequest(donor, request)
  assert.ok(result.score >= 100) // 50 (area) + 30 (city) + 20 (available) + active/reliability
  assert.equal(result.isCompatible, true)
  assert.equal(result.isEligible, true)
})

test('Matching Engine - Area Match beats City Match only', () => {
  const donorInSameArea = {
    id: 'donor-1',
    bloodGroup: 'O+',
    city: 'Chennai',
    area: 'Velachery',
    availabilityStatus: 'AVAILABLE'
  }
  const donorInDifferentArea = {
    id: 'donor-2',
    bloodGroup: 'O+',
    city: 'Chennai',
    area: 'Anna Nagar',
    availabilityStatus: 'AVAILABLE'
  }
  const request = {
    bloodGroup: 'O+',
    city: 'Chennai',
    area: 'Velachery'
  }

  const score1 = scoreDonorForRequest(donorInSameArea, request)
  const score2 = scoreDonorForRequest(donorInDifferentArea, request)

  assert.ok(score1.score > score2.score)
  assert.equal(score1.score - score2.score, SCORING_WEIGHTS.SAME_AREA)
})

test('Matching Engine - matchDonorsForRequest Ranks Correctly', () => {
  const request = {
    bloodGroup: 'B+',
    city: 'Chennai',
    area: 'Guindy'
  }
  const donors = [
    { id: 'd1', bloodGroup: 'A+', city: 'Chennai', area: 'Guindy' }, // Incompatible
    { id: 'd2', bloodGroup: 'B+', city: 'Coimbatore', area: 'Gandhipuram', availabilityStatus: 'AVAILABLE' }, // Different city
    { id: 'd3', bloodGroup: 'B+', city: 'Chennai', area: 'Guindy', availabilityStatus: 'AVAILABLE' }, // Same area & city
    { id: 'd4', bloodGroup: 'B+', city: 'Chennai', area: 'Tambaram', availabilityStatus: 'AVAILABLE' } // Same city, different area
  ]

  const matches = matchDonorsForRequest(request, donors)

  assert.equal(matches.length, 3) // d1 excluded (incompatible)
  assert.equal(matches[0].donor.id, 'd3') // Highest score (same area)
  assert.equal(matches[1].donor.id, 'd4') // Second (same city)
  assert.equal(matches[2].donor.id, 'd2') // Third (different city)
})

test('Matching Engine - Location Normalization and Case-Insensitive Matching', () => {
  assert.equal(normalizeCity('  chennai  '), 'chennai')
  assert.equal(normalizeCity('Tiruchirappalli'), 'tiruchirappalli')
  assert.equal(normalizeCity('Chennai   Central'), 'chennai central')
  assert.equal(normalizeArea('  T. Nagar  '), 't. nagar')
  assert.equal(normalizeCity(null), '')

  const donor = {
    bloodGroup: 'O+',
    city: '  CHENNAI  ',
    area: 'Velachery ',
    availabilityStatus: 'AVAILABLE'
  }
  const request = {
    bloodGroup: 'O+',
    city: 'chennai',
    area: '  velachery'
  }
  const result = scoreDonorForRequest(donor, request)
  assert.ok(result.score >= 100) // matches both area (+50) and city (+30) despite casing/whitespace differences
})
