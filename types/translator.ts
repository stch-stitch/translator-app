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
