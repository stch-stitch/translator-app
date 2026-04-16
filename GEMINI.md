# GEMINI.md (Project Specific)

## Project Overview
This is a local AI-powered translation application designed to translate long English texts into Korean by segmenting them into paragraphs. It leverages Ollama as the local LLM backend.

## Tech Stack
- **Frontend:** Next.js (App Router), React 19, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes, Axios
- **LLM:** Ollama (default: `gemma4:26b`)

## Development Commands
- `npm run dev`: Start the development server
- `npm run build`: Build for production
- `npm run start`: Start the production server
- `npm run lint`: Run ESLint

## Setup & Configuration
- **Prerequisites:** Node.js 18+, Ollama server running locally.
- **Environment Variables:** Create a `.env.local` file to override defaults:
  - `OLLAMA_API_URL` (Default: `http://localhost:11434`)
  - `OLLAMA_MODEL` (Default: `gemma4:26b`)

## Project Conventions
- **Data Persistence:** Uses `localStorage` for translation history.
- **Translation Logic:** Paragraph-based segmentation with streaming support, including pause/resume/cancel functionality.
- **PDF Support:** Users can upload PDF files, specify page ranges, and extract text for translation directly in the browser.
- **Architecture:** API routes are located in `app/api/`. Main application logic is in `app/page.tsx`.
