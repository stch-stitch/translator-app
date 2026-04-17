import { fetch as undiciFetch, Agent } from 'undici';

const OLLAMA_API_URL = process.env.OLLAMA_API_URL ?? 'http://localhost:11434';
const tlsDispatcher = new Agent({ connect: { rejectUnauthorized: false } });

export async function GET(): Promise<Response> {
  try {
    const baseUrl = OLLAMA_API_URL.endsWith('/') ? OLLAMA_API_URL.slice(0, -1) : OLLAMA_API_URL;
    const res = await undiciFetch(`${baseUrl}/api/tags`, { dispatcher: tlsDispatcher });
    return Response.json({ ok: res.ok });
  } catch {
    return Response.json({ ok: false });
  }
}
