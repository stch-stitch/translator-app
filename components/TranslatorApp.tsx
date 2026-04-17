// components/TranslatorApp.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { DarkModeToggle } from '@/components/ui/DarkModeToggle';
import { GlossarySidebar } from '@/components/sidebar/GlossarySidebar';
import { StepPdfClean } from '@/components/steps/StepPdfClean';
import { StepTranslate } from '@/components/steps/StepTranslate';
import { StepExport } from '@/components/steps/StepExport';
import { loadGlossary, saveGlossary, glossaryToInstructions } from '@/lib/glossary';
import type { ParagraphSegment, HistoryEntry, GlossaryEntry, Theme } from '@/types/translator';

const HISTORY_KEY = 'translator-history';
const INSTRUCTIONS_KEY = 'translator-instructions';
const DEFAULT_INSTRUCTIONS =
  '하나의 문장도 빠짐 없이 번역을 진행해. 다른 상식 섞지 말고 번역 의뢰한 문장을 번역하는데만 집중해. 제목으로 판단되는 문장 다음에는 줄바꿈을 해.';

const STEP_LABELS: Record<1 | 2 | 3, string> = {
  1: '① PDF 정리',
  2: '② 번역',
  3: '③ 내보내기',
};

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e) => e && typeof e.id === 'number' && Array.isArray(e.segments) && typeof e.translatedAt === 'string'
    );
  } catch { return []; }
}

function saveHistory(entries: HistoryEntry[]): void {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(entries)); } catch {}
}

function loadInstructions(): string {
  try { return localStorage.getItem(INSTRUCTIONS_KEY) ?? DEFAULT_INSTRUCTIONS; } catch { return DEFAULT_INSTRUCTIONS; }
}

function saveInstructions(value: string): void {
  try { localStorage.setItem(INSTRUCTIONS_KEY, value); } catch {}
}

function splitIntoParagraphs(text: string): string[] {
  return text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
}

interface TranslatorAppProps {
  token: string;
  theme: Theme;
  onToggleTheme: () => void;
}

