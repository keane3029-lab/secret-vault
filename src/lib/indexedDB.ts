/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EncryptedVaultRecord } from '../types';

const DB_NAME = 'secure_vault_db';
const DB_VERSION = 1;
const STORE_NAME = 'local_vault';

export function initLocalDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        // Index by userId for rapid filtering of different credentials
        store.createIndex('userId', 'userId', { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function saveLocalItem(record: EncryptedVaultRecord): Promise<void> {
  const db = await initLocalDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    // Make sure timestamps are clean serialized formats
    const putRequest = store.put({
      id: record.id,
      userId: record.userId,
      encryptedPayload: record.encryptedPayload,
      encryptionIv: record.encryptionIv,
      createdAt: typeof record.createdAt === 'object' && record.createdAt?.toDate ? record.createdAt.toDate().getTime() : record.createdAt,
      updatedAt: typeof record.updatedAt === 'object' && record.updatedAt?.toDate ? record.updatedAt.toDate().getTime() : record.updatedAt,
    });

    putRequest.onsuccess = () => resolve();
    putRequest.onerror = () => reject(putRequest.error);
  });
}

export async function getLocalItems(userId: string): Promise<EncryptedVaultRecord[]> {
  const db = await initLocalDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('userId');
    const request = index.getAll(userId);

    request.onsuccess = () => {
      resolve(request.result || []);
    };
    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function deleteLocalItem(id: string): Promise<void> {
  const db = await initLocalDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearLocalDB(userId: string): Promise<void> {
  const db = await initLocalDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('userId');
    const request = index.openCursor(userId);

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}
