import { NextResponse } from 'next/server';
import axios from 'axios';

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
    
    console.log(`Axios attempting connection to: ${baseUrl}/api/generate`);

    const response = await axios({
      method: 'post',
      url: `${baseUrl}/api/generate`,
      data: { 
        model: OLLAMA_MODEL, 
        prompt, 
        stream: true,
        think: think 
      },
      responseType: 'stream',
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/json'
      }
    }).catch(err => {
      console.error('Axios Error Details:', {
        message: err.message,
        code: err.code,
        cause: err.cause?.message || 'Unknown cause'
      });
      
      throw new Error(`Connection error: ${err.message}. Code: ${err.code || 'N/A'}. ${err.cause?.message || ''}`);
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        response.data.on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const json = JSON.parse(line);
              if (json.response) {
                controller.enqueue(encoder.encode(json.response));
              }
            } catch { /* ignore partial JSON */ }
          }
        });
        response.data.on('end', () => controller.close());
        response.data.on('error', (err: Error) => controller.error(err));
      }
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (error: any) {
    console.error('Translate API Critical Error:', error);
    return NextResponse.json(
      { 
        error: error.message || 'Internal Server Error',
        details: 'Check Vercel logs for more info.' 
      },
      { status: 500 }
    );
  }
}
