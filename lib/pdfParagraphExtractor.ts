export interface PdfTextItem {
  str: string;
  transform: number[];  // [a, b, c, d, e, f] — e: x, f: y (PDF coords, origin bottom-left)
  width: number;
  height: number;
  fontName: string;
  hasEOL: boolean;
}

interface Line {
  y: number;        // 대표 y 좌표
  avgHeight: number;
  text: string;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** 페이지 내 텍스트 아이템들의 median 폰트 크기의 75%를 각주 판별 임계값으로 반환 */
export function computeFootnoteThreshold(items: PdfTextItem[]): number {
  const heights = items
    .filter(item => item.str.trim().length > 0 && item.height > 0)
    .map(item => item.height);
  if (heights.length === 0) return 0;
  return median(heights) * 0.75;
}

/** TextItem 배열을 y 좌표 기준으로 행(Line)으로 그룹화 */
function groupItemsIntoLines(items: PdfTextItem[]): Line[] {
  if (items.length === 0) return [];

  // y 내림차순 정렬 (높은 y = 페이지 위쪽)
  const sorted = [...items].sort((a, b) => b.transform[5] - a.transform[5]);

  const groups: PdfTextItem[][] = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const refItem = groups[groups.length - 1][0];
    const dy = Math.abs(refItem.transform[5] - current.transform[5]);
    const tolerance = Math.max(refItem.height, current.height, 1) * 0.5;

    if (dy <= tolerance) {
      groups[groups.length - 1].push(current);
    } else {
      groups.push([current]);
    }
  }

  return groups
    .map(group => {
      // x 좌표로 정렬해서 읽기 순서 복원
      const byX = [...group].sort((a, b) => a.transform[4] - b.transform[4]);
      const text = byX.map(i => i.str).join('').trim();
      const avgHeight = group.reduce((s, i) => s + i.height, 0) / group.length;
      return { y: group[0].transform[5], avgHeight, text };
    })
    .filter(line => line.text.length > 0);
}

/** 행 배열을 문단 문자열 배열로 그룹화 (줄 간격 급증을 문단 구분으로 판단) */
function groupLinesIntoParagraphs(lines: Line[]): string[] {
  if (lines.length === 0) return [];
  if (lines.length === 1) return [lines[0].text];

  // 연속 행 간 y 간격 수집
  const spacings: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const dy = lines[i - 1].y - lines[i].y;
    if (dy > 0) spacings.push(dy);
  }

  const normalSpacing = median(spacings);
  const breakThreshold = normalSpacing * 1.4; // 정상 줄 간격의 1.4배 이상 → 문단 구분

  const paragraphs: Line[][] = [[lines[0]]];

  for (let i = 1; i < lines.length; i++) {
    const dy = lines[i - 1].y - lines[i].y;
    if (dy > breakThreshold) {
      paragraphs.push([lines[i]]);
    } else {
      paragraphs[paragraphs.length - 1].push(lines[i]);
    }
  }

  return paragraphs.map(mergeLines).filter(p => p.trim().length > 0);
}

/** 행 배열을 하나의 문자열로 합침. 하이픈 단어 분절 처리 포함 */
function mergeLines(lines: Line[]): string {
  const parts: string[] = [];
  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;
    if (parts.length > 0 && parts[parts.length - 1].endsWith('-')) {
      // 하이픈 단어 분절 → 하이픈 제거하고 붙임
      parts[parts.length - 1] = parts[parts.length - 1].slice(0, -1) + text;
    } else if (parts.length > 0) {
      parts[parts.length - 1] = parts[parts.length - 1] + ' ' + text;
    } else {
      parts.push(text);
    }
  }
  return parts.join('');
}

/**
 * 직전 페이지 마지막 문단과 현재 페이지 첫 문단을 이어붙여야 하는지 판단.
 * 마지막 문단이 문장 종결 기호(.!?:;)로 끝나면 false, 그 외엔 true.
 */
function shouldMergeCrossPage(lastParagraph: string, nextFirstLine: string): boolean {
  const trimmed = lastParagraph.trimEnd();
  if (/[.!?:;]"?\s*$/.test(trimmed)) return false;
  if (trimmed.endsWith('-')) return true;           // 하이픈 분절
  if (/^[a-z]/.test(nextFirstLine.trimStart())) return true; // 소문자 시작 → 연속
  return false;
}

export interface ExtractPageInput {
  items: PdfTextItem[];
  viewportHeight: number;
  includeFootnotes: boolean;
}

/**
 * 여러 페이지의 TextItem 배열을 받아 문단 단위 문자열 배열을 반환.
 * 페이지 경계에서 문단이 이어지면 자동 연결.
 */
export function extractParagraphs(pages: ExtractPageInput[]): string[] {
  const allParagraphs: string[] = [];

  for (const { items, viewportHeight, includeFootnotes } of pages) {
    // 각주 필터링
    const heightThreshold = !includeFootnotes ? computeFootnoteThreshold(items) : 0;
    const posThreshold = !includeFootnotes ? viewportHeight * 0.15 : 0;

    const visibleItems = !includeFootnotes
      ? items.filter(item => {
          if (item.height > 0 && item.height < heightThreshold) return false;
          if (item.transform[5] < posThreshold) return false;
          return true;
        })
      : items;

    const lines = groupItemsIntoLines(visibleItems);
    const pageParagraphs = groupLinesIntoParagraphs(lines);

    if (pageParagraphs.length === 0) continue;

    // 페이지 경계 처리
    if (
      allParagraphs.length > 0 &&
      shouldMergeCrossPage(allParagraphs[allParagraphs.length - 1], pageParagraphs[0])
    ) {
      const last = allParagraphs[allParagraphs.length - 1].trimEnd();
      const next = pageParagraphs[0].trimStart();
      allParagraphs[allParagraphs.length - 1] = last.endsWith('-')
        ? last.slice(0, -1) + next
        : last + ' ' + next;
      allParagraphs.push(...pageParagraphs.slice(1));
    } else {
      allParagraphs.push(...pageParagraphs);
    }
  }

  return allParagraphs;
}
