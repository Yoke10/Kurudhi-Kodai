/**
 * KURUDHI KODAI — Non-blocking Duplicate Request Detection Service
 *
 * Evaluates candidate request against existing active requests to alert users/admins
 * of potential duplicate postings without blocking legitimate emergency submissions.
 */

/**
 * Pure evaluation function for duplicate request detection.
 * @param {object} candidate
 * @param {Array<object>} existingRequests
 * @returns {{ isPossibleDuplicate: boolean, matches: Array<object> }}
 */
export function checkForDuplicateRequest(candidate, existingRequests) {
  if (!candidate?.city || !candidate?.bloodGroup || (!candidate?.hospitalName && !candidate?.hospital)) {
    return { isPossibleDuplicate: false, matches: [] };
  }

  const candidateCity = (candidate.city || '').trim().toLowerCase();
  const candidateHospital = (candidate.hospitalName || candidate.hospital || '').trim().toLowerCase();
  const candidateBlood = (candidate.bloodGroup || '').trim().toUpperCase();
  const candidatePatient = (candidate.patientName || '').trim().toLowerCase();

  const matches = [];

  for (const data of (existingRequests || [])) {
    const status = (data.status || data.Verified || '').toLowerCase();
    if (
      status === 'completed' ||
      status === 'fulfilled' ||
      status === 'rejected' ||
      status === 'cancelled' ||
      status === 'expired'
    ) {
      continue;
    }

    const existingCity = (data.city || data.City || '').trim().toLowerCase();
    if (existingCity && candidateCity && existingCity !== candidateCity) {
      continue;
    }

    const existingHospital = (data.hospitalName || data.hospital || data.Hospital || '').trim().toLowerCase();
    const existingBlood = (data.bloodGroup || data.BloodGroup || '').trim().toUpperCase();
    const existingPatient = (data.patientName || data.PatientName || '').trim().toLowerCase();

    const sameBlood = existingBlood === candidateBlood;
    const hospitalSimilar =
      existingHospital === candidateHospital ||
      (existingHospital && candidateHospital && (existingHospital.includes(candidateHospital) || candidateHospital.includes(existingHospital)));

    const patientSimilar =
      candidatePatient &&
      existingPatient &&
      (candidatePatient === existingPatient ||
        candidatePatient.includes(existingPatient) ||
        existingPatient.includes(candidatePatient));

    if (sameBlood && hospitalSimilar) {
      matches.push({
        id: data.id,
        patientName: data.patientName || data.PatientName,
        hospital: data.hospitalName || data.hospital || data.Hospital,
        hospitalName: data.hospitalName || data.hospital || data.Hospital,
        city: data.city || data.City,
        bloodGroup: data.bloodGroup || data.BloodGroup,
        unitsNeeded: data.unitsNeeded || data.UnitsNeeded,
        patientMatch: Boolean(patientSimilar),
      });
    }
  }

  return {
    isPossibleDuplicate: matches.length > 0,
    matches,
  };
}

/**
 * Formats a user-friendly duplicate alert message.
 * @param {Array<object>} matches
 * @returns {string}
 */
export function formatDuplicateWarningMessage(matches) {
  if (!matches || !matches.length) return '';
  const first = matches[0];
  return `A similar active blood request for ${first.bloodGroup} already exists at ${first.hospital || first.hospitalName || 'the specified hospital'} in ${first.city}. Please verify this is a distinct medical requirement before proceeding.`;
}

/**
 * Asynchronously checks Firestore for duplicate active requests.
 * @param {object} candidate
 * @returns {Promise<{ hasDuplicate: boolean, duplicates: Array<object>, message?: string }>}
 */
export async function detectDuplicateRequest(candidate) {
  if (!candidate?.city || !candidate?.bloodGroup || (!candidate?.hospital && !candidate?.hospitalName)) {
    return { hasDuplicate: false, duplicates: [] };
  }

  try {
    const { collection, query, where, getDocs } = await import('firebase/firestore');
    const { db } = await import('./firebase.js');

    const requestsRef = collection(db, 'requests');
    const q = query(requestsRef, where('City', '==', candidate.city));
    const snap = await getDocs(q);

    const existing = [];
    snap.forEach((docSnap) => {
      existing.push({ id: docSnap.id, ...docSnap.data() });
    });

    const result = checkForDuplicateRequest(candidate, existing);
    if (result.isPossibleDuplicate) {
      return {
        hasDuplicate: true,
        duplicates: result.matches,
        message: formatDuplicateWarningMessage(result.matches),
      };
    }

    return { hasDuplicate: false, duplicates: [] };
  } catch (error) {
    console.warn('Duplicate detection check bypassed:', error);
    return { hasDuplicate: false, duplicates: [] };
  }
}
