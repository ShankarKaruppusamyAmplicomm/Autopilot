import type { MiddlewareHandler } from 'hono';

// SHA-256 of admin password — never store the plain text
const ADMIN_HASH = 'af76b3db969e180b4a6dc1db5662f956e0407b9e3272c554f3d7038a3d4f800c';

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export const corsMiddleware: MiddlewareHandler = async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password, X-Actor');
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  await next();
};

export const adminAuth: MiddlewareHandler = async (c, next) => {
  const pw = c.req.header('X-Admin-Password') ?? '';
  if (!pw) return c.json({ error: 'Admin password required' }, 401);
  const hash = await sha256(pw);
  if (hash !== ADMIN_HASH) return c.json({ error: 'Incorrect password' }, 403);
  await next();
};
