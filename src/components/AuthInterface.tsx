/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail, 
  signInWithPopup,
  signOut
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  deleteDoc
} from 'firebase/firestore';
import { 
  Shield, 
  Lock, 
  Unlock, 
  Mail, 
  Key, 
  AlertTriangle, 
  Chrome, 
  ArrowRight, 
  UserPlus, 
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Send,
  HelpCircle,
  X
} from 'lucide-react';
import { db, auth, googleProvider, handleFirestoreError, OperationType } from '../lib/firebase';
import { deriveKeyFromPassword, generateRandomSalt, hashSHA256, bufferToBase64, base64ToBuffer } from '../lib/crypto';
import { clearLocalDB } from '../lib/indexedDB';
import { ActiveSession, UserProfile } from '../types';

interface AuthInterfaceProps {
  user: any; // Firebase user
  activeSession: ActiveSession | null;
  onSessionUnlock: (session: ActiveSession) => void;
  onLogout: () => void;
}

export default function AuthInterface({ 
  user, 
  activeSession, 
  onSessionUnlock, 
  onLogout 
}: AuthInterfaceProps) {
  // Auth view states
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Setup PIN view states (Shown if logged in but users collection document doesn't exist)
  const [needProfileSetup, setNeedProfileSetup] = useState(false);
  const [setupStep, setSetupStep] = useState(1); // 1: Real PIN, 2: Decoy PIN, 3: Show Recovery Key
  const [realPin, setRealPin] = useState('');
  const [decoyPin, setDecoyPin] = useState('');

  // Pending Session holder during Setup key generation screen
  const [pendingSession, setPendingSession] = useState<ActiveSession | null>(null);

  // Forgot Master PIN states
  const [isRecoveringPin, setIsRecoveringPin] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState(1); // 1: Select recovery, 2: Verify Gmail OTP, 3: Verify Recovery Key, 4: Enter New PIN
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [enteredOtp, setEnteredOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoverySuccess, setRecoverySuccess] = useState<string | null>(null);
  const [enteredRecoveryKey, setEnteredRecoveryKey] = useState('');
  const [backupRecoveryKey, setBackupRecoveryKey] = useState(''); // Shown after setup completed
  const [newMasterPin, setNewMasterPin] = useState('');
  const [reconstructedMasterKey, setReconstructedMasterKey] = useState<CryptoKey | null>(null);
  const [isGmailLaunchClicked, setIsGmailLaunchClicked] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  // Daily PIN Unlock screen state
  const [unlockPin, setUnlockPin] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [wrongAttempts, setWrongAttempts] = useState(0);

  // General flow triggering check
  React.useEffect(() => {
    if (user) {
      checkProfileStatus();
    } else {
      setNeedProfileSetup(false);
      setSetupStep(1);
      setRealPin('');
      setDecoyPin('');
      setUnlockPin('');
      setUnlockError(null);
    }
  }, [user]);

  // Check if user has initialized their security configurations in Firestore
  const checkProfileStatus = async () => {
    if (!user) return;
    setLoading(true);
    const userDocRef = doc(db, 'users', user.uid);
    try {
      const userSnap = await getDoc(userDocRef);
      if (userSnap.exists()) {
        setNeedProfileSetup(false);
      } else {
        setNeedProfileSetup(true);
        setSetupStep(1);
      }
    } catch (err) {
      console.warn("Could not fetch user profile settings. Initiating setup schema.", err);
      setNeedProfileSetup(true);
    } finally {
      setLoading(false);
    }
  };

  // 1. Google OAuth Authentication flow inside iframe
  const handleGoogleAuth = async () => {
    setLoading(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      setAuthSuccess("Authenticated via secure Google OAuth portal.");
    } catch (err: any) {
      setAuthError(err.message || "Google single sign-on failed.");
    } finally {
      setLoading(false);
    }
  };

  // 2. Traditional Email/Password Authentication Flow
  const handleTraditionalAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setAuthError("Email and Password fields are required.");
      return;
    }
    setLoading(true);
    setAuthError(null);
    setAuthSuccess(null);

    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
        setAuthSuccess("Account successfully established.");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        setAuthSuccess("Sign-in verified.");
      }
    } catch (err: any) {
      setAuthError(err.message || "Credentials verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // 3. Automate Password Reset via Firebase Email Services
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setAuthError("Please supply your registered email address.");
      return;
    }
    setLoading(true);
    setAuthError(null);
    setAuthSuccess(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setAuthSuccess(`An official automated recovery token email has been dispatched to ${email}. Check your inbox.`);
      setIsForgotPassword(false);
    } catch (err: any) {
      setAuthError(err.message || "Could not dispatch password reset sequence.");
    } finally {
      setLoading(false);
    }
  };

  const generateRecoveryKey = (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segments: string[] = [];
    for (let s = 0; s < 5; s++) {
      let segment = '';
      for (let i = 0; i < 4; i++) {
        segment += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      segments.push(segment);
    }
    return `SECURE-VAULT-${segments.join('-')}`;
  };

  // 4. Initial Secure PIN Configurations Setup
  const handlePinSetupComplete = async () => {
    if (realPin.length < 4) {
      setAuthError("For military-grade resilience, PINs must be at least 4 digits.");
      return;
    }
    if (realPin === decoyPin) {
      setAuthError("The Decoy PIN must be distinct from your Primary Master PIN to protect you in an emergency.");
      return;
    }

    setLoading(true);
    setAuthError(null);
    try {
      const uId = user.uid;
      const uEmail = user.email || "anonymous-vault-user@private.io";

      // Master Key Derivation Parameters
      const encryptionSalt = generateRandomSalt(16);
      const passcodeSalt = generateRandomSalt(16);

      // Secure hashes
      const passHash = await hashSHA256(realPin, passcodeSalt);
      const decHash = decoyPin ? await hashSHA256(decoyPin, passcodeSalt) : '';

      // Generate the browser state symmetric key using Web Crypto PBKDF2
      const derivedKey = await deriveKeyFromPassword(realPin, encryptionSalt);

      // Generate the emergency 24-character security recovery key
      const recoveryKey = generateRecoveryKey();

      // Export derivedKey to Raw bytes to pack inside wrappedMasterKey
      const rawKeyBytes = await window.crypto.subtle.exportKey('raw', derivedKey);

      // Derive key from Recovery Key using same salt and iterations (100k)
      const recoveryDerivedKey = await deriveKeyFromPassword(recoveryKey, encryptionSalt);
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const wrappedBuffer = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        recoveryDerivedKey,
        rawKeyBytes
      );
      const wrappedMasterKey = bufferToBase64(wrappedBuffer);
      const wrappedMasterKeyIv = bufferToBase64(iv.buffer);
      const hashRecKey = await hashSHA256(recoveryKey, passcodeSalt);

      const newProfile: UserProfile = {
        userId: uId,
        email: uEmail,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        encryptionSalt,
        passcodeSalt,
        passcodeHash: passHash,
        decoyPasscodeHash: decHash,
        disguiseType: 'calculator', // Default stealth mode
        wrappedMasterKey,
        wrappedMasterKeyIv,
        recoveryKeyHash: hashRecKey
      };

      // Set user profile document
      const path = `users/${uId}`;
      try {
        await setDoc(doc(db, 'users', uId), newProfile);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }

      const activeSession: ActiveSession = {
        masterKey: derivedKey,
        isDecoy: false,
        passcodeUsed: realPin,
        sessionExpiresAt: Date.now() + 300000 // 5 minutes standard rolling lock
      };

      // Do NOT unlock instantly. Save session as pending and show their critical Recovery Key first!
      setBackupRecoveryKey(recoveryKey);
      setPendingSession(activeSession);
      setSetupStep(3); // Go to Visual Recovery Key presentation screen
    } catch (err: any) {
      setAuthError(err.message || "Failed initializing browser security profile schema.");
    } finally {
      setLoading(false);
    }
  };

  // 5. Daily Unlock Passcode Key Validation
  const handlePinUnlock = async (numPadPin?: string) => {
    const pinToTest = numPadPin || unlockPin;
    if (pinToTest.length < 4) {
      setUnlockError("Master PIN must be 4 or more digits.");
      return;
    }

    setLoading(true);
    setUnlockError(null);

    try {
      const uId = user.uid;
      // Get the profile parameters from Firestore
      const userSnap = await getDoc(doc(db, 'users', uId));
      if (!userSnap.exists()) {
        // Fallback or setup needed
        setNeedProfileSetup(true);
        setLoading(false);
        return;
      }

      const profile = userSnap.data() as UserProfile;
      const codeSalt = profile.passcodeSalt || '';
      const enteredHash = await hashSHA256(pinToTest, codeSalt);

      const realHash = profile.passcodeHash;
      const decoyHash = profile.decoyPasscodeHash;

      // 1. Check Real PIN Matches
      if (enteredHash === realHash) {
        setWrongAttempts(0);
        const derivedKey = await deriveKeyFromPassword(pinToTest, profile.encryptionSalt);
        
        const session: ActiveSession = {
          masterKey: derivedKey,
          isDecoy: false,
          passcodeUsed: pinToTest,
          sessionExpiresAt: Date.now() + 300000
        };
        onSessionUnlock(session);
        setUnlockPin('');
      } 
      // 2. Play Along with Decoy Mode
      else if (decoyHash && enteredHash === decoyHash) {
        setWrongAttempts(0);
        // Play along seamlessly with the Decoy passcode. Generate a separate decoy key.
        const derivedKey = await deriveKeyFromPassword(pinToTest, profile.encryptionSalt + "_decoy_salt_entropy");
        
        const session: ActiveSession = {
          masterKey: derivedKey,
          isDecoy: true, // Tag inside session state
          passcodeUsed: pinToTest,
          sessionExpiresAt: Date.now() + 300000
        };
        onSessionUnlock(session);
        setUnlockPin('');
      } 
      // 3. Failed Access
      else {
        const nextAttempts = wrongAttempts + 1;
        setWrongAttempts(nextAttempts);
        setUnlockPin('');
        
        if (nextAttempts >= 5) {
          setUnlockError("Access locked. Too many failed attempts. Re-verify your master credentials.");
          // Trigger forced logout or auto lock expansion
          setTimeout(() => {
            signOut(auth);
            onLogout();
            setWrongAttempts(0);
          }, 3000);
        } else {
          setUnlockError(`Cryptographic verification mismatch. Attempts: ${nextAttempts}/5.`);
        }
      }
    } catch (err: any) {
      setUnlockError("Authentication database query failed.");
    } finally {
      setLoading(false);
    }
  };

  // 5.5. PIN Recovery handlers
  const initiateForgotPasswordFlow = async () => {
    setIsRecoveringPin(true);
    setRecoveryStep(1);
    setIsGmailLaunchClicked(false);
    setRecoveryError(null);
    setRecoverySuccess(null);
    setEnteredOtp('');
    setEnteredRecoveryKey('');
    setNewMasterPin('');
    setReconstructedMasterKey(null);
  };

  const handleSendGmailOtp = async () => {
    setLoading(true);
    setRecoveryError(null);
    setRecoverySuccess(null);
    try {
      // 1. Generate a secure 6 digit OTP reset code
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      setGeneratedOtp(otpCode);

      // 2. Write it securely to Firestore so it can be verified across browser instances
      const path = `users/${user.uid}`;
      try {
        await setDoc(doc(db, 'users', user.uid), {
          recoveryOtp: otpCode,
          recoveryOtpExpiresAt: Date.now() + 10 * 60 * 1000 // Valid for 10 minutes
        }, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }

      setRecoverySuccess("A cryptographic OTP reset code has been initialized in your secure node profile.");
      setOtpSent(true);
      setRecoveryStep(2); // Proceed to entering Gmail OTP form
    } catch (err: any) {
      setRecoveryError(err.message || "Failed initializing recovery session on the node.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtpCode = async () => {
    if (enteredOtp.length < 6) {
      setRecoveryError("The verification code must be 6 digits.");
      return;
    }
    setLoading(true);
    setRecoveryError(null);
    setRecoverySuccess(null);

    try {
      const userSnap = await getDoc(doc(db, 'users', user.uid));
      if (!userSnap.exists()) {
        setRecoveryError("Could not fetch node settings profile.");
        setLoading(false);
        return;
      }

      const profile = userSnap.data() as UserProfile;
      const storedOtp = profile.recoveryOtp;
      const expiresAt = profile.recoveryOtpExpiresAt || 0;

      if (Date.now() > expiresAt) {
        setRecoveryError("The verification session token has expired. Please request a new token.");
        setLoading(false);
        return;
      }

      if (enteredOtp !== storedOtp && enteredOtp !== generatedOtp) {
        setRecoveryError("Verification code mismatch. Re-verify the digits inside your recovery email.");
        setLoading(false);
        return;
      }

      // Verification success!
      setRecoverySuccess("Credentials owner signature checked. Please configure your new Master PIN.");
      setRecoveryStep(4); // Move forward to entering new PIN passcode (with data clearing warning!)
    } catch (err: any) {
      setRecoveryError("An error occurred during verification query.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyRecoveryKey = async () => {
    const formattedKey = enteredRecoveryKey.trim().toUpperCase();
    if (!formattedKey.startsWith("SECURE-VAULT-")) {
      setRecoveryError("Invalid format. Key must start with 'SECURE-VAULT-'.");
      return;
    }

    setLoading(true);
    setRecoveryError(null);
    setRecoverySuccess(null);

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userDocRef);
      if (!userSnap.exists()) {
        setRecoveryError("User security profile document does not exist.");
        setLoading(false);
        return;
      }

      const profile = userSnap.data() as UserProfile;
      const passcodeSalt = profile.passcodeSalt || '';
      const enteredHash = await hashSHA256(formattedKey, passcodeSalt);

      if (enteredHash !== profile.recoveryKeyHash) {
        setRecoveryError("Recovery key signature mismatch. Verify spelling or hyphen layout.");
        setLoading(false);
        return;
      }

      // Decrypt the wrappedMasterKey and reconstruct the CryptoKey
      const recoveryKeyPBKDF2 = await deriveKeyFromPassword(formattedKey, profile.encryptionSalt);
      const wrappedPayloadBuffer = base64ToBuffer(profile.wrappedMasterKey || '');
      const ivBuffer = base64ToBuffer(profile.wrappedMasterKeyIv || '');

      const rawKeyBytes = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
        recoveryKeyPBKDF2,
        wrappedPayloadBuffer
      );

      const reconstructedKey = await window.crypto.subtle.importKey(
        'raw',
        rawKeyBytes,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );

      setReconstructedMasterKey(reconstructedKey);
      setRecoverySuccess("Vault credentials signature authenticated! Please reset your Master PIN.");
      setRecoveryStep(4); // Move to set new PIN (leaving database records preserved!)
    } catch (err: any) {
      setRecoveryError("PIN recovery key structure decrypted with error. Verify the recovery key characters.");
    } finally {
      setLoading(false);
    }
  };

  const handleApplyNewRecoveredPin = async () => {
    if (newMasterPin.length < 4) {
      setRecoveryError("For cryptographic density, PINs must be at least 4 digits.");
      return;
    }
    setLoading(true);
    setRecoveryError(null);
    setRecoverySuccess(null);

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userDocRef);
      if (!userSnap.exists()) {
        setRecoveryError("Profile document is missing.");
        setLoading(false);
        return;
      }

      const profile = userSnap.data() as UserProfile;
      const codeSalt = profile.passcodeSalt || generateRandomSalt(16);
      const newHash = await hashSHA256(newMasterPin, codeSalt);

      // 1. Case A: Reconstructed Key exists (Data is PRESERVED)
      if (reconstructedMasterKey) {
        const encryptionSalt = profile.encryptionSalt;
        
        // Re-wrap the reconstructed key using a new 24-char Recovery Key for ongoing safety!
        const nextRecoveryKey = generateRecoveryKey();
        const rawKeyBytes = await window.crypto.subtle.exportKey('raw', reconstructedMasterKey);
        const recoveryDerivedKey = await deriveKeyFromPassword(nextRecoveryKey, encryptionSalt);
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const wrappedBuffer = await window.crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          recoveryDerivedKey,
          rawKeyBytes
        );
        const nextWrappedMasterKey = bufferToBase64(wrappedBuffer);
        const nextWrappedMasterKeyIv = bufferToBase64(iv.buffer);
        const nextHashRecKey = await hashSHA256(nextRecoveryKey, codeSalt);

        // Save progress to cloud
        await setDoc(userDocRef, {
          passcodeHash: newHash,
          passcodeSalt: codeSalt,
          wrappedMasterKey: nextWrappedMasterKey,
          wrappedMasterKeyIv: nextWrappedMasterKeyIv,
          recoveryKeyHash: nextHashRecKey,
          recoveryOtp: '', // Clear otp flags
          recoveryOtpExpiresAt: 0,
          updatedAt: serverTimestamp()
        }, { merge: true });

        const activeSession: ActiveSession = {
          masterKey: reconstructedMasterKey,
          isDecoy: false,
          passcodeUsed: newMasterPin,
          sessionExpiresAt: Date.now() + 300000
        };

        // Display their new emergency recovery key to write down
        setBackupRecoveryKey(nextRecoveryKey);
        setPendingSession(activeSession);
        setSetupStep(3); // Shift setup flow to show the user their brand new key!
        setNeedProfileSetup(true); // Temporarily turn on profile setup wrapper for visualization safety!
        setIsRecoveringPin(false);
      } 
      // 2. Case B: Recovered via GMAIL ONLY (Data is ERASED to safeguard Zero-Knowledge paradigm)
      else {
        // Since we don't have the original masterKey, we MUST wipe and initiate a clean new masterKey.
        const encryptionSalt = generateRandomSalt(16);
        const derivedKey = await deriveKeyFromPassword(newMasterPin, encryptionSalt);
        
        const nextRecoveryKey = generateRecoveryKey();
        const rawKeyBytes = await window.crypto.subtle.exportKey('raw', derivedKey);
        const recoveryDerivedKey = await deriveKeyFromPassword(nextRecoveryKey, encryptionSalt);
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const wrappedBuffer = await window.crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          recoveryDerivedKey,
          rawKeyBytes
        );
        const nextWrappedMasterKey = bufferToBase64(wrappedBuffer);
        const nextWrappedMasterKeyIv = bufferToBase64(iv.buffer);
        const nextHashRecKey = await hashSHA256(nextRecoveryKey, codeSalt);

        // a. Cloud Sync deletion of encrypted records
        const recordsCol = collection(db, 'vault_records');
        const q = query(recordsCol, where('userId', '==', user.uid));
        const recordSnaps = await getDocs(q);
        
        for (const recordDoc of recordSnaps.docs) {
          await deleteDoc(doc(db, 'vault_records', recordDoc.id));
        }

        // b. Local indexedDB deletion of encrypted records
        await clearLocalDB(user.uid);

        // c. Save new security profile params on Firestore
        await setDoc(userDocRef, {
          passcodeHash: newHash,
          passcodeSalt: codeSalt,
          encryptionSalt,
          wrappedMasterKey: nextWrappedMasterKey,
          wrappedMasterKeyIv: nextWrappedMasterKeyIv,
          recoveryKeyHash: nextHashRecKey,
          recoveryOtp: '', // Clear otp flags
          recoveryOtpExpiresAt: 0,
          updatedAt: serverTimestamp()
        }, { merge: true });

        const activeSession: ActiveSession = {
          masterKey: derivedKey,
          isDecoy: false,
          passcodeUsed: newMasterPin,
          sessionExpiresAt: Date.now() + 300000
        };

        setBackupRecoveryKey(nextRecoveryKey);
        setPendingSession(activeSession);
        setSetupStep(3); // Shift setup flow to show user their new recovery key
        setNeedProfileSetup(true);
        setIsRecoveringPin(false);
      }
    } catch (err: any) {
      setRecoveryError(err.message || "Failed saving new credentials profile to database.");
    } finally {
      setLoading(false);
    }
  };

  // Numpad key input helper
  const handleNumpadPress = (val: string) => {
    setUnlockError(null);
    if (val === 'clear') {
      setUnlockPin('');
    } else if (val === 'back') {
      setUnlockPin(prev => prev.slice(0, -1));
    } else {
      if (unlockPin.length < 8) {
        const newPin = unlockPin + val;
        setUnlockPin(newPin);
        // Auto-unlock triggers if length is exactly right if user wants, but let's let them click OK for precision
      }
    }
  };

  // Loading indicator
  if (loading && !user) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-neutral-400 font-mono text-sm leading-relaxed" id="auth-loading">
        <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mb-4" />
        Preparing cryptographic sandbox environment...
      </div>
    );
  }

  // Phase A: Traditional Register / Sign In Panel
  if (!user) {
    return (
      <div className="max-w-md w-full mx-auto bg-neutral-950 border border-neutral-900 rounded-2xl p-6 shadow-2xl relative overflow-hidden" id="auth-gate-form">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600" />
        
        {/* Title */}
        <div className="text-center mb-6">
          <div className="bg-amber-950/40 p-3 rounded-full border border-amber-900/30 inline-block mb-3">
            <Shield className="w-8 h-8 text-amber-500" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-wide">Secure Cryptographic Vault</h2>
          <p className="text-[11px] text-neutral-500 font-mono mt-1">Zero-Knowledge Progressive Web System</p>
        </div>

        {/* Global Success / Errors */}
        {authError && (
          <div className="mb-4 p-3 bg-red-950/40 border border-red-900/50 rounded-xl flex items-start gap-2 text-xs text-red-400 font-mono">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{authError}</span>
          </div>
        )}
        {authSuccess && (
          <div className="mb-4 p-3 bg-emerald-950/30 border border-emerald-900/50 rounded-xl text-xs text-emerald-400 font-mono">
            {authSuccess}
          </div>
        )}

        {isForgotPassword ? (
          /* Forgot Password form */
          <form onSubmit={handlePasswordReset} className="space-y-4">
            <div className="text-neutral-400 text-xs text-center leading-relaxed">
              Input your account's email. If matched, the official Firebase automated authentication recovery server will send a physical password reset link safely.
            </div>
            <div>
              <label className="block text-xs font-mono text-neutral-500 uppercase tracking-wider mb-1.5ClassName">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-neutral-600" />
                <input 
                  id="reset-email"
                  type="email" 
                  required
                  placeholder="name@company.com" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-neutral-900/80 border border-neutral-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder-neutral-600"
                />
              </div>
            </div>
            <button 
              id="reset-submit-btn"
              type="submit" 
              className="w-full bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold py-2.5 rounded-xl transition-all shadow-lg active:scale-95 text-sm flex items-center justify-center gap-1.5"
            >
              Dispatch Reset Coordinates <ArrowRight className="w-4 h-4" />
            </button>
            <div className="text-center pt-2">
              <button 
                id="reset-back-btn"
                type="button" 
                onClick={() => setIsForgotPassword(false)} 
                className="text-neutral-500 hover:text-amber-500 transition-colors text-xs font-mono"
              >
                Return to Login Gate
              </button>
            </div>
          </form>
        ) : (
          /* Main Authentication form */
          <form onSubmit={handleTraditionalAuth} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-neutral-500 uppercase tracking-wider mb-1.5">Email coordinate</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 w-4 h-4 text-neutral-600" />
                <input 
                  id="auth-email-input"
                  type="email" 
                  required
                  placeholder="name@company.com" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-neutral-900/80 border border-neutral-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder-neutral-600"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-mono text-neutral-500 uppercase tracking-wider">Account Password</label>
                <button 
                  id="forgot-password-toggle-btn"
                  type="button" 
                  onClick={() => setIsForgotPassword(true)} 
                  className="text-xs text-amber-500/80 hover:text-amber-400 font-mono cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <Key className="absolute left-3 top-3.5 w-4 h-4 text-neutral-600" />
                <input 
                  id="auth-password-input"
                  type={showPassword ? 'text' : 'password'} 
                  required
                  placeholder="••••••••••••" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-neutral-900/80 border border-neutral-800 rounded-xl pl-10 pr-10 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder-neutral-600"
                />
                <button 
                  id="auth-password-show-toggle"
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)} 
                  className="absolute right-3 top-3 text-neutral-500 hover:text-neutral-400"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button 
              id="auth-submit-btn"
              type="submit" 
              className="w-full bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold py-3 rounded-xl transition-all shadow-lg active:scale-95 text-sm flex items-center justify-center gap-1.5"
            >
              {isRegistering ? (
                <>
                  <UserPlus className="w-4 h-4" /> Initialize Encrypted Profile
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4" /> Access Digital Sandbox
                </>
              )}
            </button>

            {/* Google Authentication Portal (popup) */}
            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-neutral-900"></div>
              <span className="flex-shrink mx-4 text-neutral-600 text-xs font-mono">OR</span>
              <div className="flex-grow border-t border-neutral-900"></div>
            </div>

            <button 
              id="auth-google-btn"
              type="button" 
              onClick={handleGoogleAuth}
              className="w-full bg-neutral-900 hover:bg-neutral-800 text-white border border-neutral-800 font-semibold py-2.5 rounded-xl transition-all active:scale-95 text-xs flex items-center justify-center gap-2"
            >
              <Chrome className="w-4 h-4 text-amber-500" /> Authenticate via Google Portal
            </button>

            {/* Toggle state */}
            <div className="text-center pt-3 text-xs text-neutral-500 font-mono">
              {isRegistering ? "Existing vault operator?" : "Need a private node profile?"}{' '}
              <button 
                id="auth-toggle-reg-btn"
                type="button" 
                onClick={() => setIsRegistering(!isRegistering)} 
                className="text-amber-500 hover:text-amber-400 underline font-semibold focus:outline-none"
              >
                {isRegistering ? "Access Vault Gate" : "Register Private Profile"}
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  // Phase B: Logged in, but first-time configuration is required (No setup-profile document in Firestore user collection)
  if (needProfileSetup) {
    return (
      <div className="max-w-md w-full mx-auto bg-neutral-950 border border-neutral-900 rounded-2xl p-6 shadow-2xl relative" id="auth-setup-form">
        <div className="absolute top-0 left-0 w-full h-1 bg-amber-500" />
        
        <div className="flex justify-between items-center mb-4">
          <span className="text-[10px] font-mono text-emerald-500 bg-emerald-950/40 border border-emerald-900/30 px-2 py-0.5 rounded-full uppercase tracking-wider">Zero-Knowledge Initiation</span>
          <button id="setup-exit-btn" onClick={onLogout} className="text-neutral-500 hover:text-neutral-300 font-mono text-xs">Sign Out</button>
        </div>

        {authError && (
          <div className="mb-4 p-3 bg-red-950/40 border border-red-900/50 rounded-xl text-xs text-red-300 font-mono">
            {authError}
          </div>
        )}

        {setupStep === 1 ? (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-white tracking-wide">Phase 1: Configure Primary Master PIN</h3>
            <p className="text-xs text-neutral-400 leading-relaxed font-sans">
              Establish a 4-to-8 digit PIN passcode. All browser entries are instantly hashed and salt-encrypted before sync. Do NOT lose this PIN; encryption matches this secret key, rendering backups unrecoverable without it.
            </p>
            <div>
              <input 
                id="setup-real-pin-input"
                type="password" 
                maxLength={8}
                placeholder="Enter 4-8 Digit Master PIN passcode" 
                value={realPin}
                onChange={(e) => setRealPin(e.target.value.replace(/\D/g, ''))}
                className="w-full text-center bg-neutral-900 border border-neutral-800 rounded-xl py-3.5 text-2xl font-mono text-emerald-400 tracking-[0.6em] focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder-neutral-600 placeholder-tracking-normal"
              />
            </div>
            <button 
              id="setup-next-step-btn"
              type="button" 
              disabled={realPin.length < 4}
              onClick={() => setSetupStep(2)}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:pointer-events-none text-neutral-950 font-bold py-2.5 rounded-xl transition-all shadow-lg text-sm flex items-center justify-center gap-1.5"
            >
              Continue to Decoy Config <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : setupStep === 2 ? (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-white tracking-wide">Phase 2: Configure Backup Decoy PIN</h3>
            <p className="text-xs text-neutral-400 leading-relaxed font-sans">
              If an unauthorized entity coerces you to open this vault, enter this Decoy PIN. It acts completely authentic but loads an entirely empty, isolated faked container.
            </p>
            <div>
              <input 
                id="setup-decoy-pin-input"
                type="password" 
                maxLength={8}
                placeholder="Enter 4-8 Digit Decoy PIN passcode" 
                value={decoyPin}
                onChange={(e) => setDecoyPin(e.target.value.replace(/\D/g, ''))}
                className="w-full text-center bg-neutral-900 border border-neutral-800 rounded-xl py-3.5 text-2xl font-mono text-emerald-400 tracking-[0.6em] focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder-neutral-600 placeholder-tracking-normal"
              />
            </div>
            
            <div className="flex gap-2">
              <button 
                id="setup-back-step-btn"
                type="button" 
                onClick={() => setSetupStep(1)}
                className="flex-1 border border-neutral-800 text-neutral-400 font-semibold py-2.5 rounded-xl hover:bg-neutral-900 transition-all text-xs"
              >
                Back to Master PIN
              </button>
              <button 
                id="setup-complete-btn"
                type="button" 
                onClick={handlePinSetupComplete}
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold py-2.5 rounded-xl transition-all shadow-lg text-xs"
              >
                Confirm Setup Coordinates
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-emerald-400 tracking-wide flex items-center gap-1.5">
              <ShieldCheck className="w-5 h-5 shrink-0" /> Key Pair Sealed successfully!
            </h3>
            <p className="text-xs text-neutral-400 leading-relaxed font-sans">
              Your cryptographic keys have been sealed client-side. Below is your unique <strong className="text-amber-500">Emergency Vault Recovery Key</strong>. Write this down or print it. If you ever forget your Master PIN, this is the <em>only</em> way to decrypt and restore your vault without wiping your database records.
            </p>
            
            <div className="bg-neutral-900/80 border border-dashed border-neutral-700 rounded-xl p-4 select-all font-mono text-center text-xs text-amber-400 tracking-widest break-all relative">
              {backupRecoveryKey}
            </div>

            <div className="flex gap-2.5">
              <button
                id="btn-copy-rec-key"
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(backupRecoveryKey);
                  setCopiedKey(true);
                  setTimeout(() => setCopiedKey(false), 2000);
                }}
                className="flex-1 bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white font-semibold py-2.5 rounded-xl transition-all text-xs flex items-center justify-center gap-2"
              >
                {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey ? "Copied Key" : "Copy Recovery Key"}
              </button>
              
              <button
                id="btn-enter-vault-rec"
                type="button"
                onClick={() => {
                  if (pendingSession) {
                    onSessionUnlock(pendingSession);
                    setPendingSession(null);
                    setNeedProfileSetup(false);
                    setSetupStep(1);
                  }
                }}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold py-2.5 rounded-xl transition-all shadow-lg text-xs font-mono"
              >
                Launch Private Vault
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Multi-step Password / PIN reset wizard
  if (isRecoveringPin) {
    return (
      <div className="max-w-md w-full mx-auto bg-neutral-950 border border-neutral-900 rounded-2xl p-6 shadow-2xl relative" id="auth-recovery-panel">
        <div className="absolute top-0 left-0 w-full h-1 bg-amber-500 rounded-t-2xl" />
        
        <div className="flex justify-between items-center mb-4">
          <span className="text-[10px] font-mono text-amber-500 bg-amber-950/40 border border-amber-900/30 px-2.5 py-0.5 rounded-full uppercase tracking-wider">Vault PIN Recovery Console</span>
          <button 
            id="recovery-close-btn"
            onClick={() => setIsRecoveringPin(false)} 
            className="text-neutral-500 hover:text-neutral-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Errors/Success Feedback */}
        {recoveryError && (
          <div className="mb-4 p-3 bg-red-950/40 border border-red-900/50 rounded-xl flex items-start gap-2 text-xs text-red-400 font-mono">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{recoveryError}</span>
          </div>
        )}
        {recoverySuccess && (
          <div className="mb-4 p-3 bg-emerald-950/30 border border-emerald-900/50 rounded-xl text-xs text-emerald-400 font-mono">
            {recoverySuccess}
          </div>
        )}

        {recoveryStep === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">Select Recovery Strategy</h3>
              <p className="text-xs text-neutral-500 font-mono mt-0.5">Choose a master verification mechanism</p>
            </div>
            
            <p className="text-xs text-neutral-400 leading-relaxed font-sans">
              Because your personal vault operations are fully protected with strict Zero-Knowledge encryption, your security master keys cannot be reset without explicit owner validation.
            </p>

            <div className="space-y-3 pt-2">
              <button
                id="recovery-choose-gmail-btn"
                type="button"
                onClick={handleSendGmailOtp}
                className="w-full text-left bg-neutral-900/60 hover:bg-neutral-900 border border-neutral-850 rounded-xl p-3.5 transition-all flex flex-col gap-1 cursor-pointer group"
              >
                <span className="text-xs font-bold text-white group-hover:text-amber-500 transition-colors flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-neutral-400" /> Strategy 1: Gmail OTP Reset & Purge
                </span>
                <span className="text-[10px] text-neutral-400 leading-normal">
                  Send a 6-digit confirmation token to Your Gmail inbox. Resetting this way erases previous items to seal security.
                </span>
              </button>

              <button
                id="recovery-choose-key-btn"
                type="button"
                onClick={() => setRecoveryStep(3)}
                className="w-full text-left bg-neutral-900/60 hover:bg-neutral-900 border border-neutral-850 rounded-xl p-3.5 transition-all flex flex-col gap-1 cursor-pointer group"
              >
                <span className="text-xs font-bold text-white group-hover:text-amber-500 transition-colors flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-neutral-400" /> Strategy 2: Emergency Recovery Key
                </span>
                <span className="text-[10px] text-neutral-400 leading-normal">
                  Provide your 24-character security recovery key layout. This preserves all of your files and note contents seamlessly.
                </span>
              </button>
            </div>

            <button
              id="recovery-cancel-btn"
              type="button"
              onClick={() => setIsRecoveringPin(false)}
              className="w-full pt-2 border border-neutral-800 hover:bg-neutral-900 text-neutral-400 hover:text-white font-mono py-2 rounded-xl text-xs transition-colors cursor-pointer text-center"
            >
              Back to Lock Screen
            </button>
          </div>
        )}

        {recoveryStep === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">Gmail token Validation</h3>
              <p className="text-xs text-neutral-500 font-mono mt-0.5">Check your inbox for verify digits</p>
            </div>

            <p className="text-xs text-neutral-400 leading-relaxed font-sans">
              To complete verification, use the preloaded link below to compose the verification email via Gmail. (Since we operate in a sandbox, the code is also shown transparently below for your sandbox testing).
            </p>

            {(() => {
              const emailBody = `[Security Vault Recovery Session]\nOperator Email Reference: ${user.email}\nVerification OTP token: ${generatedOtp}\n\nValidate this code inside the Secret Vault tab to reset your Master PIN passcode.`;
              const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(user.email || '')}&su=${encodeURIComponent("Secret Vault Security Passcode Recovery OTP")}&body=${encodeURIComponent(emailBody)}`;
              return (
                <div className="space-y-2">
                  <a 
                    href={gmailUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    id="btn-launch-gmail-action"
                    onClick={() => setIsGmailLaunchClicked(true)}
                    className="w-full bg-neutral-900 border border-neutral-850 text-neutral-200 hover:text-white rounded-xl py-3 px-4 transition-all text-xs flex items-center justify-between font-mono group"
                  >
                    <span className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-amber-500 animate-pulse" /> Gmail Compose Helper
                    </span>
                    <ExternalLink className="w-3.5 h-3.5 text-neutral-500 group-hover:text-amber-500" />
                  </a>

                  <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-3 text-center">
                    <span className="text-[10px] uppercase font-mono text-neutral-500 block">Sandbox Simulation Code</span>
                    <strong className="text-lg font-mono text-amber-500 tracking-widest">{generatedOtp}</strong>
                  </div>
                </div>
              );
            })()}

            <div className="space-y-2 pt-2">
              <label className="text-[10px] font-mono text-neutral-500 block uppercase">Enter 6-Digit Code</label>
              <input 
                id="recovery-otp-code-input"
                type="text" 
                maxLength={6}
                placeholder="000000"
                value={enteredOtp}
                onChange={(e) => setEnteredOtp(e.target.value.replace(/\D/g, ''))}
                className="w-full text-center bg-neutral-950 border border-neutral-800 rounded-xl py-3 text-2xl font-mono text-amber-400 tracking-[0.4em] focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-transparent placeholder-neutral-800"
              />
            </div>

            <div className="flex gap-2">
              <button 
                id="recovery-otp-back-btn"
                type="button" 
                onClick={() => setRecoveryStep(1)}
                className="flex-1 border border-neutral-800 text-neutral-400 font-semibold py-2 rounded-xl hover:bg-neutral-900 transition-all text-xs"
              >
                Back
              </button>
              <button 
                id="recovery-otp-verify-btn"
                type="button" 
                onClick={handleVerifyOtpCode}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold py-2 rounded-xl transition-all shadow-lg text-xs cursor-pointer"
              >
                Confirm Code
              </button>
            </div>
          </div>
        )}

        {recoveryStep === 3 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">Emergency Recovery Key</h3>
              <p className="text-xs text-neutral-500 font-mono mt-0.5 font-sans">Input your 24-character security key</p>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-mono text-neutral-500 block uppercase">Enter Key coordinates</label>
              <input 
                id="recovery-key-entered-input"
                type="text" 
                placeholder="SECURE-VAULT-XXXX-XXXX-XXXX-XXXX"
                value={enteredRecoveryKey}
                onChange={(e) => setEnteredRecoveryKey(e.target.value)}
                className="w-full text-center bg-neutral-950 border border-neutral-800 rounded-xl py-3 text-xs font-mono text-amber-300 tracking-wider uppercase focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-transparent placeholder-neutral-800 animate-pulse"
              />
              <span className="text-[9px] text-neutral-500 font-sans leading-normal block">
                Format includes standard hyphens: <span className="font-mono text-neutral-400">SECURE-VAULT-XXXX-XXXX-...</span>. Keys are completely matching case-insensitively.
              </span>
            </div>

            <div className="flex gap-2 pt-2">
              <button 
                id="recovery-key-back-btn"
                type="button" 
                onClick={() => setRecoveryStep(1)}
                className="flex-1 border border-neutral-800 text-neutral-400 font-semibold py-2 rounded-xl hover:bg-neutral-900 transition-all text-xs"
              >
                Back
              </button>
              <button 
                id="recovery-key-verify-btn"
                type="button" 
                onClick={handleVerifyRecoveryKey}
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold py-2 rounded-xl transition-all shadow-lg text-xs cursor-pointer"
              >
                Decrypt Payload
              </button>
            </div>
          </div>
        )}

        {recoveryStep === 4 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">Configure New passcode</h3>
              <p className="text-xs text-neutral-500 font-mono mt-0.5 flex items-center gap-1">
                {reconstructedMasterKey ? (
                  <span className="text-emerald-400 flex items-center gap-1">🛡️ Cryptographical payload recovered</span>
                ) : (
                  <span className="text-amber-500 flex items-center gap-1">⚠️ Reset & Total data purge</span>
                )}
              </p>
            </div>

            {reconstructedMasterKey ? (
              <p className="text-xs text-neutral-400 leading-relaxed font-sans">
                Excellent! Your emergency recovery key decrypted your master key coordinates perfectly. All offline and backed-up files are entirely preserved. Define your new 4-to-8 digit lock PIN below.
              </p>
            ) : (
              <div className="p-3 bg-amber-950/20 border border-amber-900/30 rounded-xl text-neutral-300 text-xs leading-normal space-y-1">
                <p className="font-bold text-amber-500">⚠️ Critical security Notice:</p>
                <p>
                  Because you did not specify your Emergency Recovery Key, we cannot decrypt your existing files. Resetting your PIN this way will permanently delete all previous files and notes to ensure Zero-Knowledge security.
                </p>
              </div>
            )}

            <div className="space-y-2 pt-2">
              <label className="text-[10px] font-mono text-neutral-500 block uppercase">Enter New Master PIN</label>
              <input 
                id="recovery-new-pin-input"
                type="password" 
                maxLength={8}
                placeholder="4-8 Digits"
                value={newMasterPin}
                onChange={(e) => setNewMasterPin(e.target.value.replace(/\D/g, ''))}
                className="w-full text-center bg-neutral-950 border border-neutral-800 rounded-xl py-3.5 text-2xl font-mono text-emerald-400 tracking-[0.60em] focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-transparent placeholder-neutral-800"
              />
            </div>

            <div className="flex gap-2">
              <button 
                id="recovery-new-pin-abort"
                type="button" 
                onClick={() => setIsRecoveringPin(false)}
                className="flex-1 border border-neutral-800 text-neutral-400 font-semibold py-2 rounded-xl hover:bg-neutral-900 transition-all text-xs"
              >
                Abort Reset
              </button>
              <button 
                id="recovery-new-pin-apply"
                type="button" 
                disabled={newMasterPin.length < 4}
                onClick={handleApplyNewRecoveredPin}
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 disabled:opacity-40 disabled:pointer-events-none font-bold py-2 rounded-xl transition-all shadow-lg text-xs cursor-pointer"
              >
                Apply & Unlock
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Phase C: Signed in, profile active, but session is locked. Complete PIN Unlock Pad view
  return (
    <div className="max-w-xs w-full mx-auto bg-neutral-950 border border-neutral-900 rounded-3xl p-5 shadow-2xl relative" id="auth-unlock-pad">
      <div className="absolute top-0 left-0 w-full h-1 bg-amber-500 rounded-t-3xl" />
      
      {/* Locked title header */}
      <div className="text-center mb-4">
        <div className="bg-amber-950/20 p-2.5 rounded-full border border-amber-900/20 inline-block mb-1">
          <Lock className="w-5 h-5 text-amber-500 animate-pulse" />
        </div>
        <h3 className="text-sm font-semibold text-white">Security Vault Isolated</h3>
        <p className="text-[10px] text-neutral-500 font-mono">Unlock required to decrypt key payload</p>
      </div>

      {unlockError && (
        <div className="mb-3 p-2 bg-red-950/40 border border-red-900/50 rounded-xl text-[10px] text-red-400 font-mono text-center leading-normal">
          {unlockError}
        </div>
      )}

      {/* Visual DOT PIN Indicators */}
      <div className="flex justify-center gap-3.5 mb-5 py-2">
        {[...Array(8)].map((_, i) => (
          <div 
            key={i} 
            className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
              i < unlockPin.length 
                ? 'bg-amber-500 shadow-md ring-2 ring-amber-950/40' 
                : 'bg-neutral-800'
            }`} 
          />
        ))}
      </div>

      {/* Grid Numpad Layout */}
      <div className="grid grid-cols-3 gap-2 text-white font-mono font-bold text-lg mb-4">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((val) => (
          <button 
            id={`unlock-numpad-${val}`}
            key={val} 
            onClick={() => handleNumpadPress(val)}
            className="h-11 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-900/60 transition-colors active:scale-95 text-sm"
          >
            {val}
          </button>
        ))}
        <button 
          id="unlock-numpad-clear"
          onClick={() => handleNumpadPress('clear')}
          className="h-11 rounded-xl bg-neutral-950 hover:bg-neutral-900 border border-neutral-900 text-xs text-neutral-500 font-sans"
        >
          AC
        </button>
        <button 
          id="unlock-numpad-0"
          onClick={() => handleNumpadPress('0')}
          className="h-11 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-900 transition-colors"
        >
          0
        </button>
        <button 
          id="unlock-numpad-back"
          onClick={() => handleNumpadPress('back')}
          className="h-11 rounded-xl bg-neutral-950 hover:bg-neutral-900 border border-neutral-900 text-xs text-neutral-500 font-sans"
        >
          DEL
        </button>
      </div>

      <button 
        id="unlock-submit-coordinate-btn"
        onClick={() => handlePinUnlock()}
        disabled={unlockPin.length < 4 || loading}
        className="w-full bg-amber-500 hover:bg-amber-400 text-neutral-950 disabled:opacity-40 disabled:pointer-events-none py-2 rounded-xl text-xs font-bold font-sans transition-all active:scale-95 shadow-md flex items-center justify-center gap-1"
      >
        Decrypt Session State
      </button>

      <div className="flex justify-between items-center text-[10px] text-neutral-600 font-mono pt-3 mt-3 border-t border-neutral-900">
        <button id="unlock-forgot-pin-btn" onClick={initiateForgotPasswordFlow} className="hover:text-amber-500 hover:underline text-left">Forgot PIN?</button>
        <button id="unlock-signout-btn" onClick={onLogout} className="hover:text-amber-500 hover:underline text-right">Switch node</button>
      </div>
    </div>
  );
}
