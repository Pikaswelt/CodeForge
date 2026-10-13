import { CapacitorHttp } from '@capacitor/core';
import { isNativeApp } from './native';
import type { ApiProviderConfig } from './types';

// Same requests as the desktop's apichat:send / apichat:models. On the phone they go through
// Capacitor's native HTTP client, so provider APIs work without browser CORS rules.

function baseUrl(provider: ApiProviderConfig) {
  const fallback = provider.provider === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1';
  return String(provider.baseUrl || fallback).trim().replace(/\/+$/, '');
}

function headers(provider: ApiProviderConfig): Record<string, string> {
  return provider.provider === 'anthropic'
    ? { 'content-type': 'application/json', 'x-api-key': provider.apiKey || '', 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }
    : { 'content-type': 'application/json', ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}) };
}

async function request(url: string, method: 'GET' | 'POST', provider: ApiProviderConfig, body?: unknown) {
  if (isNativeApp) {
    const response = await CapacitorHttp.request({ url, method, headers: headers(provider), data: body, connectTimeout: 20000, readTimeout: 240000 });
    let data = response.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        // Plain-text error page.
      }
    }
    return { status: response.status, data };
  }
  const response = await fetch(url, { method, headers: headers(provider), body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    // Keep the text.
  }
  return { status: response.status, data };
}

function apiError(status: number, data: any) {
  const message = typeof data === 'string' ? data : data?.error?.message || data?.message || JSON.stringify(data);
  return new Error(`API-Fehler ${status}: ${String(message).slice(0, 400)}`);
}

export async function sendChat(provider: ApiProviderConfig, model: string, system: string, messages: { role: 'user' | 'assistant'; content: string }[]) {
  if (!model) throw new Error('Kein Modell angegeben.');
  const history = messages.filter((item) => item.content).map((item) => ({ role: item.role, content: item.content }));
  const base = baseUrl(provider);
  if (provider.provider === 'anthropic') {
    const { status, data } = await request(`${base}/messages`, 'POST', provider, { model, max_tokens: 8192, ...(system ? { system } : {}), messages: history });
    if (status < 200 || status >= 300) throw apiError(status, data);
    const result = data as any;
    return {
      text: (result.content || []).filter((part: any) => part.type === 'text').map((part: any) => part.text).join('\n'),
      tokens: (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0),
    };
  }
  const { status, data } = await request(`${base}/chat/completions`, 'POST', provider, { model, messages: [...(system ? [{ role: 'system', content: system }] : []), ...history] });
  if (status < 200 || status >= 300) throw apiError(status, data);
  const result = data as any;
  return { text: result.choices?.[0]?.message?.content || '', tokens: result.usage?.total_tokens || 0 };
}

export async function listModels(provider: ApiProviderConfig) {
  const { status, data } = await request(`${baseUrl(provider)}/models`, 'GET', provider);
  if (status < 200 || status >= 300) throw apiError(status, data);
  const result = data as any;
  return ((result.data || result.models || []) as any[]).map((item) => item.id || item.name).filter(Boolean).sort() as string[];
}
