# Translator App — "Wow" Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학술 논문 PDF 번역 워크플로우에 최적화된 앱으로 리빌드 — PDF 노이즈 필터, 글로벌 용어집, 전체 복사/내보내기, 단락별 재번역, 다크모드.

**Architecture:** 단일 `AppContent.tsx` 모놀리스를 step별 컴포넌트로 분리. 새 파일들을 먼저 만들고 마지막에 `AppContent.tsx`를 슬림화하여 기존 동작이 깨지지 않도록 한다. API route는 변경 없이 유지; 용어집은 클라이언트에서 instructions에 주입.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind CSS v4 (no config file — CSS-first), pdfjs-dist, localStorage

> **중요:** 이 프로젝트에는 테스트 스위트가 없다. 각 태스크의 검증은 `npm run build`(TypeScript 타입 에러 캐치)와 브라우저 수동 확인으로 대체한다.

---

## File Map

| 파일 | 액션 | 역할 |
|---|---|---|
| `types/translator.ts` | 생성 | 공유 TypeScript 인터페이스 |
| `lib/noiseFilter.ts` | 생성 | PDF 노이즈 감지+제거 순수 함수 |
| `lib/glossary.ts` | 생성 | 용어집 localStorage CRUD |
| `app/globals.css` | 수정 | 다크모드 variant + 커서 애니메이션 |
| `components/ui/DarkModeToggle.tsx` | 생성 | 다크/라이트 전환 버튼 |
| `components/ui/ProgressBar.tsx` | 생성 | 번역 진행 바 |
| `components/ui/SegmentCard.tsx` | 생성 | 단락 카드 (재번역 버튼 포함) |
| `components/sidebar/GlossarySidebar.tsx` | 생성 | 용어집 관리 UI |
| `components/steps/StepPdfClean.tsx` | 생성 | PDF 업로드, 추출, 노이즈 필터 |
| `components/steps/StepTranslate.tsx` | 생성 | 번역 진행 뷰 |
| `components/steps/StepExport.tsx` | 생성 | 내보내기 옵션 + 히스토리 |
| `components/TranslatorApp.tsx` | 생성 | 메인 앱: 번역 로직 + 스텝 탭 + 상태 |
| `components/AppContent.tsx` | 수정 | 슬림 wrapper: auth + theme만 |

---

## Task 1: 공유 타입 정의

**Files:**
- Create: `types/translator.ts`

- [ ] **Step 1: 파일 생성**

```typescript
// types/translator.ts

export type SegmentStatus = 'pending' | 'translating' | 'done' | 'error';

export interface ParagraphSegment {
  id: number;
  english: string;
  korean: string | null;
  status: SegmentStatus;
  errorMsg?: string;
}

export interface HistoryEntry {
  id: number;
  segments: ParagraphSegment[];
  translatedAt: string;
}

export interface GlossaryEntry {
  id: number;
  english: string;
  korean: string;
}

export type Theme = 'dark' | 'light';

export interface NoiseFilterConfig {
  pageNumbers: boolean;      // 단독 숫자 줄 (페이지 번호)
  runningHeaders: boolean;   // 짧고 반복되는 줄 (헤더/푸터)
  figureCaptions: boolean;   // Figure N. / Table N. 캡션 줄
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

Expected: 타입 에러 없이 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add types/translator.ts
git commit -m "feat: 공유 타입 정의 추가 (translator.ts)"
```

---

## Task 2: PDF 노이즈 필터 유틸리티

**Files:**
- Create: `lib/noiseFilter.ts`

- [ ] **Step 1: 파일 생성**

