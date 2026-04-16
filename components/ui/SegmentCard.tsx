// components/ui/SegmentCard.tsx
'use client';

import type { ParagraphSegment } from '@/types/translator';

interface SegmentCardProps {
  segment: ParagraphSegment;
  isTranslating: boolean;  // 전체 번역 진행 중 여부 — true면 재번역 버튼 비활성화
  onDelete: (id: number) => void;
  onRetry: (id: number) => void;
}

export function SegmentCard({ segment: seg, isTranslating, onDelete, onRetry }: SegmentCardProps) {
  const borderColor =
    seg.status === 'translating' ? 'border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.15)]'
    : seg.status === 'done'      ? 'border-green-700 dark:border-green-800'
    : seg.status === 'error'     ? 'border-red-700 dark:border-red-900'
    : 'border-slate-200 dark:border-slate-700';

  return (
    <div className={`relative grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg border transition-all
      bg-white dark:bg-slate-800 ${borderColor}`}
    >
      {/* 액션 버튼 */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        {seg.status === 'done' && (
          <span className="relative group inline-flex">
            <button
              type="button"
              onClick={() => onRetry(seg.id)}
              disabled={isTranslating}
              aria-label="이 단락만 다시 번역"
              className="text-xs px-2 py-1 rounded transition-colors
                bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700
                dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600 dark:hover:text-slate-200
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ↺
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute right-0 bottom-full z-20 mb-1 whitespace-nowrap rounded px-2 py-1 text-[10px] font-medium
                bg-slate-800 text-white shadow-md opacity-0 transition-opacity duration-150
                group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-slate-950 dark:ring-1 dark:ring-slate-600"
            >
              이 단락만 다시 번역
            </span>
          </span>
        )}
        {seg.status === 'done' && seg.korean && (
          <span className="relative group inline-flex">
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(seg.korean ?? '')}
              aria-label="한국어 번역문 클립보드에 복사"
              className="p-1 transition-colors text-slate-400 hover:text-blue-500 dark:text-slate-500 dark:hover:text-blue-400"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute right-0 bottom-full z-20 mb-1 whitespace-nowrap rounded px-2 py-1 text-[10px] font-medium
                bg-slate-800 text-white shadow-md opacity-0 transition-opacity duration-150
                group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-slate-950 dark:ring-1 dark:ring-slate-600"
            >
              한국어 번역문 복사
            </span>
          </span>
        )}
        {seg.status !== 'translating' && (
          <span className="relative group inline-flex">
            <button
              type="button"
              onClick={() => onDelete(seg.id)}
              aria-label="이 단락 삭제"
              className="p-1 transition-colors text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
              </svg>
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute right-0 bottom-full z-20 mb-1 whitespace-nowrap rounded px-2 py-1 text-[10px] font-medium
                bg-slate-800 text-white shadow-md opacity-0 transition-opacity duration-150
                group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-slate-950 dark:ring-1 dark:ring-slate-600"
            >
              이 단락 목록에서 삭제
            </span>
          </span>
        )}
      </div>

      {/* English */}
      <div className="pr-20">
        <p className="text-xs font-semibold mb-1 uppercase tracking-wide text-slate-400 dark:text-slate-500">English</p>
        <p className="text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-300">{seg.english}</p>
      </div>

      {/* Korean */}
      <div>
        <p className="text-xs font-semibold mb-1 uppercase tracking-wide flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
          Korean
          {seg.status === 'done' && <span className="text-green-500">✓</span>}
          {seg.status === 'translating' && <span className="text-blue-400 text-xs">●</span>}
        </p>
        {seg.status === 'pending' && (
          <p className="text-sm text-slate-300 dark:text-slate-600">대기 중…</p>
        )}
        {seg.status === 'translating' && (
          <p className="text-sm whitespace-pre-wrap text-blue-600 dark:text-blue-300">
            {seg.korean ?? ''}
            <span className="inline-block w-0.5 h-3.5 bg-blue-400 ml-0.5 align-middle animate-cursor-blink" />
          </p>
        )}
        {seg.status === 'done' && (
          <p className="text-sm whitespace-pre-wrap text-slate-900 dark:text-slate-100">{seg.korean}</p>
        )}
        {seg.status === 'error' && (
          <div className="space-y-1">
            <p className="text-sm text-red-500">번역 실패 — ↺ 버튼으로 재시도</p>
            {seg.errorMsg && <p className="text-xs text-red-400">{seg.errorMsg}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