export function TranslatorApp({ token, theme, onToggleTheme }: TranslatorAppProps) {
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  const [segments, setSegments] = useState<ParagraphSegment[]>([]);
  const [isTranslating, setIsTranslating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS);
  const [isThink, setIsThink] = useState(false);
  const [ollamaReady, setOllamaReady] = useState<boolean | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const segmentsRef = useRef<ParagraphSegment[]>([]);
  const instructionsRef = useRef(DEFAULT_INSTRUCTIONS);
  const glossaryRef = useRef<GlossaryEntry[]>([]);
  const tokenRef = useRef(token);
  const isThinkRef = useRef(false);
  const nextSegId = useRef(0);
  const nextHistId = useRef(0);

  // sync refs
  useEffect(() => { tokenRef.current = token; }, [token]);
  useEffect(() => { isThinkRef.current = isThink; }, [isThink]);

  useEffect(() => {
    const checkOllama = async (): Promise<void> => {
      try {
        const res = await fetch('/api/health');
        const data = await res.json() as { ok: boolean };
        setOllamaReady(data.ok);
      } catch {
        setOllamaReady(false);
      }
    };
    void checkOllama();
    const id = setInterval(() => { void checkOllama(); }, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const hist = loadHistory();
    setHistory(hist);
    if (hist.length > 0) nextHistId.current = Math.max(...hist.map(e => e.id)) + 1;
    const inst = loadInstructions();
    setInstructions(inst);
    instructionsRef.current = inst;
    const gl = loadGlossary();
    setGlossary(gl);
    glossaryRef.current = gl;
  }, []);

  useEffect(() => {
    if (isTranslating) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isTranslating]);

  const patchSegments = useCallback(
    (updater: (prev: ParagraphSegment[]) => ParagraphSegment[]) => {
      setSegments(prev => {
        const next = updater(prev);
        segmentsRef.current = next;
        return next;
      });
    },
    []
  );

  /** 단락 하나를 번역하고 스트리밍 콜백 호출 */
  const translateOne = useCallback(async (
    text: string,
    onChunk: (partial: string) => void,
    signal: AbortSignal
  ): Promise<string> => {
    const combinedInstructions =
      instructionsRef.current.trim() + glossaryToInstructions(glossaryRef.current);

    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRef.current}`,
      },
      body: JSON.stringify({
        text,
        instructions: combinedInstructions,
        think: isThinkRef.current,
      }),
      signal,
    });

    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => ({})) as { error?: string; details?: string };
      throw new Error(data.error ? `${data.error}${data.details ? `: ${data.details}` : ''}` : 'Translation failed');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      full += decoder.decode(value, { stream: true });
      onChunk(full);
    }
    return full;
  }, []);

  /** 여러 세그먼트를 순서대로 번역 */
  const runTranslation = useCallback(async (controller: AbortController): Promise<void> => {
    const snapshot = segmentsRef.current;
    for (const seg of snapshot) {
      if (seg.status === 'done') continue;
      if (!segmentsRef.current.find(s => s.id === seg.id)) continue;

      patchSegments(prev =>
        prev.map(s => s.id === seg.id ? { ...s, status: 'translating', korean: null } : s)
      );

      try {
        const korean = await translateOne(
          seg.english,
          partial => patchSegments(prev =>
            prev.map(s => s.id === seg.id ? { ...s, korean: partial } : s)
          ),
          controller.signal
        );
        patchSegments(prev =>
          prev.map(s => s.id === seg.id ? { ...s, korean, status: 'done', errorMsg: undefined } : s)
        );
      } catch (err: unknown) {
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        patchSegments(prev =>
          prev.map(s => s.id === seg.id ? {
            ...s, korean: null,
            status: isAbort ? 'pending' : 'error',
            errorMsg: isAbort ? undefined : err instanceof Error ? err.message : 'Unknown error',
          } : s)
        );
        if (isAbort) break;
      }
    }
  }, [patchSegments, translateOne]);

  /** PDF 정리 완료 후 번역 시작 */
  const handleStartTranslation = useCallback(async (text: string): Promise<void> => {
    const paragraphs = splitIntoParagraphs(text);
    if (!paragraphs.length) return;
    const initial: ParagraphSegment[] = paragraphs.map(p => ({
      id: nextSegId.current++,
      english: p,
      korean: null,
      status: 'pending',
    }));
    segmentsRef.current = initial;
    setSegments(initial);
    setActiveStep(2);

    const controller = new AbortController();
    abortRef.current = controller;
    setIsTranslating(true);
    await runTranslation(controller);
    setIsTranslating(false);

    const final = segmentsRef.current;
    const allSettled = final.length > 0 && final.every(s => s.status === 'done' || s.status === 'error');
    if (allSettled) {
      const newEntry: HistoryEntry = {
        id: nextHistId.current++,
        segments: final,
        translatedAt: new Date().toISOString(),
      };
      setHistory(prev => {
        const next = [newEntry, ...prev];
        saveHistory(next);
        return next;
      });
    }
  }, [runTranslation]);

  const handleStop = (): void => { abortRef.current?.abort(); };

  const handleResume = useCallback(async (): Promise<void> => {
    patchSegments(prev =>
      prev.map(s => s.status === 'error' ? { ...s, status: 'pending' } : s)
    );
    const controller = new AbortController();
    abortRef.current = controller;
    setIsTranslating(true);
    await runTranslation(controller);
    setIsTranslating(false);
  }, [patchSegments, runTranslation]);

  /** 특정 세그먼트 하나만 재번역 */
  const handleRetrySegment = useCallback(async (id: number): Promise<void> => {
    if (isTranslating) return;
    const seg = segmentsRef.current.find(s => s.id === id);
    if (!seg) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setIsTranslating(true);

    patchSegments(prev =>
      prev.map(s => s.id === id ? { ...s, status: 'translating', korean: null } : s)
    );

    try {
      const korean = await translateOne(
        seg.english,
        partial => patchSegments(prev =>
          prev.map(s => s.id === id ? { ...s, korean: partial } : s)
        ),
        controller.signal
      );
      patchSegments(prev =>
        prev.map(s => s.id === id ? { ...s, korean, status: 'done', errorMsg: undefined } : s)
      );
    } catch (err: unknown) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      patchSegments(prev =>
        prev.map(s => s.id === id ? {
          ...s, korean: null,
          status: isAbort ? 'pending' : 'error',
          errorMsg: isAbort ? undefined : err instanceof Error ? err.message : 'Unknown error',
        } : s)
      );
    }

    setIsTranslating(false);
  }, [isTranslating, patchSegments, translateOne]);

  const handleDeleteSegment = (id: number): void => {
    patchSegments(prev => prev.filter(s => s.id !== id));
  };

  const handleDeleteHistory = (id: number): void => {
    setHistory(prev => {
      const next = prev.filter(e => e.id !== id);
      saveHistory(next);
      return next;
    });
  };

  const handleCancel = (): void => {
    segmentsRef.current = [];
    setSegments([]);
  };

  const handleGlossaryChange = (updated: GlossaryEntry[]): void => {
    setGlossary(updated);
    glossaryRef.current = updated;
    saveGlossary(updated);
  };

  const handleInstructionsChange = (value: string): void => {
    setInstructions(value);
    instructionsRef.current = value;
    saveInstructions(value);
  };

  const hasAnyDone = segments.some(s => s.status === 'done');

  return (
    <main className="min-h-screen bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-colors">
      <div className="max-w-5xl mx-auto">
        {/* 헤더 */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex items-baseline gap-2">
              <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400">Translator for</h1>
              <span className="text-xs text-slate-400">my Yf by Hb</span>
            </div>
            <span
              className={`w-2 h-2 rounded-full transition-colors ${
                ollamaReady === null
                  ? 'bg-slate-300 dark:bg-slate-600 animate-pulse'
                  : ollamaReady
                  ? 'bg-green-500'
                  : 'bg-red-500'
              }`}
              title={
                ollamaReady === null ? 'Ollama 확인 중...' :
                ollamaReady ? 'Ollama 연결됨' : 'Ollama 오프라인'
              }
            />
          </div>
          <DarkModeToggle theme={theme} onToggle={onToggleTheme} />
        </header>

        {/* 스텝 탭 */}
        <nav className="flex px-6 border-b border-slate-200 dark:border-slate-800">
          {([1, 2, 3] as const).map(step => {
            const isActive = activeStep === step;
            const isDisabled = step === 3 && !hasAnyDone;
            return (
              <button
                key={step}
                onClick={() => !isDisabled && setActiveStep(step)}
                disabled={isDisabled}
                title={isDisabled ? '번역을 먼저 진행하세요' : undefined}
                className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                  isActive
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : isDisabled
                      ? 'border-transparent text-slate-300 dark:text-slate-700 cursor-not-allowed'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {STEP_LABELS[step]}
              </button>
            );
          })}
        </nav>

        {/* 메인 영역 + 사이드바 */}
        <div className="flex">
          <div className="flex-1 min-w-0 p-6">
            {activeStep === 1 && (
              <StepPdfClean
                token={token}
                isTranslating={isTranslating}
                isThink={isThink}
                instructions={instructions}
                onToggleThink={() => setIsThink(v => !v)}
                onInstructionsChange={handleInstructionsChange}
                onStartTranslation={handleStartTranslation}
              />
            )}
            {activeStep === 2 && (
              <StepTranslate
                segments={segments}
                isTranslating={isTranslating}
                elapsed={elapsed}
                onStop={handleStop}
                onResume={handleResume}
                onDelete={handleDeleteSegment}
                onRetry={handleRetrySegment}
                onCancel={handleCancel}
              />
            )}
            {activeStep === 3 && (
              <StepExport
                segments={segments}
                history={history}
                onDeleteHistory={handleDeleteHistory}
              />
            )}
          </div>

          {/* 우측 사이드바 */}
          <aside className="w-56 shrink-0 p-4 border-l border-slate-200 dark:border-slate-800 space-y-5">
            <GlossarySidebar glossary={glossary} onChange={handleGlossaryChange} />
          </aside>
        </div>
      </div>
    </main>
  );
}
