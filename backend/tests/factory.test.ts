import request from 'supertest';
import { it, expect, vi, afterEach } from 'vitest';
import type { Database } from '../src/features/todos/types.ts';
import { createApp } from '../src/factory.ts';

vi.mock('../src/api/health.ts', async () => {
  const { Router } = await import('express');
  return {
    createHealthRouter: () => {
      const router = Router();
      router.get('/health', (req, res, next) => {
        res.write('partial');
        next(new Error('late failure'));
      });
      return router;
    },
  };
});

function setup(todo: Record<string, unknown> = {}) {
  return createApp({ todo: { findMany: vi.fn().mockResolvedValue([]), ...todo } } as unknown as Database);
}

afterEach(() => vi.restoreAllMocks());

it('returns 404 JSON for unknown routes', async () => {
  const response = await request(setup()).get('/api/unknown');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Not Found' });
});

it('maps malformed JSON to 422', async () => {
  const response = await request(setup()).post('/api/todos').set('Content-Type', 'application/json').send('{"title":');
  expect(response.status).toBe(422);
  expect(response.body).toEqual({ detail: 'Invalid JSON.' });
});

it('maps an oversized body to 413', async () => {
  const response = await request(setup()).post('/api/todos').send({ title: 'x'.repeat(200_000) });
  expect(response.status).toBe(413);
  expect(response.body).toEqual({ detail: 'Request body too large.' });
});

it('serves the OpenAPI specification without x-powered-by', async () => {
  const response = await request(setup()).get('/openapi.json');
  expect(response.status).toBe(200);
  expect(response.body).toHaveProperty('openapi');
  expect(response.headers).not.toHaveProperty('x-powered-by');
});

it('passes errors through without appending a JSON 500 once headers are sent', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  const server = setup().listen(0);
  try {
    const { port } = server.address() as { port: number };
    const body = await fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.text()).catch(() => 'aborted');
    expect(body).not.toContain('Internal Server Error');
  } finally {
    server.close();
  }
  expect(logged).not.toHaveBeenCalled();
});

it('maps unexpected errors to a generic 500 and logs them', async () => {
  const failure = new Error('db down');
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = await request(setup({ findMany: vi.fn().mockRejectedValue(failure) })).get('/api/todos');
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ detail: 'Internal Server Error' });
  expect(logged).toHaveBeenCalledWith(failure);
});