```typescript
// lib/noiseFilter.ts
import type { NoiseFilterConfig } from '@/types/translator';

export const DEFAULT_NOISE_CONFIG: NoiseFilterConfig = {
  pageNumbers: true,
  runningHeaders: true,
  figureCaptions: false,
};

export interface DetectedNoise {
  pageNumbers: number;
  runningHeaders: number;
  figureCaptions: number;
}

/** 추출된 텍스트에서 노이즈 패턴 감지 — 각 타입의 발생 횟수 반환 */
export function detectNoise(text: string): DetectedNoise {
  const lines = text.split('\n');

  // 페이지 번호: 1~4자리 숫자만 있는 줄
  const pageNumbers = lines.filter(l => /^\s*\d{1,4}\s*$/.test(l)).length;

  // 반복 헤더: 60자 미만 줄 중 2회 이상 반복되는 것
  const shortLines = lines.filter(l => l.trim().length > 0 && l.trim().length < 60);
  const counts = new Map<string, number>();
  for (const l of shortLines) {
    const k = l.trim().toLowerCase();
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const runningHeaders = [...counts.values()].filter(n => n >= 2).length;

  // Figure/Table 캡션: Figure N. / Table N. 으로 시작하는 줄
  const figureCaptions = lines.filter(l =>
    /^\s*(Figure|Fig\.|Table)\s+\d+[\s.:]/i.test(l)
  ).length;

  return { pageNumbers, runningHeaders, figureCaptions };
}

/** 설정에 따라 노이즈를 텍스트에서 제거하고 정제된 텍스트 반환 */
export function applyNoiseFilter(text: string, config: NoiseFilterConfig): string {
  let lines = text.split('\n');

  if (config.pageNumbers) {
    lines = lines.filter(l => !/^\s*\d{1,4}\s*$/.test(l));
  }

  if (config.runningHeaders) {
    const shortLines = lines.filter(l => l.trim().length > 0 && l.trim().length < 60);
    const counts = new Map<string, number>();
    for (const l of shortLines) {
      const k = l.trim().toLowerCase();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const repeated = new Set(
      [...counts.entries()].filter(([, n]) => n >= 2).map(([k]) => k)
    );
    lines = lines.filter(l => !repeated.has(l.trim().toLowerCase()));
  }

  if (config.figureCaptions) {
    lines = lines.filter(l => !/^\s*(Figure|Fig\.|Table)\s+\d+[\s.:]/i.test(l));
  }

  // 연속된 빈 줄 정리
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

Expected: 타입 에러 없이 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add lib/noiseFilter.ts
git commit -m "feat(lib): PDF 노이즈 감지 및 필터 유틸리티 추가"
```

---

## Task 3: 용어집 유틸리티

**Files:**
- Create: `lib/glossary.ts`

- [ ] **Step 1: 파일 생성**

```typescript
// lib/glossary.ts
import type { GlossaryEntry } from '@/types/translator';

const GLOSSARY_KEY = 'translator-glossary';

export function loadGlossary(): GlossaryEntry[] {
  try {
    const raw = localStorage.getItem(GLOSSARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is GlossaryEntry =>
        typeof e.id === 'number' &&
        typeof e.english === 'string' &&
        typeof e.korean === 'string'
    );
  } catch {
    return [];
  }
}

export function saveGlossary(entries: GlossaryEntry[]): void {
  try {
    localStorage.setItem(GLOSSARY_KEY, JSON.stringify(entries));
  } catch {}
}

/** 용어집 항목을 번역 프롬프트 instructions에 삽입할 텍스트로 변환 */
export function glossaryToInstructions(entries: GlossaryEntry[]): string {
  if (entries.length === 0) return '';
  const lines = entries.map(e => `- ${e.english} → ${e.korean}`).join('\n');
  return `\nGlossary (use these translations consistently, do not deviate):\n${lines}`;
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

Expected: 타입 에러 없이 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add lib/glossary.ts
git commit -m "feat(lib): 용어집 localStorage CRUD 유틸리티 추가"
```

---

## Task 4: CSS — 다크모드 variant + 커서 애니메이션

**Files:**
- Modify: `app/globals.css`

> **Tailwind v4 주의:** `tailwind.config.js` 없음. 다크모드는 CSS에서 `@custom-variant`로 설정.

- [ ] **Step 1: globals.css 수정**

