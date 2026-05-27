/**
 * ASCII art banner for the Mingyi Atlas TUI header.
 * Renders "MINGYI ATLAS" or "MINGYI" in block-letter art with a green gradient.
 */
import chalk from 'chalk';

import { theme } from '../theme.js';

// Mastra brand green gradient stops (left → right)
const GRADIENT_STOPS = ['#085314', '#0d8020', '#16c858', '#62f69d', '#a1fac7'];

const DEFAULT_APP_NAME = 'Mingyi Atlas';

// Full "MINGYI ATLAS" banner (52 chars wide)
const FULL_ART = [
  '█▀▄▀█ █ █▄ █ █▀▀ █▄█ █   ▄▀█ ▀█▀ █   ▄▀█ █▀',
  '█ ▀ █ █ █ ▀█ █▄█  █  █   █▀█  █  █   █▀█ ▄█',
  '▀   ▀ ▀ ▀  ▀ ▀ ▀  ▀  ▀   ▀ ▀  ▀  ▀▀▀ ▀ ▀ ▀▀',
];

// Short "MINGYI" banner (25 chars wide)
const SHORT_ART = ['█▀▄▀█ █ █▄ █ █▀▀ █▄█ █', '█ ▀ █ █ █ ▀█ █▄█  █  █', '▀   ▀ ▀ ▀  ▀ ▀ ▀  ▀  ▀'];

/**
 * Interpolate between two hex colors.
 */
function lerpColor(hex1: string, hex2: string, t: number): [number, number, number] {
  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);
  return [Math.round(r1 + (r2 - r1) * t), Math.round(g1 + (g2 - g1) * t), Math.round(b1 + (b2 - b1) * t)];
}

/**
 * Color a single character based on its horizontal position in the gradient.
 */
function gradientChar(ch: string, colIdx: number, totalCols: number): string {
  if (ch === ' ') return ' ';
  const t = totalCols <= 1 ? 0.5 : colIdx / (totalCols - 1);
  const segmentCount = GRADIENT_STOPS.length - 1;
  const segment = Math.min(Math.floor(t * segmentCount), segmentCount - 1);
  const frac = t * segmentCount - segment;
  const [r, g, b] = lerpColor(GRADIENT_STOPS[segment]!, GRADIENT_STOPS[segment + 1]!, frac);
  return chalk.rgb(r, g, b)(ch);
}

/**
 * Apply left-to-right purple gradient to a line of text.
 */
function colorLine(line: string): string {
  const chars = [...line];
  return chars.map((ch, i) => gradientChar(ch, i, chars.length)).join('');
}

/**
 * Render the banner header for the TUI.
 *
 * @param version - App version string (e.g. "0.2.0")
 * @param appName - App name. Block art is only used for "Mingyi Atlas" (default).
 * @returns Styled multi-line string ready for display.
 */
export function renderBanner(version: string, appName?: string): string {
  const name = appName || DEFAULT_APP_NAME;

  // Custom app names get the simple text format (no Mingyi Atlas branding)
  if (name !== DEFAULT_APP_NAME) {
    return theme.fg('accent', '◆') + ' ' + theme.bold(theme.fg('accent', name)) + theme.fg('dim', ` v${version}`);
  }

  const cols = process.stdout.columns || 80;

  // Narrow terminal — compact single line
  if (cols < 30) {
    return (
      theme.fg('accent', '◆') + ' ' + theme.bold(theme.fg('accent', DEFAULT_APP_NAME)) + theme.fg('dim', ` v${version}`)
    );
  }

  // Select art based on available width
  const art = cols >= 58 ? FULL_ART : SHORT_ART;
  const coloredLines = art.map(line => colorLine(line));

  // Append version below the art
  coloredLines.push(theme.fg('dim', `v${version}`));

  return coloredLines.join('\n');
}
