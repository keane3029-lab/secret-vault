/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  onAuthStateChanged, 
  signOut,
  User 
} from 'firebase/auth';
import { 
  doc, 
  getDoc,
  onSnapshot
} from 'firebase/firestore';
import { 
  ShieldAlert, 
  ShieldCheck, 
  Lock, 
  LockKeyhole,
  Sparkles,
  Info
} from 'lucide-react';
import { auth, db } from './lib/firebase';
import { ActiveSession, UserProfile } from './types';
import StealthDisguise from './components/StealthDisguise';
import AuthInterface from './components/AuthInterface';
import VaultDashboard from './components/VaultDashboard';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [showUnlockGate, setShowUnlockGate] = useState(false);
  const [loading, setLoading] = useState(true);

  // Auto-lock idle management refs & states
  const IDLE_LIMIT_MS = 30000; // Strictly enforce 30 seconds idle limit
  const idleTimeoutId = useRef<NodeJS.Timeout | null>(null);
  const [isIdleLocked, setIsIdleLocked] = useState(false);

  // Monitor Auth Status changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setCurrentUser(fbUser);
      if (fbUser) {
        // Direct stream monitor on the User Settings Profile so disguise updates apply dynamically
        onSnapshot(doc(db, 'users', fbUser.uid), (docSnap) => {
          if (docSnap.exists()) {
            setUserProfile(docSnap.data() as UserProfile);
          } else {
            setUserProfile(null);
          }
        });
      } else {
        setUserProfile(null);
        setActiveSession(null);
        setShowUnlockGate(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 1. Enforce Auto-lock on Tab Focus Loss & Visibility Changes
  useEffect(() => {
    const handleLockTrigger = () => {
      if (activeSession) {
        console.warn("Active session terminated instantly: Focus limits exceeded or Tab state minimized.");
        handleLockVault();
      }
    };

    // Listeners for focus loss & minimizes
    window.addEventListener('blur', handleLockTrigger);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        handleLockTrigger();
      }
    });

    return () => {
      window.removeEventListener('blur', handleLockTrigger);
      document.removeEventListener('visibilitychange', handleLockTrigger);
    };
  }, [activeSession]);

  // 2. Active Session Idle Timing triggers
  useEffect(() => {
    const resetIdleTimer = () => {
      if (!activeSession) return;
      
      if (idleTimeoutId.current) {
        clearTimeout(idleTimeoutId.current);
      }

      idleTimeoutId.current = setTimeout(() => {
        console.warn("Active session locked: 30 seconds of idle inactivity detected.");
        setIsIdleLocked(true);
        handleLockVault();
      }, IDLE_LIMIT_MS);
    };

    if (activeSession) {
      resetIdleTimer();
      // Track normal mouse and keyboard interaction to refresh idle
      window.addEventListener('mousemove', resetIdleTimer);
      window.addEventListener('keydown', resetIdleTimer);
      window.addEventListener('mousedown', resetIdleTimer);
      window.addEventListener('scroll', resetIdleTimer);
      window.addEventListener('touchstart', resetIdleTimer);
    }

    return () => {
      if (idleTimeoutId.current) clearTimeout(idleTimeoutId.current);
      window.removeEventListener('mousemove', resetIdleTimer);
      window.removeEventListener('keydown', resetIdleTimer);
      window.removeEventListener('mousedown', resetIdleTimer);
      window.removeEventListener('scroll', resetIdleTimer);
      window.removeEventListener('touchstart', resetIdleTimer);
    };
  }, [activeSession]);

  const handleLockVault = () => {
    setActiveSession(null);
    setShowUnlockGate(false); // return to stealth disguise instantly
    if (idleTimeoutId.current) clearTimeout(idleTimeoutId.current);
  };

  const handleLogout = async () => {
    handleLockVault();
    await signOut(auth);
    setUserProfile(null);
    setCurrentUser(null);
  };

  const fetchUpdatedProfile = async () => {
    if (!currentUser) return;
    const userDocSnap = await getDoc(doc(db, 'users', currentUser.uid));
    if (userDocSnap.exists()) {
      setUserProfile(userDocSnap.data() as UserProfile);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-950 font-mono text-xs text-neutral-500 leading-normal" id="app-loader">
        <Sparkles className="w-8 h-8 text-amber-500 animate-pulse mb-3" />
        Securing Cryptographic Sandbox Terminal...
      </div>
    );
  }

  // Active Disguise Layout (calculator, notepad, system logs)
  const activeDisguise = userProfile?.disguiseType || 'calculator';

  return (
    <div 
      className="min-h-screen bg-neutral-950 flex flex-col justify-between p-4 selection:bg-amber-500 selection:text-neutral-950 select-none print:hidden overflow-x-hidden relative"
      id="root-vault-container"
    >
      {/* Background radial secure ambiance gradient */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.02)_0%,rgba(0,0,0,0)_100%)]" />

      {/* Ambiance Security Banner top info if disguise is off */}
      <header className="max-w-7xl mx-auto w-full text-center py-2 flex items-center justify-between pointer-events-none opacity-50 select-none mb-4">
        <div className="flex items-center gap-1 text-[10px] font-mono text-neutral-600">
          <ShieldCheck className="w-3.5 h-3.5" /> ISO-ZERO_KNOWLEDGE COORD
        </div>
        <div className="text-[10px] font-mono text-neutral-600">
          SECURE STATUS: ACTIVE SHIELD
        </div>
      </header>

      {/* Main secure conditional body content container */}
      <main className="flex-grow flex items-center justify-center py-4 w-full max-w-5xl mx-auto z-10">
        <AnimatePresence mode="wait">
          
          {/* A. If session is fully unlocked, present the main Vault Dashboard */}
          {activeSession ? (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="w-full"
            >
              <VaultDashboard
                user={currentUser}
                profile={userProfile}
                activeSession={activeSession}
                onLogout={handleLogout}
                onLockSession={handleLockVault}
                onRefreshProfile={fetchUpdatedProfile}
              />
            </motion.div>
          ) : showUnlockGate ? (
            
            /* B. If they clicked the secret trigger, present the credentials or numpad unlock UI */
            <motion.div
              key="unlock-gate"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="w-full relative"
            >
              {/* Back to disguise quick action button */}
              <button 
                id="btn-return-stealth"
                type="button"
                onClick={() => setShowUnlockGate(false)}
                className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-[10px] font-mono rounded-lg hover:text-amber-500 transition-all cursor-default"
              >
                <Lock className="w-3.5 h-3.5 text-amber-500" /> Return to Disguise layout
              </button>

              <AuthInterface
                user={currentUser}
                activeSession={activeSession}
                onSessionUnlock={(session) => {
                  setIsIdleLocked(false);
                  setActiveSession(session);
                }}
                onLogout={handleLogout}
              />
            </motion.div>
          ) : (
            
            /* C. By default, lock screen presents stealth decoy pages (Notepad/Calculator/Logs) */
            <motion.div
              key="disguise"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full"
            >
              {isIdleLocked && (
                <div id="idle-warning-toast" className="max-w-xs mx-auto mb-4 p-2.5 bg-amber-950/20 border border-amber-900/40 rounded-xl flex items-center gap-2 text-[10px] font-mono text-amber-500 leading-normal animate-pulse">
                  <Info className="w-4 h-4 shrink-0" />
                  Your session was automatically locked to safeguard vault credentials.
                </div>
              )}
              <StealthDisguise
                disguiseType={activeDisguise}
                onUnlockTrigger={() => {
                  setIsIdleLocked(false); // reset idle locks triggers
                  setShowUnlockGate(true);
                }}
              />
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Discrete subtle system disclaimer coordinates footer */}
      <footer className="w-full text-center py-4 text-[9px] font-mono text-neutral-700 pointer-events-none select-none">
        System Alert: Security checked. Host operational. Copyright © 2026.
      </footer>
    </div>
  );
}
