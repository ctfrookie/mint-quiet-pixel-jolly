import { rgba, ramp, type RGB, type Theme } from "@/lib/visualizer/themes";

export type VizMode = "bars" | "rings" | "bloom";

export type Scene = {
  mode: VizMode;
  theme: Theme;
  levels: Float32Array;
  peaks: Float32Array;
  wave: Float32Array;
  bass: number;
  punch: number;
  mid: number;
  high: number;
  time: number;
  reduced: boolean;
};

export function renderScene(ctx: CanvasRenderingContext2D, w: number, h: number, scene: Scene) {
  if (w < 2 || h < 2) return;
  paintBackdrop(ctx, w, h, scene);
  if (scene.mode === "bars") drawBars(ctx, w, h, scene);
  else if (scene.mode === "rings") drawRings(ctx, w, h, scene);
  else drawBloom(ctx, w, h, scene);
  vignette(ctx, w, h);
  ctx.globalCompositeOperation = "source-over";
}

function paintBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, scene: Scene) {
  const { theme, bass, time, reduced } = scene;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#07080c";
  ctx.fillRect(0, 0, w, h);

  const drift = reduced ? 0 : 1;
  const cx = w * (0.5 + Math.sin(time * 0.07 * drift) * 0.08);
  const cy = h * (0.46 + Math.cos(time * 0.05 * drift) * 0.05);
  const radius = Math.max(w, h) * (0.42 + bass * 0.28);
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  glow.addColorStop(0, rgba(theme.stops[1], 0.14 + bass * 0.28));
  glow.addColorStop(0.38, rgba(theme.stops[0], 0.07 + scene.mid * 0.1));
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const wash = ctx.createRadialGradient(w * 0.82, h * 0.9, 0, w * 0.82, h * 0.9, w * 0.5);
  wash.addColorStop(0, rgba(theme.stops[2], 0.05 + bass * 0.08));
  wash.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);
}

