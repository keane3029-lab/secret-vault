/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Helper functions for binary representation conversions
export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Derives a cryptographic CryptoKey (AES-GCM 256) from a user master password or PIN.
 * This runs PBKDF2 with 100,000 iterations and SHA-256 to ensure custom safety.
 */
export async function deriveKeyFromPassword(password: string, saltHexOrBase64: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  
  // Parse the salt buffer (supporting hex or base64 fallback)
  let saltBuffer: Uint8Array;
  try {
    // If it's base64 encoded
    const binary = atob(saltHexOrBase64);
    saltBuffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      saltBuffer[i] = binary.charCodeAt(i);
    }
  } catch {
    // String fallback
    saltBuffer = encoder.encode(saltHexOrBase64);
  }

  // Import raw password as a key-producing material
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  // Derive AES 256-GCM Key
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Generates a clean cryptographically secure random base64 salt.
 */
export function generateRandomSalt(bytesCount = 16): string {
  const array = new Uint8Array(bytesCount);
  window.crypto.getRandomValues(array);
  return bufferToBase64(array.buffer);
}

/**
 * Perform AES-256-GCM encryption on arbitrary text string
 */
export async function encryptData(plaintext: string, key: CryptoKey): Promise<{ ciphertext: string; iv: string }> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(plaintext);
  
  // Encrypt with AES-GCM (Requires a 12-byte initialization vector)
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    dataBuffer
  );

  return {
    ciphertext: bufferToBase64(encryptedBuffer),
    iv: bufferToBase64(iv.buffer)
  };
}

/**
 * Perform AES-256-GCM decryption on ciphertext utilizing the key and IV
 */
export async function decryptData(ciphertextBase64: string, ivBase64: string, key: CryptoKey): Promise<string> {
  const encryptedBuffer = base64ToBuffer(ciphertextBase64);
  const ivBuffer = base64ToBuffer(ivBase64);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(ivBuffer)
    },
    key,
    encryptedBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

/**
 * Sha256 hashing helper - useful for passcode validation
 */
export async function hashSHA256(text: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text + salt);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  return bufferToBase64(hashBuffer);
}
