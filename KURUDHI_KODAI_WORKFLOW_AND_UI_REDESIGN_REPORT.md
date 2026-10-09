# KURUDHI KODAI — Donation Workflow Reconstruction, Admin Console Redesign & Complete Application UI/UX Modernization

**Date:** October 9, 2026  
**Project:** Kurudhi Kodai (`Yoke10/Kurudhi-Kodai`)  
**Status:** Completed & Production Verified  

---

## 1. Executive Summary

This engineering report documents the comprehensive reconstruction of the Kurudhi Kodai blood donation coordination platform. The work accomplished four interconnected objectives:

1. **Resolved Requester OTP Bug:** Eliminated the runtime error `ReferenceError: setDonation is not defined` in `app/myrequests/page.js` by establishing an authenticated, properly scoped state management flow.
2. **Rebuilt Dual-Party OTP Verification Lifecycle:** Re-architected donation verification so that a donation is completed if and only if **both** the requester verifies the donor's verbal code AND the donor verifies the requester's verbal code on-site. Neither party can complete a donation unilaterally.
3. **Decomposed and Redesigned Admin & Superadmin Consoles:** Transformed monolithic management pages (`app/admin/page.js` and `app/superadmin/page.js`, formerly >5,000 lines of entangled code) into modular, responsive dashboards powered by a shared `AdminShell`, reusable `DataTable`, operational drawers, and secure two-party donation tracking without exposing plaintext OTPs or hashes.
4. **Modernized UI/UX System-Wide:** Standardized the design system around a clean, healthcare-adjacent aesthetic with strategic red accents, accessible contrast, mobile-friendly numeric keyboards for OTPs, and zero browser `alert()` or `confirm()` dialogs.

---

## 2. Root Cause Analysis

### 2.1 Requester OTP `ReferenceError: setDonation is not defined`
* **Location:** `handleGenerateRequesterOtp` within `app/myrequests/page.js`.
* **Root Cause:** The `RequesterDonationItem` child component received `donation` as a prop from the parent `MyRequestsPage` (which subscribed to Firestore via `onSnapshot`). A previous refactoring attempted to perform an optimistic update using `setDonation(prev => ...)`, which was never declared or passed to the child. When a requester clicked "Generate / Reveal My Code", JavaScript threw an unhandled `ReferenceError`.
* **Resolution:** Replaced the fragile local state mutation with the standalone `DualOtpVerification` component (`currentRole="REQUESTER"`). State updates are received automatically through Firestore document listeners and session storage retention (`sessionStorage`), preventing crashes without requiring full-page reloads.

### 2.2 Unilateral & Vulnerable OTP Verification
* **Location:** `app/api/donations/otp/route.js` and `DonorRequestCard` in `app/dashboard/page.js`.
* **Root Cause:** Both the client and server API previously completed donations immediately upon a single party verifying an OTP. This violated the fundamental safety requirement of physical arrival and exchange between the patient attenders and the donor.
* **Resolution:** Introduced distinct verification flags:
  * `donorOtpVerified`: requester has entered and verified donor's 4-digit code.
  * `requesterOtpVerified`: donor has entered and verified requester's 4-digit code.
  * Completion condition: `donorOtpVerified === true && requesterOtpVerified === true`.
  * Atomically enforced both in client transactions and the server API.

### 2.3 Transient OTP Loss Across Route Navigation & Refreshes
* **Root Cause:** Plaintext OTPs were previously held exclusively in ephemeral React component memory. Refreshing the browser or navigating to another page destroyed the code, prompting unnecessary regeneration.
* **Resolution:** Implemented client-side session storage retention via `saveRetainedOtp`, `getRetainedOtp`, and `clearRetainedOtp` in `lib/otpService.js`. Plaintext codes are bound to the user's UID, donation ID, and role in `sessionStorage` with an active 10-minute expiry timestamp. Plaintext OTPs are **never** persisted to Firestore.

---

## 3. Files Modified & Created

