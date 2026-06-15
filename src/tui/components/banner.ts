/**
 * ASCII art banner for the TUI header.
 * Renders the Mingyi Atlas brand with responsive terminal art.
 */
import chalk from 'chalk';

import { theme } from '../theme.js';

const DEFAULT_APP_NAME = 'Mingyi Atlas';

// Brand gradient stops (left to right). The wider palette gives the banner a
// sharper red-team / cyber map feel while staying readable on dark terminals.
const GRADIENT_STOPS = ['#0b2f1d', '#11a63f', '#39ff88', '#22d3ee', '#7c3aed'];

// Full "MINGYI ATLAS" banner for wide terminals.
const FULL_ART = [
  '███╗   ███╗██╗███╗   ██╗ ██████╗ ██╗   ██╗██╗     █████╗ ████████╗██╗      █████╗ ███████╗',
  '████╗ ████║██║████╗  ██║██╔════╝ ╚██╗ ██╔╝██║    ██╔══██╗╚══██╔══╝██║     ██╔══██╗██╔════╝',
  '██╔████╔██║██║██╔██╗ ██║██║  ███╗ ╚████╔╝ ██║    ███████║   ██║   ██║     ███████║███████╗',
  '██║╚██╔╝██║██║██║╚██╗██║██║   ██║  ╚██╔╝  ██║    ██╔══██║   ██║   ██║     ██╔══██║╚════██║',
  '██║ ╚═╝ ██║██║██║ ╚████║╚██████╔╝   ██║   ██║    ██║  ██║   ██║   ███████╗██║  ██║███████║',
  '╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝    ╚═╝   ╚═╝    ╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚══════╝',
];

// Medium "MINGYI ATLAS" banner.
const MEDIUM_ART = [
  '███╗   ███╗██╗███╗   ██╗ ██████╗ ██╗   ██╗',
  '████╗ ████║██║████╗  ██║██╔════╝ ╚██╗ ██╔╝',
  '██╔████╔██║██║██╔██╗ ██║██║  ███╗ ╚████╔╝ ',
  '██║╚██╔╝██║██║██║╚██╗██║██║   ██║  ╚██╔╝  ',
  '██║ ╚═╝ ██║██║██║ ╚████║╚██████╔╝   ██║   ',
  '╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝    ╚═╝   ',
  '           A T L A S   ·   A U T O N O M O U S   S E C U R I T Y',
];

// Short "MINGYI" banner.
const SHORT_ART = [
  '█▀▄▀█ █ █▄  █ █▀▀ █▄█ █',
  '█ ▀ █ █ █ ▀▄█ █▄█  █  █',
  '▀   ▀ ▀ ▀  ▀ ▀▀▀  ▀  ▀',
];

// Legacy art is retained for embedders that explicitly pass the old app name.
const LEGACY_MASTRA_CODE_ART = [
  '█▀▄▀█ ▄▀█ █▀ ▀█▀ █▀█ ▄▀█   █▀▀ █▀█ █▀▄ █▀▀',
  '█ ▀ █ █▀█ ▀█  █  █▀▄ █▀█   █   █ █ █ █ █▀▀',
  '▀   ▀ ▀ ▀ ▀▀  ▀  ▀ ▀ ▀ ▀   ▀▀▀ ▀▀▀ ▀▀  ▀▀▀',
];

const LEGACY_MASTRA_ART = ['█▀▄▀█ ▄▀█ █▀ ▀█▀ █▀█ ▄▀█', '█ ▀ █ █▀█ ▀█  █  █▀▄ █▀█', '▀   ▀ ▀ ▀ ▀▀  ▀  ▀ ▀ ▀ ▀'];

function maxLineWidth(lines: string[]): number {
  return Math.max(...lines.map(line => [...line].length));
}

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
 * Apply left-to-right gradient to a line of text.
 */
function colorLine(line: string): string {
  const chars = [...line];
  return chars.map((ch, i) => gradientChar(ch, i, chars.length)).join('');
}

/**
 * Render the banner header for the TUI.
 *
 * @param version - App version string (e.g. "0.2.0")
 * @param appName - App name. Block art is used for the default brand.
 * @returns Styled multi-line string ready for display.
 */
export function renderBanner(version: string, appName?: string): string {
  const name = appName || DEFAULT_APP_NAME;

  const isDefaultBrand = name === DEFAULT_APP_NAME;
  const isLegacyBrand = name === 'Mastra Code' || name === 'Mastra';

  // Custom app names get the simple text format.
  if (!isDefaultBrand && !isLegacyBrand) {
    return theme.fg('accent', '◆') + ' ' + theme.bold(theme.fg('accent', name)) + theme.fg('dim', ` v${version}`);
  }

  const cols = process.stdout.columns || 80;

  // Narrow terminal — compact single line
  if (cols < 30) {
    return theme.fg('accent', '◆') + ' ' + theme.bold(theme.fg('accent', name)) + theme.fg('dim', ` v${version}`);
  }

  // Select art based on available width
  const art = isLegacyBrand
    ? name === 'Mastra Code' && cols >= 50
      ? LEGACY_MASTRA_CODE_ART
      : LEGACY_MASTRA_ART
    : cols >= maxLineWidth(FULL_ART) + 2
      ? FULL_ART
      : cols >= maxLineWidth(MEDIUM_ART) + 2
        ? MEDIUM_ART
        : SHORT_ART;
  const coloredLines = art.map(line => colorLine(line));

  const versionLine = isDefaultBrand
    ? `${theme.fg('accent', '◆')} ${theme.bold(theme.fg('accent', 'Mingyi Atlas'))}${theme.fg('dim', ` v${version}`)}`
    : theme.fg('dim', `v${version}`);
  coloredLines.push(versionLine);

  return coloredLines.join('\n');
}
