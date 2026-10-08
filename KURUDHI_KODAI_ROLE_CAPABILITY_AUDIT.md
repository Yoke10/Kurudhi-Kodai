# KURUDHI KODAI — ROLE & DONOR CAPABILITY ARCHITECTURE AUDIT REPORT

**Date:** October 8, 2026  
**Status:** **FULLY RESOLVED & AUDITED**  
**Test Suite:** 48/48 Passing (100% Success)  
**Production Build:** Compiled & Optimized (Exit Code 0)  

---

## 1. Executive Summary & Root Cause Analysis

### 1.1 The Issue
During live Firebase verification, an architectural defect was identified where `DONOR` was treated as a mutually exclusive system authorization role alongside `USER`, `ADMIN`, and `SUPERADMIN`. 

Specifically, in `app/newdonor/page.js`, completing the donor onboarding form executed:
```javascript
// BUGGY IMPLEMENTATION:
await setDoc(doc(db, 'users', user.uid), {
  role: ROLES.DONOR,
  updatedAt: serverTimestamp(),
}, { merge: true });
```
This directly mutated `users/{uid}.role` to `'DONOR'`. When an `ADMIN` or `SUPERADMIN` user registered as a blood donor, their privileged administrative role was overwritten and downgraded to `'DONOR'`, causing immediate revocation of administrative privileges and console access.

### 1.2 Root Cause
1. **Conflation of Authorization vs. Capability**: The previous model conflated administrative authorization privileges (`USER`, `ADMIN`, `SUPERADMIN`) with personal volunteer capabilities (`donors/{uid}`).
2. **Client-side Role Mutation**: Donor onboarding performed an unnecessary update to `users/{uid}`, forcing the role field into `'DONOR'`.
3. **Firestore Rule Permissiveness**: `firestore.rules` permitted account owners to update `role` to `'DONOR'`.

---

## 2. Canonical Role & Capability Architecture

### 2.1 Core Architectural Principle
> **System roles represent authorization privileges strictly.**  
> **Being a blood donor represents a user capability/profile.**  
> **Donor status must NEVER overwrite, downgrade, or replace an existing system authorization role.**

### 2.2 Before vs. After Role Modeling

#### Before (Flawed Model):
```text
System Roles: ['USER', 'DONOR', 'ADMIN', 'SUPERADMIN']
(A user could only be ONE of these at a time. A donor lost ADMIN/SUPERADMIN role).
```

#### After (Canonical Decoupled Model):
```text
Authorization Roles:
  ROLES = {
    USER: 'USER',
    ADMIN: 'ADMIN',
    SUPERADMIN: 'SUPERADMIN',
  }

Capabilities / Profiles:
  DONOR = Document existence at `donors/{uid}`
```

```text
                     USER ACCOUNT
                          │
              ┌───────────┴───────────┐
              │                       │
         SYSTEM ROLE            DONOR CAPABILITY
              │                       │
       USER / ADMIN /            donors/{uid}
        SUPERADMIN                    │
              │                       │
              └───────────┬───────────┘
                          │
                     SAME PERSON
```

### 2.3 User Persona Matrix

| Persona | `users/{uid}.role` | `donors/{uid}` Document | Admin Console | Superadmin Console | Donor Dashboard |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Normal User** | `USER` | Does Not Exist | ❌ No | ❌ No | ❌ (Prompts to register) |
| **USER + Donor** | `USER` | **Exists** | ❌ No | ❌ No | ✅ **Full Access** |
| **Admin (Non-Donor)** | `ADMIN` | Does Not Exist | ✅ **Full Access** | ❌ No | ❌ (Prompts to register) |
| **ADMIN + Donor** | `ADMIN` | **Exists** | ✅ **Full Access** | ❌ No | ✅ **Full Access** |
| **Superadmin (Non-Donor)**| `SUPERADMIN` | Does Not Exist | ✅ **Full Access** | ✅ **Full Access** | ❌ (Prompts to register) |
| **SUPERADMIN + Donor** | `SUPERADMIN` | **Exists** | ✅ **Full Access** | ✅ **Full Access** | ✅ **Full Access** |

---

## 3. Files Modified & Technical Changes

### 3.1 `lib/roles.js`
- Removed `DONOR` from `ROLES` and `ALL_ROLES`.
- Defined `ROLES` strictly as `{ USER: 'USER', ADMIN: 'ADMIN', SUPERADMIN: 'SUPERADMIN' }`.
- Updated `normalizeRole(role)` to safely map legacy `'DONOR'` or `'donor'` values to `ROLES.USER` while preserving `'ADMIN'` and `'SUPERADMIN'`.
- Added helper `hasDonorProfile(donorProfile)`.
- Added helper `resolveMigratedRole(userDocData, auditLogs)`.