| File | Type | Changes |
| :--- | :--- | :--- |
| `lib/otpService.js` | Core Module | Added `saveRetainedOtp`, `getRetainedOtp`, `clearRetainedOtp`, `isDualOtpFullyVerified`, and `getPartyOtpStatus` helpers. |
| `components/ui/StatusBadge.jsx` | UI Component | Reusable badge supporting roles, OTP stages (`VERIFIED`, `ACTIVE`, `EXPIRED`, `LOCKED`, `NOT_GENERATED`), request states, and donation states. |
| `components/donations/DualOtpVerification.jsx` | Feature Component | Unified 5-stage dual-OTP verification UI with countdowns, inline 4-digit numeric inputs, attempt tracking, and atomic transactional completion. |
| `app/myrequests/page.js` | Route | Replaced broken `RequesterDonationItem` with `DualOtpVerification` (`currentRole="REQUESTER"`), resolving `ReferenceError`. |
| `app/dashboard/page.js` | Route | Refactored `DonorRequestCard` to use `DualOtpVerification` (`currentRole="DONOR"`) and session retention on donation pledge. |
| `app/api/donations/otp/route.js` | API Route | Enforced two-party verification rule: first verification updates partial status (`DONOR_CONFIRMED` / `REQUESTER_CONFIRMED`); second verification executes atomic transaction. |
| `components/ui/DataTable.jsx` | UI Component | Reusable table with client-side search, column sorting, pagination, and responsive mobile card fallback. |
| `components/admin/DonationDetailsModal.jsx` | Admin Modal | Two-party verification inspection modal showing lifecycle timestamps, donor/requester info, and stage statuses without exposing OTP hashes or secrets. |
| `components/admin/RequestDetailsModal.jsx` | Admin Modal | Operational dialog for request verification, rejection (with mandatory reason), emergency toggling, and cancellation review. |
| `components/admin/AdminShell.jsx` | Admin Shell | Professional layout shell with collapsible sidebar, top bar, breadcrumbs, user role indicator, and regional city scope. |
| `components/admin/AdminOverview.jsx` | Admin Tab | Live KPI cards computed from Firestore collections, with invariant safety banners. |
| `components/admin/AdminRequestsTab.jsx` | Admin Tab | Operational requests management table with status, blood group, and urgency filters, plus Excel export. |
| `components/admin/AdminDonationsTab.jsx` | Admin Tab | Dual-OTP tracking table with stage filters and inspection modal triggers. |
| `components/admin/AdminDonorsTab.jsx` | Admin Tab | Donors directory with cooldown calculations and availability filters. |
| `components/admin/AdminCampsTab.jsx` | Admin Tab | Blood camp management and camp creation dialog. |
| `components/admin/AdminUsersTab.jsx` | Admin Tab | Superadmin role management interface preserving role-donor capability decoupling. |
| `components/admin/AdminAuditTab.jsx` | Admin Tab | Immutable system audit log viewer. |
| `app/admin/page.js` | Route | Decomposed 1.8k-line monolith into modular, maintainable composition using `AdminShell`. |
| `app/superadmin/page.js` | Route | Decomposed 3.2k-line monolith into modular, maintainable composition using `AdminShell`. |
| `firestore.rules` | Security | Added recursive collection group rule `match /{path=**}/donations/{donationId}` for authorized admin queries. |
| `components/Navbar.jsx` | Navigation | Removed public `/admin` and `/superadmin` tabs; integrated secure console links inside user profile dropdown for authorized users. |
| `app/support/page.js` | Route | Replaced browser `alert()` with `react-hot-toast` notifications. |
| `tests/otpService.test.js` | Test Suite | Added unit tests for dual-OTP completion conditions, status analyzer, and regeneration invariants. |

---

## 4. Architectural Details

### 4.1 Two-Party Dual-OTP State Machine
```
[DONOR_MATCHED] 
       ↓ (Donor accepts pledge)
[DONOR_ACCEPTED] 
       ↓ (Contact established / hospital arrival)
[OTP_PENDING] 
       ├── (Requester verifies Donor OTP) ──> [DONOR_CONFIRMED] ──┐
       │                                                          ├──> [DONATION_COMPLETED]
       └── (Donor verifies Requester OTP) ──> [REQUESTER_CONFIRMED] ┘
       ↓ (Cancellation allowed prior to completion)
[CANCELLED]
```

