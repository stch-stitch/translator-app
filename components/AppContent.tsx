// components/AppContent.tsx
'use client';

import { useState, useEffect } from 'react';
import { TranslatorApp } from '@/components/TranslatorApp';
import type { Theme } from '@/types/translator';

const THEME_KEY = 'translator-theme';

function loadTheme(): Theme {
  try { return (localStorage.getItem(THEME_KEY) as Theme) ?? 'dark'; } catch { return 'dark'; }
}

// ─── Password Gate ────────────────────────────────────────────────────────────

export function PasswordGate({ onAuth }: { onAuth: (token: string) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setIsChecking(true);
    setError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        onAuth(password);
      } else {
        setError('비밀번호가 올바르지 않습니다.');
      }
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
      <div className="w-full max-w-sm p-8 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm space-y-6">
        <div className="flex items-baseline gap-2">
          <h1 className="text-2xl font-bold text-blue-600">Translator for my Yf</h1>
          <span className="text-sm text-slate-400">by Hb</span>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="비밀번호를 입력하세요"
            className="w-full px-4 py-3 border rounded-lg text-sm outline-none
              border-slate-200 text-slate-800 focus:ring-2 focus:ring-blue-500
              dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            autoFocus
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={isChecking || !password}
            className="w-full py-3 bg-blue-600 text-white rounded-full font-bold hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
          >
            {isChecking ? '확인 중...' : '입장'}
          </button>
        </form>
      </div>
    </main>
  );
}

// ─── Main Wrapper ─────────────────────────────────────────────────────────────

export default function AppContent({
  token,
  handleAuth,
}: {
  token: string | null;
  handleAuth: (t: string) => void;
}) {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    setTheme(loadTheme());
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
  }, [theme]);

  const toggleTheme = (): void => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  if (token === null) return <PasswordGate onAuth={handleAuth} />;
  return <TranslatorApp token={token} theme={theme} onToggleTheme={toggleTheme} />;
}
