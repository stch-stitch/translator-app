# Translator App — "Wow" Upgrade Design

**Date**: 2026-04-16  
**Status**: Approved  

---

## Background

현재 translator-app은 EN→KR 번역 기능은 탄탄하지만, 학술 논문 번역 워크플로우에 최적화되어 있지 않고 시각적으로도 밋밋하다. 이 설계는 "파워 유저 기능 + 시각적 감동"을 동시에 달성하는 업그레이드 방향을 정의한다.

**주요 사용 패턴**: 학술 논문 PDF → EN→KR 번역 → 한국어 전체 복사 → 다른 문서에 붙여넣기

---

## Pain Points (우선순위 순)

1. **PDF 노이즈** — 헤더/푸터/참고문헌 번호 등이 추출 텍스트에 섞여 수동 정리 필요
2. **용어 불일치** — 같은 논문에서 동일 용어가 매번 다르게 번역됨
3. **결과물 조합** — 번역 완료 후 단락마다 개별 복사해야 함
4. **특정 단락 재번역** — 잘못된 단락 하나를 위해 전체를 다시 돌려야 함

---

## Approach

**B: 기능 + 디자인 동시 업그레이드**

레이아웃을 학술 번역 워크플로우 중심으로 재구성하면서, 4가지 pain point를 해결하는 기능을 함께 추가한다. 현재 컴포넌트(`AppContent.tsx`, API route)를 기반으로 확장한다.

---

## Architecture

### 레이아웃 구조

```
┌─────────────────────────────────────────────────────┐
│ Header: 타이틀 | 사고력 강화 토글 | 다크/라이트 모드 토글  │
├─────────────────────────────────────────────────────┤
│ Step Tabs: [① PDF 정리] [② 번역] [③ 내보내기]          │
├────────────────────────────────┬────────────────────┤
│                                │                    │
│  Main Content Area             │  Right Sidebar     │
│  (step에 따라 내용 변경)          │  📖 용어집          │
│                                │  📋 번역 규칙        │
│                                │                    │
└────────────────────────────────┴────────────────────┘
```

### 컴포넌트 분리

현재 `AppContent.tsx` 하나에 모든 UI가 있음. 이를 다음 구조로 분리:

```
components/
  AppContent.tsx          — 최상위 wrapper (token/auth 관리, 다크모드 context)
  TranslatorApp.tsx       — 메인 앱 (3-step 탭 상태 관리)
  steps/
    StepPdfClean.tsx      — ① PDF 업로드, 추출, 노이즈 필터
    StepTranslate.tsx     — ② 번역 진행, 세그먼트 카드
    StepExport.tsx        — ③ 내보내기 옵션
  sidebar/
    GlossarySidebar.tsx   — 용어집 관리
  ui/
    SegmentCard.tsx       — 단락 카드 (번역 상태 표시 + 재번역 버튼)
    ProgressBar.tsx       — 번역 진행 바
    DarkModeToggle.tsx    — 다크/라이트 전환 버튼
```

---

## Feature Specifications

### 1. PDF 노이즈 필터

**위치**: Step ① PDF 정리

**동작**:
1. PDF 텍스트 추출 완료 후 자동으로 노이즈 패턴 감지
2. 감지된 패턴을 체크박스 목록으로 표시 (기본값: 모두 체크)
3. 사용자가 체크 해제하면 해당 패턴 제거된 텍스트를 미리보기에 반영
4. "번역 시작" 클릭 시 필터링된 텍스트로 번역

**감지 패턴**:
- 페이지 헤더/푸터: 줄 전체가 짧고 반복되는 패턴 (정규식 기반)
- 참고문헌 번호: `[1]`, `(2024)` 등 단독 줄 패턴
- Figure/Table 캡션: `Figure N.`, `Table N.` 으로 시작하는 줄

**구현 위치**: 클라이언트 측 순수 함수 (`lib/noiseFilter.ts`)

---

### 2. 글로벌 용어집 (Glossary)

**위치**: 우측 사이드바, 항상 노출

**동작**:
- EN→KR 용어 쌍 관리 (예: `attention` → `어텐션`)
- **앱 전체에서 누적** — localStorage에 저장, 논문이 바뀌어도 유지
- 번역 API 호출 시 용어집을 Translation Rules에 자동 주입:
  ```
  Glossary (must use these translations consistently):
  - attention → 어텐션
  - transformer → 트랜스포머
  ```
- 용어 추가 / 삭제 / 편집 가능

