# KURUDHI KODAI — DONATION LIFECYCLE BUG FIX & LOGIC VALIDATION REPORT

**Author:** Senior Full-Stack Engineer  
**Date:** October 9, 2026  
**Project:** Kurudhi Kodai Blood Donation Application  
**Technologies:** Next.js 15 (App Router), Firebase Authentication, Cloud Firestore (Atomic Transactions & Rules), Node Test Runner  

---

## 1. Executive Summary

This report documents the resolution of three critical production issues in the blood donation lifecycle of Kurudhi Kodai:
1. **Bug One (Cancelled Requests Lingering as Accepted):** Cancelled donation commitments and requester requests continued to display as accepted or active due to stale local React state, unhandled cancellation statuses in card components, missing requester cancellation workflows, and lack of soft-cancellation isolation.
2. **Bug Two (Multiple Active Donations per Donor):** Donors were previously able to pledge to multiple ongoing donation requests concurrently. Direct client-side `addDoc` operations lacked authoritative locking and race-condition prevention across simultaneous tabs.
3. **Bug Three (Active/Unfinished Requests Appearing in Completed Tab):** In the donor dashboard, any request ID ever associated with the user was unconditionally injected into the "Completed" view (`donationReqIds.includes(request.id)`), conflating individual pledges with fulfilled request goals.

All three bugs have been resolved at the database transaction level, state machine level, UI presentation layer, and security rules level. **72 automated tests** and the **Next.js production build (22 routes)** passed with zero errors.

---

## 2. Root Cause Analysis

### Bug One: Cancelled Accepted Requests Still Appear as Accepted
- **Stale React Listener Handling in `app/dashboard/page.js`:** The donor card donation snapshot listener searched for non-cancelled documents:
  ```javascript
  const activeDoc = snap.docs.find(d => d.data().status !== 'CANCELLED');
  if (activeDoc) setDonation({ id: activeDoc.id, ...activeDoc.data() });
  ```
  When a donation was cancelled, `activeDoc` became `undefined`, and `setDonation` was never invoked. The existing active donation state remained frozen in memory.
- **Card Rendering Defect:** `DonorRequestCard` conditionally checked `isCompleted ? ... : donation ? <DualOtpVerification /> : <PledgeButton />`. When a donation record had `status: 'CANCELLED'`, the truthy check rendered `Donation In Progress` with live OTP inputs.
- **Missing Requester Cancellation:** In `app/myrequests/page.js`, requesters had no mechanism to soft-cancel blood requests. When a request was closed or cancelled, pledged donors remained permanently locked.

### Bug Two: A Donor Can Accept Multiple Active Donations
- **Non-Atomic Client Writes:** `handlePledgeDonation` executed a direct `addDoc` call without checking existing active commitments or coordinating within a Firestore transaction.
- **Race Condition Vulnerability:** If a donor opened multiple browser tabs or double-clicked pledge buttons, multiple pledge records were created in parallel because no unique user lock existed.

### Bug Three: Completed Requests Include Active Requests
- **Conflated Filter Logic in `app/dashboard/page.js`:** Line 145 explicitly stated:
  ```javascript
  const donationReqIds = userDonations.map(d => d.requestId);
  return donationReqIds.includes(request.id) || isCompleted;
  ```
  Consequently, *every* request a user ever pledged to (active, matching, or cancelled) appeared in the "Completed" tab.
- **Decoupled Request vs. Donation Status:** Single donation OTP verifications were occasionally treated as whole-request completions without evaluating `unitsDonated >= unitsNeeded`.

---

## 3. Canonical Request & Donation Status Rules

