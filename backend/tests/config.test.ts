import { it, expect, vi, afterEach } from 'vitest';
import { resolveDatabaseUrl } from '../src/core/config.ts';

const parts = { POSTGRES_USER: 'user', POSTGRES_PASSWORD: 'pass', POSTGRES_HOST: 'db', DB_PORT: '5433', POSTGRES_DB: 'taskly' };

function stubParts(values: Record<string, string> = parts) {
  vi.stubEnv('DATABASE_URL', '');
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
}

afterEach(() => vi.unstubAllEnvs());

it('prefers the override over DATABASE_URL', () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://env/db');
  expect(resolveDatabaseUrl('postgresql://override/db')).toBe('postgresql://override/db');
});

it('uses DATABASE_URL without an override', () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://env/db');
  expect(resolveDatabaseUrl()).toBe('postgresql://env/db');
});

it('rewrites the postgresql+psycopg scheme', () => {
  vi.stubEnv('DATABASE_URL', 'postgresql+psycopg://u:p@h:5432/d');
  expect(resolveDatabaseUrl()).toBe('postgresql://u:p@h:5432/d');
});

it.each(Object.keys(parts))('throws naming the missing variable %s', (name) => {
  stubParts({ ...parts, [name]: '' });
  expect(() => resolveDatabaseUrl()).toThrow(`Missing environment variable: ${name}`);
});

it('builds the URL from POSTGRES_* parts with encoding', () => {
  stubParts({ ...parts, POSTGRES_PASSWORD: 'p@ss/word', POSTGRES_DB: 'my db' });
  expect(resolveDatabaseUrl()).toBe('postgresql://user:p%40ss%2Fword@db:5433/my%20db');
});
