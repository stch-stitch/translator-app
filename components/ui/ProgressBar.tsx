// components/ui/ProgressBar.tsx

interface ProgressBarProps {
  done: number;
  total: number;
  elapsed: number;
}

export function ProgressBar({ done, total, elapsed }: ProgressBarProps) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-slate-400">
        <span>{done} / {total} 단락</span>
        <span>{elapsed}s</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
