import { NextRequest } from 'next/server';
import { fetch as undiciFetch, Agent } from 'undici';
import type { ParsedSegment } from '@/types/translator';

const OLLAMA_API_URL = process.env.OLLAMA_API_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'gemma4:26b';
const tlsDispatcher = new Agent({ connect: { rejectUnauthorized: false } });

const PARSE_PROMPT = `You are a document structure analyzer. Analyze the following extracted PDF text and reorganize it into clean titles and paragraphs.

Rules:
1. Short headings and section titles → type "title"
2. Body text content blocks → type "paragraph"
3. Fix hyphenated word breaks (e.g., "ex-amined" → "examined")
4. Remove standalone page numbers and running headers/footers
5. Merge sentences split across line boundaries into single clean paragraphs
6. Return ONLY a valid JSON array. No markdown, no explanation, no code fences.

Output format (JSON array only):
[{"type":"title","text":"..."},{"type":"paragraph","text":"..."}]

Text to analyze:
`;

interface OllamaGenerateResponse {
  response: string;
  done: boolean;
}

interface RawSegment {
  type: unknown;
  text: unknown;
}

export async function POST(req: NextRequest): Promise<Response> {
  const appSecret = process.env.APP_SECRET;
  if (appSecret) {
    const auth = req.headers.get('Authorization');
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (token !== appSecret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const body = await req.json() as { text?: unknown };
  if (typeof body.text !== 'string' || !body.text.trim()) {
    return Response.json({ error: 'text is required' }, { status: 400 });
  }

  try {
    const baseUrl = OLLAMA_API_URL.endsWith('/') ? OLLAMA_API_URL.slice(0, -1) : OLLAMA_API_URL;
    const res = await undiciFetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: PARSE_PROMPT + body.text,
        stream: false,
      }),
      dispatcher: tlsDispatcher,
    });

    if (!res.ok) {
      return Response.json({ error: `Ollama error: ${res.status}` }, { status: 502 });
    }

    const data = await res.json() as OllamaGenerateResponse;
    const raw = data.response?.trim() ?? '';

    // JSON array extraction — handles cases where model wraps in markdown fences
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) {
      return Response.json({ error: 'Model returned no JSON array' }, { status: 502 });
    }

    const parsed = JSON.parse(match[0]) as RawSegment[];
    const segments: ParsedSegment[] = parsed
      .filter(s => (s.type === 'title' || s.type === 'paragraph') && typeof s.text === 'string' && (s.text as string).trim())
      .map((s, i) => ({
        id: i,
        type: s.type as 'title' | 'paragraph',
        text: (s.text as string).trim(),
      }));

    return Response.json({ segments });
  } catch (err: unknown) {
    return Response.json(
      { error: 'Parse failed', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