### 3.2 `app/newdonor/page.js`
- **Removed lines mutating `users/{uid}.role`**: Donor onboarding now solely writes to `donors/{user.uid}`.
- Guaranteed that `role`, `assignedCity`, and `emailVerified` on `users/{uid}` are never altered during donor registration.
- Added hydration call `await refreshUserProfile()` to refresh donor capability state in `AuthContext`.

### 3.3 `firestore.rules`
- Removed `'DONOR'` and `'donor'` from allowed initial roles on `users/{userId}` create.
- Updated `users/{userId}` update rule: Prohibited ordinary account owners from changing `role` or `assignedCity`.
- Enforced that only `isSuperAdmin()` can perform role modifications.
- Maintained `donors/{donorId}` ownership checks (`isOwner(donorId) || isAdmin()`), ensuring any authenticated user (`USER`, `ADMIN`, `SUPERADMIN`) can create/manage their own donor record without touching their user role.

### 3.4 `context/AuthContext.js`
- Decoupled `userRole` and `donorProfile` / `isDonor`.
- Hydration flow strictly follows:
  1. Firebase Auth listener triggers on auth state change.
  2. Load user document `users/{uid}` and set `userRole = normalizeRole(userData.role)`.
  3. Load donor document `donors/{uid}` and set `donorProfile = donorData`, `isDonor = Boolean(donorData)`.
  4. Expose `hasDonorProfile: Boolean(donorProfile)` in context value.
- Enables `userRole: 'SUPERADMIN'` and `isDonor: true` simultaneously.

### 3.5 `components/Navbar.jsx`
- Upgraded navigation to be capability-based:
  - If user is `SUPERADMIN`: Displays "Superadmin Dashboard" in desktop navbar, profile dropdown, and mobile menu.
  - If user is `ADMIN` or `SUPERADMIN`: Displays "Admin Dashboard" in desktop navbar, profile dropdown, and mobile menu.
  - If user has donor capability (`isDonor`): Displays "Donor Dashboard" in desktop navbar, profile dropdown, and mobile menu.
  - If user is not yet a donor: Displays "Donor Portal" with a "Register as Donor" link.
- A `SUPERADMIN` who is a donor sees **both** "Superadmin Dashboard" and "Donor Dashboard".
- An `ADMIN` who is a donor sees **both** "Admin Dashboard" and "Donor Dashboard".
- Profile dropdown header displays both badges: `Role: [USER | ADMIN | SUPERADMIN]` and `Donor` badge when applicable.

### 3.6 `app/profile/page.js`
- Overhauled profile page layout to distinguish authorization from donor capability.
- Added "Account Overview" header displaying:
  - **Account Role**: `SUPERADMIN` (purple badge), `ADMIN` (red badge), or `USER` (slate badge).
  - **Donor Status**: `Registered Donor` (green badge) or `Not Registered` (amber badge).
- For non-donors (including non-donor Admins/Superadmins), renders full account overview with an invitation to register as a donor, explicitly informing the user that their administrative privileges will be preserved.
- For registered donors, provides quick status, cooldown eligibility, and the complete editable donor profile form.

### 3.7 `app/admin/page.js` & `app/superadmin/page.js`
- Fixed access guards to use `isAdminRole(userRole)` and `isSuperAdminRole(userRole)`.
- Fixed requests fetch effect in `app/admin/page.js` to trigger on `isAdminRole(userRole)`.
- Fixed access denied check in `app/superadmin/page.js` line 1096 (`!isSuperAdminRole(userRole)`).
- Standardized Manage Admins role selection in `app/superadmin/page.js` to `[ROLES.USER, ROLES.ADMIN, ROLES.SUPERADMIN]`.

### 3.8 `app/support/page.js`
- Updated admin authorization check to `isAdminRole(userRole)`.

---

## 4. Migration & Legacy Data Strategy

For existing user documents in Firestore:
1. **Safe Normalization**: `normalizeRole(rawRole)` normalizes legacy `'DONOR'` / `'donor'` to `'USER'`, ensuring no broken queries or unhandled states.
2. **Audit Log Role Recovery**: `resolveMigratedRole(userDocData, auditLogs)` inspects immutable `auditLogs` for historical `ROLE_CHANGED` actions. If an account was previously promoted to `ADMIN` or `SUPERADMIN` before registering as a donor, their privileged role is authoritatively recovered.
3. **Data Preservation**:
   - `donors/{uid}` documents are 100% preserved.
   - Historical donation records and OTP logs remain intact.
   - Historical audit records are immutable and untouched.

---

## 5. Security Invariant Verification

- **OTP Flow**: Remains intact (4-digit cryptographically generated, SHA-256 hashed, server transaction, 10-minute expiry, max 3 attempts).
- **Zero Paid APIs**: Uses browser-native navigation and in-app notifications.
- **Donor PII Protection**: `donors/{donorId}` full documents remain accessible only to the owner (`request.auth.uid == donorId`) or authorized admins (`isAdmin()`).
- **Client Role Tampering Prevention**: Ordinary users cannot update `role` or `assignedCity` on `users/{userId}`. Only superadmin accounts can alter role authorization.