### Request Statuses (`REQUEST_STATES`)
- `SUBMITTED`: Newly submitted, pending verification.
- `ACTIVE`: Verified and actively seeking donor pledges.
- `MATCHING`: Actively notifying compatible nearby donors.
- `PARTIALLY_FULFILLED`: At least one unit received, but `unitsDonated < unitsNeeded`. Remains in active feeds!
- `FULFILLED`: Canonical completion state: `unitsDonated >= unitsNeeded`. Only fulfilled requests appear in Completed feeds.
- `EXPIRED`: Deadline passed without complete fulfillment.
- `CANCELLED`: Explicitly cancelled by requester or admin. Closed to new pledges and OTP operations.
- `REJECTED`: Rejected during administrative verification.

### Donation Statuses (`DONATION_STATES`)
- `DONOR_MATCHED`: Donor identified by matching engine.
- `DONOR_ACCEPTED`: Donor pledged commitment to donate.
- `CONTACT_ESTABLISHED`: Communication initiated between parties.
- `OTP_PENDING`: On-site OTP verification window active.
- `DONOR_CONFIRMED`: Donor entered requester's verbal code.
- `REQUESTER_CONFIRMED`: Requester entered donor's verbal code.
- `DONATION_COMPLETED`: Terminal successful state. Both OTPs verified; request unit incremented.
- `CANCELLED`: Terminal cancelled state. Soft cancellation with reason and actor UID.

---

## 4. Architectural Solutions

### A. Atomic Concurrency Lock (`donorCommitments/{donorUid}`)
To enforce the strict rule **"One donor cannot have more than one active accepted donation"**, we established an atomic document keyed by the donor's UID: `donorCommitments/{donorUid}`.

When a donor pledges via `acceptDonationPledge` in `lib/donationService.js`:
1. A Firestore transaction reads `donorCommitments/{donorUid}` and `requests/{requestId}` simultaneously.
2. If `donorCommitments/{donorUid}` exists with `status == 'ACTIVE'`, the transaction immediately aborts with:
   `"You already have an active donation commitment. Complete or cancel it before accepting another request."`
3. If the request is cancelled, expired, or fulfilled (`unitsDonated >= unitsNeeded`), the transaction aborts.
4. If the donor is in cooldown (`calculateDonorCooldown` < 90 days), the transaction aborts.
5. In the same atomic commit:
   - The donation record is created under `requests/{requestId}/donations/{donationId}`.
   - `donorCommitments/{donorUid}` is updated to `status: 'ACTIVE'`, locking the donor across all browser sessions.

### B. Deterministic Cancellation Workflow
When a donor cancels an accepted donation (`cancelDonorDonation`):
1. Verifies the authenticated user is the assigned donor.
2. Updates donation document to `status: 'CANCELLED'`, preserving `cancelledAt`, `cancelledByUid`, and `cancellationReason`.
3. Releases the lock on `donorCommitments/{donorUid}` (`status: 'RELEASED'`).
4. Checks the parent blood request: if `unitsDonated < unitsNeeded` and not cancelled/rejected/expired, the parent request remains or reverts to `ACTIVE` so backup donors can pledge.
5. Sends in-app notification to the requester and appends an immutable audit log.

When a requester cancels a blood request (`cancelRequesterRequest`):
1. Verifies ownership (`createdByUid == user.uid || uuid == user.uid`).
2. Soft-cancels parent request: `status: 'CANCELLED'`.
3. Cascades cancellation across all active subcollection donations.
4. Releases all affected donors' `donorCommitments/{donorUid}` records.
5. Disables all subsequent OTP generation and verification attempts.

### C. Completed Requests Filter
In `lib/requestStateMachine.js`, `isRequestFullyCompleted(request)` strictly validates:
```javascript
export function isRequestFullyCompleted(requestOrStatus) {
  if (!requestOrStatus) return false;
  const status = normalizeRequestStatus(typeof requestOrStatus === 'string' ? requestOrStatus : requestOrStatus.status || requestOrStatus.Verified);
  if (status === REQUEST_STATES.CANCELLED || status === REQUEST_STATES.REJECTED || status === REQUEST_STATES.EXPIRED) {
    return false;
  }
  if (status === REQUEST_STATES.FULFILLED || status === 'COMPLETED') {
    return true;
  }
  if (typeof requestOrStatus === 'object') {
    const needed = parseInt(requestOrStatus.unitsNeeded || requestOrStatus.UnitsNeeded || 0, 10);
    const donated = parseInt(requestOrStatus.unitsDonated || requestOrStatus.UnitsDonated || 0, 10);
    if (needed > 0 && donated >= needed) return true;
  }
  return false;
}
```
All views (`app/dashboard/page.js`, `app/myrequests/page.js`, `components/admin/AdminRequestsTab.jsx`, and `components/admin/AdminDonationsTab.jsx`) now filter through this centralized predicate.

