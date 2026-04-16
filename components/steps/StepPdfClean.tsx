// components/steps/StepPdfClean.tsx
'use client';

import { useState, useRef, useCallback, useLayoutEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { detectNoise, applyNoiseFilter, DEFAULT_NOISE_CONFIG } from '@/lib/noiseFilter';
import type { NoiseFilterConfig } from '@/types/translator';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.6.205/build/pdf.worker.min.mjs`;

interface StepPdfCleanProps {
  isTranslating: boolean;
  isThink: boolean;
  instructions: string;
  onToggleThink: () => void;
  onInstructionsChange: (value: string) => void;
  onStartTranslation: (text: string) => void;
}

export function StepPdfClean({ isTranslating, isThink, instructions, onToggleThink, onInstructionsChange, onStartTranslation }: StepPdfCleanProps) {
  const [rawText, setRawText] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [startPage, setStartPage] = useState(1);
  const [endPage, setEndPage] = useState(1);
  const [includeAnnotations, setIncludeAnnotations] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [noiseConfig, setNoiseConfig] = useState<NoiseFilterConfig>(DEFAULT_NOISE_CONFIG);
  const [detectedNoise, setDetectedNoise] = useState<{ pageNumbers: number; runningHeaders: number; figureCaptions: number } | null>(null);
  const instructionsRef = useRef<HTMLTextAreaElement>(null);
  const INSTRUCTIONS_MIN_PX = 55;

  useLayoutEffect(() => {
    const el = instructionsRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, INSTRUCTIONS_MIN_PX)}px`;
  }, [instructions]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredText = rawText ? applyNoiseFilter(rawText, noiseConfig) : '';

  const loadPdf = useCallback(async (file: File): Promise<void> => {
    setPdfFile(file);
    setPdfError('');
    setDetectedNoise(null);
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      setTotalPages(pdf.numPages);
      setEndPage(pdf.numPages);
      setStartPage(1);
    } catch (err: unknown) {
      setPdfError('PDF 로드 실패: ' + (err instanceof Error ? err.message : String(err)));
    }
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { setPdfError('PDF 파일만 업로드 가능합니다.'); return; }
    await loadPdf(file);
  };

  const handleDrop = useCallback(async (e: React.DragEvent): Promise<void> => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { setPdfError('PDF 파일만 드롭 가능합니다.'); return; }
    await loadPdf(file);
  }, [loadPdf]);

  const handleExtract = async (): Promise<void> => {
    if (!pdfFile) return;
    setIsExtracting(true);
    setPdfError('');
    let extracted = '';
    try {
      const buf = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      const sPage = Math.max(1, startPage);
      const ePage = Math.min(pdf.numPages, endPage);
      for (let i = sPage; i <= ePage; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = (textContent.items as Array<{ str: string }>).map(item => item.str).join(' ');
        extracted += pageText.trim() + '\n\n';
        if (includeAnnotations) {
          const annotations = await page.getAnnotations();
          const annos = annotations
            .filter((a: { subtype: string }) => a.subtype === 'Text' || a.subtype === 'FreeText')
            .map((a: { contents?: string; title?: string }) => (a.title ? `[${a.title}]: ` : '') + (a.contents ?? ''))
            .filter((s: string) => s.trim().length > 0);
          if (annos.length > 0) extracted += annos.join('\n') + '\n\n';
        }
      }
      const text = extracted.trim();
      setRawText(text);
      setDetectedNoise(detectNoise(text));
    } catch (err: unknown) {
      setPdfError('텍스트 추출 실패: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsExtracting(false);
    }
  };

  const handleStart = (): void => {
    const text = rawText ? filteredText : '';
    if (!text.trim()) return;
    onStartTranslation(text);
  };

  const textToTranslate = rawText ? filteredText : '';

  return (
    <div className="space-y-5">
      {/* 드래그앤드롭 존 */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30'
            : 'border-slate-200 bg-slate-50 hover:border-blue-300 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-blue-600'
        }`}
      >
        <div className="text-3xl mb-2">📄</div>
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
          {pdfFile ? pdfFile.name : 'PDF를 여기 끌어다 놓기'}
        </p>
        <p className="text-xs text-slate-400 mt-1">또는 클릭해서 파일 선택</p>
        <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" />
      </div>

      {/* 페이지 범위 + 추출 */}
      {pdfFile && (
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              페이지 범위 (전체 {totalPages}p)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number" min={1} max={totalPages} value={startPage}
                onChange={e => setStartPage(Number(e.target.value))}
                className="w-20 px-2 py-1.5 text-sm border rounded outline-none
                  border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200
                  focus:border-blue-400 dark:focus:border-blue-500"
              />
              <span className="text-slate-400">~</span>
              <input
                type="number" min={startPage} max={totalPages} value={endPage}
                onChange={e => setEndPage(Number(e.target.value))}
                className="w-20 px-2 py-1.5 text-sm border rounded outline-none
                  border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200
                  focus:border-blue-400 dark:focus:border-blue-500"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 cursor-pointer">
            <input
              type="checkbox" checked={includeAnnotations}
              onChange={e => setIncludeAnnotations(e.target.checked)}
              className="rounded"
            />
            주석 포함
          </label>
          <button
            onClick={handleExtract}
            disabled={isExtracting}
            className="px-5 py-2 text-sm font-semibold rounded-lg transition-colors
              bg-blue-100 text-blue-700 hover:bg-blue-200
              dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900
              disabled:opacity-50"
          >
            {isExtracting ? '추출 중…' : '텍스트 추출'}
          </button>
        </div>
      )}

      {/* 노이즈 필터 */}
      {detectedNoise && (
        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            노이즈 필터
          </p>
          <div className="flex flex-wrap gap-4">
            {([
              { key: 'pageNumbers' as const, label: `페이지 번호 (${detectedNoise.pageNumbers}개)` },
              { key: 'runningHeaders' as const, label: `반복 헤더 (${detectedNoise.runningHeaders}개)` },
              { key: 'figureCaptions' as const, label: `Figure/Table 캡션 (${detectedNoise.figureCaptions}개)` },
            ]).map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={noiseConfig[key]}
                  onChange={e => setNoiseConfig(prev => ({ ...prev, [key]: e.target.checked }))}
                  className="rounded"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* 텍스트 입력 (수동 또는 추출 결과) */}
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          번역할 텍스트
          {rawText && detectedNoise && (
            <span className="ml-2 text-xs font-normal text-slate-400">
              (필터 적용 후 미리보기)
            </span>
          )}
        </label>
        <textarea
          value={rawText ? filteredText : ''}
          onChange={e => { setRawText(e.target.value); setDetectedNoise(null); }}
          placeholder="번역할 영어 텍스트를 붙여넣거나 위에서 PDF를 추출하세요.&#10;빈 줄로 구분된 문단을 하나씩 순서대로 번역합니다."
          disabled={isTranslating}
          className="w-full h-52 p-4 text-sm border rounded-lg resize-none outline-none
            border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:border-blue-400
            dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder-slate-600 dark:focus:border-blue-500"
        />
      </div>

      {pdfError && <p className="text-sm text-red-500">{pdfError}</p>}

      {/* 번역 액션 바 */}
      <div className="flex items-center gap-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 overflow-hidden">
        <textarea
          ref={instructionsRef}
          value={instructions}
          onChange={e => onInstructionsChange(e.target.value)}
          placeholder="번역 규칙을 입력하세요…"
          rows={1}
          className="flex-1 min-w-0 min-h-[55px] text-xs px-4 py-3 resize-none outline-none overflow-hidden
            bg-transparent text-slate-700 placeholder-slate-400
            dark:text-slate-300 dark:placeholder-slate-500"
        />
        <div className="flex items-center gap-2 px-3 shrink-0">
          <button
            onClick={onToggleThink}
            disabled={isTranslating}
            className={`px-4 py-3 rounded-lg text-xs font-medium transition-colors ${
              isThink
                ? 'bg-purple-600 text-white ring-2 ring-purple-300/50'
                : 'bg-white text-slate-500 hover:bg-slate-100 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600'
            } disabled:opacity-50`}
            title={isThink ? 'Thinking Mode: ON' : 'Thinking Mode: OFF'}
          >
            🧠 사고력 강화
          </button>
          <button
            onClick={handleStart}
            disabled={isTranslating || !textToTranslate.trim()}
            className="px-6 py-3 rounded-lg font-bold text-xs transition-colors
              bg-blue-600 text-white hover:bg-blue-700
              disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:text-slate-500 disabled:cursor-not-allowed"
          >
            번역 시작 →
          </button>
        </div>
      </div>
    </div>
  );
}
