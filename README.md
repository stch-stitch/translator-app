# Translator for my wife

Ollama 로컬 LLM을 사용한 영한 번역 앱입니다. 긴 텍스트를 문단 단위로 분절하여 순차적으로 번역합니다.

## 주요 기능

- 긴 영어 텍스트를 빈 줄 기준으로 문단 분절 후 순차 번역
- 번역 진행 중 실시간 스트리밍 출력
- 번역 일시 중지(Stop) / 재개(Resume) / 취소(Cancel)
- 각 문단 개별 삭제
- 번역 지침 입력 (브라우저 재시작 후에도 유지)
- 번역 이력 저장 (localStorage 영속)

## 사전 요구사항

- Node.js 18+
- [Ollama](https://ollama.ai) 실행 중인 서버 (gemma4:26b 모델)

## 설치 및 실행

**macOS / Linux:**
```bash
git clone https://github.com/stch-stitch/translator-app.git
cd translator-app
npm install
npm run dev
```

**Windows 11 (PowerShell):**
```powershell
git clone https://github.com/stch-stitch/translator-app.git
cd translator-app
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 접속

## 환경변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `OLLAMA_API_URL` | `http://localhost:11434` | Ollama 서버 주소 |
| `OLLAMA_MODEL` | `gemma4:26b` | 사용할 모델명 |

**macOS / Linux:**
```bash
# .env.local 파일 생성
echo "OLLAMA_API_URL=http://your-ollama-ip:11434" > .env.local
```

**Windows 11 (PowerShell):**
```powershell
# .env.local 파일 생성
"OLLAMA_API_URL=http://your-ollama-ip:11434" | Out-File -Encoding utf8 .env.local
```

## Vercel 배포

1. Vercel 대시보드에서 이 레포를 import
2. Environment Variables에 `OLLAMA_API_URL` 설정 (Ollama 서버의 외부 접근 가능한 주소)
3. Deploy