---

## 5. Files Modified & Summary of Changes

| File | Nature of Changes |
| :--- | :--- |
| `lib/donationStateMachine.js` | Exported `ACTIVE_DONATION_STATES`, `TERMINAL_DONATION_STATES`, implemented `isDonationActive`, `isDonationCompleted`, `isDonationCancelled`, `isDonationCancellable`. |
| `lib/requestStateMachine.js` | Implemented `isRequestFullyCompleted`, `isRequestActive`, `isRequestCancelled`, `isRequestExpired`, `isRequestPartiallyFulfilled`. |
| `lib/donationService.js` | Created unified transactional service implementing `acceptDonationPledge`, `cancelDonorDonation`, `cancelRequesterRequest`, and `getActiveDonorCommitment` with legacy scan protection. |
| `firestore.rules` | Added security rules for `/donorCommitments/{donorId}` preventing unauthorized creation, status forging, and physical deletions. |
| `components/donations/DualOtpVerification.jsx` | Added cancellation check and UI banner, guarded against OTP entry on cancelled records, resolved `freshData` ReferenceError in transactional completion, and released `donorCommitments` atomically. |
| `app/api/donations/otp/route.js` | Added cancellation rejection checks and atomic release of `donorCommitments/{donorUid}` in `executeAtomicDonationCompletion`. |
| `app/dashboard/page.js` | Added real-time `donorCommitments/{user.uid}` listener, fixed tab filter to exclude active requests from Completed tab, updated `DonorRequestCard` to use transactional pledge/cancel, and added soft cancelled alerts. |
| `app/myrequests/page.js` | Added Requester Cancel Request dialog & handler (`cancelRequesterRequest`), separated Matched Donors into Active, Completed, and Cancelled history, and added Cancelled filter tab. |
| `components/admin/AdminRequestsTab.jsx` | Standardized filtering using `isRequestActive`, `isRequestFullyCompleted`, and `isRequestCancelled`. |
| `components/admin/AdminDonationsTab.jsx` | Standardized filtering using `isDonationActive`, `isDonationCompleted`, and `isDonationCancelled`. |
| `lib/notifications.js` | Added `DONATION_CANCELLED` and `DONATION_COMPLETED` constants; added `.js` extension to imports. |
| `lib/auditLogger.js` | Added `.js` extension to firebase import for Node ESM compatibility. |
| `tests/donationLifecycle.test.js` | Created 20 comprehensive automated unit, transactional, and concurrency tests. |

---

## 6. Automated Test Results

The full test suite was executed via Node.js native test runner (`node --test tests/**/*.test.js`).

