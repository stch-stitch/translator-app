// components/ui/DarkModeToggle.tsx
'use client';

import type { Theme } from '@/types/translator';

interface DarkModeToggleProps {
  theme: Theme;
  onToggle: () => void;
}

export function DarkModeToggle({ theme, onToggle }: DarkModeToggleProps) {
  return (
    <button
      onClick={onToggle}
      className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors
        bg-slate-200 text-slate-600 hover:bg-slate-300
        dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
      title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
    >
      {theme === 'dark' ? '☀️ 라이트' : '🌙 다크'}
    </button>
  );
}