---

## 6. Automated Test Suite Results

Test file: `tests/roleCapabilities.test.js` (Created to verify all 8 required scenarios) + `tests/roles.test.js`.

```text
> node --test tests/**/*.test.js

✔ Blood Compatibility (8 tests) (12.4ms)
✔ Donation State Machine (4 tests) (8.2ms)
✔ Duplicate Detection (4 tests) (6.4ms)
✔ Matching Engine (7 tests) (5.1ms)
✔ OTP Service (7 tests) (40.8ms)
✔ Request State Machine (5 tests) (3.9ms)
✔ Test 1: USER registers as donor -> role = USER, donor profile exists (1.4ms)
✔ Test 2: ADMIN registers as donor -> role = ADMIN, donor profile exists (0.3ms)
✔ Test 3: SUPERADMIN registers as donor -> role = SUPERADMIN, donor profile exists (0.4ms)
✔ Test 4: SUPERADMIN + donor -> superadmin & donor dashboards both accessible (0.4ms)
✔ Test 5: ADMIN + donor -> admin & donor dashboards both accessible (0.3ms)
✔ Test 6: USER + donor -> donor dashboard accessible, admin & superadmin inaccessible (0.2ms)
✔ Test 7: Donor registration must never change role, assignedCity, emailVerified (0.3ms)
✔ Test 8: Firestore security rule behavior matrix across all user personas (0.6ms)
✔ Roles - Canonical Authorization Definitions are uppercase without DONOR (3.6ms)
✔ Roles - normalizeRole handles legacy lowercase and mixed case (0.6ms)
✔ Roles - isAdminRole and isSuperAdminRole (0.4ms)
✔ Roles - hasDonorProfile capability detection (0.4ms)
✔ Roles - resolveMigratedRole preserves previous privileged roles from audit (0.4ms)

Total: 48 passed, 0 failed, 0 skipped
Duration: 269ms
```

---

## 7. Production Build Verification

```text
> npx next build

   ▲ Next.js 15.1.6
   - Environments: .env.local

   Creating an optimized production build ...
 ✓ Compiled successfully
   Collecting page data ...
 ✓ Generating static pages (22/22)
   Finalizing page optimization ...

Route (app)                              Size     First Load JS
┌ ○ /                                    6.31 kB         259 kB
├ ○ /about                               3.88 kB         256 kB
├ ○ /admin                               8.85 kB         406 kB
├ ƒ /api/donations/otp                   139 B           106 kB
├ ƒ /api/support                         139 B           106 kB
├ ○ /camp                                6.46 kB         289 kB
├ ○ /dashboard                           9.21 kB         265 kB
├ ○ /myrequests                          5.84 kB         274 kB
├ ○ /needdonor                           11.5 kB         294 kB
├ ○ /newdonor                            4.25 kB         290 kB
├ ○ /profile                             5.86 kB         292 kB
├ ○ /signin                              4.83 kB         255 kB
├ ○ /signup                              5.54 kB         256 kB
├ ○ /superadmin                          15.5 kB         413 kB
├ ○ /support                             3.94 kB         260 kB
└ ○ /verifymail                          2.58 kB         241 kB

Build Exit Code: 0 (Success)
```

---

## 8. Live Firebase Verification Steps

To verify on the connected live Firebase environment:
1. **Sign in as Superadmin** (or promote your account to `SUPERADMIN` via Firebase Console or `/superadmin` console).
2. Note your current role in the navbar badge and `/profile`:
   - Account Role: `SUPERADMIN`
   - Donor Status: `Not Registered`
3. Navigate to `/newdonor` and submit a new donor registration form.
4. **Verification Point 1**: After successful submission, check `/profile`:
   - Account Role: Still **`SUPERADMIN`** (NOT downgraded!).
   - Donor Status: **`Registered Donor`**.
5. **Verification Point 2**: Check navigation links:
   - You can see **both** "Donor Dashboard" (`/dashboard`) and "Superadmin Dashboard" (`/superadmin`).
6. **Verification Point 3**: In Firestore Console:
   - `users/{yourUid}.role` remains `'SUPERADMIN'`.
   - `donors/{yourUid}` exists with your blood group and donor information.
7. **Verification Point 4**: Check Admin flow:
   - An `ADMIN` who registers as a donor retains `role: 'ADMIN'` and `assignedCity: '...'`.
   - Sees both "Admin Dashboard" and "Donor Dashboard".
8. **Verification Point 5**: Normal `USER` who registers as a donor:
   - Retains `role: 'USER'`.
   - Cannot access `/admin` or `/superadmin`.
   - Can access `/dashboard` (Donor Dashboard).