#### Dual Verification Invariant:
* Neither party can complete a donation unilaterally.
* `donorOtpVerified === true` indicates requester verified donor's code.
* `requesterOtpVerified === true` indicates donor verified requester's code.
* Final atomic completion executes inside `runTransaction`:
  1. Verifies `donorOtpVerified === true` AND `requesterOtpVerified === true`.
  2. Ensures donation is not already marked completed (idempotency).
  3. Ensures `unitsDonated < unitsNeeded`.
  4. Increments `unitsDonated` by exactly 1.
  5. Updates request status to `PARTIALLY_FULFILLED` or `FULFILLED`.
  6. Sets donation status to `DONATION_COMPLETED` and stamps `completedAt`.
  7. Updates donor profile cooldown (`lastDonationAt`, `availabilityStatus = 'COOLDOWN'`).

### 4.2 OTP Security & Retention Strategy
* **4-Digit Numeric String:** Securely generated using Node.js/Web Crypto APIs.
* **Storage Protection:** Only the SHA-256 hash (`donorOtpHash`, `requesterOtpHash`) is stored in Firestore.
* **No Plaintext in Firestore:** Security rules forbid `donorOtp`, `requesterOtp`, or `otp` field creation.
* **Admin Privacy:** Administrative panels and audit logs never expose plaintext OTPs or hashes; they display semantic statuses (`ACTIVE`, `VERIFIED`, `EXPIRED`, `LOCKED`, `NOT_GENERATED`).
* **Session Storage Retention:** Client keeps plaintext in `sessionStorage` scoped by key `kk_otp_${uid}_${donationId}_${role}` with a 10-minute expiry timestamp. Survives page reloads and tab navigation.
* **Lockout:** 3 failed attempts lock the OTP until explicitly regenerated.

### 4.3 Role & Capability Decoupling
* **System Roles:** `USER`, `ADMIN`, `SUPERADMIN`.
* **Capability:** `donors/{uid}` profile.
* An administrator or superadmin who registers as a donor keeps their privileged role intact while gaining donor capabilities (`isDonor = true`). Donor registration never overwrites `users/{uid}.role` with `DONOR`.

---

## 5. Test Results

All 52 unit and regression tests pass without errors:

```bash
> node --test tests/**/*.test.js

✔ Blood Compatibility - Disclaimer Presence (3.08ms)
✔ Blood Compatibility - Valid Blood Groups List (0.45ms)
✔ Blood Compatibility - O- Universal Donor (0.38ms)
✔ Blood Compatibility - AB+ Universal Recipient (0.74ms)
✔ Blood Compatibility - Incompatible Combinations (0.26ms)
✔ Blood Compatibility - Same Blood Group Compatibility (0.25ms)
✔ Blood Compatibility - getCompatibleDonorGroups (2.37ms)
✔ Blood Compatibility - getCompatibleRecipientGroups (0.32ms)
✔ Donation State Machine - States Defined (1.62ms)
✔ Donation State Machine - Valid Transitions (1.72ms)
✔ Donation State Machine - Terminal States Cannot Transition (0.30ms)
✔ Donation State Machine - Legacy Normalization (0.21ms)
✔ Duplicate Detection - Detects Exact Match on Active Request (1.70ms)
✔ Duplicate Detection - Ignores Completed or Cancelled Requests (0.43ms)
✔ Duplicate Detection - Tolerates Different Hospitals or Cities (0.22ms)
✔ Duplicate Detection - Warning Message Formatter (0.32ms)
✔ Matching Engine - Cooldown Calculation (90 Days) (1.68ms)
✔ Matching Engine - Incompatible Blood Group returns Score 0 (0.72ms)
✔ Matching Engine - Cooldown Ineligible returns Score 0 (0.36ms)
✔ Matching Engine - Full Score Breakdown for Same Area & City (0.80ms)
✔ Matching Engine - Area Match beats City Match only (0.37ms)
✔ Matching Engine - matchDonorsForRequest Ranks Correctly (0.45ms)
✔ Matching Engine - Location Normalization and Case-Insensitive Matching (0.28ms)
✔ OTP Service - Generates 4-digit numeric string (10.14ms)
✔ OTP Service - Expiry and Attempt Constants (0.29ms)
✔ OTP Service - Hash OTP generates SHA-256 hex string (7.17ms)
✔ OTP Service - Verification Success with Valid OTP (2.03ms)
✔ OTP Service - Verification Failure with Wrong OTP (1.27ms)
✔ OTP Service - Verification Failure on Expiry (>10 mins) (0.80ms)
✔ OTP Service - Verification Lockout after 3 Attempts (0.87ms)
✔ OTP Service - Non-4-digit input rejection (0.89ms)
✔ OTP Service - Dual-OTP Completion Condition (0.46ms)
✔ OTP Service - Party OTP Status Analysis (0.81ms)
✔ OTP Service - Regeneration Invariant (2.02ms)
✔ Request State Machine - Status Constants (2.55ms)
✔ Request State Machine - Valid Transitions (0.29ms)
✔ Request State Machine - Invalid Transitions (0.14ms)
✔ Request State Machine - isRequestOpenForMatching (0.36ms)
✔ Request State Machine - Legacy Status Normalization (0.39ms)
✔ Test 1: USER registers as donor -> role = USER, donor profile exists (1.42ms)
✔ Test 2: ADMIN registers as donor -> role = ADMIN, donor profile exists (0.25ms)
✔ Test 3: SUPERADMIN registers as donor -> role = SUPERADMIN, donor profile exists (0.18ms)
✔ Test 4: SUPERADMIN + donor -> superadmin & donor dashboards both accessible (0.17ms)
✔ Test 5: ADMIN + donor -> admin & donor dashboards both accessible (0.13ms)
✔ Test 6: USER + donor -> donor dashboard accessible, admin & superadmin inaccessible (0.12ms)
✔ Test 7: Donor registration must never change role, assignedCity, emailVerified (0.27ms)
✔ Test 8: Firestore security rule behavior matrix across all user personas (0.42ms)
✔ Roles - Canonical Authorization Definitions are uppercase without DONOR (2.86ms)
✔ Roles - normalizeRole handles legacy lowercase and mixed case (0.20ms)
✔ Roles - isAdminRole and isSuperAdminRole (0.18ms)
✔ Roles - hasDonorProfile capability detection (0.15ms)
✔ Roles - resolveMigratedRole preserves previous privileged roles from audit (0.24ms)

ℹ tests 52
ℹ suites 0
ℹ pass 52
ℹ fail 0
```

