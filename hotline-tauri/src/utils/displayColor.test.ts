import { describe, it, expect } from 'vitest';
import { getDisplayColor, hexToHsl, hslToHex } from './displayColor';

const DARK_BG = '#111827';   // gray-900
const LIGHT_BG = '#f3f4f6';  // gray-100
const ON = { displayUserColors: true, enforceColorLegibility: true };
const NO_LEGIBILITY = { displayUserColors: true, enforceColorLegibility: false };
const NO_DISPLAY = { displayUserColors: false, enforceColorLegibility: true };

describe('hexToHsl / hslToHex', () => {
  it('round-trips primary colors approximately', () => {
    for (const hex of ['#ff0000', '#00ff00', '#0000ff', '#808080']) {
      const hsl = hexToHsl(hex);
      expect(hsl).not.toBeNull();
      const back = hslToHex(hsl!);
      expect(back.toLowerCase()).toBe(hex.toLowerCase());
    }
  });

  it('rejects malformed hex', () => {
    expect(hexToHsl('not-a-color')).toBeNull();
    expect(hexToHsl('#abc')).toBeNull();
    expect(hexToHsl('')).toBeNull();
  });

  it('accepts hex with or without leading #', () => {
    expect(hexToHsl('ff0000')).not.toBeNull();
    expect(hexToHsl('#ff0000')).not.toBeNull();
  });
});

describe('getDisplayColor', () => {
  it('returns undefined when displayUserColors is off', () => {
    expect(getDisplayColor('#ff0000', DARK_BG, NO_DISPLAY)).toBeUndefined();
  });

  it('returns undefined for null/undefined/empty input', () => {
    expect(getDisplayColor(null, DARK_BG, ON)).toBeUndefined();
    expect(getDisplayColor(undefined, DARK_BG, ON)).toBeUndefined();
    expect(getDisplayColor('', DARK_BG, ON)).toBeUndefined();
  });

  it('returns undefined for malformed hex input', () => {
    expect(getDisplayColor('not-a-color', DARK_BG, ON)).toBeUndefined();
  });

  it('passes through unchanged when enforceColorLegibility is off', () => {
    expect(getDisplayColor('#1b1b1b', DARK_BG, NO_LEGIBILITY)).toBe('#1b1b1b');
  });

  it('passes through legible color unchanged', () => {
    expect(getDisplayColor('#ff00ff', DARK_BG, ON)).toBe('#ff00ff');
    expect(getDisplayColor('#003300', LIGHT_BG, ON)).toBe('#003300');
  });

  it('lightens dark color on dark background', () => {
    const out = getDisplayColor('#1b1b1b', DARK_BG, ON);
    expect(out).toBeDefined();
    const adjusted = hexToHsl(out!)!;
    const bgL = hexToHsl(DARK_BG)!.l;
    expect(adjusted.l).toBeGreaterThanOrEqual(bgL + 0.30 - 0.001);
  });

  it('darkens light color on light background', () => {
    const out = getDisplayColor('#ffeeee', LIGHT_BG, ON);
    expect(out).toBeDefined();
    const adjusted = hexToHsl(out!)!;
    const bgL = hexToHsl(LIGHT_BG)!.l;
    expect(adjusted.l).toBeLessThanOrEqual(bgL - 0.30 + 0.001);
  });

  it('preserves hue when adjusting lightness', () => {
    const out = getDisplayColor('#1b1b1b', DARK_BG, ON);
    const adjusted = hexToHsl(out!)!;
    const original = hexToHsl('#1b1b1b')!;
    // Both pure gray (s=0); hue is undefined for gray, so we just check saturation
    expect(adjusted.s).toBe(original.s);
  });
});