```css
/* app/globals.css */
@import "tailwindcss";

/* 다크모드: html.dark 의 모든 자손에게 dark: 클래스 적용 */
@custom-variant dark (&:where(.dark, .dark *));

:root {
  --background: #ffffff;
  --foreground: #171717;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: Arial, Helvetica, sans-serif;
}

/* 스트리밍 커서 깜빡임 애니메이션 */
@keyframes cursor-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.animate-cursor-blink {
  animation: cursor-blink 0.8s step-end infinite;
}
```

> `@media (prefers-color-scheme: dark)` 블록은 제거한다 — 이제 `html.dark` 클래스로 제어하기 때문에 자동 시스템 테마 감지가 충돌할 수 있다.

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

Expected: CSS 에러 없이 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add app/globals.css
git commit -m "feat(css): Tailwind v4 다크모드 variant 및 커서 애니메이션 추가"
```

---

## Task 5: DarkModeToggle 컴포넌트

**Files:**
- Create: `components/ui/DarkModeToggle.tsx`

- [ ] **Step 1: 파일 생성**

```typescript
// components/ui/DarkModeToggle.tsx
'use client';

import type { Theme } from '@/types/translator';

interface DarkModeToggleProps {
  theme: Theme;
  onToggle: () => void;
}

export function DarkModeToggle({ theme, onToggle }: DarkModeToggleProps): JSX.Element {
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
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

- [ ] **Step 3: 커밋**

```bash
git add components/ui/DarkModeToggle.tsx
git commit -m "feat(ui): DarkModeToggle 컴포넌트 추가"
```

---

## Task 6: ProgressBar 컴포넌트

**Files:**
- Create: `components/ui/ProgressBar.tsx`

- [ ] **Step 1: 파일 생성**

```typescript
// components/ui/ProgressBar.tsx

interface ProgressBarProps {
  done: number;
  total: number;
  elapsed: number;
}

export function ProgressBar({ done, total, elapsed }: ProgressBarProps): JSX.Element {
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
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

- [ ] **Step 3: 커밋**

```bash
git add components/ui/ProgressBar.tsx
git commit -m "feat(ui): ProgressBar 컴포넌트 추가"
```

---

## Task 7: SegmentCard 컴포넌트

**Files:**
- Create: `components/ui/SegmentCard.tsx`

- [ ] **Step 1: 파일 생성**

```typescript
// components/ui/SegmentCard.tsx
'use client';

import type { ParagraphSegment } from '@/types/translator';

interface SegmentCardProps {
  segment: ParagraphSegment;
  isTranslating: boolean;  // 전체 번역 진행 중 여부 — true면 재번역 버튼 비활성화
  onDelete: (id: number) => void;
  onRetry: (id: number) => void;
}

export function SegmentCard({ segment: seg, isTranslating, onDelete, onRetry }: SegmentCardProps): JSX.Element {
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
          <button
            onClick={() => onRetry(seg.id)}
            disabled={isTranslating}
            title="이 단락만 재번역"
            className="text-xs px-2 py-1 rounded transition-colors
              bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700
              dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600 dark:hover:text-slate-200
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ↺
          </button>
        )}
        {seg.status === 'done' && seg.korean && (
          <button
            onClick={() => navigator.clipboard.writeText(seg.korean ?? '')}
            title="한국어 복사"
            className="p-1 transition-colors text-slate-400 hover:text-blue-500 dark:text-slate-500 dark:hover:text-blue-400"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
        )}
        {seg.status !== 'translating' && (
          <button
            onClick={() => onDelete(seg.id)}
            title="삭제"
            className="p-1 transition-colors text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
          </button>
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
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

- [ ] **Step 3: 커밋**

```bash
git add components/ui/SegmentCard.tsx
git commit -m "feat(ui): SegmentCard 컴포넌트 추가 (재번역 버튼, 커서 애니메이션)"
```

---

## Task 8: GlossarySidebar 컴포넌트

**Files:**
- Create: `components/sidebar/GlossarySidebar.tsx`

- [ ] **Step 1: 파일 생성**

```typescript
// components/sidebar/GlossarySidebar.tsx
'use client';

import { useState } from 'react';
import type { GlossaryEntry } from '@/types/translator';

interface GlossarySidebarProps {
  glossary: GlossaryEntry[];
  onChange: (updated: GlossaryEntry[]) => void;
}

export function GlossarySidebar({ glossary, onChange }: GlossarySidebarProps): JSX.Element {
  const [engInput, setEngInput] = useState('');
  const [korInput, setKorInput] = useState('');
  const nextId = getNextId(glossary);

  const handleAdd = (): void => {
    const english = engInput.trim();
    const korean = korInput.trim();
    if (!english || !korean) return;
    onChange([...glossary, { id: nextId, english, korean }]);
    setEngInput('');
    setKorInput('');
  };

  const handleDelete = (id: number): void => {
    onChange(glossary.filter(e => e.id !== id));
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') handleAdd();
  };

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide mb-3 text-slate-500 dark:text-slate-400">
        📖 용어집
      </p>

      {/* 용어 목록 */}
      <div className="space-y-1.5 mb-3 max-h-48 overflow-y-auto">
        {glossary.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-600">용어 없음</p>
        )}
        {glossary.map(entry => (
          <div key={entry.id} className="flex items-center gap-1.5 group">
            <span className="flex-1 text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 truncate">
              {entry.english}
            </span>
            <span className="text-xs text-slate-400">→</span>
            <span className="flex-1 text-xs px-2 py-1 rounded bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 truncate">
              {entry.korean}
            </span>
            <button
              onClick={() => handleDelete(entry.id)}
              className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition-opacity"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* 용어 추가 */}
      <div className="space-y-1.5">
        <input
          type="text"
          value={engInput}
          onChange={e => setEngInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="영어"
          className="w-full text-xs px-2 py-1.5 rounded border outline-none
            border-slate-200 bg-white text-slate-700 placeholder-slate-400 focus:border-blue-400
            dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:placeholder-slate-600 dark:focus:border-blue-500"
        />
        <input
          type="text"
          value={korInput}
          onChange={e => setKorInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="한국어"
          className="w-full text-xs px-2 py-1.5 rounded border outline-none
            border-slate-200 bg-white text-slate-700 placeholder-slate-400 focus:border-blue-400
            dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:placeholder-slate-600 dark:focus:border-blue-500"
        />
        <button
          onClick={handleAdd}
          disabled={!engInput.trim() || !korInput.trim()}
          className="w-full text-xs py-1.5 rounded border transition-colors
            border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600
            dark:border-slate-700 dark:text-slate-500 dark:hover:border-blue-500 dark:hover:text-blue-400
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + 추가 (Enter)
        </button>
      </div>
    </div>
  );
}

/** 현재 용어집의 최대 id + 1 반환 */
function getNextId(entries: GlossaryEntry[]): number {
  return entries.length === 0 ? 1 : Math.max(...entries.map(e => e.id)) + 1;
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

- [ ] **Step 3: 커밋**

```bash
git add components/sidebar/GlossarySidebar.tsx
git commit -m "feat(sidebar): GlossarySidebar 컴포넌트 추가"
```

---

## Task 9: StepPdfClean 컴포넌트

**Files:**
- Create: `components/steps/StepPdfClean.tsx`

- [ ] **Step 1: 파일 생성**

```typescript
// components/steps/StepPdfClean.tsx
'use client';

import { useState, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { detectNoise, applyNoiseFilter, DEFAULT_NOISE_CONFIG } from '@/lib/noiseFilter';
import type { NoiseFilterConfig } from '@/types/translator';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.6.205/build/pdf.worker.min.mjs`;

interface StepPdfCleanProps {
  isTranslating: boolean;
  onStartTranslation: (text: string) => void;
}

export function StepPdfClean({ isTranslating, onStartTranslation }: StepPdfCleanProps): JSX.Element {
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

      {/* 번역 시작 버튼 */}
      <div className="flex justify-end">
        <button
          onClick={handleStart}
          disabled={isTranslating || !textToTranslate.trim()}
          className="px-8 py-3 rounded-full font-bold text-sm transition-colors
            bg-blue-600 text-white hover:bg-blue-700
            disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed"
        >
          번역 시작 →
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

Expected: TypeScript 에러 없음. pdfjs-dist 타입 관련 `item.str` 접근에서 `any` 경고가 있을 수 있으나 빌드는 통과해야 함.

- [ ] **Step 3: 커밋**

```bash
git add components/steps/StepPdfClean.tsx
git commit -m "feat(steps): StepPdfClean — 드래그앤드롭 PDF 업로드 + 노이즈 필터 추가"
```

---

## Task 10: StepExport 컴포넌트

**Files:**
- Create: `components/steps/StepExport.tsx`

- [ ] **Step 1: 파일 생성**

```typescript
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

export function StepExport({ segments, history, onDeleteHistory }: StepExportProps): JSX.Element {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'copiedBi'>('idle');
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

  const handleDownload = (): void => {
    const blob = new Blob([koreanText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    a.href = url;
    a.download = `translated_${ts}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyBilingual = async (): Promise<void> => {
    await navigator.clipboard.writeText(bilingualText);
    setCopyState('copiedBi');
    setTimeout(() => setCopyState('idle'), 2000);
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

  return (
    <div className="space-y-5">
      {/* 내보내기 버튼 */}
      <div className="flex gap-3">
        <button
          onClick={handleCopyKorean}
          className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
            copyState === 'copied'
              ? 'bg-green-600 text-white'
              : 'bg-green-500 hover:bg-green-600 text-white'
          }`}
        >
          {copyState === 'copied' ? '✓ 복사됨!' : '📋 한국어 전체 복사'}
        </button>
        <button
          onClick={handleDownload}
          className="flex-1 py-3 rounded-xl font-semibold text-sm transition-colors
            border border-slate-200 text-slate-600 hover:bg-slate-50
            dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          ⬇ .txt 다운로드
        </button>
        <button
          onClick={handleCopyBilingual}
          className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all
            border ${copyState === 'copiedBi'
              ? 'border-green-500 text-green-600 dark:text-green-400'
              : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
        >
          {copyState === 'copiedBi' ? '✓ 복사됨!' : '원문+번역 대조본'}
        </button>
      </div>

      {/* 미리보기 */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            미리보기 (한국어 · {doneSegments.length}단락)
          </span>
        </div>
        <div className="p-4 max-h-64 overflow-y-auto">
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
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

- [ ] **Step 3: 커밋**

```bash
git add components/steps/StepExport.tsx
git commit -m "feat(steps): StepExport — 전체 복사, txt 다운로드, 대조본, 히스토리 추가"
```

---

## Task 11: TranslatorApp — 핵심 번역 로직 + 스텝 탭 + 상태

**Files:**
- Create: `components/TranslatorApp.tsx`

> 이 컴포넌트가 전체 앱의 두뇌다. 번역 로직은 기존 `AppContent.tsx`에서 이식하고, 신규 기능(용어집 주입, 단락 재번역, 스텝 탭)을 추가한다.

- [ ] **Step 1: 파일 생성**

```typescript
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

export function TranslatorApp({ token, theme, onToggleTheme }: TranslatorAppProps): JSX.Element {
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  const [segments, setSegments] = useState<ParagraphSegment[]>([]);
  const [isTranslating, setIsTranslating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS);
  const [isThink, setIsThink] = useState(false);

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
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400">Translator for my Yf</h1>
            <span className="text-xs text-slate-400">by Hb</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsThink(v => !v)}
              disabled={isTranslating}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                isThink
                  ? 'bg-purple-600 text-white ring-2 ring-purple-300 ring-opacity-50'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
              } disabled:opacity-50`}
              title={isThink ? 'Thinking Mode: ON' : 'Thinking Mode: OFF'}
            >
              🧠 사고력 강화
            </button>
            <DarkModeToggle theme={theme} onToggle={onToggleTheme} />
          </div>
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
                isTranslating={isTranslating}
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
            <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
              <p className="text-xs font-bold uppercase tracking-wide mb-2 text-slate-500 dark:text-slate-400">
                📋 번역 규칙
              </p>
              <textarea
                value={instructions}
                onChange={e => handleInstructionsChange(e.target.value)}
                className="w-full h-24 text-xs p-2 rounded border resize-none outline-none
                  border-slate-200 bg-slate-50 text-slate-700 focus:border-blue-400
                  dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:focus:border-blue-500"
              />
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

> `StepTranslate`가 아직 없으므로 import 에러 발생 → 다음 태스크에서 해결됨. 빌드 실패 OK.

- [ ] **Step 3: 커밋 (빌드 미완성 상태로)**

```bash
git add components/TranslatorApp.tsx
git commit -m "feat: TranslatorApp — 번역 로직, 스텝 탭, 용어집 주입 통합"
```

---

## Task 12: StepTranslate 컴포넌트

**Files:**
- Create: `components/steps/StepTranslate.tsx`

- [ ] **Step 1: 파일 생성**

```typescript
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
}: StepTranslateProps): JSX.Element {
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
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

Expected: 타입 에러 없이 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add components/steps/StepTranslate.tsx
git commit -m "feat(steps): StepTranslate — 세그먼트 카드 + 진행 바 + 컨트롤 추가"
```

---

## Task 13: AppContent.tsx 슬림화 + TranslatorApp 연결

**Files:**
- Modify: `components/AppContent.tsx`

> 기존 `AppContent.tsx`의 `TranslatorApp`과 PDF 관련 코드를 전부 제거하고, 새 `TranslatorApp` 컴포넌트를 연결한다. `PasswordGate`는 작으므로 여기에 유지한다.

- [ ] **Step 1: AppContent.tsx 전체 교체**

```typescript
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

export function PasswordGate({ onAuth }: { onAuth: (token: string) => void }): JSX.Element {
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
}): JSX.Element {
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
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

Expected: 타입 에러 없이 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add components/AppContent.tsx
git commit -m "refactor(AppContent): TranslatorApp 연결 및 슬림화, 다크모드 theme 관리 추가"
```

---

## Task 14: 최종 통합 검증

- [ ] **Step 1: 개발 서버 실행**

```bash
npm run dev
```

- [ ] **Step 2: 기능 체크리스트**

브라우저에서 `http://localhost:3000` 접속 후 순서대로 확인:

| 항목 | 확인 방법 |
|---|---|
| 다크모드 기본 | 첫 로드 시 배경이 어두운지 |
| 라이트 모드 전환 | 헤더 ☀️ 버튼 클릭 → 흰 배경으로 전환 |
| 테마 기억 | 새로고침 후 마지막 테마 유지 |
| PDF 드래그앤드롭 | PDF 파일을 드롭 존에 드롭 |
| 노이즈 필터 | PDF 추출 후 체크박스 UI 표시 |
| 번역 시작 | "번역 시작 →" 클릭 시 ② 번역 탭으로 자동 이동 |
| 커서 애니메이션 | 번역 중 한국어 컬럼에 깜빡이는 커서 표시 |
| 진행 바 | 번역 중 하단 진행 바 업데이트 |
| 단락 재번역 | 완료 단락의 ↺ 버튼 클릭 시 해당 단락만 재번역 |
| 용어집 추가 | 사이드바에서 영어→한국어 추가 후 번역 재시도 |
| 용어집 누적 | 새로고침 후 용어집 유지 |
| 한국어 전체 복사 | ③ 내보내기 탭에서 복사 버튼 클릭 시 성공 피드백 |
| .txt 다운로드 | 다운로드 버튼으로 파일 저장 확인 |
| ③ 탭 비활성화 | 번역 없는 상태에서 ③ 탭 클릭 불가 |

- [ ] **Step 3: 최종 커밋**

```bash
git add .
git commit -m "feat: translator-app wow 업그레이드 완료 — 다크모드, PDF 노이즈 필터, 용어집, 내보내기, 재번역"
```
