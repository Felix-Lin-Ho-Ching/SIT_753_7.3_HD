const request = require('supertest');
const app = require('../index');

describe('Health check', () => {
  it('GET /healthz -> 200 and ok', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.text).toContain('ok');
  });
});
