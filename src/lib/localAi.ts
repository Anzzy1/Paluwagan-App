/**
 * Local AI through Ollama, for when there's no internet (or no account).
 *
 * Talks straight to the Ollama server from the app. Default: the same computer
 * (http://localhost:11434) with qwen2.5:3b. A phone can point to the computer's
 * Wi-Fi address instead (Settings → Local AI) when Ollama listens on the network.
 */
import { useSyncExternalStore } from 'react';

import { kv } from '@/lib/storage';

export type LocalAiConfig = { url: string; model: string };
export const LOCAL_AI_DEFAULT: LocalAiConfig = { url: 'http://localhost:11434', model: 'qwen2.5:3b' };

const KEY = 'local-ai-v1';
const TIMEOUT_MS = 180_000; // small models on a laptop CPU can take a while

let config: LocalAiConfig = (() => {
  try {
    return { ...LOCAL_AI_DEFAULT, ...(JSON.parse(kv.get(KEY) ?? '{}') as Partial<LocalAiConfig>) };
  } catch {
    return LOCAL_AI_DEFAULT;
  }
})();
const listeners = new Set<() => void>();

export function setLocalAiConfig(next: Partial<LocalAiConfig>) {
  config = { url: (next.url ?? config.url).trim().replace(/\/+$/, '') || LOCAL_AI_DEFAULT.url, model: (next.model ?? config.model).trim() || LOCAL_AI_DEFAULT.model };
  kv.set(KEY, JSON.stringify(config));
  listeners.forEach((l) => l());
}

export function useLocalAiConfig(): LocalAiConfig {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => config,
    () => config,
  );
}

export type OllamaMessage = { role: 'system' | 'user' | 'assistant'; content: string };

function unreachable(url: string) {
  return new Error(
    `Can’t reach the local AI at ${url}. Make sure Ollama is running on that computer. On a phone or the web app, set Settings → Local AI to the computer’s address and allow it in Ollama (OLLAMA_HOST and OLLAMA_ORIGINS).`,
  );
}

/** One chat turn with Ollama. `format` can be a JSON schema to get structured output. */
export async function ollamaChat(messages: OllamaMessage[], opts: { format?: Record<string, unknown> } = {}): Promise<string> {
  const { url, model } = config;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false, format: opts.format, options: { temperature: 0.4 } }),
      signal: ctrl.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw new Error('The local AI took too long to answer. Try a shorter question.');
    throw unreachable(url);
  } finally {
    clearTimeout(t);
  }
  if (res.status === 403) throw unreachable(url);
  const body = (await res.json().catch(() => null)) as { message?: { content?: string }; error?: string } | null;
  if (!res.ok) {
    if (body?.error && /not found|pull/i.test(body.error)) throw new Error(`The model “${model}” isn’t downloaded. On that computer, run: ollama pull ${model}`);
    throw new Error(body?.error ? `Local AI error: ${body.error}` : `Local AI error (${res.status}).`);
  }
  return (body?.message?.content ?? '').trim();
}

/** Quick check for Settings: is Ollama there, and is the model downloaded? */
export async function testLocalAi(): Promise<string> {
  const { url, model } = config;
  let res: Response;
  try {
    res = await fetch(`${url}/api/tags`);
  } catch {
    throw unreachable(url);
  }
  if (!res.ok) throw unreachable(url);
  const tags = (await res.json().catch(() => ({}))) as { models?: { name: string }[] };
  const names = (tags.models ?? []).map((m) => m.name);
  if (!names.some((n) => n === model || n === `${model}:latest`)) {
    throw new Error(`Ollama is running, but “${model}” isn’t downloaded. Run: ollama pull ${model}${names.length ? `\nAvailable: ${names.join(', ')}` : ''}`);
  }
  return `Connected to Ollama. ${model} is ready.`;
}
