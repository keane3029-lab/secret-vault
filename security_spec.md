# Security Specification: Secure Encrypted Vault

This document outlines the security architecture and validation tests for the Secure Encrypted Vault Firestore rules. This is designed to enforce a zero-knowledge, zero-trust cloud data layer.

## 1. Data Invariants

1. **User Ownership Isolation**: Users can only read, write, update, or delete profiles and records that belong to their verified `request.auth.uid`.
2. **Strict Identity Locking**: The `userId` of any created document must match `request.auth.uid`. Once created, `userId` is immutable.
3. **Temporal Integrity**: All `createdAt` and `updatedAt` fields must match `request.time` exactly on creations and updates.
4. **Field Validation**: No shadow fields can be added. Every string must be size-bounded to prevent "Denial of Wallet" and storage exploitation.
5. **No Blind Passcode Bypassing**: Firebase rules do not allow reading other users' master keys or hashes. All validations are kept client-side or tightly restricted to the owner's own document.
6. **Zero-Knowledge Cipher-Text Integrity**: The database handles only string ciphertexts (`encryptedPayload` and `encryptionIv`) and has no awareness of keys. All strings must be size-constrained (< 500KB per file payload in Firestore).

---

## 2. The "Dirty Dozen" Payloads

Here are twelve hostile payloads attempting to violate identity, integrity, state, or bounds.

### Payload 1: Identity Spoofing - Creating User Settings for a Sibling
* **Target Collection**: `users/{userId}`
* **Intent**: Attempt to create a user settings profile for `user_B` while authenticated as `user_A`.
* **Payload**:
  ```json
  {
    "userId": "user_B",
    "email": "malicious@attacker.com",
    "encryptionSalt": "randomsalt123",
    "createdAt": "request.time",
    "updatedAt": "request.time"
  }
  ```
* **Expected Result**: `PERMISSION_DENIED` (Match constraint `request.auth.uid == userId` fails).

### Payload 2: Privilege Escalation - Self-Assigning Admin
* **Target Collection**: `users/{userId}`
* **Intent**: Write an unrequested `isAdmin: true` attribute onto the user's profile document.
* **Payload**:
  ```json
  {
    "userId": "user_A",
    "email": "userA@gmail.com",
    "encryptionSalt": "randomsalt123",
    "isAdmin": true,
    "createdAt": "request.time",
    "updatedAt": "request.time"
  }
  ```
* **Expected Result**: `PERMISSION_DENIED` (Strict schema block: keys must meet exact size constraints, or `affectedKeys().hasOnly()` rejects `isAdmin`).

### Payload 3: Shadow Read - Reading Another User's Vault Records
* **Target Collection**: `vault_records/{recordId}`
* **Intent**: Querying `vault_records` where `userId` belongs to someone else.
* **Payload**: `getDocFromServer(doc(db, "vault_records", "victim_record_1"))` with caller `user_auth = user_A` and resource `userId = user_B`.
* **Expected Result**: `PERMISSION_DENIED` (Evaluates `resource.data.userId == request.auth.uid` inside `allow read`).

### Payload 4: Orphaned Record - Invariant Theft (Faked Owner ID)
* **Target Collection**: `vault_records/{recordId}`
* **Intent**: authenticated as `user_A` trying to write a vault record but setting its `userId` field to `user_B` to charge their storage or poison their profile.
* **Payload**:
  ```json
  {
    "id": "new_record_1",
    "userId": "user_B",
    "encryptedPayload": "cipher...",
    "encryptionIv": "iv...",
    "createdAt": "request.time",
    "updatedAt": "request.time"
  }
  ```
* **Expected Result**: `PERMISSION_DENIED` (Validation helper `isValidVaultRecord` checks `incoming().userId == request.auth.uid`).

### Payload 5: Immortal Injection - Overwriting Immutable `createdAt`
* **Target Collection**: `vault_records/{recordId}`
* **Intent**: Attempting to update a vault record and changing its immutable `createdAt` timestamp to arbitrary history.
* **Payload**:
  ```json
  {
    "id": "record_1",
    "userId": "user_A",
    "encryptedPayload": "cipher...",
    "encryptionIv": "iv...",
    "createdAt": "1970-01-01T00:00:00Z",
    "updatedAt": "request.time"
  }
  ```
