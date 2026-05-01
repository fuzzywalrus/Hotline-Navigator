// Tunable. Not WCAG — just "visibly distinct from the background".
// HSL lightness is normalized 0..1; this is the minimum delta we enforce
// between a rendered color's L and the theme background's L.
const MIN_DELTA = 0.30;

interface Hsl {
  h: number; // 0..360
  s: number; // 0..1
  l: number; // 0..1
}

export interface DisplayColorPrefs {
  displayUserColors: boolean;
  enforceColorLegibility: boolean;
}

function parseHex(input: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(input.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

export function hexToHsl(hex: string): Hsl | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      case b: h = ((r - g) / d + 4) * 60; break;
    }
  }
  return { h, s, l };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp < 1)      { r1 = c; g1 = x; b1 = 0; }
  else if (hp < 2) { r1 = x; g1 = c; b1 = 0; }
  else if (hp < 3) { r1 = 0; g1 = c; b1 = x; }
  else if (hp < 4) { r1 = 0; g1 = x; b1 = c; }
  else if (hp < 5) { r1 = x; g1 = 0; b1 = c; }
  else             { r1 = c; g1 = 0; b1 = x; }
  const m = l - c / 2;
  const toHex = (v: number) => {
    const n = Math.max(0, Math.min(255, Math.round((v + m) * 255)));
    return n.toString(16).padStart(2, '0');
  };
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

/**
 * Resolve a name color for rendering against a given theme background.
 *
 *   prefs.displayUserColors === false       → undefined  (caller falls back to default text color)
 *   rawColor falsy or malformed             → undefined
 *   prefs.enforceColorLegibility === false  → rawColor unchanged
 *   |rawL - bgL| >= MIN_DELTA               → rawColor unchanged
 *   otherwise                                → L pushed away from bgL by MIN_DELTA, hue/sat preserved
 */
export function getDisplayColor(
  rawColor: string | null | undefined,
  themeBg: string,
  prefs: DisplayColorPrefs,
): string | undefined {
  if (!prefs.displayUserColors) return undefined;
  if (!rawColor) return undefined;
  const raw = hexToHsl(rawColor);
  if (!raw) return undefined;
  if (!prefs.enforceColorLegibility) return rawColor;
  const bg = hexToHsl(themeBg);
  if (!bg) return rawColor;
  const delta = Math.abs(raw.l - bg.l);
  if (delta >= MIN_DELTA) return rawColor;
  const targetL = bg.l < 0.5
    ? Math.min(1, bg.l + MIN_DELTA)
    : Math.max(0, bg.l - MIN_DELTA);
  return hslToHex({ h: raw.h, s: raw.s, l: targetL });
}

// App-defined "system" name colors (admin red, self green, default sky), as hex
// for both themes. Resolved via getDisplayColor with displayUserColors=true so
// the user's "Display username colors" toggle doesn't strip these — only the
// legibility transform applies.
const DARK_THEME_BG = '#111827';
const NAME_COLORS = {
  ownLight: '#16a34a',     // green-600
  ownDark: '#4ade80',      // green-400
  adminLight: '#dc2626',   // red-600
  adminDark: '#f87171',    // red-400
  defaultLight: '#0284c7', // sky-600
  defaultDark: '#38bdf8',  // sky-400
};

/**
 * Resolves the rendered username color: own > admin > user-set > default,
 * routed through getDisplayColor so the legibility transform always applies
 * and the user's "displayUserColors" toggle hides only server-set colors
 * (system defaults remain visible).
 */
export function resolveNameColor(opts: {
  userColor?: string | null;
  isOwn: boolean;
  isAdmin: boolean;
  themeBg: string;
  prefs: DisplayColorPrefs;
}): string | undefined {
  const { userColor, isOwn, isAdmin, themeBg, prefs } = opts;
  const isDark = themeBg === DARK_THEME_BG;
  const sysPrefs = { displayUserColors: true, enforceColorLegibility: prefs.enforceColorLegibility };
  if (isOwn) {
    return getDisplayColor(isDark ? NAME_COLORS.ownDark : NAME_COLORS.ownLight, themeBg, sysPrefs);
  }
  if (isAdmin) {
    return getDisplayColor(isDark ? NAME_COLORS.adminDark : NAME_COLORS.adminLight, themeBg, sysPrefs);
  }
  if (userColor) {
    const adjusted = getDisplayColor(userColor, themeBg, prefs);
    if (adjusted) return adjusted;
  }
  return getDisplayColor(isDark ? NAME_COLORS.defaultDark : NAME_COLORS.defaultLight, themeBg, sysPrefs);
}
