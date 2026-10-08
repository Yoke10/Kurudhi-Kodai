/**
 * KURUDHI KODAI — 7-Level Deterministic Donor Matching Engine
 *
 * Scoring configuration:
 * - Level 1: Blood compatibility (Prerequisite filter)
 * - Level 2: Platform eligibility (90-day cooldown & age check)
 * - Level 3: Donor availability (AVAILABLE status)
 * - Level 4: Locality / Area match (+50 points)
 * - Level 5: City match (+30 points)
 * - Level 6: Recent activity (+10 points)
 * - Level 7: Reliability score (+10 points)
 *
 * NO AI, NO Paid Maps API, NO Continuous GPS.
 */

import { isBloodGroupCompatible } from './bloodCompatibility.js';

export const DEFAULT_MATCHING_WEIGHTS = {
  SAME_AREA: 50,
  SAME_CITY: 30,
  AVAILABLE_BONUS: 20,
  RECENTLY_ACTIVE: 10,
  HIGH_RELIABILITY: 10,
};

export const DONATION_COOLDOWN_DAYS = 90;

/**
 * Calculates whether a donor has passed the required 90-day cooldown period.
 * @param {string | Date | { toDate: Function } | null} lastDonationDate
 * @returns {{ isEligible: boolean, remainingDays: number, daysRemaining: number }}
 */
export function calculateDonorCooldown(lastDonationDate) {
  if (!lastDonationDate) {
    return { isEligible: true, remainingDays: 0, daysRemaining: 0 };
  }

  let lastDate;
  if (typeof lastDonationDate === 'object' && typeof lastDonationDate.toDate === 'function') {
    lastDate = lastDonationDate.toDate();
  } else {
    lastDate = new Date(lastDonationDate);
  }

  if (isNaN(lastDate.getTime())) {
    return { isEligible: true, remainingDays: 0, daysRemaining: 0 };
  }

  const now = new Date();
  const diffMs = now.getTime() - lastDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays >= DONATION_COOLDOWN_DAYS) {
    return { isEligible: true, remainingDays: 0, daysRemaining: 0 };
  } else {
    const rem = DONATION_COOLDOWN_DAYS - diffDays;
    return { isEligible: false, remainingDays: rem, daysRemaining: rem };
  }
}

/**
 * Evaluates whether a donor meets platform eligibility (age 18-65 and cooldown).
 * @param {object} donor
 * @returns {{ eligible: boolean, reason?: string }}
 */
export function checkPlatformEligibility(donor) {
  if (!donor) return { eligible: false, reason: 'No donor record provided' };

  // 1. Age check from dateOfBirth or age field
  const dob = donor.dateOfBirth || donor.DateOfBirth;
  if (dob) {
    const birthDate = new Date(dob);
    if (!isNaN(birthDate.getTime())) {
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      if (age < 18 || age > 65) {
        return { eligible: false, reason: `Donor age (${age}) is outside eligible range (18-65)` };
      }
    }
  } else {
    const rawAge = donor.age || donor.Age;
    if (rawAge && (rawAge < 18 || rawAge > 65)) {
      return { eligible: false, reason: `Donor age (${rawAge}) is outside eligible range (18-65)` };
    }
  }

  // 2. Cooldown check
  const lastDonation = donor.lastDonationAt || donor.lastDonationDate;
  const { isEligible, remainingDays } = calculateDonorCooldown(lastDonation);
  if (!isEligible) {
    return { eligible: false, reason: `In cooldown period (${remainingDays} days remaining)` };
  }

  return { eligible: true };
}

/**
 * Normalizes city names for case and whitespace insensitive matching.
 * @param {string} city
 * @returns {string}
 */
