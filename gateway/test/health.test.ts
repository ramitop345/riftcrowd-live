import { afterAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

const app = buildApp({ logger: false });

describe('GET /health', () => {
  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with the expected shape', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(body.provider).toBe('mock');
    expect(typeof body.version).toBe('string');
    expect(typeof body.timestamp).toBe('string');
    // The timestamp must be a parseable ISO date, not just any string.
    expect(Number.isNaN(Date.parse(body.timestamp as string))).toBe(false);
  });
});
