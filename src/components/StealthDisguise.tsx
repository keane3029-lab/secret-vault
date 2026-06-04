/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Shield, Sparkles, Terminal, FileText, ChevronRight, HelpCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface StealthDisguiseProps {
  disguiseType: 'calculator' | 'notepad' | 'system_logs' | 'none';
  onUnlockTrigger: () => void;
}

export default function StealthDisguise({ disguiseType, onUnlockTrigger }: StealthDisguiseProps) {
  // Calculator State
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [calcPrev, setCalcPrev] = useState<string | null>(null);
  const [calcOp, setCalcOp] = useState<string | null>(null);
  const [calcResetOnNext, setCalcResetOnNext] = useState(false);

  // Notepad State
  const [noteTitle, setNoteTitle] = useState('My Quick Drafts');
  const [noteBody, setNoteBody] = useState(
    "1. Meeting notes on project scope. Check the milestones.\n" +
    "2. Remember to buy milk and cereal.\n" +
    "3. Fix CSS bug in navigation menu.\n" +
    "Drafting some ideas about optimization in modern JS applications..."
  );

  // System Logs State
  const [logSearch, setLogSearch] = useState('');
  const staticLogs = [
    { time: '13:14:02', source: 'SYS/INIT', msg: 'Kernel boot sequence initialized.' },
    { time: '13:14:05', source: 'NET/WG', msg: 'Local proxy handshakes established on port 80.' },
    { time: '13:14:12', source: 'AUTH/PAM', msg: 'Default policy files parsed successfully.' },
    { time: '13:14:28', source: 'CRON/DAEMON', msg: 'Cleaning database session descriptors.' },
    { time: '13:14:55', source: 'SYS/KERN', msg: 'Memory allocation successful (pooled heap: 4096MB).' },
    { time: '13:15:10', source: 'SEC/FILTER', msg: 'WAF rules loaded. 104 default filters active.' },
    { time: '13:15:24', source: 'SYS/STABLE', msg: 'Check finished. Host status is operational.' }
  ];

  // Calculator Logic
  const handleCalcNum = (num: string) => {
    if (calcDisplay === '0' || calcResetOnNext) {
      setCalcDisplay(num);
      setCalcResetOnNext(false);
    } else {
      setCalcDisplay(calcDisplay + num);
    }
  };

  const handleCalcOp = (op: string) => {
    setCalcPrev(calcDisplay);
    setCalcOp(op);
    setCalcResetOnNext(true);
  };

  const handleCalcClear = () => {
    setCalcDisplay('0');
    setCalcPrev(null);
    setCalcOp(null);
    setCalcResetOnNext(false);
  };

  const calculateResult = () => {
    // Secret trigger inside the calculator: type "7890" or "80085" and hit "="
    if (calcDisplay === '7890' || calcDisplay === '80085') {
      onUnlockTrigger();
      return;
    }

    if (!calcOp || !calcPrev) return;
    const a = parseFloat(calcPrev);
    const b = parseFloat(calcDisplay);
    let res = 0;
    switch (calcOp) {
      case '+': res = a + b; break;
      case '-': res = a - b; break;
      case '*': res = a * b; break;
      case '/': res = b !== 0 ? a / b : 0; break;
    }
    setCalcDisplay(String(res));
    setCalcOp(null);
    setCalcPrev(null);
    setCalcResetOnNext(true);
  };

  if (disguiseType === 'calculator') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] p-6 max-w-sm mx-auto" id="disguise-calculator">
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 shadow-2xl w-full">
          {/* Stealth Unlock Trigger in the bezel */}
          <div className="flex justify-between items-center mb-4 px-1">
            <span className="text-xs font-mono text-neutral-600">CASIO-FX82</span>
            <button 
              id="stealth-bezel-trigger"
              onClick={onUnlockTrigger} 
              className="w-4 h-4 rounded-full bg-neutral-800 hover:bg-neutral-700 transition-colors cursor-default"
              title="Stealth access"
            />
          </div>

          {/* Calculator Screen */}
          <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-xl p-4 mb-5 text-right font-mono min-h-[72px] flex flex-col justify-end overflow-hidden">
            <div className="text-neutral-500 text-xs tracking-wider h-4">
              {calcPrev ? `${calcPrev} ${calcOp || ''}` : ''}
            </div>
            <div id="calculator-display" className="text-emerald-400 text-3xl font-semibold truncate tracking-tight">
              {calcDisplay}
            </div>
          </div>

          {/* Keypad Grid */}
          <div className="grid grid-cols-4 gap-3 font-semibold text-lg text-white">
            <button id="calc-btn-ac" onClick={handleCalcClear} className="h-14 bg-neutral-800 hover:bg-neutral-700/80 rounded-2xl transition-colors active:scale-95 text-red-400">AC</button>
            <button id="calc-btn-back" onClick={() => setCalcDisplay(d => d.length > 1 ? d.slice(0, -1) : '0')} className="h-14 bg-neutral-800 hover:bg-neutral-700/80 rounded-2xl transition-colors active:scale-95 text-neutral-400">C</button>
            <button id="calc-btn-pct" onClick={() => setCalcDisplay(d => String(parseFloat(d) / 100))} className="h-14 bg-neutral-800 hover:bg-neutral-700/80 rounded-2xl transition-colors active:scale-95 text-neutral-400">%</button>
            <button id="calc-btn-div" onClick={() => handleCalcOp('/')} className="h-14 bg-amber-600 hover:bg-amber-500 rounded-2xl transition-colors active:scale-95 text-xl">÷</button>

            <button id="calc-btn-7" onClick={() => handleCalcNum('7')} className="h-14 bg-neutral-800 hover:bg-neutral-700 rounded-2xl transition-colors active:scale-95">7</button>
            <button id="calc-btn-8" onClick={() => handleCalcNum('8')} className="h-14 bg-neutral-800 hover:bg-neutral-700 rounded-2xl transition-colors active:scale-95">8</button>
            <button id="calc-btn-9" onClick={() => handleCalcNum('9')} className="h-14 bg-neutral-800 hover:bg-neutral-700 rounded-2xl transition-colors active:scale-95">9</button>
            <button id="calc-btn-mul" onClick={() => handleCalcOp('*')} className="h-14 bg-amber-600 hover:bg-amber-500 rounded-2xl transition-colors active:scale-95 text-xl">×</button>

            <button id="calc-btn-4" onClick={() => handleCalcNum('4')} className="h-14 bg-neutral-800 hover:bg-neutral-700 rounded-2xl transition-colors active:scale-95">4</button>
            <button id="calc-btn-5" onClick={() => handleCalcNum('5')} className="h-14 bg-neutral-800 hover:bg-neutral-700 rounded-2xl transition-colors active:scale-95">5</button>
            <button id="calc-btn-6" onClick={() => handleCalcNum('6')} className="h-14 bg-neutral-800 hover:bg-neutral-700 rounded-2xl transition-colors active:scale-95">6</button>
            <button id="calc-btn-sub" onClick={() => handleCalcOp('-')} className="h-14 bg-amber-600 hover:bg-amber-500 rounded-2xl transition-colors active:scale-95 text-xl">-</button>

            <button id="calc-btn-1" onClick={() => handleCalcNum('1')} className="h-14 bg-neutral-800 hover:bg-neutral-700 rounded-2xl transition-colors active:scale-95">1</button>
            <button id="calc-btn-2" onClick={() => handleCalcNum('2')} className="h-14 bg-neutral-800 hover:bg-neutral-700 rounded-2xl transition-colors active:scale-95">2</button>
            <button id="calc-btn-3" onClick={() => handleCalcNum('3')} className="h-14 bg-neutral-800 hover:bg-neutral-700 rounded-2xl transition-colors active:scale-95">3</button>
            <button id="calc-btn-add" onClick={() => handleCalcOp('+')} className="h-14 bg-amber-600 hover:bg-amber-500 rounded-2xl transition-colors active:scale-95 text-xl">+</button>

            <button id="calc-btn-0" onClick={() => handleCalcNum('0')} className="col-span-2 h-14 bg-neutral-800 hover:bg-neutral-700 rounded-2xl transition-colors active:scale-95 text-left pl-6">0</button>
            <button id="calc-btn-dot" onClick={() => { if(!calcDisplay.includes('.')) setCalcDisplay(calcDisplay + '.'); }} className="h-14 bg-neutral-800 hover:bg-neutral-700 rounded-2xl transition-colors active:scale-95">.</button>
            <button id="calc-btn-eq" onClick={calculateResult} className="h-14 bg-amber-600 hover:bg-amber-500 rounded-2xl transition-colors active:scale-95 text-xl">=</button>
          </div>
          <div className="mt-4 text-center">
            <p className="text-[10px] text-neutral-600 font-sans">
              Enter secret code bypass + '=' or click the screw bezel.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (disguiseType === 'notepad') {
    return (
      <div className="max-w-xl mx-auto p-4 bg-amber-50/70 dark:bg-neutral-900 border border-amber-200/50 dark:border-neutral-800 rounded-2xl shadow-lg mt-6" id="disguise-notepad">
        <div className="flex items-center justify-between border-b pb-3 border-amber-200/50 dark:border-neutral-800 mb-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-600" />
            <input 
              id="notepad-title-input"
              type="text" 
              className="font-semibold text-neutral-700 dark:text-neutral-200 bg-transparent border-none focus:outline-none focus:ring-0 text-sm py-0 h-auto"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-mono text-neutral-400">Offline Memo v1.2</span>
            <button 
              id="stealth-help-trigger"
              onClick={onUnlockTrigger} 
              className="p-1 text-neutral-400 hover:text-amber-600 transition-colors rounded-full"
              title="Stealth access"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
        </div>
        <textarea
          id="notepad-body-input"
          className="w-full h-80 bg-transparent text-sm font-sans resize-none focus:outline-none dark:text-neutral-300 text-neutral-600 leading-relaxed border-none p-0 focus:ring-0"
          value={noteBody}
          onChange={(e) => setNoteBody(e.target.value)}
          placeholder="Start typing your quick memos..."
        />
        <div className="flex justify-between items-center text-[10px] text-neutral-400 font-mono mt-3 pt-2 border-t border-amber-200/50 dark:border-neutral-800">
          <span>Words: {noteBody.split(/\s+/).filter(Boolean).length}</span>
          <span>Draft autosaved locally. Click the Help icon to load utilities.</span>
        </div>
      </div>
    );
  }

  if (disguiseType === 'system_logs') {
    return (
      <div className="max-w-2xl mx-auto bg-black p-5 rounded-2xl border border-neutral-800 text-neutral-400 font-mono shadow-2xl mt-6" id="disguise-logs">
        <div className="flex justify-between items-center border-b border-neutral-800 pb-3 mb-4">
          <div className="flex items-center gap-2 text-emerald-500">
            <Terminal className="w-5 h-5 animate-pulse" />
            <span className="text-xs font-semibold">DAEMON CONTROL CONSOLE [SYSTEM STABLE]</span>
          </div>
          <button 
            id="stealth-logs-trigger"
            onClick={onUnlockTrigger} 
            className="text-xs px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-all"
          >
            Run Audit
          </button>
        </div>

        {/* Console stats */}
        <div className="grid grid-cols-3 gap-4 mb-4 text-[11px] text-neutral-500 bg-neutral-950/60 p-3 rounded-lg border border-neutral-900">
          <div>CPU usage: <span className="text-emerald-500">1.4%</span></div>
          <div>RAM allocated: <span className="text-emerald-500">15.2MB</span></div>
          <div>Secure Nodes: <span className="text-emerald-500">Online</span></div>
        </div>

        {/* Filter */}
        <div className="mb-3">
          <div className="relative flex items-center bg-neutral-950 border border-neutral-900 rounded-lg px-2 py-1.5">
            <span className="text-neutral-600 text-xs mr-2">$ grep</span>
            <input 
              id="logs-filter-input"
              type="text" 
              placeholder="filter log lines..." 
              value={logSearch} 
              onChange={(e) => setLogSearch(e.target.value)}
              className="bg-transparent border-none text-xs focus:outline-none text-emerald-400 p-0 m-0 w-full focus:ring-0"
            />
          </div>
        </div>

        {/* Logger Board */}
        <div className="h-64 overflow-y-auto bg-neutral-950/80 border border-neutral-900 rounded-xl p-3 space-y-1.5 scrollbar-thin text-xs">
          {staticLogs
            .filter(l => l.msg.toLowerCase().includes(logSearch.toLowerCase()) || l.source.toLowerCase().includes(logSearch.toLowerCase()))
            .map((l, idx) => (
              <div key={idx} className="flex gap-2 hover:bg-neutral-900/40 p-0.5 rounded">
                <span className="text-neutral-600">[{l.time}]</span>
                <span className="text-emerald-500 font-bold">{l.source}</span>
                <span className="text-neutral-300">{l.msg}</span>
              </div>
            ))
          }
        </div>
        <p className="text-[9px] text-neutral-600 mt-3 text-right">
          Click the "Run Audit" header to evaluate system profiles.
        </p>
      </div>
    );
  }

  // Fallback / None
  return (
    <div className="text-center p-8 bg-neutral-900/50 border border-neutral-800 rounded-3xl" id="disguise-none">
      <Shield className="w-12 h-12 text-amber-500 mx-auto mb-4 animate-pulse" />
      <h3 className="text-lg font-semibold text-white mb-2">Secure Gateway Portal</h3>
      <p className="text-sm text-neutral-400 max-w-md mx-auto mb-6">
        No active decoy disguise. Enter the vault authorization sequence or set up custom disguises in settings.
      </p>
      <button 
        id="gateway-portal-trigger"
        onClick={onUnlockTrigger} 
        className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded-xl font-bold transition-all shadow-lg active:scale-95 inline-flex items-center gap-2"
      >
        <Sparkles className="w-4 h-4" /> Open Cryptographic Gate
      </button>
    </div>
  );
}
