/**
 * Reads src/styles/tokens.css at build time so the /design-system page
 * always shows the real values — there is no second copy to keep in sync.
 */
import raw from '../styles/tokens.css?raw';

export interface Token {
  name: string;
  value: string;
  note?: string;
}

// Only the main :root block — the reduced-motion overrides come after `@media`.
const rootBlock = raw.slice(raw.indexOf(':root {'), raw.indexOf('@media'));

// `--name: value;` optionally followed by a same-line `/* note */`.
const TOKEN = /(--[\w-]+):\s*([^;]+);[ \t]*(?:\/\*\s*(.*?)\s*\*\/)?/g;

export const tokens: Token[] = [...rootBlock.matchAll(TOKEN)].map(([, name, value, note]) => ({
  name,
  value: value.trim(),
  note,
}));

const startsWith = (...prefixes: string[]) =>
  tokens.filter((t) => prefixes.some((p) => t.name.startsWith(p)));

export const tokenGroups = {
  primitiveColors: tokens.filter((t) => t.value.startsWith('#')),
  semanticColors: startsWith('--color-'),
  fonts: startsWith('--font-'),
  typeScale: startsWith('--text-'),
  typeDetails: startsWith('--weight-', '--leading-', '--tracking-', '--measure'),
  spacing: startsWith('--space-'),
  layout: startsWith('--container-', '--gutter', '--section-y'),
  radii: startsWith('--radius-'),
  shadows: startsWith('--shadow-'),
  durations: startsWith('--dur-'),
  easings: startsWith('--ease-'),
};

/** Looks up a token's final hex colour, following var() references. */
export function resolveColor(name: string): string | undefined {
  const token = tokens.find((t) => t.name === name);
  if (!token) return undefined;
  const ref = token.value.match(/^var\((--[\w-]+)\)$/);
  return ref ? resolveColor(ref[1]) : token.value;
}

/** WCAG relative luminance: 0 = black, 1 = white. */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio between two hex colours, e.g. 17.04. */
export function contrastRatio(hexA: string, hexB: string): number {
  const [light, dark] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a);
  return Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100;
}