---

## 6. Next.js Production Build Result

Executing `npx next build` succeeded with exit code 0 across all 22 static and dynamic routes:

```text
   ▲ Next.js 15.1.6
   - Environments: .env.local

   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (22/22)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                              Size     First Load JS
┌ ○ /                                    6.32 kB         260 kB
├ ○ /_not-found                          983 B           106 kB
├ ○ /about                               3.89 kB         258 kB
├ ○ /admin                               2.33 kB         413 kB
├ ƒ /api/donations/otp                   142 B           106 kB
├ ƒ /api/support                         142 B           106 kB
├ ○ /camp                                6.33 kB         290 kB
├ ○ /contact                             5.5 kB          255 kB
├ ○ /dashboard                           7.76 kB         273 kB
├ ○ /faq                                 4.33 kB         254 kB
├ ○ /icon.png                            0 B                0 B
├ ○ /myrequests                          3.57 kB         282 kB
├ ○ /needdonor                           8.09 kB         296 kB
├ ○ /newdonor                            4.59 kB         292 kB
├ ○ /privacy-policy                      1.74 kB         251 kB
├ ○ /profile                             6.3 kB          294 kB
├ ○ /signin                              4.83 kB         257 kB
├ ○ /signup                              5.55 kB         258 kB
├ ○ /superadmin                          5.12 kB         416 kB
├ ○ /support                             3.97 kB         265 kB
├ ○ /terms-and-conditions                1.74 kB         251 kB
└ ○ /verifymail                          2.58 kB         243 kB
+ First Load JS shared by all            105 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

---

## 7. Firebase Deployment Considerations

1. **Deploy Security Rules:**
   Execute `firebase deploy --only firestore:rules` to publish the updated collection group rules (`match /{path=**}/donations/{donationId}`) ensuring administrative queries operate securely.
2. **Collection Group Indexes:**
   Ensure Firestore has enabled collection group queries on `donations` for timestamp sorting if requested by the Firebase Console.
3. **Billing & External Services:**
   No paid third-party services (no Twilio, WhatsApp Business, Google Maps Billing, or Paid Cloud Functions) were introduced. All matching remains deterministic and runs at zero external infrastructure cost.
