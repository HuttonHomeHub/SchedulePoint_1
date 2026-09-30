import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';

import { toNodeHandler } from 'better-auth/node';
import express, { type ErrorRequestHandler } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { boundAuthBody } from './app-setup';
import { DEFAULT_JSON_LIMIT_BYTES } from './common/http/body-limits';

/**
 * The 64 KB cap on `/api/auth/*` (TECH_DEBT #416), against better-call's REAL node adapter — the
 * code that had no limit — with a stand-in for Better Auth's handler that records what it read.
 * The database-backed proof through the real Better Auth is `test/auth-body-cap.e2e-spec.ts`.
 */
const OVER = DEFAULT_JSON_LIMIT_BYTES + 1;

describe('boundAuthBody', () => {
  let server: Server;
  let port: number;
  const reached: string[] = [];
  let lastError: { type?: unknown } | undefined;

  beforeAll(async () => {
    const app = express();
    app.all(
      /^\/api\/auth(?:\/|$)/,
      boundAuthBody,
      toNodeHandler(async (req: Request) => {
        const body = req.method === 'GET' || req.method === 'HEAD' ? '' : await req.text();
        reached.push(body);
        return new Response(JSON.stringify({ length: body.length }), {
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
    const failure: ErrorRequestHandler = (error, _req, res, _next) => {
      lastError = error as { type?: unknown };
      res.status((error as { status?: number }).status ?? 500).end();
    };
    app.use(failure);
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  function chunked(
    payload: string | Buffer,
    chunks: number,
    headers: Record<string, string> = {},
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      // No Content-Length, so Node frames the body with `Transfer-Encoding: chunked`.
      const req = httpRequest(
        {
          port,
          method: 'POST',
          path: '/api/auth/sign-up/email',
          headers: { 'Content-Type': 'application/json', ...headers },
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode ?? 0));
        },
      );
      req.on('error', reject);
      const size = Math.ceil(payload.length / chunks);
      for (let i = 0; i < payload.length; i += size) req.write(payload.slice(i, i + size));
      req.end();
    });
  }

  it('refuses a declared Content-Length over the cap with 413, before Better Auth reads a byte', async () => {
    reached.length = 0;
    await request(server)
      .post('/api/auth/sign-up/email')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ name: 'x'.repeat(OVER) }))
      .expect(413);
    expect(lastError?.type).toBe('entity.too.large');
    expect(reached).toHaveLength(0);
  });

  it('refuses a chunked body with no Content-Length once it passes the cap', async () => {
    reached.length = 0;
    const status = await chunked(JSON.stringify({ name: 'x'.repeat(OVER * 4) }), 8);
    expect(status).toBe(413);
    expect(lastError?.type).toBe('entity.too.large');
    expect(reached).toHaveLength(0);
  });

  it('accepts a declared Content-Length of exactly the cap and refuses one byte more', async () => {
    reached.length = 0;
    const atCap = 'x'.repeat(DEFAULT_JSON_LIMIT_BYTES);
    await request(server)
      .post('/api/auth/sign-in/email')
      .set('Content-Type', 'application/json')
      .set('Content-Length', String(DEFAULT_JSON_LIMIT_BYTES))
      .send(atCap)
      .expect(200);
    expect(reached).toEqual([atCap]);

    reached.length = 0;
    await request(server)
      .post('/api/auth/sign-in/email')
      .set('Content-Type', 'application/json')
      .set('Content-Length', String(OVER))
      .send('x'.repeat(OVER))
      .expect(413);
    expect(reached).toHaveLength(0);
  });

  it('bounds a chunked gzip body by its DECODED size', async () => {
    reached.length = 0;
    const small = JSON.stringify({ name: 'Zoë' });
    expect(await chunked(gzipSync(small), 2, { 'Content-Encoding': 'gzip' })).toBe(200);
    expect(reached).toEqual([small]);

    // Compresses to a few hundred bytes, so only a cap on the inflated stream refuses it.
    reached.length = 0;
    const bomb = gzipSync(JSON.stringify({ name: 'x'.repeat(OVER * 4) }));
    expect(bomb.length).toBeLessThan(DEFAULT_JSON_LIMIT_BYTES);
    expect(await chunked(bomb, 2, { 'Content-Encoding': 'gzip' })).toBe(413);
    expect(lastError?.type).toBe('entity.too.large');
    expect(reached).toHaveLength(0);
  });

  it('refuses a chunked body in a charset it cannot decode with 415, not by guessing', async () => {
    reached.length = 0;
    const status = await chunked('{}', 1, { 'Content-Type': 'application/json; charset=nonsense' });
    expect(status).toBe(415);
    expect(reached).toHaveLength(0);
  });

  it('passes a small chunked body through verbatim as a string', async () => {
    reached.length = 0;
    const payload = JSON.stringify({ name: 'Zoë', email: 'a@example.com' });
    expect(await chunked(payload, 3)).toBe(200);
    expect(reached).toEqual([payload]);
  });

  it('leaves a body within the cap on the raw stream, byte for byte', async () => {
    reached.length = 0;
    const payload = JSON.stringify({ name: 'x'.repeat(DEFAULT_JSON_LIMIT_BYTES - 64) });
    await request(server)
      .post('/api/auth/sign-in/email')
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(200);
    expect(reached).toEqual([payload]);
  });

  it('does not touch a body-less POST or a GET', async () => {
    reached.length = 0;
    await request(server).post('/api/auth/sign-out').expect(200);
    await request(server).get('/api/auth/get-session').expect(200);
    expect(reached).toEqual(['', '']);
  });

  it('passes a malformed JSON body to Better Auth untouched, as before', async () => {
    reached.length = 0;
    await request(server)
      .post('/api/auth/sign-in/email')
      .set('Content-Type', 'application/json')
      .send('{"a":')
      .expect(200);
    expect(reached).toEqual(['{"a":']);
  });
});