function drawBars(ctx: CanvasRenderingContext2D, w: number, h: number, scene: Scene) {
  const { levels, peaks, theme, wave, mid, punch } = scene;
  const columns = w < 520 ? 36 : w < 960 ? 60 : 84;
  const pad = Math.max(16, w * 0.045);
  const inner = w - pad * 2;
  const slot = inner / columns;
  const gap = Math.max(2, slot * 0.28);
  const bw = Math.max(2, slot - gap);
  const horizon = h * 0.56;
  const maxH = h * 0.4;

  const bed = ctx.createLinearGradient(0, horizon, 0, Math.min(h, horizon + h * 0.32));
  bed.addColorStop(0, rgba(theme.stops[0], 0.12 + punch * 0.18));
  bed.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bed;
  ctx.fillRect(0, horizon, w, h - horizon);

  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < columns; i++) {
    const t = i / (columns - 1);
    const v = sample(levels, t);
    const peak = sample(peaks, t);
    const bh = Math.max(1.5, v * maxH);
    const x = pad + i * slot + gap * 0.5;
    const col = ramp(theme, t);
    const hot = mixToward(col, theme.stops[2], 0.2 + v * 0.55);

    ctx.fillStyle = rgba(col, 0.07 + v * 0.14);
    fillRound(ctx, x - 1.5, horizon - bh * 1.04, bw + 3, bh * 1.04, bw);
    ctx.fillStyle = rgba(hot, 0.4 + v * 0.55);
    fillRound(ctx, x, horizon - bh, bw, bh, Math.min(bw * 0.45, 8));

    const refl = bh * 0.42;
    ctx.fillStyle = rgba(col, 0.05 + v * 0.16);
    fillRound(ctx, x, horizon + 3, bw, refl, Math.min(bw * 0.45, 8));

    if (peak > 0.06) {
      const py = horizon - Math.max(peak * maxH, bh + 6);
      ctx.fillStyle = rgba(theme.stops[2], 0.35 + peak * 0.6);
      fillRound(ctx, x, py, bw, Math.max(2, bw * 0.22), 2);
    }
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.beginPath();
  ctx.moveTo(pad, horizon + 0.5);
  ctx.lineTo(w - pad, horizon + 0.5);
  ctx.strokeStyle = rgba(theme.stops[2], 0.28);
  ctx.lineWidth = 1;
  ctx.stroke();

  if (wave.length > 1) {
    ctx.beginPath();
    const amp = h * 0.045 * (0.45 + mid);
    for (let i = 0; i < wave.length; i++) {
      const x = pad + (i / (wave.length - 1)) * inner;
      const y = horizon + wave[i]! * amp;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = rgba(theme.stops[2], 0.7);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawRings(ctx: CanvasRenderingContext2D, w: number, h: number, scene: Scene) {
  const { levels, theme, time, bass, punch, mid, reduced } = scene;
  const cx = w / 2;
  const cy = h * 0.46;
  const min = Math.min(w, h);
  const base = min * 0.2;
  const spin = reduced ? 0.45 : time * 0.11;

  ctx.globalCompositeOperation = "lighter";

  const halo = ctx.createRadialGradient(cx, cy, base * 0.2, cx, cy, base * (2.15 + punch));
  halo.addColorStop(0, rgba(theme.stops[1], 0.45 + punch * 0.4));
  halo.addColorStop(0.42, rgba(theme.stops[0], 0.1));
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, base * (2.3 + punch * 0.4), 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, base * (0.78 + punch * 0.22), 0, Math.PI * 2);
  ctx.fillStyle = rgba(theme.stops[1], 0.88);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  ctx.beginPath();
  ctx.arc(cx, cy, base * (0.46 + mid * 0.12), 0, Math.PI * 2);
  ctx.fillStyle = "rgba(7,8,12,0.72)";
  ctx.fill();

  ctx.globalCompositeOperation = "lighter";
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(spin);
  ctx.lineCap = "round";
  const n = levels.length;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const v = levels[i] ?? 0;
    const inner = base * 1.08;
    const outer = inner + v * min * 0.26 + 2;
    const col = ramp(theme, i / n);
    ctx.strokeStyle = rgba(col, 0.28 + v * 0.7);
    ctx.lineWidth = Math.max(1.6, (Math.PI * 2 * inner) / n * 0.42);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(reduced ? -0.2 : -time * 0.16);
  ctx.lineCap = "round";
  const innerN = 42;
  for (let i = 0; i < innerN; i++) {
    const a = (i / innerN) * Math.PI * 2;
    const v = levels[(i * 2) % n] ?? 0;
    const inner = base * 0.74;
    const outer = Math.max(base * 0.18, inner - v * base * 0.5);
    ctx.strokeStyle = rgba(theme.stops[2], 0.25 + v * 0.65);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    ctx.stroke();
  }
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, base * (1.55 + bass * 0.18), 0, Math.PI * 2);
  ctx.strokeStyle = rgba(theme.stops[0], 0.2 + mid * 0.35);
  ctx.lineWidth = 1;
  ctx.stroke();

  for (let k = 0; k < 3; k++) {
    const a = (reduced ? 0.6 : time * (0.35 + k * 0.12)) + k * 2.15;
    const orbit = base * (1.7 + k * 0.28) + punch * min * 0.03;
    const x = cx + Math.cos(a) * orbit;
    const y = cy + Math.sin(a) * orbit * 0.9;
    ctx.beginPath();
    ctx.arc(x, y, 2.2 + punch * 3.5, 0, Math.PI * 2);
    ctx.fillStyle = rgba(theme.stops[2], 0.85);
    ctx.fill();
  }

  ctx.globalCompositeOperation = "source-over";
}

function drawBloom(ctx: CanvasRenderingContext2D, w: number, h: number, scene: Scene) {
  const { levels, theme, time, punch, bass, reduced } = scene;
  const cx = w / 2;
  const cy = h * 0.46;
  const min = Math.min(w, h);
  const rings = 20;

  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < rings; i++) {
    const v = levels[Math.min(levels.length - 1, ((i / rings) * levels.length) | 0)] ?? 0;
    const phase = reduced ? i / rings : (time * 0.28 + i / rings) % 1;
    const radius = min * (0.06 + phase * 0.46) * (1 + v * 0.08);
    const alpha = (1 - phase) * (0.12 + v * 0.72);
    const col = ramp(theme, i / rings);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(col, alpha);
    ctx.lineWidth = (1 - phase) * (1.5 + v * 9);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(reduced ? 0.3 : time * 0.06);
  ctx.lineCap = "round";
  const spokes = 40;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const v = levels[(i * 2) % levels.length] ?? 0;
    ctx.strokeStyle = rgba(theme.stops[2], 0.04 + v * 0.28);
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    const reach = min * (0.08 + v * 0.34);
    ctx.moveTo(Math.cos(a) * min * 0.035, Math.sin(a) * min * 0.035);
    ctx.lineTo(Math.cos(a) * reach, Math.sin(a) * reach);
    ctx.stroke();
  }
  ctx.restore();

  const coreR = min * (0.1 + punch * 0.14);
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
  core.addColorStop(0, rgba(theme.stops[2], 0.95));
  core.addColorStop(0.45, rgba(theme.stops[1], 0.4 + bass * 0.3));
  core.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = "source-over";
}

function vignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.globalCompositeOperation = "source-over";
  const g = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.28,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.72,
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.58)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function sample(data: Float32Array, t: number): number {
  if (data.length === 0) return 0;
  const x = t * (data.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = data[i] ?? 0;
  const b = data[Math.min(data.length - 1, i + 1)] ?? a;
  return a + (b - a) * f;
}

function mixToward(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function fillRound(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  if (w <= 0.5 || h <= 0.5) return;
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
}