**저장 키**: `translator-glossary` (localStorage)

**데이터 구조**:
```typescript
interface GlossaryEntry {
  id: number;
  english: string;
  korean: string;
}
```

---

### 3. 전체 복사 + 내보내기

**위치**: Step ③ 내보내기

**3가지 옵션**:
1. **한국어 전체 복사** — 모든 세그먼트의 `korean` 텍스트를 `\n\n`으로 합쳐 클립보드에 복사. 성공 시 버튼 텍스트가 "✓ 복사됨!"으로 2초간 변경
2. **.txt 다운로드** — 한국어 텍스트를 `.txt` 파일로 저장 (`translated_YYYYMMDD_HHmmss.txt`)
3. **원문+번역 대조본** — `영어 단락\n한국어 단락\n---` 형태로 클립보드 복사

---

### 4. 단락별 재번역

**위치**: Step ② 번역, 각 세그먼트 카드

**동작**:
- `status === 'done'` 인 세그먼트에 ↺ 재번역 버튼 표시
- 클릭 시 해당 세그먼트만 `status: 'pending'`으로 초기화 후 단독 번역
- 번역 중인 다른 세그먼트와 충돌 방지: 전체 번역 진행 중에는 버튼 비활성화

---

### 5. 다크모드

- **기본값**: 다크 모드
- **전환**: 헤더 토글 버튼 (🌙 / ☀️)
- **저장**: localStorage `translator-theme` 키
- **구현**: Tailwind CSS `dark:` 클래스 + `<html>` 태그 `class="dark"` 제어

---

### 6. 시각적 개선

| 항목 | 현재 | 변경 후 |
|---|---|---|
| 배경 | 흰색 (고정) | 다크 기본, 라이트 선택 |
| 번역 진행 표시 | `3 / 8 · 42s` 텍스트 | 진행 바 + 텍스트 |
| 스트리밍 표시 | `animate-pulse` 텍스트 | 타이핑 커서 (`▌`) 애니메이션 |
| 완료 피드백 | 없음 | 세그먼트 테두리 초록색 전환 |
| PDF 업로드 | 일반 file input | 드래그앤드롭 존 |
| 복사 성공 | 피드백 없음 | 버튼 텍스트 변경 + 색 전환 |

---

## Data Flow

```
[PDF 업로드] → [pdfjs 텍스트 추출] → [노이즈 필터 적용]
     ↓
[rawInput 세팅] + [용어집 로드]
     ↓
[번역 API POST] ← 용어집 + 번역 규칙 프롬프트에 주입
     ↓
[스트리밍 응답] → [세그먼트 카드 실시간 업데이트]
     ↓
[전체 완료] → [히스토리 저장] → [내보내기 탭 활성화]
```

---

## State Management

현재 단일 컴포넌트 state를 유지하되, 신규 상태 추가:

```typescript
// 추가되는 state
const [theme, setTheme] = useState<'dark' | 'light'>('dark');
const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
const [noiseFilters, setNoiseFilters] = useState<NoiseFilterConfig>({
  headerFooter: true,
  referenceNumbers: true,
  figureCaptions: false,
});

// NoiseFilterConfig 타입
interface NoiseFilterConfig {
  headerFooter: boolean;       // 페이지 헤더/푸터 제거
  referenceNumbers: boolean;   // [1], (2024) 등 단독 줄 참고문헌 번호
  figureCaptions: boolean;     // Figure N. / Table N. 캡션
}
```

**Step 탭 네비게이션**: 강제 순서가 아닌 **자유 네비게이션**. 탭을 클릭하면 언제든 이동 가능. 단, ③ 내보내기 탭은 번역 완료 세그먼트가 1개 이상 있을 때만 활성화됨 (0개면 비활성 + tooltip: "번역을 먼저 진행하세요").

---

## What's NOT Changing

- 번역 API route (`app/api/translate/route.ts`) — 용어집 주입은 클라이언트에서 instructions에 추가하는 방식으로 처리
- 인증 흐름 (`PasswordGate`, `/api/auth`)
- 번역 순차 처리 방식 (순서 보장, 모델 부하 방지)
- localStorage 히스토리 구조 (`translator-history`)

---

## Out of Scope

- PDF 뷰어 내장 (원문 나란히 보기) — 구현 복잡도 높음, 추후 검토
- 번역 메모리 (이전 번역 재활용) — 추후 검토
- 서버 사이드 히스토리 저장 — 현재 로컬 전용 유지