* **Expected Result**: `PERMISSION_DENIED` (Constraint `incoming().createdAt == existing().createdAt` fails).

### Payload 6: Size Exploitation - Massive Resource Poisoning
* **Target Collection**: `vault_records/{recordId}`
* **Intent**: Injecting a 20MB `encryptionIv` to crash parsing memory or induce heavy storage fees ("Denial of Wallet").
* **Payload**:
  ```json
  {
    "id": "record_1",
    "userId": "user_A",
    "encryptedPayload": "cipher...",
    "encryptionIv": "A".repeat(1000000), 
    "createdAt": "request.time",
    "updatedAt": "request.time"
  }
  ```
* **Expected Result**: `PERMISSION_DENIED` (Constraint `encryptionIv.size() <= 128` fails).

### Payload 7: Client Temporal Spoofing - Using Arbitrary High-Latency Timestamps
* **Target Collection**: `vault_records/{recordId}`
* **Intent**: Bypassing server clock validation.
* **Payload**:
  ```json
  {
    "id": "record_1",
    "userId": "user_A",
    "encryptedPayload": "cipher...",
    "encryptionIv": "iv...",
    "createdAt": "request.time",
    "updatedAt": "2050-12-31T23:59:59Z"
  }
  ```
* **Expected Result**: `PERMISSION_DENIED` (Validation check `incoming().updatedAt == request.time` fails).

### Payload 8: Key Poisoning - Injecting Hostile Fields via Update Leak
* **Target Collection**: `vault_records/{recordId}`
* **Intent**: Triggering standard update, but smuggling a ghost field `maliciousBackdoorCode` into the store.
* **Payload**:
  ```json
  {
    "id": "record_1",
    "userId": "user_A",
    "encryptedPayload": "new_cipher...",
    "encryptionIv": "new_iv...",
    "maliciousBackdoorCode": "eval(something)",
    "createdAt": "record_created_time",
    "updatedAt": "request.time"
  }
  ```
* **Expected Result**: `PERMISSION_DENIED` (Strict schema validator `incoming().keys().size() == 6` or `affectedKeys().hasOnly(['encryptedPayload', 'encryptionIv', 'updatedAt'])` restricts edits).

### Payload 9: Anonymous Write - Writing without Authentication
* **Target Collection**: `vault_records/{recordId}`
* **Intent**: Writing a secure note to the general store when `request.auth` is null.
* **Payload**: Same as valid record, but with no authenticated authorization headers.
* **Expected Result**: `PERMISSION_DENIED` (`request.auth != null` is evaluated first).

### Payload 10: Unverified User Bypass
* **Target Collection**: `vault_records/{recordId}`
* **Intent**: Writing or reading when `request.auth.token.email_verified` is `false`.
* **Payload**: Any valid write payload from an unverified email address.
* **Expected Result**: `PERMISSION_DENIED` (`request.auth.token.email_verified == true` mandate fails. If the app supports Google login or passcode, we verify email check or authorize registered entries strictly).

### Payload 11: Spoofed ID Injection
* **Target Collection**: `vault_records/{recordId}`
* **Intent**: Creating a record where `{recordId}` contains characters outside bounds, e.g. `../inject/../../exploit`.
* **Payload**: Writing to `vault_records/../../exploit`.
* **Expected Result**: `PERMISSION_DENIED` (`isValidId` verification restricts keys to alphanumeric and safe hyphens/underscores).

### Payload 12: Blanket Collection Scraping
* **Target Collection**: `vault_records` (List Query)
* **Intent**: Executing a blanket read query `getDocs(collection="vault_records")` to fetch everyone's encrypted secrets.
* **Expected Result**: `PERMISSION_DENIED` (`allow list` evaluates `resource.data.userId == request.auth.uid` and rejects queries lacking the userId filter).

---

## 3. The Test Suite Strategy

All test profiles will assert that:
- Attempts to query `vault_records` without a strict `userId == request.auth.uid` filter are immediately rejected.
- Direct document writes that violate the schema size limits or user ownership are blocked.
- Master locks are never bypassable.
