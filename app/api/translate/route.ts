import { NextResponse } from 'next/server';
import { Agent } from 'undici';

const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:26b';

const tlsDispatcher = new Agent({ connect: { rejectUnauthorized: false } });

export async function POST(req: Request): Promise<Response> {
  try {
    const secret = process.env.APP_SECRET;
    if (secret) {
      const auth = req.headers.get('Authorization');
      const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
      if (token !== secret) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const { text, instructions, think = false } = await req.json();

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

    const baseUrl = OLLAMA_API_URL.endsWith('/') ? OLLAMA_API_URL.slice(0, -1) : OLLAMA_API_URL;
    const ollamaUrl = `${baseUrl}/api/generate`;

    console.log(`Connecting to: ${ollamaUrl}`);

    const ollamaResponse = await fetch(ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: true, think }),
      // @ts-expect-error -- undici dispatcher: TLS bypass for self-signed certs (ngrok/Funnel)
      dispatcher: tlsDispatcher,
    }).catch((err: Error) => {
      console.error('Fetch error:', { message: err.message, cause: (err as NodeJS.ErrnoException).code });
      throw new Error(`Connection error: ${err.message}`);
    });

    if (!ollamaResponse.ok || !ollamaResponse.body) {
      throw new Error(`Ollama responded with status ${ollamaResponse.status}`);
    }

    const encoder = new TextEncoder();
    const stream = ollamaResponse.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          const lines = new TextDecoder().decode(chunk).split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const json = JSON.parse(line) as { response?: string };
              if (json.response) {
                controller.enqueue(encoder.encode(json.response));
              }
            } catch { /* ignore partial JSON */ }
          }
        },
      })
    );

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('Translate API error:', message);
    return NextResponse.json(
      { error: message, details: 'Check Vercel logs for more info.' },
      { status: 500 }
    );
  }
}
