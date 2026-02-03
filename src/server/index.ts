import http from 'node:http';
import { loadConfig } from '../config/loader.js';
import {
  addModel,
  updateModel,
  removeModel,
  setModelEnabled,
  setAlias,
  removeAlias,
} from '../config/writer.js';

const PORT = process.env['PORT'] ?? 3001;

type RouteHandler = (req: http.IncomingMessage, res: http.ServerResponse, params: Record<string, string>) => Promise<void>;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

const routes: Route[] = [];

function route(method: string, path: string, handler: RouteHandler) {
  // Convert /models/:name to regex with named capture
  const paramNames: string[] = [];
  const pattern = path.replace(/:([^/]+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  routes.push({
    method,
    pattern: new RegExp(`^${pattern}$`),
    paramNames,
    handler,
  });
}

function matchRoute(method: string, path: string): { handler: RouteHandler; params: Record<string, string> } | null {
  for (const r of routes) {
    if (r.method !== method) continue;
    const match = path.match(r.pattern);
    if (match) {
      const params: Record<string, string> = {};
      r.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1]!);
      });
      return { handler: r.handler, params };
    }
  }
  return null;
}

async function parseBody<T>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString();
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function json(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function error(res: http.ServerResponse, message: string, status = 400) {
  json(res, { message }, status);
}

// Routes
route('GET', '/api/config', async (_req, res) => {
  try {
    const config = loadConfig();
    json(res, config);
  } catch (e) {
    error(res, e instanceof Error ? e.message : 'Failed to load config', 500);
  }
});

route('POST', '/api/models', async (req, res) => {
  const { name, config } = await parseBody<{ name: string; config: unknown }>(req);
  if (!name || !config) {
    return error(res, 'Missing name or config');
  }
  const result = await addModel(name, config as any);
  if (!result.success) {
    return error(res, result.error?.message ?? 'Failed to add model');
  }
  json(res, { success: true });
});

route('PATCH', '/api/models/:name', async (req, res, params) => {
  const config = await parseBody<unknown>(req);
  const result = await updateModel(params['name']!, config as any);
  if (!result.success) {
    return error(res, result.error?.message ?? 'Failed to update model');
  }
  json(res, { success: true });
});

route('DELETE', '/api/models/:name', async (_req, res, params) => {
  const result = await removeModel(params['name']!);
  if (!result.success) {
    return error(res, result.error?.message ?? 'Failed to remove model');
  }
  json(res, { success: true });
});

route('PATCH', '/api/models/:name/enabled', async (req, res, params) => {
  const { enabled } = await parseBody<{ enabled: boolean }>(req);
  if (typeof enabled !== 'boolean') {
    return error(res, 'Missing or invalid enabled value');
  }
  const result = await setModelEnabled(params['name']!, enabled);
  if (!result.success) {
    return error(res, result.error?.message ?? 'Failed to update model');
  }
  json(res, { success: true });
});

route('POST', '/api/aliases', async (req, res) => {
  const { name, query } = await parseBody<{ name: string; query: string }>(req);
  if (!name || !query) {
    return error(res, 'Missing name or query');
  }
  const result = await setAlias(name, query);
  if (!result.success) {
    return error(res, result.error?.message ?? 'Failed to set alias');
  }
  json(res, { success: true });
});

route('DELETE', '/api/aliases/:name', async (_req, res, params) => {
  const result = await removeAlias(params['name']!);
  if (!result.success) {
    return error(res, result.error?.message ?? 'Failed to remove alias');
  }
  json(res, { success: true });
});

// Server
const server = http.createServer(async (req, res) => {
  // CORS headers for development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method ?? 'GET';

  const matched = matchRoute(method, path);
  if (!matched) {
    return error(res, 'Not found', 404);
  }

  try {
    await matched.handler(req, res, matched.params);
  } catch (e) {
    console.error('Request error:', e);
    error(res, e instanceof Error ? e.message : 'Internal server error', 500);
  }
});

server.listen(PORT, () => {
  console.log(`Model Selector API server running at http://localhost:${PORT}`);
});
