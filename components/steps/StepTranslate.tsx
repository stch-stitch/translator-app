// components/steps/StepTranslate.tsx
'use client';

import { SegmentCard } from '@/components/ui/SegmentCard';
import { ProgressBar } from '@/components/ui/ProgressBar';
import type { ParagraphSegment } from '@/types/translator';

interface StepTranslateProps {
  segments: ParagraphSegment[];
  isTranslating: boolean;
  elapsed: number;
  onStop: () => void;
  onResume: () => Promise<void>;
  onDelete: (id: number) => void;
  onRetry: (id: number) => Promise<void>;
  onCancel: () => void;
}

export function StepTranslate({
  segments,
  isTranslating,
  elapsed,
  onStop,
  onResume,
  onDelete,
  onRetry,
  onCancel,
}: StepTranslateProps) {
  const doneCount = segments.filter(s => s.status === 'done' || s.status === 'error').length;
  const hasPending = segments.some(s => s.status === 'pending' || s.status === 'error');

  if (segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-600">
        <p className="text-4xl mb-3">✏️</p>
        <p className="text-sm">① PDF 정리 탭에서 번역을 시작하세요.</p>
      </div>
    );
  }

  const statusLabel = isTranslating
    ? `번역 중… (${doneCount} / ${segments.length})`
    : hasPending
      ? `일시 중지 — ${doneCount} / ${segments.length} 완료`
      : `완료 — ${segments.length}단락`;

  return (
    <div className="space-y-4">
      {/* 상태 + 진행 바 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400">{statusLabel}</h2>
          <div className="flex gap-2">
            {isTranslating && (
              <button
                onClick={onStop}
                className="px-4 py-1.5 text-xs font-bold rounded-full bg-red-500 hover:bg-red-600 text-white transition-colors"
              >
                중지
              </button>
            )}
            {!isTranslating && hasPending && (
              <>
                <button
                  onClick={() => void onResume()}
                  className="px-4 py-1.5 text-xs font-bold rounded-full bg-green-600 hover:bg-green-700 text-white transition-colors"
                >
                  재개
                </button>
                <button
                  onClick={onCancel}
                  className="px-4 py-1.5 text-xs font-bold rounded-full
                    bg-slate-200 hover:bg-slate-300 text-slate-600
                    dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-300 transition-colors"
                >
                  취소
                </button>
              </>
            )}
          </div>
        </div>
        {isTranslating && (
          <ProgressBar done={doneCount} total={segments.length} elapsed={elapsed} />
        )}
      </div>

      {/* 세그먼트 카드 목록 */}
      <div className="space-y-3">
        {segments.map(seg => (
          <SegmentCard
            key={seg.id}
            segment={seg}
            isTranslating={isTranslating}
            onDelete={onDelete}
            onRetry={id => void onRetry(id)}
          />
        ))}
      </div>
    </div>
  );
}