```text
✔ Blood Compatibility - Disclaimer Presence (4.2ms)
✔ Blood Compatibility - Valid Blood Groups List (0.5ms)
✔ Blood Compatibility - O- Universal Donor (0.4ms)
✔ Blood Compatibility - AB+ Universal Recipient (0.3ms)
✔ Blood Compatibility - Incompatible Combinations (0.3ms)
✔ Blood Compatibility - Same Blood Group Compatibility (0.2ms)
✔ Blood Compatibility - getCompatibleDonorGroups (1.6ms)
✔ Blood Compatibility - getCompatibleRecipientGroups (0.3ms)
✔ Case 1: A donor can accept an eligible request when they have no active commitment (15.2ms)
✔ Case 2: The same donor cannot accept a second request while the first donation is active (2.3ms)
✔ Case 3: Concurrency requirement: Simultaneous requests cannot both accept (4.8ms)
✔ Case 4: A donor can accept another eligible request after the previous donation is cancelled (45.1ms)
✔ Case 5: A donor can accept another request after completion only if cooldown rules permit it (38.2ms)
✔ Case 6: A donor cannot cancel another donor's commitment (27.7ms)
✔ Case 7: A requester cannot cancel another user's request (0.6ms)
✔ Case 8: Cancelling an accepted donation removes it from active/accepted views (0.1ms)
✔ Case 9: Cancelling one donor's commitment reopens parent request only when still eligible (57.0ms)
✔ Case 10: Cancelling a parent request prevents further acceptance and OTP verification (31.4ms)
✔ Case 11: Cancelled records remain in history and are not physically deleted (soft cancel) (42.3ms)
✔ Case 12: Active requests never appear in Completed Requests (0.4ms)
✔ Case 13: A request with partial fulfillment is not incorrectly marked fully completed (0.2ms)
✔ Case 14: A fulfilled request appears in Completed Requests (0.1ms)
✔ Case 15: Unknown or legacy statuses are handled safely (0.1ms)
✔ Case 16: Repeated cancellation does not duplicate side effects or corrupt state (48.5ms)
✔ Case 17: Repeated completion does not increment donated units twice (55.4ms)
✔ Case 18: A failed transaction does not leave partial commitment, donation, or request updates (0.8ms)
✔ Case 19: Real-time UI state functions remain consistent after acceptance, cancellation, and completion (0.4ms)
✔ Case 20: Existing OTP dual-verification rules and state invariants continue to hold (4.3ms)
✔ Donation State Machine - States Defined (2.4ms)
✔ Donation State Machine - Valid Transitions (0.6ms)
✔ Donation State Machine - Terminal States Cannot Transition (0.3ms)
✔ Donation State Machine - Legacy Normalization (0.2ms)
✔ Duplicate Detection - Detects Exact Match on Active Request (2.1ms)
✔ Duplicate Detection - Ignores Completed or Cancelled Requests (0.5ms)
✔ Duplicate Detection - Tolerates Different Hospitals or Cities (0.3ms)
✔ Duplicate Detection - Warning Message Formatter (0.4ms)
✔ Matching Engine - Cooldown Calculation (90 Days) (2.0ms)
✔ Matching Engine - Incompatible Blood Group returns Score 0 (1.0ms)
✔ Matching Engine - Cooldown Ineligible returns Score 0 (0.7ms)
✔ Matching Engine - Full Score Breakdown for Same Area & City (0.7ms)
✔ Matching Engine - Area Match beats City Match only (0.4ms)
✔ Matching Engine - matchDonorsForRequest Ranks Correctly (0.5ms)
✔ Matching Engine - Location Normalization and Case-Insensitive Matching (0.3ms)
✔ OTP Service - Generates 4-digit numeric string (10.7ms)
✔ OTP Service - Expiry and Attempt Constants (0.3ms)
✔ OTP Service - Hash OTP generates SHA-256 hex string (6.9ms)
✔ OTP Service - Verification Success with Valid OTP (1.6ms)
✔ OTP Service - Verification Failure with Wrong OTP (1.1ms)
✔ OTP Service - Verification Failure on Expiry (>10 mins) (0.8ms)
✔ OTP Service - Verification Lockout after 3 Attempts (0.9ms)
✔ OTP Service - Non-4-digit input rejection (0.9ms)
✔ OTP Service - Dual-OTP Completion Condition (0.4ms)
✔ OTP Service - Party OTP Status Analysis (0.4ms)
✔ OTP Service - Regeneration Invariant (1.6ms)
✔ Request State Machine - Status Constants (2.9ms)
✔ Request State Machine - Valid Transitions (0.5ms)
✔ Request State Machine - Invalid Transitions (0.2ms)
✔ Request State Machine - isRequestOpenForMatching (0.3ms)
✔ Request State Machine - Legacy Status Normalization (0.2ms)
✔ Test 1: USER registers as donor -> role = USER, donor profile exists (2.0ms)
✔ Test 2: ADMIN registers as donor -> role = ADMIN, donor profile exists (0.5ms)
✔ Test 3: SUPERADMIN registers as donor -> role = SUPERADMIN, donor profile exists (0.4ms)
✔ Test 4: SUPERADMIN + donor -> superadmin & donor dashboards both accessible (0.4ms)
✔ Test 5: ADMIN + donor -> admin & donor dashboards both accessible (0.2ms)
✔ Test 6: USER + donor -> donor dashboard accessible, admin & superadmin inaccessible (0.2ms)
✔ Test 7: Donor registration must never change role, assignedCity, emailVerified (0.3ms)
✔ Test 8: Firestore security rule behavior matrix across all user personas (0.6ms)
✔ Roles - Canonical Authorization Definitions are uppercase without DONOR (4.2ms)
✔ Roles - normalizeRole handles legacy lowercase and mixed case (0.6ms)
✔ Roles - isAdminRole and isSuperAdminRole (0.5ms)
✔ Roles - hasDonorProfile capability detection (0.4ms)
✔ Roles - resolveMigratedRole preserves previous privileged roles from audit (0.4ms)

Total Tests: 72
Passed: 72
Failed: 0
Duration: 807ms
```

