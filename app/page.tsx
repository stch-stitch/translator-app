'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Use UNPKG CDN for worker (matching the version in package.json)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.6.205/build/pdf.worker.min.mjs`;

type SegmentStatus = 'pending' | 'translating' | 'done' | 'error';

interface ParagraphSegment {
  id: number;
  english: string;
  korean: string | null;
  status: SegmentStatus;
}

interface HistoryEntry {
  id: number;
  segments: ParagraphSegment[];
  translatedAt: string;
}

const TOKEN_KEY = 'app_token';
const STORAGE_KEY = 'translator-history';
const INSTRUCTIONS_KEY = 'translator-instructions';
const DEFAULT_INSTRUCTIONS =
  '단 하나의 문장도 빠짐 없이 번역을 진행해줘. 너의 다른 상식을 섞지 말고 번역 의뢰한 문장을 번역하는데만 집중해.';

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e) => e && typeof e.id === 'number' && Array.isArray(e.segments) && typeof e.translatedAt === 'string'
    );
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch {}
}

function loadInstructions(): string {
  try { return localStorage.getItem(INSTRUCTIONS_KEY) ?? DEFAULT_INSTRUCTIONS; } catch { return DEFAULT_INSTRUCTIONS; }
}

function saveInstructions(value: string): void {
  try { localStorage.setItem(INSTRUCTIONS_KEY, value); } catch {}
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function splitIntoParagraphs(text: string): string[] {
  return text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
}

// ─── Password Gate ────────────────────────────────────────────────────────────

function PasswordGate({ onAuth }: { onAuth: (token: string) => void }) {
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
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm p-8 bg-white border rounded-xl shadow-sm space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-blue-600">Translator for my wife</h1>
          <p className="text-sm text-gray-400 mt-1">by Hb</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호를 입력하세요"
            className="w-full px-4 py-3 border rounded-lg text-sm text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
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

// ─── Translator App ───────────────────────────────────────────────────────────

function TranslatorApp({ token }: { token: string }) {
  const [rawInput, setRawInput] = useState('');
  const [instructions, setInstructions] = useState('');
  const [segments, setSegments] = useState<ParagraphSegment[]>([]);
  const [isTranslating, setIsTranslating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // PDF related states
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(1);
  const [isExtracting, setIsExtracting] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
      setPdfError('');
      try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        setTotalPages(pdf.numPages);
        setEndPage(pdf.numPages);
        setStartPage(1);
      } catch (err: any) {
        setPdfError('Failed to load PDF: ' + err.message);
      }
    } else if (file) {
      setPdfError('Please upload a valid PDF file.');
    }
  };

  const handleExtractText = async () => {
    if (!pdfFile) return;

    setIsExtracting(true);
    setPdfError('');
    let extractedText = '';

    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;

      const sPage = Math.max(1, startPage);
      const ePage = Math.min(pdf.numPages, endPage);

      for (let i = sPage; i <= ePage; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        extractedText += `--- Page ${i} ---\n` + pageText + '\n\n';
      }

      setRawInput(extractedText.trim());
    } catch (err: any) {
      setPdfError('Failed to extract text: ' + err.message);
    } finally {
      setIsExtracting(false);
    }
  };

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const segmentsRef = useRef<ParagraphSegment[]>([]);
  const instructionsRef = useRef('');
  const tokenRef = useRef(token);
  const nextSegId = useRef(0);
  const nextHistId = useRef(0);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    const stored = loadHistory();
    setHistory(stored);
    if (stored.length > 0) {
      nextHistId.current = Math.max(...stored.map((e) => e.id)) + 1;
    }
    const savedInstructions = loadInstructions();
    setInstructions(savedInstructions);
    instructionsRef.current = savedInstructions;
  }, []);

  useEffect(() => {
    if (isTranslating) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isTranslating]);

  const patchSegments = useCallback(
    (updater: (prev: ParagraphSegment[]) => ParagraphSegment[]) => {
      setSegments((prev) => {
        const next = updater(prev);
        segmentsRef.current = next;
        return next;
      });
    },
    []
  );

  const translateOne = async (
    text: string,
    onChunk: (partial: string) => void,
    signal: AbortSignal
  ): Promise<string> => {
    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRef.current}`,
      },
      body: JSON.stringify({ text, instructions: instructionsRef.current.trim() }),
      signal,
    });

    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => ({}));
      throw new Error(typeof data.error === 'string' ? data.error : 'Translation failed');
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
  };

  const runTranslation = useCallback(async (): Promise<void> => {
    const controller = new AbortController();
    abortRef.current = controller;
    setIsTranslating(true);

    const snapshot = segmentsRef.current;

    for (const seg of snapshot) {
      if (seg.status === 'done') continue;
      if (!segmentsRef.current.find((s) => s.id === seg.id)) continue;

      patchSegments((prev) =>
        prev.map((s) => (s.id === seg.id ? { ...s, status: 'translating', korean: null } : s))
      );

      try {
        const korean = await translateOne(
          seg.english,
          (partial) => {
            patchSegments((prev) =>
              prev.map((s) => (s.id === seg.id ? { ...s, korean: partial } : s))
            );
          },
          controller.signal
        );
        patchSegments((prev) =>
          prev.map((s) => (s.id === seg.id ? { ...s, korean, status: 'done' } : s))
        );
      } catch (err) {
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        patchSegments((prev) =>
          prev.map((s) => (s.id === seg.id ? { ...s, korean: null, status: isAbort ? 'pending' : 'error' } : s))
        );
        if (isAbort) break;
      }
    }

    setIsTranslating(false);

    const final = segmentsRef.current;
    const allSettled = final.length > 0 && final.every((s) => s.status === 'done' || s.status === 'error');
    if (allSettled) {
      setRawInput('');
      const newEntry: HistoryEntry = {
        id: nextHistId.current++,
        segments: final,
        translatedAt: new Date().toISOString(),
      };
      setHistory((prev) => {
        const next = [newEntry, ...prev];
        saveHistory(next);
        return next;
      });
    }
  }, [patchSegments]);

  const handleTranslate = async (): Promise<void> => {
    const paragraphs = splitIntoParagraphs(rawInput);
    if (!paragraphs.length) return;
    const initial: ParagraphSegment[] = paragraphs.map((p) => ({
      id: nextSegId.current++,
      english: p,
      korean: null,
      status: 'pending',
    }));
    segmentsRef.current = initial;
    setSegments(initial);
    await runTranslation();
  };

  const handleStop = (): void => { abortRef.current?.abort(); };

  const handleResume = async (): Promise<void> => {
    patchSegments((prev) =>
      prev.map((s) => (s.status === 'error' ? { ...s, status: 'pending' } : s))
    );
    await runTranslation();
  };

  const handleDeleteSegment = (id: number): void => {
    patchSegments((prev) => prev.filter((s) => s.id !== id));
  };

  const handleDeleteHistory = (id: number): void => {
    setHistory((prev) => {
      const next = prev.filter((e) => e.id !== id);
      saveHistory(next);
      return next;
    });
  };

  const doneCount = segments.filter((s) => s.status === 'done' || s.status === 'error').length;
  const hasPending = segments.some((s) => s.status === 'pending' || s.status === 'error');

  return (
    <main className="min-h-screen p-8 bg-gray-50 text-gray-900">
      <div className="max-w-4xl mx-auto space-y-6">
        <header>
          <h1 className="text-3xl font-bold text-blue-600">Translator for my wife</h1>
          <p className="text-gray-500">by Hb</p>
        </header>

        <div className="flex flex-col space-y-2">
          <label className="font-semibold">Translation Instructions</label>
          <textarea
            className="w-full h-14 py-3 px-4 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none bg-blue-50 text-sm leading-tight"
            value={instructions}
            onChange={(e) => {
              setInstructions(e.target.value);
              instructionsRef.current = e.target.value;
              saveInstructions(e.target.value);
            }}
            placeholder={DEFAULT_INSTRUCTIONS}
          />
        </div>

        {/* PDF Upload Section */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className="bg-blue-100 text-blue-600 px-2 py-1 rounded text-sm">PDF</span>
              Document Translation
            </h2>
          </div>
          
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px] space-y-2">
              <label className="text-sm font-medium text-gray-700">Select PDF File</label>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="application/pdf"
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
              />
            </div>

            {pdfFile && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Range (Total: {totalPages})</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={startPage}
                      onChange={(e) => setStartPage(Number(e.target.value))}
                      className="w-20 p-2 border rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="Start"
                    />
                    <span className="text-gray-400">~</span>
                    <input
                      type="number"
                      min={startPage}
                      max={totalPages}
                      value={endPage}
                      onChange={(e) => setEndPage(Number(e.target.value))}
                      className="w-20 p-2 border rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="End"
                    />
                  </div>
                </div>

                <button
                  onClick={handleExtractText}
                  disabled={isExtracting}
                  className="px-6 py-2 bg-blue-100 text-blue-700 rounded-lg font-semibold hover:bg-blue-200 disabled:opacity-50 transition-colors"
                >
                  {isExtracting ? 'Extracting...' : 'Extract Text'}
                </button>
              </>
            )}
          </div>
          {pdfError && <p className="text-sm text-red-500">{pdfError}</p>}
        </section>

        <div className="flex flex-col space-y-2">
          <label className="font-semibold">English Text</label>
          <textarea
            className="w-full h-48 p-4 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder={"번역할 영어 텍스트를 붙여넣으세요.\n빈 줄로 구분된 문단을 하나씩 순서대로 번역합니다."}
            disabled={isTranslating}
          />
        </div>

        <div className="flex justify-center gap-3">
          <button
            onClick={handleTranslate}
            disabled={isTranslating || !rawInput.trim()}
            className="px-8 py-3 bg-blue-600 text-white rounded-full font-bold hover:bg-blue-700 disabled:bg-gray-400 transition-colors min-w-48"
          >
            {isTranslating ? `${doneCount} / ${segments.length} · ${elapsed}s` : 'Translate'}
          </button>
          {isTranslating && (
            <button onClick={handleStop} className="px-6 py-3 bg-red-500 text-white rounded-full font-bold hover:bg-red-600 transition-colors">
              Stop
            </button>
          )}
          {!isTranslating && hasPending && (
            <>
              <button onClick={handleResume} className="px-6 py-3 bg-green-600 text-white rounded-full font-bold hover:bg-green-700 transition-colors">
                Resume
              </button>
              <button
                onClick={() => { segmentsRef.current = []; setSegments([]); }}
                className="px-6 py-3 bg-gray-400 text-white rounded-full font-bold hover:bg-gray-500 transition-colors"
              >
                Cancel
              </button>
            </>
          )}
        </div>

        {segments.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-700 border-b pb-2">
              {isTranslating
                ? `Translating… (${doneCount} / ${segments.length})`
                : hasPending
                  ? `Paused — ${doneCount} / ${segments.length} done`
                  : `Complete — ${segments.length} paragraph${segments.length > 1 ? 's' : ''}`}
            </h2>
            {segments.map((seg) => (
              <div
                key={seg.id}
                className={`relative grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg transition-colors ${
                  seg.status === 'translating' ? 'border-blue-300 bg-blue-50' : 'bg-white'
                }`}
              >
                {seg.status !== 'translating' && (
                  <button
                    onClick={() => handleDeleteSegment(seg.id)}
                    className="absolute bottom-3 right-3 text-red-400 hover:text-red-600 transition-colors flex items-center gap-1 text-xs font-medium"
                    aria-label="Delete paragraph"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                    Delete
                  </button>
                )}
                <div className="pr-6">
                  <p className="text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">English</p>
                  <p className="text-sm whitespace-pre-wrap">{seg.english}</p>
                </div>
                <div className="relative">
                  <p className="text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">Korean</p>
                  {seg.status === 'done' && seg.korean && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(seg.korean || '');
                        // Optional: trigger some visual feedback here
                      }}
                      className="absolute -top-1 right-0 text-gray-300 hover:text-blue-500 transition-colors p-1"
                      title="Copy to clipboard"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                  )}
                  {seg.status === 'pending' && <p className="text-sm text-gray-300">—</p>}
                  {seg.status === 'translating' && <p className="text-sm text-gray-400 animate-pulse">Translating...</p>}
                  {seg.status === 'done' && <p className="text-sm whitespace-pre-wrap">{seg.korean}</p>}
                  {seg.status === 'error' && <p className="text-sm text-red-400">Translation failed — will retry on Resume</p>}
                </div>
              </div>
            ))}
          </section>
        )}

        {history.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-700 border-b pb-2">Translation History</h2>
            {history.map((entry) => (
              <div key={entry.id} className="bg-white border rounded-lg shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
                  <span className="text-xs text-gray-500">
                    {formatDate(entry.translatedAt)} · {entry.segments.length} paragraph{entry.segments.length > 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => handleDeleteHistory(entry.id)}
                    className="text-red-400 hover:text-red-600 transition-colors flex items-center gap-1 text-xs font-medium"
                    aria-label="Delete entry"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                    Delete
                  </button>
                </div>
                <div className="divide-y">
                  {entry.segments.map((seg) => (
                    <div key={seg.id} className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                      <div>
                        <p className="text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">English</p>
                        <p className="text-sm whitespace-pre-wrap">{seg.english}</p>
                      </div>
                      <div className="relative">
                        <p className="text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">Korean</p>
                        {seg.korean && (
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(seg.korean || '');
                            }}
                            className="absolute -top-1 right-0 text-gray-300 hover:text-blue-500 transition-colors p-1"
                            title="Copy to clipboard"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                          </button>
                        )}
                        <p className="text-sm whitespace-pre-wrap">{seg.korean ?? '—'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

// ─── Page (Auth Wrapper) ──────────────────────────────────────────────────────

export default function Page() {
  // 'loading' → haven't checked sessionStorage yet (prevents flash of password screen)
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
  if (token === null) return <PasswordGate onAuth={handleAuth} />;
  return <TranslatorApp token={token} />;
}
