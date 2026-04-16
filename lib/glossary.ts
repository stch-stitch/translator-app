// lib/glossary.ts
import type { GlossaryEntry } from '@/types/translator';

const GLOSSARY_KEY = 'translator-glossary';

/** 최초 방문(저장소 없음) 시에만 쓰이는 기본 매핑. 사용자가 삭제하면 빈 배열로 유지됨. */
export function getDefaultGlossary(): GlossaryEntry[] {
  return [{ id: 1, english: 'Beethoven', korean: '베에토벤' }];
}

export function loadGlossary(): GlossaryEntry[] {
  try {
    const raw = localStorage.getItem(GLOSSARY_KEY);
    if (!raw) return getDefaultGlossary();
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