---

## 7. Production Build Verification

`npm run build` executed and completed successfully with exit code 0:
```text
   ▲ Next.js 15.1.6
   - Environments: .env.local

   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (22/22)
 ✓ Generating static pages (22/22)
   Finalizing page optimization ...

Route (app)                              Size     First Load JS
┌ ○ /                                    6.31 kB         260 kB
├ ○ /_not-found                          979 B           106 kB
├ ○ /about                               3.02 kB         257 kB
├ ○ /admin                               2.31 kB         413 kB
├ ƒ /api/donations/otp                   139 B           106 kB
├ ƒ /api/support                         139 B           106 kB
├ ○ /camp                                6.32 kB         289 kB
├ ○ /contact                             5.49 kB         255 kB
├ ○ /dashboard                           4.95 kB         277 kB
├ ○ /faq                                 4.32 kB         254 kB
├ ○ /icon.png                            0 B                0 B
├ ○ /myrequests                          4.2 kB          276 kB
├ ○ /needdonor                           8.08 kB         295 kB
├ ○ /newdonor                            4.58 kB         291 kB
├ ○ /privacy-policy                      1.73 kB         251 kB
├ ○ /profile                             6.29 kB         293 kB
├ ○ /signin                              4.83 kB         257 kB
├ ○ /signup                              5.54 kB         258 kB
├ ○ /superadmin                          5.11 kB         416 kB
├ ○ /support                             3.97 kB         265 kB
├ ○ /terms-and-conditions                1.73 kB         251 kB
└ ○ /verifymail                          2.58 kB         243 kB
```

---

## 8. Deployment & Firebase Guidelines

1. **Firestore Security Rules:**
   Deploy the updated `firestore.rules` containing `/donorCommitments/{donorId}`:
   ```bash
   firebase deploy --only firestore:rules
   ```
2. **Composite Indexes:**
   Ensure the following composite indexes exist in Firebase Console:
   - Collection Group: `donations`
     - Fields: `donorId` (ASC), `status` (ASC), `createdAt` (DESC)
   - Collection: `requests`
     - Fields: `createdByUid` (ASC), `status` (ASC), `createdAt` (DESC)
3. **Data Integrity Compatibility:**
   - Existing active donations are protected by the fallback scanner in `getActiveDonorCommitment` if a legacy document predates the commitment record.
   - Historical records are never deleted; cancellations are preserved with full audit metadata.
