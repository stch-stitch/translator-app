# CONTEXT.md

## 2026-04-16 초기 개발

### 프로젝트 개요
아내를 위한 영한 번역 앱. Ollama 로컬 LLM(gemma4:26b)을 사용하며, 긴 텍스트를 문단 단위로 분절하여 순차 번역한다.

### 주요 구현 내역

**앱 구조**
- `app/page.tsx` — 메인 UI (번역 입력/출력, 이력 관리)
- `app/api/translate/route.ts` — Ollama API 연동 라우트 핸들러
- `app/layout.tsx` — 메타데이터 및 레이아웃
- `app/icon.svg` — 8분음표 파비콘 (파란 라운드 사각형 배경)

**번역 플로우**
1. 사용자가 긴 텍스트 붙여넣기
2. 빈 줄(`\n\n`)을 기준으로 문단 분절, 화면에 즉시 표시
3. gemma4가 위에서부터 순차적으로 한국어 번역 스트리밍
4. 완료 시 입력창 비우고 히스토리에 저장

**핵심 기술 결정**
- `think: false` 옵션으로 Ollama thinking 모드 비활성화 (번역 속도 개선)
- 스트리밍 응답으로 체감 속도 개선 (NDJSON → plain text 변환 후 포워딩)
- `AbortController`로 Stop 기능 구현
- `segmentsRef`로 async 루프 내 최신 segments 상태 동기적 읽기
- localStorage로 번역 이력 및 번역 지침 영속화

**환경변수**
- `OLLAMA_API_URL`: Ollama 서버 주소 (기본값: `http://localhost:11434`)
- `OLLAMA_MODEL`: 사용 모델 (기본값: `gemma4:26b`)

### 참고 사항
- `src/app/` 디렉토리는 이전 LLM이 생성한 미사용 파일들 (무시해도 됨)
- Vercel 배포 시 `OLLAMA_API_URL`을 외부 접근 가능한 Ollama 서버 주소로 설정 필요
- `OLLAMA_API_URL`은 Tailscale Funnel 공개 URL 사용 권장 (`tailscale funnel 11434`)

## 2026-04-16 인증 및 React #310 에러 수정

### 변경 사항
- `app/api/auth/route.ts` — 비밀번호 인증 API 추가 (`APP_SECRET` env var 기반)
- `app/api/translate/route.ts` — `Authorization: Bearer <secret>` 헤더 검증 추가
- `app/page.tsx` — React error #310 수정을 위해 3개 컴포넌트로 분리
  - `Page`: sessionStorage 확인 후 `PasswordGate` 또는 `TranslatorApp` 렌더
  - `PasswordGate`: 비밀번호 입력 폼
  - `TranslatorApp`: 모든 번역 훅/로직 (token을 prop으로 수신)
- `app/icon.svg` — 8분음표 파비콘 (파란 모서리 깎은 사각형 배경)

### 작업 목적
- React 19 + Next.js 16에서 조건부 렌더 이전에 훅이 호출되면 error #310 발생
- 비밀번호 게이트를 별도 컴포넌트로 분리하여 훅 규칙 위반 해소
- `token` 초기값을 `'loading'`으로 설정해 sessionStorage 확인 전 PasswordGate 깜박임 방지

### 참고 사항
- `APP_SECRET` 환경변수가 없으면 인증 없이 동작 (로컬 개발 편의)
- Vercel에 `APP_SECRET` 설정 필수 (미설정 시 auth API가 500 반환)

## 2026-04-16 PDF 지원 및 사고력 강화(Thinking) 모드 UI 추가

### 변경 사항
- **PDF 번역 지원**: `pdfjs-dist`를 사용하여 브라우저에서 PDF 텍스트 추출 기능 추가
- **UI 개선**: 
    - 번역 결과물 복사 버튼 추가
    - 삭제 버튼 위치 이동 (우측 하단) 및 가시성 강화
    - 비밀번호 입력창 폰트 색상 가독성 개선
- **사고력 강화(Thinking) 모드**: 
    - "사고력 강화" 텍스트 토글 버튼 추가
    - 활성화 시 Ollama API에 `think: true` 파라미터 전달
- **빌드 최적화**: `pdfjs-dist` 관련 SSR 에러 해결을 위해 `AppContent` 컴포넌트를 `dynamic(ssr: false)`로 분리

### 작업 목적
- PDF 문서를 바로 번역하고 싶은 사용자 요구 반영
- Gemma4:26b 모델의 추론 능력을 선택적으로 활용할 수 있도록 개선
- 프로덕션 빌드 시 발생하는 서버 사이드 참조 오류 해결
