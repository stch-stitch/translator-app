import { NextResponse } from 'next/server';

const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:26b';

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.APP_SECRET;
  if (secret) {
    const auth = req.headers.get('Authorization');
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (token !== secret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { text, instructions } = await req.json();

  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'Text is required' }, { status: 400 });
  }

  const customGuidelines =
    instructions && typeof instructions === 'string' && instructions.trim()
      ? `\nAdditional instructions from the user:\n${instructions.trim()}\n`
      : '';

  const prompt = `You are a professional translator.
Translate the following English text into natural, fluent Korean.
Maintain the original tone and technical context.
Only output the translated text, without any explanations or extra comments.
${customGuidelines}
English Text:
${text}

Korean Translation:`;

  const ollamaRes = await fetch(`${OLLAMA_API_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: true, think: false }),
  });

  if (!ollamaRes.ok || !ollamaRes.body) {
    return NextResponse.json(
      { error: 'Failed to communicate with Ollama. Make sure Ollama is running.' },
      { status: 500 }
    );
  }

  // Forward Ollama's NDJSON stream, extracting only the `response` token text
  const encoder = new TextEncoder();
  const ollamaReader = ollamaRes.body.getReader();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
        const { done, value } = await ollamaReader.read();
        if (done) {
          controller.close();
          return;
        }

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line) as { response?: string; done?: boolean };
            if (json.response) {
              controller.enqueue(encoder.encode(json.response));
            }
          } catch {
            // ignore malformed lines
          }
        }
      }
    },
    cancel() {
      ollamaReader.cancel();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
