export type RGB = readonly [number, number, number];

export type Theme = {
  id: string;
  name: string;
  stops: readonly [RGB, RGB, RGB];
};

export const THEMES = [
  {
    id: "aurora",
    name: "极光",
    stops: [
      [61, 255, 197],
      [122, 162, 255],
      [236, 186, 255],
    ],
  },
  {
    id: "neon",
    name: "霓虹",
    stops: [
      [34, 231, 255],
      [255, 61, 196],
      [214, 255, 63],
    ],
  },
  {
    id: "ember",
    name: "余烬",
    stops: [
      [255, 94, 42],
      [255, 176, 48],
      [255, 232, 196],
    ],
  },
  {
    id: "glacier",
    name: "霜蓝",
    stops: [
      [176, 228, 255],
      [86, 168, 255],
      [168, 176, 255],
    ],
  },
  {
    id: "rose",
    name: "玫金",
    stops: [
      [255, 93, 138],
      [255, 176, 148],
      [255, 214, 120],
    ],
  },
] as const satisfies readonly Theme[];

export type ThemeId = (typeof THEMES)[number]["id"];

export function themeById(id: string): Theme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

export function ramp(theme: Theme, t: number): RGB {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  if (k < 0.5) return mix(theme.stops[0], theme.stops[1], k * 2);
  return mix(theme.stops[1], theme.stops[2], (k - 0.5) * 2);
}

export function rgba(c: RGB, a: number): string {
  const alpha = a < 0 ? 0 : a > 1 ? 1 : a;
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha.toFixed(3)})`;
}
