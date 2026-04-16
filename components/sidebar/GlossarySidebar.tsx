// components/sidebar/GlossarySidebar.tsx
'use client';

import { useState } from 'react';
import type { GlossaryEntry } from '@/types/translator';

interface GlossarySidebarProps {
  glossary: GlossaryEntry[];
  onChange: (updated: GlossaryEntry[]) => void;
}

export function GlossarySidebar({ glossary, onChange }: GlossarySidebarProps) {
  const [engInput, setEngInput] = useState('');
  const [korInput, setKorInput] = useState('');
  const nextId = getNextId(glossary);

  const handleAdd = (): void => {
    const english = engInput.trim();
    const korean = korInput.trim();
    if (!english || !korean) return;
    onChange([...glossary, { id: nextId, english, korean }]);
    setEngInput('');
    setKorInput('');
  };

  const handleDelete = (id: number): void => {
    onChange(glossary.filter(e => e.id !== id));
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') handleAdd();
  };

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide mb-3 text-slate-500 dark:text-slate-400">
        📖 용어집
      </p>

      {/* 용어 목록 */}
      <div className="space-y-1.5 mb-3 max-h-48 overflow-y-auto">
        {glossary.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-600">용어 없음</p>
        )}
        {glossary.map(entry => (
          <div key={entry.id} className="flex items-center gap-1.5 group">
            <span className="flex-1 text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 truncate">
              {entry.english}
            </span>
            <span className="text-xs text-slate-400">→</span>
            <span className="flex-1 text-xs px-2 py-1 rounded bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 truncate">
              {entry.korean}
            </span>
            <button
              onClick={() => handleDelete(entry.id)}
              className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition-opacity"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* 용어 추가 */}
      <div className="space-y-1.5">
        <input
          type="text"
          value={engInput}
          onChange={e => setEngInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="영어"
          className="w-full text-xs px-2 py-1.5 rounded border outline-none
            border-slate-200 bg-white text-slate-700 placeholder-slate-400 focus:border-blue-400
            dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:placeholder-slate-600 dark:focus:border-blue-500"
        />
        <input
          type="text"
          value={korInput}
          onChange={e => setKorInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="한국어"
          className="w-full text-xs px-2 py-1.5 rounded border outline-none
            border-slate-200 bg-white text-slate-700 placeholder-slate-400 focus:border-blue-400
            dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:placeholder-slate-600 dark:focus:border-blue-500"
        />
        <button
          onClick={handleAdd}
          disabled={!engInput.trim() || !korInput.trim()}
          className="w-full text-xs py-1.5 rounded border transition-colors
            border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600
            dark:border-slate-700 dark:text-slate-500 dark:hover:border-blue-500 dark:hover:text-blue-400
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + 추가 (Enter)
        </button>
      </div>
    </div>
  );
}

/** 현재 용어집의 최대 id + 1 반환 */
function getNextId(entries: GlossaryEntry[]): number {
  return entries.length === 0 ? 1 : Math.max(...entries.map(e => e.id)) + 1;
}
