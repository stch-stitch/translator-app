'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';

const TOKEN_KEY = 'app_token';

// Dynamically import AppContent with SSR disabled to avoid pdfjs-dist related Node.js errors
const AppContent = dynamic(() => import('../components/AppContent'), { 
  ssr: false,
  loading: () => null // Prevent flash during load
});

export default function Page() {
  // 'loading' → haven't checked sessionStorage yet
  const [token, setToken] = useState<string | 'loading' | null>('loading');

  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    setToken(saved ?? null);
  }, []);

  const handleAuth = useCallback((t: string) => {
    sessionStorage.setItem(TOKEN_KEY, t);
    setToken(t);
  }, []);

  if (token === 'loading') return null;
  
  return <AppContent token={token} handleAuth={handleAuth} />;
}
