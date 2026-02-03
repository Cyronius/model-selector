import type { Config, ModelConfig } from '../../types.js';

const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `Request failed: ${response.status}`);
  }

  return response.json();
}

export async function fetchConfig(): Promise<Config> {
  return request<Config>('/config');
}

export async function addModel(name: string, config: ModelConfig): Promise<void> {
  await request('/models', {
    method: 'POST',
    body: JSON.stringify({ name, config }),
  });
}

export async function updateModel(name: string, config: Partial<ModelConfig>): Promise<void> {
  await request(`/models/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    body: JSON.stringify(config),
  });
}

export async function removeModel(name: string): Promise<void> {
  await request(`/models/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}

export async function setModelEnabled(name: string, enabled: boolean): Promise<void> {
  await request(`/models/${encodeURIComponent(name)}/enabled`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

export async function setAlias(name: string, query: string): Promise<void> {
  await request('/aliases', {
    method: 'POST',
    body: JSON.stringify({ name, query }),
  });
}

export async function removeAlias(name: string): Promise<void> {
  await request(`/aliases/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}
