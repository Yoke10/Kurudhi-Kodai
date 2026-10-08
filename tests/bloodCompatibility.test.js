import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isBloodGroupCompatible,
  getCompatibleDonorGroups,
  getCompatibleRecipientGroups,
  BLOOD_COMPATIBILITY_DISCLAIMER,
  VALID_BLOOD_GROUPS
} from '../lib/bloodCompatibility.js'

test('Blood Compatibility - Disclaimer Presence', () => {
  assert.ok(BLOOD_COMPATIBILITY_DISCLAIMER)
  assert.ok(BLOOD_COMPATIBILITY_DISCLAIMER.includes('medical'))
})

test('Blood Compatibility - Valid Blood Groups List', () => {
  assert.equal(VALID_BLOOD_GROUPS.length, 8)
  assert.ok(VALID_BLOOD_GROUPS.includes('O-'))
  assert.ok(VALID_BLOOD_GROUPS.includes('AB+'))
})

test('Blood Compatibility - O- Universal Donor', () => {
  for (const recipient of VALID_BLOOD_GROUPS) {
    assert.equal(
      isBloodGroupCompatible('O-', recipient),
      true,
      `O- should be compatible with ${recipient}`
    )
  }
})

test('Blood Compatibility - AB+ Universal Recipient', () => {
  for (const donor of VALID_BLOOD_GROUPS) {
    assert.equal(
      isBloodGroupCompatible(donor, 'AB+'),
      true,
      `${donor} should be compatible with AB+ recipient`
    )
  }
})

test('Blood Compatibility - Incompatible Combinations', () => {
  assert.equal(isBloodGroupCompatible('A+', 'B+'), false)
  assert.equal(isBloodGroupCompatible('B+', 'A-'), false)
  assert.equal(isBloodGroupCompatible('AB+', 'O+'), false)
  assert.equal(isBloodGroupCompatible('O+', 'O-'), false)
  assert.equal(isBloodGroupCompatible('A+', 'O+'), false)
})

test('Blood Compatibility - Same Blood Group Compatibility', () => {
  for (const bg of VALID_BLOOD_GROUPS) {
    assert.equal(isBloodGroupCompatible(bg, bg), true, `${bg} should donate to ${bg}`)
  }
})

test('Blood Compatibility - getCompatibleDonorGroups', () => {
  const oNegDonors = getCompatibleDonorGroups('O-')
  assert.deepEqual(oNegDonors, ['O-'])

  const abPosDonors = getCompatibleDonorGroups('AB+')
  assert.equal(abPosDonors.length, 8)
})

test('Blood Compatibility - getCompatibleRecipientGroups', () => {
  const oNegRecipients = getCompatibleRecipientGroups('O-')
  assert.equal(oNegRecipients.length, 8)

  const abPosRecipients = getCompatibleRecipientGroups('AB+')
  assert.deepEqual(abPosRecipients, ['AB+'])
})
