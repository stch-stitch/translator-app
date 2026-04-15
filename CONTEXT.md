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
