/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  getDocs, 
  setDoc,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  where
} from 'firebase/firestore';
import { 
  ShieldCheck, 
  ShieldAlert,
  Key, 
  FileText, 
  Settings, 
  Trash2, 
  Plus, 
  Search, 
  Copy, 
  Download, 
  Upload, 
  LogOut, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  User, 
  Globe, 
  File, 
  CloudRain, 
  CloudLightning,
  Check,
  Flame,
  Binary,
  Shield,
  Clock,
  Sparkles,
  Lock,
  LockKeyhole
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { encryptData, decryptData, bufferToBase64, base64ToBuffer } from '../lib/crypto';
import { saveLocalItem, getLocalItems, deleteLocalItem, clearLocalDB } from '../lib/indexedDB';
import { ActiveSession, DecryptedVaultItem, EncryptedVaultRecord, DisguiseType, UserProfile } from '../types';

interface VaultDashboardProps {
  user: any;
  profile: UserProfile | null;
  activeSession: ActiveSession;
  onLogout: () => void;
  onLockSession: () => void;
  onRefreshProfile: () => void;
}

export default function VaultDashboard({
  user,
  profile,
  activeSession,
  onLogout,
  onLockSession,
  onRefreshProfile
}: VaultDashboardProps) {
  // Navigation tabs
  type TabName = 'passwords' | 'notes' | 'files' | 'security';
  const [activeTab, setActiveTab] = useState<TabName>('passwords');

  // Vault records state
  const [items, setItems] = useState<DecryptedVaultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string>('Synced');

  // Modal / Interaction states
  const [showItemForm, setShowItemForm] = useState(false);
  const [formType, setFormType] = useState<'note' | 'password' | 'file'>('note');
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState('Personal');
  // Password form specific
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formWebsite, setFormWebsite] = useState('');
  // Note form specific
  const [formContent, setFormContent] = useState('');
  // File upload state
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileUploadBase64, setFileUploadBase64] = useState<string>('');
  const [fileDetails, setFileDetails] = useState<{ name: string; size: number; type: string } | null>(null);

  // Password Generator UI States
  const [genLength, setGenLength] = useState(16);
  const [genUpper, setGenUpper] = useState(true);
  const [genLower, setGenLower] = useState(true);
  const [genNums, setGenNums] = useState(true);
  const [genSyms, setGenSyms] = useState(true);
  const [generatedResult, setGeneratedResult] = useState('');

  // SHTF Destruct confirmation sequence
  const [destructConfirm, setDestructConfirm] = useState(false);
  const [destructCountdown, setDestructCountdown] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Copy status notifier helper
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Password Visibility Toggle Map
  const [visiblePasswords, setVisiblePasswords] = useState<{ [id: string]: boolean }>({});

  useEffect(() => {
    loadVaultItems();
    generatePassword(); // bootstrap password generator with safe values
  }, [activeSession]);

  // Handle countdown Timer for Destruct
  useEffect(() => {
    if (destructCountdown === null) return;
    if (destructCountdown <= 0) {
      triggerSelfDestructSequence();
      return;
    }
    const timer = setTimeout(() => {
      setDestructCountdown(prev => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [destructCountdown]);

  // Load items from local IndexedDB and decrypt them inside browser memory
  const loadVaultItems = async () => {
    setLoading(true);
    setSyncStatusMsg('Decrypting local cache...');
    try {
      // 1. Fetch locally stored encrypted items
      const localRecords = await getLocalItems(user.uid);
      
      const decryptedList: DecryptedVaultItem[] = [];

      for (const rec of localRecords) {
        try {
          const decryptedJsonStr = await decryptData(
            rec.encryptedPayload,
            rec.encryptionIv,
            activeSession.masterKey
          );
          const decryptedItem = JSON.parse(decryptedJsonStr) as DecryptedVaultItem;
          decryptedList.push(decryptedItem);
        } catch (decryptErr) {
          // If we cannot decrypt, it belongs to the other coordinate (e.g. real items fail to decrypt in decoy PIN log, which is expected!)
          // Or salt is stale. We silently pass as expected in Zero-Knowledge.
        }
      }

      setItems(decryptedList);
      setSyncStatusMsg(activeSession.isDecoy ? 'Decoy Sandbox Enabled' : 'Secure Session Local-Ready');
    } catch (err) {
      console.error('Error loading local vault items:', err);
    } finally {
      setLoading(false);
    }
  };

  // 14+ Character High-Entropy Password Generator
  const generatePassword = () => {
    const uppers = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowers = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

    let pool = '';
    if (genUpper) pool += uppers;
    if (genLower) pool += lowers;
    if (genNums) pool += numbers;
    if (genSyms) pool += symbols;

    if (!pool) pool = lowers + numbers; // fallback

    let result = '';
    const buffer = new Uint32Array(genLength);
    window.crypto.getRandomValues(buffer);
    
    for (let i = 0; i < genLength; i++) {
      result += pool[buffer[i] % pool.length];
    }
    
    setGeneratedResult(result);
    // Auto-populate form password if it is open
    if (showItemForm && formType === 'password') {
      setFormPassword(result);
    }
  };

  // Drag and drop mechanics for confidential files
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    if (file.size > 800000) {
      alert("To preserve IndexedDB resources, individual files must be under 800KB.");
      return;
    }
    setFileToUpload(file);
    setFileDetails({ name: file.name, size: file.size, type: file.type });

    // Read to Base64
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const base64Content = result.split(',')[1];
      setFileUploadBase64(base64Content);
    };
    reader.readAsDataURL(file);
  };

  // Handle saving new items (Local-first with auto cloud-sync if configured and not decoy)
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle) return;

    setLoading(true);
    try {
      const itemId = 'rec_' + Math.random().toString(36).substring(2, 11);
      
      const newItem: DecryptedVaultItem = {
        id: itemId,
        type: formType,
        title: formTitle,
        category: formCategory,
        updatedAt: Date.now(),
        createdAt: Date.now()
      };

      if (formType === 'password') {
        newItem.username = formUsername;
        newItem.password = formPassword;
        newItem.website = formWebsite;
      } else if (formType === 'note') {
        newItem.content = formContent;
      } else if (formType === 'file') {
        if (!fileUploadBase64 || !fileDetails) {
          alert("File data is pending parsing. Please wait or upload again.");
          setLoading(false);
          return;
        }
        newItem.fileName = fileDetails.name;
        newItem.fileType = fileDetails.type;
        newItem.fileSize = fileDetails.size;
        newItem.fileData = fileUploadBase64;
      }

      // Convert JSON plaintext item to cipher payload client-side
      const jsonStr = JSON.stringify(newItem);
      const { ciphertext, iv } = await encryptData(jsonStr, activeSession.masterKey);

      // Create standard record payload
      const record: EncryptedVaultRecord = {
        id: itemId,
        userId: user.uid,
        encryptedPayload: ciphertext,
        iv: iv, // standard check
        createdAt: new Date(),
        updatedAt: new Date()
      } as any;

      // To comply with rules formatting
      (record as any).encryptionIv = iv;

      // 1. Save Locally to IndexedDB (Instant local-first feedback)
      await saveLocalItem(record);

      // 2. Cloud Backups Sync (Only if auto-sync toggled, and user has approved, bypassed for Decoy Mode)
      if (syncEnabled && !activeSession.isDecoy) {
        setIsSyncing(true);
        const path = `vault_records/${itemId}`;
        try {
          await setDoc(doc(db, 'vault_records', itemId), {
            id: itemId,
            userId: user.uid,
            encryptedPayload: ciphertext,
            encryptionIv: iv,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          setSyncStatusMsg('Cloud Backup Updated');
        } catch (syncErr: any) {
          console.warn("Cloud Sync halted. Rules blocked write.", syncErr);
          setSyncStatusMsg('Pending Sync: Rules Protected');
        } finally {
          setIsSyncing(false);
        }
      } else {
        setSyncStatusMsg(activeSession.isDecoy ? 'Isolated Decoy Session' : 'Saved Locally (Cloud off)');
      }

      // Reset form view
      setItems(prev => [newItem, ...prev]);
      setShowItemForm(false);
      resetFormValues();
    } catch (saveErr) {
      console.error("Save transaction aborted.", saveErr);
    } finally {
      setLoading(false);
    }
  };

  const resetFormValues = () => {
    setFormTitle('');
    setFormCategory('Personal');
    setFormUsername('');
    setFormPassword('');
    setFormWebsite('');
    setFormContent('');
    setFileToUpload(null);
    setFileUploadBase64('');
    setFileDetails(null);
  };

  // Perform "Data Shredding" (Immediate client purge + cloud sync deletion)
  const handleShredItem = async (itemId: string) => {
    setLoading(true);
    try {
      // 1. Delete from local IndexedDB
      await deleteLocalItem(itemId);

      // 2. Wipe from Cloud Backups (Only if user is not in decoy mode and has sync)
      if (syncEnabled && !activeSession.isDecoy) {
        setIsSyncing(true);
        const path = `vault_records/${itemId}`;
        try {
          await deleteDoc(doc(db, 'vault_records', itemId));
          setSyncStatusMsg('Wiped both Cloud + Local');
        } catch (dbErr) {
          // Cloud might not have it or rules failed
        } finally {
          setIsSyncing(false);
        }
      } else {
        setSyncStatusMsg('Local Purge Accomplished');
      }

      // Refresh page visual list
      setItems(prev => prev.filter(i => i.id !== itemId));
    } catch (shredErr) {
      console.error("Shredding aborted.", shredErr);
    } finally {
      setLoading(false);
    }
  };

  // Downloading and decrypting confidential documents Base64 binary content
  const handleDownloadFile = (item: DecryptedVaultItem) => {
    if (!item.fileData) return;
    try {
      const binaryStr = atob(item.fileData);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      
      const blob = new Blob([bytes.buffer], { type: item.fileType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = item.fileName || 'confidential_document.pdf';
      document.body.appendChild(a);
      a.click();
      
      // Clean temporary reference
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Decrypt payload format error while producing file binary stream.");
    }
  };

  // Backup and Restore Coordinate Utilities
  const handleForceCloudBackup = async () => {
    if (activeSession.isDecoy) {
      setSyncStatusMsg("Operation locked during decoy sandbox mode.");
      return;
    }
    setIsSyncing(true);
    setSyncStatusMsg('Backing up database...');
    let successCount = 0;

    try {
      // Fetch all local records to encrypt and overwrite
      const localRecords = await getLocalItems(user.uid);
      for (const rec of localRecords) {
        await setDoc(doc(db, 'vault_records', rec.id), {
          id: rec.id,
          userId: user.uid,
          encryptedPayload: rec.encryptedPayload,
          encryptionIv: rec.encryptionIv,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        successCount++;
      }
      setSyncStatusMsg(`Successfully backed up ${successCount} records to Cloud.`);
    } catch (err) {
      console.error("Manual Backup blocked by Firebase Security Rules.", err);
      setSyncStatusMsg("Rules Denied Write: Verify auth permission.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRestoreFromCloud = async () => {
    if (activeSession.isDecoy) {
      // Act completely normal. Load no backup but announce completed successfully.
      setIsSyncing(true);
      setSyncStatusMsg('Fetching cloud snapshots...');
      setTimeout(() => {
        setIsSyncing(false);
        setSyncStatusMsg('Database Restore finished. (0 records returned)');
      }, 1500);
      return;
    }

    setIsSyncing(true);
    setSyncStatusMsg('Restoring cloud logs...');
    try {
      // Get all documents matching our authenticated user id
      const q = query(collection(db, 'vault_records'), where('userId', '==', user.uid));
      const querySnapshot = await getDocs(q);
      
      let restoreCount = 0;
      for (const d of querySnapshot.docs) {
        const data = d.data() as EncryptedVaultRecord;
        await saveLocalItem(data);
        restoreCount++;
      }
      
      setSyncStatusMsg(`Restored ${restoreCount} secure files from Cloud.`);
      loadVaultItems(); // reload and decrypt
    } catch (err) {
      console.error("Cloud snapshots retrieval denied.", err);
      setSyncStatusMsg("Unauthorized Backup Fetch. Security denied.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Disguise Settings Modifier
  const handleUpdateDisguise = async (type: DisguiseType) => {
    if (!profile) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        disguiseType: type,
        updatedAt: serverTimestamp()
      });
      onRefreshProfile();
      setSyncStatusMsg(`Disguise profile set to ${type}`);
    } catch (err) {
      console.warn("Operation aborted by database restrictions.", err);
    } finally {
      setLoading(false);
    }
  };

  // SHTF Self-Destruct Sequence (Deletes everything local-first + cloud synched)
  const handleTriggerDestructCountdown = () => {
    setDestructConfirm(true);
    setDestructCountdown(10); // 10 second countdown trigger
  };

  const handleCancelDestruct = () => {
    setDestructConfirm(false);
    setDestructCountdown(null);
  };

  const triggerSelfDestructSequence = async () => {
    setLoading(true);
    setSyncStatusMsg('Purging and shredding vault elements...');
    try {
      // 1. Wipe local IndexedDB
      await clearLocalDB(user.uid);

      // 2. Shred Cloud references from Firestore (if not Decoy Mode)
      if (!activeSession.isDecoy) {
        const q = query(collection(db, 'vault_records'), where('userId', '==', user.uid));
        const querySnapshot = await getDocs(q);
        for (const d of querySnapshot.docs) {
          await deleteDoc(doc(db, 'vault_records', d.id));
        }
      }

      setSyncStatusMsg('DESTRUCT TRIGGER COMPLETED. All trace purged.');
      
      // Delay logout slightly to display completion banner
      setTimeout(() => {
        onLogout();
      }, 2000);
    } catch (err) {
      // Fail-safe wipe client DB even if cloud call gets rate limited
      await clearLocalDB(user.uid);
      onLogout();
    } finally {
      setLoading(false);
    }
  };

  // Click-To-Copy helper
  const handleCopyToClipboard = (text: string, elementId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(elementId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Helper categories filter list
  const categories = ['All', 'Personal', 'Work', 'Financial', 'Server-Keys', 'Confidential'];
  const filteredItems = items
    .filter(item => {
      const matchSearch = 
        item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.username && item.username.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchCat = selectedCategory === 'All' || item.category === selectedCategory;
      return matchSearch && matchCat;
    });

  return (
    <div className="w-full bg-neutral-950 text-white rounded-3xl border border-neutral-900 shadow-2xl overflow-hidden min-h-[600px] flex flex-col font-sans" id="vault-dashboard-root">
      
      {/* Header Bezel Bar */}
      <header className="bg-neutral-900 border-b border-neutral-800 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-amber-500/10 p-2 rounded-xl border border-amber-500/20">
            <LockKeyhole className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-wide">SECURE MILITARY CRYPT-VAULT</h1>
              {activeSession.isDecoy ? (
                <span id="badge-decoy-mode" className="text-[9px] font-mono select-none px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700 font-bold uppercase tracking-widest animate-pulse">
                  Sandbox Active
                </span>
              ) : (
                <span id="badge-live-mode" className="text-[9px] font-mono select-none px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-900 text-emerald-400 font-bold uppercase tracking-widest">
                  Secure Live
                </span>
              )}
            </div>
            <p className="text-[10px] text-neutral-500 font-mono mt-0.5">AES-256 PBKDF2 Zero-Knowledge Sync</p>
          </div>
        </div>

        {/* Sync Indicator and session status control */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-neutral-950 border border-neutral-900 rounded-lg text-[10px] font-mono text-neutral-400">
            {isSyncing ? (
              <RefreshCw className="w-3.5 h-3.5 text-amber-500 animate-spin" />
            ) : syncEnabled ? (
              <Globe className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
            ) : (
              <CloudLightning className="w-3.5 h-3.5 text-neutral-600" />
            )}
            <span id="sync-status-indicator">{syncStatusMsg}</span>
          </div>

          <button 
            id="dash-lock-session-btn"
            onClick={onLockSession} 
            className="p-2 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 hover:border-amber-500 rounded-xl text-neutral-400 hover:text-amber-500 transition-all active:scale-95" 
            title="Lock Session Instantly"
          >
            <Lock className="w-4 h-4" />
          </button>

          <button 
            id="dash-logout-btn"
            onClick={onLogout} 
            className="p-2 bg-red-950/20 hover:bg-red-900 border border-red-950/40 rounded-xl text-red-400 transition-all active:scale-95 flex items-center gap-1 text-xs font-mono font-bold"
            title="Lock & Terminate Session Node"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Vault Tabs and Main Panel */}
      <div className="flex-grow flex flex-col md:flex-row">
        
        {/* Navigation Rail */}
        <nav className="w-full md:w-56 bg-neutral-900/40 md:border-r border-neutral-900 p-4 space-y-1">
          <p className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest px-2 mb-2">Vault Divisions</p>
          
          <button 
            id="nav-tab-passwords"
            onClick={() => { setActiveTab('passwords'); setShowItemForm(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-mono transition-all text-left ${activeTab === 'passwords' ? 'bg-amber-500 text-neutral-950 font-bold shadow-md' : 'text-neutral-400 hover:text-white hover:bg-neutral-900'}`}
          >
            <Key className="w-4 h-4" /> Credentials & Keys
          </button>

          <button 
            id="nav-tab-notes"
            onClick={() => { setActiveTab('notes'); setShowItemForm(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-mono transition-all text-left ${activeTab === 'notes' ? 'bg-amber-500 text-neutral-950 font-bold shadow-md' : 'text-neutral-400 hover:text-white hover:bg-neutral-900'}`}
          >
            <FileText className="w-4 h-4" /> Secure Memo Pads
          </button>

          <button 
            id="nav-tab-files"
            onClick={() => { setActiveTab('files'); setShowItemForm(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-mono transition-all text-left ${activeTab === 'files' ? 'bg-amber-500 text-neutral-950 font-bold shadow-md' : 'text-neutral-400 hover:text-white hover:bg-neutral-900'}`}
          >
            <Upload className="w-4 h-4" /> Private Documents
          </button>

          <div className="pt-4 border-t border-neutral-900 my-2" />
          <p className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest px-2 mb-2">System Control</p>

          <button 
            id="nav-tab-security"
            onClick={() => { setActiveTab('security'); setShowItemForm(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-mono transition-all text-left ${activeTab === 'security' ? 'bg-neutral-800 text-emerald-400 font-bold border border-emerald-950' : 'text-neutral-400 hover:text-white hover:bg-neutral-900'}`}
          >
            <Settings className="w-4 h-4" /> Security / Disguises
          </button>
        </nav>

        {/* Content Panel Area */}
        <main className="flex-grow p-6">
          
          {/* Main List & Operations View */}
          {!showItemForm && activeTab !== 'security' && (
            <div className="space-y-5">
              
              {/* Filter controls */}
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-neutral-500" />
                  <input 
                    id="vault-search-input"
                    type="text" 
                    placeholder="Search titles, category, users..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 text-xs rounded-xl pl-9 pr-4 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder-neutral-600"
                  />
                </div>

                <div className="flex gap-2 w-full sm:w-auto overflow-x-auto py-1 scrollbar-none">
                  {categories.map(cat => (
                    <button
                      id={`cat-filter-${cat.toLowerCase()}`}
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1 rounded-lg text-[10px] font-mono border whitespace-nowrap transition-all ${selectedCategory === cat ? 'bg-neutral-800 text-amber-500 border-amber-500/40' : 'bg-transparent text-neutral-500 border-neutral-900 hover:border-neutral-800 hover:text-neutral-400'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <button 
                  id="vault-add-item-btn"
                  onClick={() => { 
                    setFormType(activeTab === 'passwords' ? 'password' : activeTab === 'notes' ? 'note' : 'file');
                    setShowItemForm(true); 
                  }}
                  className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs py-2 px-4 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Add Record
                </button>
              </div>

              {/* Items Render Arena */}
              {loading && items.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-16 text-neutral-500 font-mono text-xs">
                  <RefreshCw className="w-6 h-6 animate-spin text-amber-500 mb-3" />
                  Decrypting vault keys...
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center p-16 border border-dashed border-neutral-900 rounded-3xl text-neutral-500 font-mono text-xs" id="empty-vault-state">
                  No secure {activeTab} matches found in this coordinate.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredItems
                    .filter(item => item.type === (activeTab === 'passwords' ? 'password' : activeTab === 'notes' ? 'note' : 'file'))
                    .map((item) => (
                      <div 
                        id={`vault-card-${item.id}`}
                        key={item.id} 
                        className="bg-neutral-900 border border-neutral-800/60 rounded-2xl p-4 shadow flex flex-col justify-between hover:border-neutral-800 transition-all group"
                      >
                        <div>
                          {/* Card Header & category tag */}
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-[9px] font-mono border border-neutral-800/80 px-2 py-0.5 rounded bg-neutral-950 text-neutral-400">
                              {item.category || 'General'}
                            </span>
                            <span className="text-[8px] font-mono text-neutral-600">
                              {new Date(item.updatedAt).toLocaleDateString()}
                            </span>
                          </div>

                          <h3 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors">{item.title}</h3>

                          {/* Render Credential fields */}
                          {item.type === 'password' && (
                            <div className="space-y-1.5 mt-3 text-xs font-mono bg-neutral-950/40 p-2.5 rounded-xl border border-neutral-900">
                              <div className="flex justify-between items-center text-[11px]">
                                <span className="text-neutral-500">USER:</span>
                                <span className="text-neutral-300 select-all">{item.username || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between items-center text-[11px]">
                                <span className="text-neutral-500">PASS:</span>
                                <div className="flex items-center gap-1.5">
                                  <span id={`pass-text-${item.id}`} className="text-neutral-300 font-bold">
                                    {visiblePasswords[item.id] ? item.password : '••••••••••••'}
                                  </span>
                                  <button 
                                    id={`pass-toggle-${item.id}`}
                                    onClick={() => setVisiblePasswords(prev => ({...prev, [item.id]: !prev[item.id]}))}
                                    className="text-neutral-500 hover:text-neutral-300"
                                  >
                                    {visiblePasswords[item.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              </div>
                              {item.website && (
                                <div className="flex justify-between items-center text-[10px] text-neutral-500 truncate pt-1 border-t border-neutral-900/60 leading-none">
                                  <span>SITE:</span>
                                  <a href={item.website} target="_blank" rel="noopener noreferrer" className="hover:text-amber-500 underline truncate max-w-[140px]">{item.website}</a>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Render memo field */}
                          {item.type === 'note' && (
                            <p className="mt-2.5 text-xs text-neutral-400 leading-relaxed max-h-24 overflow-y-auto font-sans whitespace-pre-wrap">
                              {item.content || 'Empty note content.'}
                            </p>
                          )}

                          {/* Render file attachments */}
                          {item.type === 'file' && (
                            <div className="mt-3 flex items-center justify-between p-2.5 bg-neutral-950/40 rounded-xl border border-neutral-900">
                              <div className="flex items-center gap-2 max-w-[70%]">
                                <File className="w-5 h-5 text-amber-500 shrink-0" />
                                <div className="truncate">
                                  <p className="text-xs font-mono text-neutral-300 truncate" title={item.fileName}>{item.fileName}</p>
                                  <p className="text-[10px] text-neutral-500 font-mono">{( (item.fileSize || 0) / 1024 ).toFixed(1)} KB</p>
                                </div>
                              </div>
                              <button 
                                id={`file-dl-${item.id}`}
                                onClick={() => handleDownloadFile(item)}
                                className="p-1.5 hover:bg-neutral-800 text-amber-500 hover:text-amber-400 rounded-lg transition-colors"
                                title="Decrypt and Download File"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Card Footer Purge Controls */}
                        <div className="flex justify-between items-center mt-4 pt-3 border-t border-neutral-900">
                          {item.type === 'password' ? (
                            <button 
                              id={`cred-copy-${item.id}`}
                              onClick={() => handleCopyToClipboard(item.password || '', item.id)}
                              className="text-[10px] font-mono font-bold text-amber-500/80 hover:text-amber-400 flex items-center gap-1"
                            >
                              {copiedId === item.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              {copiedId === item.id ? 'Copied' : 'Copy Key'}
                            </button>
                          ) : <div />}

                          <button 
                            id={`shred-${item.id}`}
                            onClick={() => handleShredItem(item.id)}
                            className="p-1 hover:bg-red-950/30 text-neutral-600 hover:text-red-400 border border-transparent hover:border-red-900/40 rounded-lg transition-colors flex items-center gap-1 text-[10px] font-mono leading-none"
                            title="Shred and Destroy Document"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Purge
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* New Item addition form dialog overlay simulation */}
          {showItemForm && (
            <div className="bg-neutral-900/60 border border-neutral-800 p-6 rounded-2xl max-w-lg mx-auto" id="vault-item-form-container">
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-neutral-800">
                <h3 className="text-sm font-bold tracking-wider font-mono text-amber-400 uppercase">
                  Prepare {formType} Payload
                </h3>
                <button 
                  id="form-close-btn"
                  onClick={() => { setShowItemForm(false); resetFormValues(); }} 
                  className="text-xs text-neutral-500 hover:text-white"
                >
                  Cancel
                </button>
              </div>

              <form onSubmit={handleSaveItem} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono text-neutral-500 uppercase tracking-wider mb-1">Title</label>
                    <input 
                      id="form-title-input"
                      type="text" 
                      required 
                      placeholder="e.g. Protonmail Core" 
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder-neutral-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-neutral-500 uppercase tracking-wider mb-1">Category</label>
                    <select 
                      id="form-category-select"
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="Personal">Personal</option>
                      <option value="Work">Work</option>
                      <option value="Financial">Financial</option>
                      <option value="Server-Keys">Server-Keys</option>
                      <option value="Confidential">Confidential</option>
                    </select>
                  </div>
                </div>

                {/* Form inputs mapping */}
                {formType === 'password' && (
                  <div className="space-y-3.5">
                    <div>
                      <label className="block text-[10px] font-mono text-neutral-500 uppercase tracking-wider mb-1">Username / Email Coordinate</label>
                      <input 
                        id="form-username-input"
                        type="text" 
                        placeholder="admin@private.io" 
                        value={formUsername}
                        onChange={(e) => setFormUsername(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder-neutral-700"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Secret Key Coordinate</label>
                        <button 
                          id="form-generate-btn"
                          type="button" 
                          onClick={generatePassword} 
                          className="text-[10px] font-mono text-amber-500 hover:text-amber-400 hover:underline"
                        >
                          Generate Entropy Key
                        </button>
                      </div>
                      <input 
                        id="form-password-input"
                        type="text" 
                        required 
                        placeholder="Secure Password string" 
                        value={formPassword}
                        onChange={(e) => setFormPassword(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-emerald-400 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder-neutral-700"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-neutral-500 uppercase tracking-wider mb-1">Website URL</label>
                      <input 
                        id="form-website-input"
                        type="url" 
                        placeholder="https://proton.me" 
                        value={formWebsite}
                        onChange={(e) => setFormWebsite(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder-neutral-700"
                      />
                    </div>
                  </div>
                )}

                {formType === 'note' && (
                  <div>
                    <label className="block text-[10px] font-mono text-neutral-500 uppercase tracking-wider mb-1">Memo Content</label>
                    <textarea 
                      id="form-content-area"
                      required 
                      rows={5}
                      placeholder="Write your private confidential logs..." 
                      value={formContent}
                      onChange={(e) => setFormContent(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder-neutral-700"
                    />
                  </div>
                )}

                {formType === 'file' && (
                  <div>
                    <label className="block text-[10px] font-mono text-neutral-500 uppercase tracking-wider mb-1">Drag file or Click Upload</label>
                    <div 
                      id="form-drag-drop-zone"
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      className={`h-36 border border-dashed rounded-xl flex flex-col items-center justify-center p-4 transition-all ${dragActive ? 'border-amber-500 bg-amber-500/5' : fileToUpload ? 'border-emerald-500 bg-emerald-500/5' : 'border-neutral-800 bg-neutral-950/50'}`}
                    >
                      <input 
                        type="file" 
                        id="file-selector" 
                        className="hidden" 
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) processFile(e.target.files[0]);
                        }}
                      />
                      <label htmlFor="file-selector" className="cursor-pointer text-center flex flex-col items-center gap-2">
                        <Upload className={`w-8 h-8 ${fileToUpload ? 'text-emerald-500' : 'text-neutral-500'}`} />
                        {fileToUpload ? (
                          <div id="selected-file-details">
                            <p className="text-xs font-mono font-bold text-neutral-200">{fileDetails?.name}</p>
                            <p className="text-[10px] text-neutral-500">{( (fileDetails?.size || 0) / 1024 ).toFixed(1)} KB (Base64 Ready)</p>
                          </div>
                        ) : (
                          <div>
                            <p className="text-xs text-neutral-400 font-bold">Select Confidential File</p>
                            <p className="text-[10px] text-neutral-600 mt-1">Recommended size &lt; 800KB</p>
                          </div>
                        )}
                      </label>
                    </div>
                  </div>
                )}

                <button 
                  id="form-save-btn"
                  type="submit" 
                  disabled={loading}
                  className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-neutral-950 font-bold text-xs py-2.5 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <ShieldCheck className="w-4 h-4" /> Save Encrypted Record
                </button>
              </form>
            </div>
          )}

          {/* Security Center & System Control Panel */}
          {activeTab === 'security' && (
            <div className="space-y-6 max-w-lg mx-auto" id="security-center-panel">
              <h2 className="text-base font-bold font-mono tracking-wider text-amber-500 uppercase border-b border-neutral-900 pb-2">
                Security Coordination Command
              </h2>

              {/* Stealth Disguise Selector */}
              <div className="bg-neutral-900/40 border border-neutral-900 p-4 rounded-xl space-y-3">
                <h3 className="text-xs font-mono font-bold text-neutral-300 flex items-center gap-1">
                  <Binary className="w-4 h-4 text-amber-500" /> Stealth Disguise Gateway Type
                </h3>
                <p className="text-[11px] text-neutral-500 leading-normal">
                  Toggle what the sandbox portal looks like to standard nosey spectators. When decoy is active, accessing the vault redirects from this gate.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {['calculator', 'notepad', 'system_logs', 'none'].map((type) => (
                    <button
                      id={`set-disguise-${type}`}
                      key={type}
                      onClick={() => handleUpdateDisguise(type as DisguiseType)}
                      className={`text-[11px] py-2 px-3 rounded-lg border font-mono transition-all capitalize text-center ${profile?.disguiseType === type ? 'bg-neutral-800 text-amber-500 border-amber-500' : 'bg-transparent text-neutral-500 border-neutral-900 hover:border-neutral-800 hover:text-neutral-400'}`}
                    >
                      {type.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cloud Sync Backups Coordinate */}
              <div className="bg-neutral-900/40 border border-neutral-900 p-4 rounded-xl space-y-3.5">
                <h3 className="text-xs font-mono font-bold text-neutral-300">
                  Cloud Coordinates & Recovery Snaps
                </h3>
                <p className="text-[11px] text-neutral-500 leading-normal">
                  Back up client-side encrypted Base64 payloads to your cloud coordinates (Firebase Firestore). All decoders remain local-only inside browser memory.
                </p>
                
                <div className="flex items-center justify-between p-2.5 bg-neutral-950 rounded-lg border border-neutral-900 text-xs">
                  <span className="font-mono text-neutral-400">Automatic Backup Sync</span>
                  <button 
                    id="toggle-cloud-sync"
                    type="button" 
                    onClick={() => setSyncEnabled(!syncEnabled)} 
                    className={`font-mono font-bold text-[10px] px-3 py-1 rounded-full border transition-all ${syncEnabled ? 'bg-emerald-950/60 border-emerald-900/60 text-emerald-400' : 'bg-red-950/20 border-red-900/20 text-neutral-500'}`}
                  >
                    {syncEnabled ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button 
                    id="sync-backup-btn"
                    onClick={handleForceCloudBackup}
                    className="py-2 px-3 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-[10px] font-mono font-bold text-neutral-200 rounded-lg flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Upload className="w-3.5 h-3.5 text-amber-500" /> Push Local to Cloud
                  </button>
                  <button 
                    id="sync-restore-btn"
                    onClick={handleRestoreFromCloud}
                    className="py-2 px-3 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-[10px] font-mono font-bold text-neutral-200 rounded-lg flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-500" /> Restore backup to Local
                  </button>
                </div>
              </div>

              {/* Password Generator Sandbox */}
              <div className="bg-neutral-900/40 border border-neutral-900 p-4 rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-mono font-bold text-neutral-300 flex items-center gap-1">
                    <Key className="w-4 h-4 text-amber-500" /> High-Entropy Generator
                  </h3>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-900/30">
                    Min 14 Char Rule
                  </span>
                </div>

                {/* Configurations */}
                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div className="flex flex-col gap-1 bg-neutral-950 p-2 rounded-lg border border-neutral-900">
                    <label className="text-[10px] text-neutral-500">LENGTH: {genLength}</label>
                    <input 
                      id="gen-length-slider"
                      type="range" 
                      min={14} 
                      max={32} 
                      value={genLength} 
                      onChange={(e) => { setGenLength(parseInt(e.target.value)); }}
                      className="w-full accent-amber-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px] text-neutral-400">
                    <label className="flex items-center gap-1.5">
                      <input id="chk-gen-upper" type="checkbox" checked={genUpper} onChange={(e) => setGenUpper(e.target.checked)} className="accent-amber-500" /> UPPER
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input id="chk-gen-lower" type="checkbox" checked={genLower} onChange={(e) => setGenLower(e.target.checked)} className="accent-amber-500" /> LOWER
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input id="chk-gen-num" type="checkbox" checked={genNums} onChange={(e) => setGenNums(e.target.checked)} className="accent-amber-500" /> NUMS
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input id="chk-gen-sym" type="checkbox" checked={genSyms} onChange={(e) => setGenSyms(e.target.checked)} className="accent-amber-500" /> SYMS
                    </label>
                  </div>
                </div>

                <div className="bg-neutral-950 p-2.5 rounded-lg border border-neutral-900 flex justify-between items-center mt-2 overflow-hidden">
                  <span id="generated-password-display" className="text-xs font-bold font-mono text-emerald-400 select-all truncate max-w-[70%]">{generatedResult}</span>
                  <div className="flex gap-1">
                    <button 
                      id="gen-entropy-trigger"
                      onClick={generatePassword} 
                      className="p-1 hover:bg-neutral-900 rounded text-neutral-400 hover:text-white"
                      title="Regenerate"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      id="gen-copy-btn"
                      onClick={() => handleCopyToClipboard(generatedResult, 'gen')} 
                      className="p-1 hover:bg-neutral-900 rounded text-amber-500 hover:text-amber-400 flex items-center text-[10px] font-mono leading-none font-bold"
                    >
                      {copiedId === 'gen' ? <Check className="w-3 h-3 text-emerald-400 mr-0.5" /> : <Copy className="w-3 h-3 mr-0.5" />}
                      Copy
                    </button>
                  </div>
                </div>
              </div>

              {/* Secure Shred Clean / Self-Destruct Coordinate */}
              <div className="bg-red-950/10 border border-red-900/20 p-4 rounded-xl space-y-3.5">
                <h3 className="text-xs font-mono font-bold text-red-400 flex items-center gap-1">
                  <Flame className="w-4 h-4 text-red-500" /> Shit Hit The Fan (SHTF) Secure Purge
                </h3>
                <p className="text-[11px] text-neutral-500 leading-normal font-sans">
                  Instantly self-destructs your node coordinate. Completely wipes all local IndexedDB cached vault databases, deletes cloud synchronization documents, and locks access instantly. This is irreversible.
                </p>

                {destructCountdown !== null ? (
                  <div className="p-3 bg-red-950/40 border border-red-900 rounded-xl text-center space-y-2" id="destruct-countdown-container">
                    <p className="text-xs font-mono text-red-400 font-bold tracking-wider animate-pulse uppercase">
                      CRITICAL DESTRUCT SEQUENCE ACTIVE: {destructCountdown} SECS
                    </p>
                    <button 
                      id="destruct-abort-btn"
                      onClick={handleCancelDestruct} 
                      className="text-xs font-mono px-4 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-white font-bold rounded-lg transition-all"
                    >
                      ABORT PURGE COORDINATES
                    </button>
                  </div>
                ) : (
                  <button 
                    id="destruct-initiate-btn"
                    onClick={handleTriggerDestructCountdown}
                    className="w-full bg-red-800 hover:bg-red-700 text-white font-bold text-xs py-2 px-4 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Flame className="w-4 h-4" /> Trigger Automated Self-Destruct Sequence
                  </button>
                )}
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
