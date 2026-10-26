import { token } from './session';
import { parseSSE } from './sse';
import { newRequestID } from './workflow';
import type { JobEvent } from './types';
declare global { interface Window { __SDN_CONFIG__?: { apiBase?: string } } }
export class APIError extends Error { constructor(public code: string, message: string, public status: number, public requestId = '') { super(message); } }
function base() { return (window.__SDN_CONFIG__?.apiBase || '/api/v1').replace(/\/$/, ''); }
export async function request<T>(path: string, options: { method?: string; body?: unknown; key?: string; signal?: AbortSignal; bearer?: string } = {}): Promise<T> {
  const headers: Record<string,string> = { Authorization: `Bearer ${options.bearer ?? token()}` };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'; if (options.key) headers['Idempotency-Key'] = options.key;
  const response = await fetch(`${base()}${path}`, { method: options.method || 'GET', headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: options.signal });
  const result = await response.json(); if (!response.ok) throw new APIError(result.code || 'HTTP_ERROR', result.message || `HTTP ${response.status}`, response.status, result.requestId); return result as T;
}
export async function watchJob(id: string, after: string, signal: AbortSignal, emit: (event: JobEvent) => void) {
  const response = await fetch(`${base()}/jobs/${encodeURIComponent(id)}/events?afterSequence=${after}`, { headers: { Authorization: `Bearer ${token()}` }, signal });
  if (!response.ok) { const e = await response.json(); throw new APIError(e.code, e.message, response.status); } if (!response.body) throw new Error('浏览器不支持流式响应');
  const reader = response.body.getReader();
  try { const decoder = new TextDecoder(); const parser = parseSSE((e) => { if (e.event === 'stream-error') { const value = JSON.parse(e.data); throw new Error(value.message); } if (e.event === 'job') emit(JSON.parse(e.data) as JobEvent); }); while (true) { const { done, value } = await reader.read(); if (done) { parser.push(decoder.decode()); break; } parser.push(decoder.decode(value, { stream: true })); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);
export const uid = newRequestID;
export const terminal = (s: string) => ['SUCCEEDED','FAILED','PARTIAL','ROLLED_BACK','COMPENSATION_FAILED'].includes(s);
export const date = (ms: string) => ms && ms !== '0' ? new Date(Number(ms)).toLocaleString('zh-CN') : '—';
