import stripAnsi from 'strip-ansi';
import { describe, it, expect, afterEach } from 'vitest';
import { renderBanner } from '../banner.js';

describe('renderBanner', () => {
  const originalColumns = process.stdout.columns;

  afterEach(() => {
    // Restore original columns
    Object.defineProperty(process.stdout, 'columns', {
      value: originalColumns,
      writable: true,
      configurable: true,
    });
  });

  function setColumns(n: number) {
    Object.defineProperty(process.stdout, 'columns', {
      value: n,
      writable: true,
      configurable: true,
    });
  }

  it('renders multi-line block art for wide terminals', () => {
    setColumns(100);
    const result = renderBanner('0.2.0');
    const plain = stripAnsi(result);
    const lines = plain.split('\n');
    // 6 lines of wordmark, 1 version line
    expect(lines.length).toBe(7);
    expect(plain).toContain('█');
    expect(plain).toContain('███████╗');
  });

  it('uses Mingyi Atlas art for the default brand', () => {
    setColumns(80);
    const result = renderBanner('0.2.0', 'Mingyi Atlas');
    const plain = stripAnsi(result);
    expect(plain).toContain('███╗   ███╗██╗███╗   ██╗');
    expect(plain).toContain('A T L A S');
    expect(plain).not.toContain('█▀▄▀█ ▄▀█ █▀ ▀█▀ █▀█ ▄▀█   █▀▀ █▀█ █▀▄ █▀▀');
  });

  it('includes the version string', () => {
    setColumns(80);
    const result = renderBanner('1.2.3');
    const plain = stripAnsi(result);
    expect(plain).toContain('v1.2.3');
  });

  it('uses short Mingyi art for medium terminals (30-55 cols)', () => {
    setColumns(40);
    const result = renderBanner('0.2.0');
    const plain = stripAnsi(result);
    const lines = plain.split('\n');
    expect(lines.length).toBe(4);
    expect(lines[0]!.length).toBeLessThan(30);
  });

  it('uses medium Mingyi Atlas art when the full logo would overflow', () => {
    setColumns(80);
    const result = renderBanner('0.2.0');
    const plain = stripAnsi(result);
    const lines = plain.split('\n');
    expect(lines.length).toBe(8);
    expect(plain).toContain('A T L A S');
    expect(plain).not.toContain('███████╗');
    expect(Math.max(...lines.map(line => [...line].length))).toBeLessThanOrEqual(80);
  });

  it('falls back to compact single line for narrow terminals', () => {
    setColumns(25);
    const result = renderBanner('0.2.0');
    const plain = stripAnsi(result);
    expect(plain).toContain('Mingyi Atlas');
    expect(plain).toContain('v0.2.0');
    // Should be a single line (no block art)
    expect(plain.split('\n').length).toBe(1);
  });

  it('uses compact format for custom appName', () => {
    setColumns(80);
    const result = renderBanner('1.0.0', 'My Custom App');
    const plain = stripAnsi(result);
    expect(plain).toContain('My Custom App');
    expect(plain).toContain('v1.0.0');
    // Should NOT contain block art characters
    expect(plain).not.toContain('█');
  });

  it('keeps legacy Mastra Code art when explicitly requested', () => {
    setColumns(80);
    const result = renderBanner('1.0.0', 'Mastra Code');
    const plain = stripAnsi(result);
    expect(plain).toContain('█▀▄▀█ ▄▀█ █▀ ▀█▀ █▀█ ▄▀█   █▀▀ █▀█ █▀▄ █▀▀');
    expect(plain).toContain('v1.0.0');
  });
});
