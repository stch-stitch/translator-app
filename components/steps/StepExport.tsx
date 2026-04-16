// components/steps/StepExport.tsx
'use client';

import { useState } from 'react';
import type { ParagraphSegment, HistoryEntry } from '@/types/translator';

interface StepExportProps {
  segments: ParagraphSegment[];
  history: HistoryEntry[];
  onDeleteHistory: (id: number) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export function StepExport({ segments, history, onDeleteHistory }: StepExportProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const [historyOpen, setHistoryOpen] = useState(false);

  const doneSegments = segments.filter(s => s.status === 'done' && s.korean);
  const koreanText = doneSegments.map(s => s.korean ?? '').join('\n\n');
  const bilingualText = doneSegments
    .map(s => `${s.english}\n\n${s.korean ?? ''}`)
    .join('\n\n---\n\n');

  const handleCopyKorean = async (): Promise<void> => {
    await navigator.clipboard.writeText(koreanText);
    setCopyState('copied');
    setTimeout(() => setCopyState('idle'), 2000);
  };

  const downloadTxt = (content: string, baseName: string): void => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    a.href = url;
    a.download = `${baseName}_${ts}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownload = (): void => {
    downloadTxt(koreanText, 'translated');
  };

  const handleDownloadBilingual = (): void => {
    downloadTxt(bilingualText, 'bilingual');
  };

  if (doneSegments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-600">
        <p className="text-4xl mb-3">📭</p>
        <p className="text-sm">번역된 단락이 없습니다.</p>
        <p className="text-xs mt-1">② 번역 탭에서 번역을 먼저 진행하세요.</p>
      </div>
    );
  }

  /* 헤더·탭·본문 패딩·버튼 행·카드 헤더·하단 여백을 대략 반영한 뷰포트 기준 높이 */
  const previewBodyClass =
    'p-4 overflow-y-auto min-h-[12rem] h-[calc(100vh-17.5rem)]';

  return (
    <div className="space-y-5">
      {/* 내보내기 버튼 */}
      <div className="flex gap-3">
        <button
          onClick={handleCopyKorean}
          className={`flex flex-1 items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
            copyState === 'copied'
              ? 'bg-blue-700 text-white'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {copyState === 'copied' ? (
            '✓ 복사됨!'
          ) : (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 opacity-95"
                aria-hidden
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              한국어 전체 복사
            </>
          )}
        </button>
        <button
          onClick={handleDownload}
          className="flex-1 py-3 rounded-xl font-semibold text-sm transition-colors
            border border-slate-200 text-slate-600 hover:bg-slate-50
            dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          번역본 .txt 다운로드
        </button>
        <button
          onClick={handleDownloadBilingual}
          className="flex-1 py-3 rounded-xl font-semibold text-sm transition-colors
            border border-slate-200 text-slate-500 hover:bg-slate-50
            dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          원문+번역본 .txt 다운로드
        </button>
      </div>

      {/* 미리보기 */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            미리보기 (한국어 · {doneSegments.length}단락)
          </span>
        </div>
        <div className={previewBodyClass}>
          <p className="text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-300 leading-relaxed">
            {koreanText}
          </p>
        </div>
      </div>

      {/* 히스토리 (접었다 펼치기) */}
      {history.length > 0 && (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <button
            onClick={() => setHistoryOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold
              bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-750"
          >
            <span>번역 히스토리 ({history.length}건)</span>
            <span className="text-slate-400">{historyOpen ? '▲' : '▼'}</span>
          </button>
          {historyOpen && (
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {history.map(entry => (
                <div key={entry.id} className="overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-slate-50/50 dark:bg-slate-800/50">
                    <span className="text-xs text-slate-400">
                      {formatDate(entry.translatedAt)} · {entry.segments.length}단락
                    </span>
                    <button
                      onClick={() => onDeleteHistory(entry.id)}
                      className="text-xs text-red-400 hover:text-red-600 transition-colors"
                    >
                      삭제
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {entry.segments.map(seg => (
                      <div key={seg.id} className="grid grid-cols-2 gap-4 px-4 py-3">
                        <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap">{seg.english}</p>
                        <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{seg.korean ?? '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
