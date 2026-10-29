import { EventEmitter } from 'node:events';
import express from 'express';
import { it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createDatabase, initialize } from '../src/core/database.ts';
import { createApp } from '../src/factory.ts';
import { start } from '../src/core/lifespan.ts';

vi.mock('../src/core/database.ts');
vi.mock('../src/factory.ts');

const database = { $connect: vi.fn(), $disconnect: vi.fn() };

beforeEach(() => {
  vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/test');
  vi.stubEnv('API_PORT', '0');
  vi.mocked(createDatabase).mockReturnValue(database as never);
  vi.mocked(initialize).mockResolvedValue(undefined);
  vi.mocked(createApp).mockReturnValue(express() as never);
  database.$connect.mockReset().mockResolvedValue(undefined);
  database.$disconnect.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

function captureHandlers() {
  const handlers: Record<string, () => void> = {};
  vi.spyOn(process, 'once').mockImplementation(((event: string, handler: () => void) => {
    handlers[event] = handler;
    return process;
  }) as never);
  return handlers;
}

it('disconnects and rethrows when connect fails', async () => {
  const failure = new Error('connect failed');
  database.$connect.mockRejectedValue(failure);
  await expect(start()).rejects.toBe(failure);
  expect(database.$disconnect).toHaveBeenCalledOnce();
  expect(initialize).not.toHaveBeenCalled();
});

it('disconnects and rethrows when initialize fails', async () => {
  const failure = new Error('init failed');
  vi.mocked(initialize).mockRejectedValue(failure);
  await expect(start()).rejects.toBe(failure);
  expect(database.$disconnect).toHaveBeenCalledOnce();
});

it('disconnects and rethrows when listen fails', async () => {
  const failure = new Error('EADDRINUSE');
  const listener = new EventEmitter();
  vi.mocked(createApp).mockReturnValue({ listen: () => { queueMicrotask(() => listener.emit('error', failure)); return listener; } } as never);
  await expect(start()).rejects.toBe(failure);
  expect(database.$disconnect).toHaveBeenCalledOnce();
});

it.each(['SIGTERM', 'SIGINT'])('closes the server and then disconnects on %s', async (signal) => {
  const handlers = captureHandlers();
  const { server } = await start();
  expect(server.listening).toBe(true);
  expect(database.$disconnect).not.toHaveBeenCalled();
  handlers[signal]();
  await vi.waitFor(() => expect(database.$disconnect).toHaveBeenCalledOnce());
  expect(server.listening).toBe(false);
});

function fakeApp(close: (callback: () => void) => void = () => {}) {
  const listener = Object.assign(new EventEmitter(), { address: () => ({ port: 8000 }), close: vi.fn(close) });
  const listen = vi.fn((port: number, host: string, callback: () => void) => { queueMicrotask(callback); return listener; });
  vi.mocked(createApp).mockReturnValue({ listen } as never);
  return { listen, listener };
}

it('listens on port 8000 when API_PORT is unset', async () => {
  vi.stubEnv('API_PORT', '');
  const { listen } = fakeApp();
  await start();
  expect(listen).toHaveBeenCalledWith(8000, '0.0.0.0', expect.any(Function));
});

it('forces exit with code 1 when the server never finishes closing', async () => {
  vi.useFakeTimers();
  try {
    const handlers = captureHandlers();
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    fakeApp();
    await start();
    handlers.SIGTERM();
    await vi.advanceTimersByTimeAsync(9999);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledWith(1);
  } finally {
    vi.useRealTimers();
  }
});

it('cancels the forced exit after a clean close', async () => {
  vi.useFakeTimers();
  try {
    const handlers = captureHandlers();
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    fakeApp((callback) => callback());
    await start();
    handlers.SIGTERM();
    await vi.advanceTimersByTimeAsync(0);
    expect(database.$disconnect).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10000);
    expect(exit).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

it('sets exitCode to 1 when disconnect fails during shutdown', async () => {
  const handlers = captureHandlers();
  const failure = new Error('disconnect failed');
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  await start();
  database.$disconnect.mockRejectedValue(failure);
  handlers.SIGTERM();
  await vi.waitFor(() => expect(logged).toHaveBeenCalledWith(failure));
  expect(process.exitCode).toBe(1);
});
