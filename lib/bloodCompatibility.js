/**
 * KURUDHI KODAI — Centralized Blood Compatibility Service
 *
 * Notice: Final biological transfusion compatibility (e.g. major/minor cross-match,
 * Rh sub-phenotypes, antibodies) must ALWAYS be clinically determined by qualified
 * healthcare and blood-bank professionals.
 */

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// Standard Red Blood Cell (RBC) donation compatibility matrix
// Keys: Donor Blood Group -> Values: Compatible Recipient Blood Groups
const COMPATIBILITY_MAP = {
  'O-': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'], // Universal donor
  'O+': ['O+', 'A+', 'B+', 'AB+'],
  'A-': ['A-', 'A+', 'AB-', 'AB+'],
  'A+': ['A+', 'AB+'],
  'B-': ['B-', 'B+', 'AB-', 'AB+'],
  'B+': ['B+', 'AB+'],
  'AB-': ['AB-', 'AB+'],
  'AB+': ['AB+'], // Universal recipient
};

/**
 * Checks whether a donor blood group is compatible for a recipient.
 * @param {string} donorGroup - e.g. 'O+'
 * @param {string} recipientGroup - e.g. 'A+'
 * @param {boolean} anyBloodGroupAccepted - whether request explicitly accepts any group
 * @returns {boolean}
 */
export function isBloodGroupCompatible(donorGroup, recipientGroup, anyBloodGroupAccepted = false) {
  if (anyBloodGroupAccepted) {
    return true;
  }
  if (!donorGroup || !recipientGroup) {
    return false;
  }

  const cleanDonor = donorGroup.trim().toUpperCase();
  const cleanRecipient = recipientGroup.trim().toUpperCase();

  const recipients = COMPATIBILITY_MAP[cleanDonor];
  if (!recipients) {
    return false;
  }

  return recipients.includes(cleanRecipient);
}

/**
 * Returns list of compatible recipient groups for a donor
 * @param {string} donorGroup
 * @returns {string[]}
 */
export function getCompatibleRecipients(donorGroup) {
  if (!donorGroup) return [];
  const clean = donorGroup.trim().toUpperCase();
  return COMPATIBILITY_MAP[clean] || [];
}

/**
 * Returns list of compatible donor groups for a recipient
 * @param {string} recipientGroup
 * @returns {string[]}
 */
export function getCompatibleDonors(recipientGroup) {
  if (!recipientGroup) return [];
  const clean = recipientGroup.trim().toUpperCase();
  return Object.keys(COMPATIBILITY_MAP).filter(donor =>
    COMPATIBILITY_MAP[donor].includes(clean)
  );
}

export const MEDICAL_DISCLAIMER =
  "Notice: Platform compatibility matching is for preliminary coordination only. Final transfusion eligibility and biological cross-matching must be performed by qualified medical and blood bank staff.";

export const BLOOD_COMPATIBILITY_DISCLAIMER = MEDICAL_DISCLAIMER;
export const VALID_BLOOD_GROUPS = BLOOD_GROUPS;
export const getCompatibleDonorGroups = getCompatibleDonors;
export const getCompatibleRecipientGroups = getCompatibleRecipients;
