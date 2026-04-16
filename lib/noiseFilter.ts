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

  // 연속된 빈 줄 정리 — 전체 trim()은 금지: 사용자가 입력 중인 앞뒤 스페이스까지 지워져 스페이스 입력이 막히는 현상 방지
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
}
