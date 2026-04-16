# CONTEXT.md

## 2026-04-16 초기 개발

### 프로젝트 개요
Yf를 위한 영한 번역 앱. Ollama 로컬 LLM(gemma4:26b)을 사용하며, 긴 텍스트를 문단 단위로 분절하여 순차 번역한다.

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

## 2026-04-16 PDF 주석(Annotation) 분리 추출 기능 추가

### 변경 사항
- **PDF 주석 추출**: `includeAnnotations` 옵션을 추가하여 본문과 주석을 분리하여 추출하는 기능 구현
- **데이터 포맷팅**: `--- Page N Body ---` 및 `--- Page N Annotations ---`로 구분하여 추출 및 번역 연동
- **작성자 정보 포함**: 주석 작성자 정보가 있는 경우 `[작성자]: 내용` 형식으로 파싱

### 작업 목적
- PDF 문서의 메모나 주석 내용도 본문과 섞이지 않게 분리하여 번역할 수 있도록 사용자 편의성 증대

## 2026-04-16 기본 번역 지침 고도화 및 UI 문구 로컬라이징

### 변경 사항
- **기본 번역 지침 업데이트**: 번역 시 누락 방지, 외부 지식 배제, 제목 뒤 줄바꿈 추가 등 구체적인 가이드라인으로 `DEFAULT_INSTRUCTIONS` 변경
- **UI 로컬라이징**: PDF 업로드 영역의 "Include Annotations" 체크박스 라벨을 "주석 포함"으로 변경

### 작업 목적
- 번역 결과의 품질을 높이고 사용자 환경(UI)을 보다 친숙하게 개선

## 2026-04-16 UI 텍스트 및 레이아웃 조정

### 변경 사항
- **타이틀 변경**: 앱 타이틀을 "Translator for my Yf"로 업데이트하고 메타데이터 및 README 반영
- **레이아웃 개선**: "by Hb" 표시를 타이틀 우측으로 이동하여 공간 효율성 증대
- **라벨 수정**: "Translation Instructions"를 "Translation Rules"로 변경하여 용어 명확화

### 작업 목적
- 사용자 요청에 따른 브랜드 네이밍 변경 및 UI 요소 가독성 향상

## 2026-04-16 TLS 우회 undici Agent로 전환

### 변경 사항
- `app/api/translate/route.ts` — axios 제거, native `fetch` + undici `Agent` dispatcher로 TLS 우회 구현
- `package.json` / `package-lock.json` — `undici` 의존성 추가 (axios 제거됨)
- `CLAUDE.md` — axios → undici 관련 설명 업데이트

### 작업 목적
- 이전 코드의 `dispatcher: undefined`는 TLS 우회를 전혀 하지 않는 무의미한 코드였음
- undici `Agent({ connect: { rejectUnauthorized: false } })`를 fetch의 `dispatcher`로 전달하여 ngrok/Funnel HTTPS 자체서명 인증서 에러(ECONNRESET) 해결

### 참고 사항
- undici는 Node.js 내장 HTTP 라이브러리로, 별도 외부 의존성 없이 경량
- `dispatcher` 옵션은 TypeScript 타입에 없어 `@ts-expect-error` 주석 유지

## 2026-04-16 API 안정화 및 로직 최적화

### 변경 사항
- **API 에러 핸들링 강화**: `/api/translate`에 `try-catch` 블록 및 상세 에러 로깅 추가 (Ollama 응답 상태 코드 및 메시지 출력)
- **로직 단순화**: 불안정했던 NDJSON 버퍼 처리 로직을 제거하고 직관적인 라인 단위 스트리밍 방식으로 원복
- **Ollama 옵션 최적화**: 과도한 `num_ctx` 설정을 제거하여 서버 부하 경감 및 안정성 확보

### 작업 목적
- Tailscale Funnel 연결 이슈 대응 과정에서 복잡해진 코드를 정리하고 서버 안정성을 높임
