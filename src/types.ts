/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type DisguiseType = 'calculator' | 'notepad' | 'system_logs' | 'none';

export type VaultItemType = 'note' | 'password' | 'file';

export interface DecryptedVaultItem {
  id: string;
  type: VaultItemType;
  title: string;
  category?: string;
  // Note fields
  content?: string;
  // Password fields
  username?: string;
  password?: string;
  website?: string;
  // File fields
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  fileData?: string; // Base64 representation of file
  
  updatedAt: number; // local timestamp
  createdAt: number; // local timestamp
}

export interface EncryptedVaultRecord {
  id: string;
  userId: string;
  encryptedPayload: string; // Base64 AES-GCM cipher
  encryptionIv: string;      // Base64 Initialization Vector
  createdAt: any;            // Firestore Timestamp or IsoString
  updatedAt: any;            // Firestore Timestamp or IsoString
}

export interface UserProfile {
  userId: string;
  email: string;
  createdAt: any;
  updatedAt: any;
  encryptionSalt: string;
  passcodeSalt?: string;
  passcodeHash?: string;
  decoyPasscodeHash?: string;
  disguiseType: DisguiseType;
  // Security recovery fields
  recoveryOtp?: string;
  recoveryOtpExpiresAt?: number;
  wrappedMasterKey?: string;
  wrappedMasterKeyIv?: string;
  recoveryKeyHash?: string;
}

export interface ActiveSession {
  masterKey: CryptoKey;             // Derived encryption symmetric key
  isDecoy: boolean;                 // Set to true if decoy PIN was entered
  passcodeUsed: string;             // Raw entered passcode/PIN
  sessionExpiresAt: number;         // Time of automatic lock
}
