import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { analyzeCaptcha, detectCaptchaTool } from '../detect-captcha.js';

let servers: http.Server[] = [];

async function startServer(handler: http.RequestListener): Promise<{ url: string }> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unexpected server address');
  return { url: `http://127.0.0.1:${address.port}` };
}

afterEach(async () => {
  await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  servers = [];
});

describe('analyzeCaptcha', () => {
  it('detects common CAPTCHA providers and login signals', () => {
    const result = analyzeCaptcha(`
      <form action="/login">
        <input name="username">
        <input type="password" name="password">
        <div class="g-recaptcha" data-sitekey="site-key"></div>
        <script src="https://www.google.com/recaptcha/api.js"></script>
      </form>
    `);

    expect(result.captchaDetected).toBe(true);
    expect(result.confidence).toBe('high');
    expect(result.providers).toContain('recaptcha');
    expect(result.loginSignals).toEqual(expect.arrayContaining(['HTML form element present', 'password input present']));
  });

  it('detects image captcha fields', () => {
    const result = analyzeCaptcha(`
      <form>
        <label for="captcha_code">验证码</label>
        <img id="captcha-img" src="/captcha.php">
        <input id="captcha_code" name="captcha">
        <button type="submit">登录</button>
      </form>
    `, {}, 'https://example.test/login');

    expect(result.captchaDetected).toBe(true);
    expect(result.providers).toContain('image-captcha');
    expect(result.manualEntry.supported).toBe(true);
    expect(result.manualEntry.inputCandidates).toEqual([
      expect.objectContaining({
        selector: '#captcha_code',
        name: 'captcha',
        label: '验证码',
        confidence: 'high',
      }),
    ]);
    expect(result.manualEntry.challengeCandidates).toEqual([
      expect.objectContaining({
        kind: 'image',
        selector: '#captcha-img',
        src: 'https://example.test/captcha.php',
      }),
      expect.objectContaining({ kind: 'text' }),
    ]);
    expect(result.manualEntry.submitCandidates).toEqual([
      expect.objectContaining({
        selector: 'button:nth-of-type(1)',
        text: '登录',
      }),
    ]);
  });

  it('reports provider challenges that require rendered manual interaction', () => {
    const result = analyzeCaptcha(`
      <form id="login">
        <input name="username">
        <input type="password" name="password">
        <div id="turnstile-box" class="cf-turnstile" data-sitekey="site-key"></div>
        <input type="hidden" name="cf-turnstile-response">
      </form>
    `);

    expect(result.captchaDetected).toBe(true);
    expect(result.providers).toContain('turnstile');
    expect(result.manualEntry.challengeCandidates).toEqual([
      expect.objectContaining({
        kind: 'provider-widget',
        selector: '#turnstile-box',
        provider: 'turnstile',
      }),
    ]);
    expect(result.manualEntry.inputCandidates).toEqual([
      expect.objectContaining({
        selector: 'input[name="cf-turnstile-response"]',
        name: 'cf-turnstile-response',
      }),
    ]);
  });
});

describe('detect_captcha tool', () => {
  it('runs a scoped localhost CAPTCHA detection check', async () => {
    const { url } = await startServer((_req, res) => {
      res.end(`
        <form>
          <input type="password" name="password">
          <div class="cf-turnstile"></div>
          <script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>
        </form>
      `);
    });

    const result = await detectCaptchaTool.execute({ url }, {} as any);

    expect(result).toMatchObject({
      success: true,
      captchaDetected: true,
      confidence: 'high',
      manualEntry: expect.objectContaining({
        supported: false,
      }),
    });
    expect(result.providers).toContain('turnstile');
  });

  it('blocks out-of-scope external targets', async () => {
    const result = await detectCaptchaTool.execute({ url: 'https://out-of-scope.example/login' }, {} as any);

    expect(result).toMatchObject({
      success: false,
      error: 'scope_violation',
    });
  });
});
