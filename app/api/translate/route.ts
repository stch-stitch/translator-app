import { NextResponse } from 'next/server';

const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:26b';

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
    
    console.log(`Attempting to fetch from Ollama: ${baseUrl}/api/generate`);

    const ollamaRes = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        // Add User-Agent to mimic a real browser request, preventing some proxy blocks
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({ 
        model: OLLAMA_MODEL, 
        prompt, 
        stream: true,
        think: think 
      }),
      // Set a reasonable timeout for the connection phase
      signal: AbortSignal.timeout(30000) 
    }).catch(err => {
      console.error('CRITICAL: Fetch to Ollama failed:', err.name, err.message);
      if (err.name === 'TimeoutError') {
        throw new Error(`Connection to Ollama timed out at ${baseUrl}. Is the server awake?`);
      }
      throw new Error(`Network error reaching Ollama: ${err.message}. Check if Funnel is public.`);
    });

    if (!ollamaRes.ok) {
      const errorText = await ollamaRes.text().catch(() => 'No error body');
      console.error('Ollama API Error:', ollamaRes.status, errorText);
      return NextResponse.json(
        { 
          error: `Ollama error (${ollamaRes.status})`, 
          details: errorText,
          url: `${OLLAMA_API_URL}/api/generate`
        },
        { status: 500 }
      );
    }

    if (!ollamaRes.body) {
      throw new Error('Ollama response body is empty');
    }

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
  } catch (error: any) {
    console.error('Translate API Critical Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