export function normalizeCity(city) {
  if (!city || typeof city !== 'string') return '';
  return city.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Normalizes area/locality names for case and whitespace insensitive matching.
 * @param {string} area
 * @returns {string}
 */
export function normalizeArea(area) {
  if (!area || typeof area !== 'string') return '';
  return area.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Scores and filters a donor against a blood request.
 *
 * @param {object} donor
 * @param {object} request
 * @param {object} weights - Configurable scoring weights
 * @returns {{ matched: boolean, score: number, reasons: string[] }}
 */
export function evaluateDonorMatch(donor, request, weights = DEFAULT_MATCHING_WEIGHTS) {
  const reasons = [];

  // LEVEL 1: Blood Compatibility
  const donorBlood = donor.bloodGroup || donor.BloodGroup;
  const requestBlood = request.bloodGroup || request.BloodGroup;
  const anyAccepted = request.anyBloodGroupAccepted || request.AnyBloodGroupAccepted || false;

  if (!isBloodGroupCompatible(donorBlood, requestBlood, anyAccepted)) {
    return { matched: false, score: 0, reasons: ['Incompatible blood group'] };
  }
  reasons.push('Blood group compatible');

  // LEVEL 2: Platform Eligibility
  const eligibility = checkPlatformEligibility(donor);
  if (!eligibility.eligible) {
    return { matched: false, score: 0, reasons: [eligibility.reason] };
  }
  reasons.push('Meets platform cooldown & age requirements');

  // LEVEL 3: Availability
  const status = (donor.availabilityStatus || 'AVAILABLE').toUpperCase();
  if (status === 'UNAVAILABLE') {
    return { matched: false, score: 0, reasons: ['Donor is marked unavailable'] };
  }

  let score = 0;

  // Bonus for explicit availability
  if (status === 'AVAILABLE') {
    score += weights.AVAILABLE_BONUS;
    reasons.push('Donor status is available');
  }

  // LEVEL 4 & 5: Locality and City match (Normalized)
  const donorArea = normalizeArea(donor.area);
  const requestArea = normalizeArea(request.area);
  const donorCity = normalizeCity(donor.city || donor.City || donor.residentCity || donor.ResidentCity || donor.permanentCity || donor.PermanentCity);
  const requestCity = normalizeCity(request.city || request.City);

  if (donorArea && requestArea && donorArea === requestArea) {
    score += weights.SAME_AREA;
    reasons.push('Matching area / locality (+50)');
  }

  if (donorCity && requestCity && donorCity === requestCity) {
    score += weights.SAME_CITY;
    reasons.push('Matching city (+30)');
  }

  // LEVEL 6: Recent Activity
  const updatedAt = donor.updatedAt || donor.registeredAt;
  if (updatedAt) {
    const updatedDate = typeof updatedAt.toDate === 'function' ? updatedAt.toDate() : new Date(updatedAt);
    const daysSinceActive = (new Date().getTime() - updatedDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceActive <= 30) {
      score += weights.RECENTLY_ACTIVE;
      reasons.push('Active in the last 30 days (+10)');
    }
  }

  // LEVEL 7: Reliability History
  const stats = donor.reliabilityStats || {};
  const accepted = stats.requestsAccepted || 0;
  const received = stats.requestsReceived || 0;
  if (received >= 2 && accepted / received >= 0.7) {
    score += weights.HIGH_RELIABILITY;
    reasons.push('Strong response history (+10)');
  }

  return {
    matched: true,
    score,
    reasons,
  };
}

/**
 * Filters and ranks a pool of donors for a blood request in descending score order.
 * Accepts either (donors, request) or (request, donors).
 * @param {Array<object> | object} arg1
 * @param {object | Array<object>} arg2
 * @returns {Array<{ donor: object, score: number, reasons: string[] }>}
 */
export function rankMatchingDonors(arg1, arg2) {
  const donors = Array.isArray(arg1) ? arg1 : (Array.isArray(arg2) ? arg2 : []);
  const request = Array.isArray(arg1) ? arg2 : arg1;
  if (!Array.isArray(donors) || !request) return [];

  const results = [];
  for (const donor of donors) {
    const evalResult = evaluateDonorMatch(donor, request);
    if (evalResult.matched) {
      results.push({
        donor,
        score: evalResult.score,
        reasons: evalResult.reasons,
      });
    }
  }

  // Rank by highest score first
  return results.sort((a, b) => b.score - a.score);
}

export const SCORING_WEIGHTS = DEFAULT_MATCHING_WEIGHTS;
export const scoreDonorForRequest = (donor, request, weights) => {
  const res = evaluateDonorMatch(donor, request, weights);
  const donorBlood = donor.bloodGroup || donor.BloodGroup;
  const requestBlood = request.bloodGroup || request.BloodGroup;
  const isCompatible = isBloodGroupCompatible(donorBlood, requestBlood);
  const isEligible = checkPlatformEligibility(donor).eligible;
  return {
    ...res,
    isCompatible,
    isEligible
  };
};
export const matchDonorsForRequest = rankMatchingDonors;

