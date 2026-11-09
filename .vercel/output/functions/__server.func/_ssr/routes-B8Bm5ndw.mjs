import { i as __toESM } from "../_runtime.mjs";
import { K as require_react, b as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as Pause, c as Maximize2, i as Play, l as AudioLines, o as Minimize2, r as Radius, s as Mic, t as Upload, u as Aperture } from "../_libs/lucide-react.mjs";
import { t as clsx } from "../_libs/clsx.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-B8Bm5ndw.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var MIN_HZ = 36;
var MAX_HZ = 14e3;
var AudioEngine = class {
	audio;
	ctx = null;
	analyser = null;
	fileSource = null;
	micSource = null;
	stream = null;
	freq = /* @__PURE__ */ new Uint8Array(0);
	time = /* @__PURE__ */ new Uint8Array(0);
	objectUrl = null;
	monitoring = false;
	fileLoaded = false;
	constructor(audio) {
		this.audio = audio;
	}
	async context() {
		if (!this.ctx) {
			const ctx = new AudioContext();
			const analyser = ctx.createAnalyser();
			analyser.fftSize = 2048;
			analyser.smoothingTimeConstant = .62;
			this.ctx = ctx;
			this.analyser = analyser;
			this.freq = new Uint8Array(analyser.frequencyBinCount);
			this.time = new Uint8Array(analyser.fftSize);
		}
		if (this.ctx.state === "suspended") await this.ctx.resume();
		return this.ctx;
	}
	setMonitor(on) {
		const analyser = this.analyser;
		const ctx = this.ctx;
		if (!analyser || !ctx) return;
		if (on && !this.monitoring) {
			analyser.connect(ctx.destination);
			this.monitoring = true;
		} else if (!on && this.monitoring) {
			analyser.disconnect(ctx.destination);
			this.monitoring = false;
		}
	}
	ensureFileGraph() {
		const ctx = this.ctx;
		const analyser = this.analyser;
		if (!ctx || !analyser || this.fileSource) return;
		this.fileSource = ctx.createMediaElementSource(this.audio);
		this.fileSource.connect(analyser);
	}
	stopMic() {
		this.micSource?.disconnect();
		this.micSource = null;
		if (this.stream) {
			for (const track of this.stream.getTracks()) track.stop();
			this.stream = null;
		}
	}
	async startMic() {
		if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
		await this.context();
		this.audio.pause();
		this.setMonitor(false);
		this.stopMic();
		const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		const ctx = this.ctx;
		const analyser = this.analyser;
		if (!ctx || !analyser) throw new Error("no-context");
		const source = ctx.createMediaStreamSource(stream);
		source.connect(analyser);
		this.stream = stream;
		this.micSource = source;
	}
	async loadFile(file) {
		await this.context();
		this.stopMic();
		this.ensureFileGraph();
		this.setMonitor(true);
		if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
		const url = URL.createObjectURL(file);
		this.objectUrl = url;
		this.fileLoaded = true;
		this.audio.src = url;
		await this.audio.play();
	}
	async play() {
		if (!this.fileLoaded) return;
		await this.context();
		this.stopMic();
		this.ensureFileGraph();
		this.setMonitor(true);
		await this.audio.play();
	}
	pause() {
		this.audio.pause();
	}
	/** Writes 0–1 log-frequency bands and a −1..1 waveform. Returns false if silent graph. */
	read(levels, wave) {
		const analyser = this.analyser;
		const ctx = this.ctx;
		if (!analyser || !ctx || this.freq.length === 0) return false;
		analyser.getByteFrequencyData(this.freq);
		sampleLog(this.freq, levels, ctx.sampleRate);
		analyser.getByteTimeDomainData(this.time);
		const step = this.time.length / wave.length;
		for (let i = 0; i < wave.length; i++) {
			const k = Math.min(this.time.length - 1, i * step | 0);
			wave[i] = (this.time[k] - 128) / 128;
		}
		return true;
	}
	dispose() {
		this.stopMic();
		this.audio.pause();
		this.audio.removeAttribute("src");
		if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
		this.objectUrl = null;
		this.ctx?.close();
		this.ctx = null;
		this.analyser = null;
	}
};
function sampleLog(freq, out, sampleRate) {
	const bins = freq.length;
	const nyquist = sampleRate / 2;
	if (bins < 2 || nyquist <= 0) {
		out.fill(0);
		return;
	}
	const maxHz = Math.min(MAX_HZ, nyquist * .94);
	const n = out.length;
	for (let i = 0; i < n; i++) {
		const f0 = MIN_HZ * Math.pow(maxHz / MIN_HZ, i / n);
		const f1 = MIN_HZ * Math.pow(maxHz / MIN_HZ, (i + 1) / n);
		let i0 = Math.floor(f0 / nyquist * bins);
		let i1 = Math.ceil(f1 / nyquist * bins);
		if (i0 < 1) i0 = 1;
		if (i1 <= i0) i1 = i0 + 1;
		if (i1 > bins) i1 = bins;
		let sum = 0;
		for (let k = i0; k < i1; k++) sum += freq[k];
		const avg = sum / (i1 - i0) / 255;
		const tilt = 1 + i / n * .9;
		out[i] = Math.min(1, avg * tilt);
	}
}
function shapeBand(value, sensitivity) {
	const gated = value < .04 ? 0 : (value - .04) / .96;
	return Math.min(1, 1 - Math.exp(-gated * sensitivity * 2.6));
}
function idleTarget(out, time, reduced) {
	const t = time * (reduced ? .4 : 1);
	const last = Math.max(1, out.length - 1);
	for (let i = 0; i < out.length; i++) {
		const x = i / last;
		const bass = Math.exp(-x * 3.1) * (.42 + .58 * Math.sin(t * 1.65) ** 2);
		const mid = Math.abs(Math.sin(x * 10.5 + t * 2.15) * Math.sin(x * 2.6 + t * .55));
		const pulse = .45 + .55 * Math.sin(t * 2.35 + x * 15);
		const env = Math.sin(Math.PI * x) ** .7;
		out[i] = Math.min(1, (.1 + bass * .62 + mid * .42 * pulse) * (.32 + .68 * env));
	}
}
function idleWave(out, time, reduced) {
	const t = time * (reduced ? .4 : 1);
	const last = Math.max(1, out.length - 1);
	for (let i = 0; i < out.length; i++) {
		const x = i / last;
		const body = Math.sin(t * 2.1 + x * 8.2) * .34 + Math.sin(t * 4.8 + x * 19) * .1;
		out[i] = body * Math.sin(Math.PI * x);
	}
}
var THEMES = [
	{
		id: "aurora",
		name: "极光",
		stops: [
			[
				61,
				255,
				197
			],
			[
				122,
				162,
				255
			],
			[
				236,
				186,
				255
			]
		]
	},
	{
		id: "neon",
		name: "霓虹",
		stops: [
			[
				34,
				231,
				255
			],
			[
				255,
				61,
				196
			],
			[
				214,
				255,
				63
			]
		]
	},
	{
		id: "ember",
		name: "余烬",
		stops: [
			[
				255,
				94,
				42
			],
			[
				255,
				176,
				48
			],
			[
				255,
				232,
				196
			]
		]
	},
	{
		id: "glacier",
		name: "霜蓝",
		stops: [
			[
				176,
				228,
				255
			],
			[
				86,
				168,
				255
			],
			[
				168,
				176,
				255
			]
		]
	},
	{
		id: "rose",
		name: "玫金",
		stops: [
			[
				255,
				93,
				138
			],
			[
				255,
				176,
				148
			],
			[
				255,
				214,
				120
			]
		]
	}
];
function themeById(id) {
	return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}
function mix(a, b, t) {
	const k = t < 0 ? 0 : t > 1 ? 1 : t;
	return [
		a[0] + (b[0] - a[0]) * k,
		a[1] + (b[1] - a[1]) * k,
		a[2] + (b[2] - a[2]) * k
	];
}
function ramp(theme, t) {
	const k = t < 0 ? 0 : t > 1 ? 1 : t;
	if (k < .5) return mix(theme.stops[0], theme.stops[1], k * 2);
	return mix(theme.stops[1], theme.stops[2], (k - .5) * 2);
}
function rgba(c, a) {
	const alpha = a < 0 ? 0 : a > 1 ? 1 : a;
	return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha.toFixed(3)})`;
}
function renderScene(ctx, w, h, scene) {
	if (w < 2 || h < 2) return;
	paintBackdrop(ctx, w, h, scene);
	if (scene.mode === "bars") drawBars(ctx, w, h, scene);
	else if (scene.mode === "rings") drawRings(ctx, w, h, scene);
	else drawBloom(ctx, w, h, scene);
	vignette(ctx, w, h);
	ctx.globalCompositeOperation = "source-over";
}
function paintBackdrop(ctx, w, h, scene) {
	const { theme, bass, time, reduced } = scene;
	ctx.globalCompositeOperation = "source-over";
	ctx.fillStyle = "#07080c";
	ctx.fillRect(0, 0, w, h);
	const drift = reduced ? 0 : 1;
	const cx = w * (.5 + Math.sin(time * .07 * drift) * .08);
	const cy = h * (.46 + Math.cos(time * .05 * drift) * .05);
	const radius = Math.max(w, h) * (.42 + bass * .28);
	const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
	glow.addColorStop(0, rgba(theme.stops[1], .14 + bass * .28));
	glow.addColorStop(.38, rgba(theme.stops[0], .07 + scene.mid * .1));
	glow.addColorStop(1, "rgba(0,0,0,0)");
	ctx.fillStyle = glow;
	ctx.fillRect(0, 0, w, h);
	const wash = ctx.createRadialGradient(w * .82, h * .9, 0, w * .82, h * .9, w * .5);
	wash.addColorStop(0, rgba(theme.stops[2], .05 + bass * .08));
	wash.addColorStop(1, "rgba(0,0,0,0)");
	ctx.fillStyle = wash;
	ctx.fillRect(0, 0, w, h);
}
function drawBars(ctx, w, h, scene) {
	const { levels, peaks, theme, wave, mid, punch } = scene;
	const columns = w < 520 ? 36 : w < 960 ? 60 : 84;
	const pad = Math.max(16, w * .045);
	const inner = w - pad * 2;
	const slot = inner / columns;
	const gap = Math.max(2, slot * .28);
	const bw = Math.max(2, slot - gap);
	const horizon = h * .56;
	const maxH = h * .4;
	const bed = ctx.createLinearGradient(0, horizon, 0, Math.min(h, horizon + h * .32));
	bed.addColorStop(0, rgba(theme.stops[0], .12 + punch * .18));
	bed.addColorStop(1, "rgba(0,0,0,0)");
	ctx.fillStyle = bed;
	ctx.fillRect(0, horizon, w, h - horizon);
	ctx.globalCompositeOperation = "lighter";
	for (let i = 0; i < columns; i++) {
		const t = i / (columns - 1);
		const v = sample(levels, t);
		const peak = sample(peaks, t);
		const bh = Math.max(1.5, v * maxH);
		const x = pad + i * slot + gap * .5;
		const col = ramp(theme, t);
		const hot = mixToward(col, theme.stops[2], .2 + v * .55);
		ctx.fillStyle = rgba(col, .07 + v * .14);
		fillRound(ctx, x - 1.5, horizon - bh * 1.04, bw + 3, bh * 1.04, bw);
		ctx.fillStyle = rgba(hot, .4 + v * .55);
		fillRound(ctx, x, horizon - bh, bw, bh, Math.min(bw * .45, 8));
		const refl = bh * .42;
		ctx.fillStyle = rgba(col, .05 + v * .16);
		fillRound(ctx, x, horizon + 3, bw, refl, Math.min(bw * .45, 8));
		if (peak > .06) {
			const py = horizon - Math.max(peak * maxH, bh + 6);
			ctx.fillStyle = rgba(theme.stops[2], .35 + peak * .6);
			fillRound(ctx, x, py, bw, Math.max(2, bw * .22), 2);
		}
	}
	ctx.globalCompositeOperation = "source-over";
	ctx.beginPath();
	ctx.moveTo(pad, horizon + .5);
	ctx.lineTo(w - pad, horizon + .5);
	ctx.strokeStyle = rgba(theme.stops[2], .28);
	ctx.lineWidth = 1;
	ctx.stroke();
	if (wave.length > 1) {
		ctx.beginPath();
		const amp = h * .045 * (.45 + mid);
		for (let i = 0; i < wave.length; i++) {
			const x = pad + i / (wave.length - 1) * inner;
			const y = horizon + wave[i] * amp;
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.strokeStyle = rgba(theme.stops[2], .7);
		ctx.lineWidth = 1.5;
		ctx.stroke();
	}
}
function drawRings(ctx, w, h, scene) {
	const { levels, theme, time, bass, punch, mid, reduced } = scene;
	const cx = w / 2;
	const cy = h * .46;
	const min = Math.min(w, h);
	const base = min * .2;
	const spin = reduced ? .45 : time * .11;
	ctx.globalCompositeOperation = "lighter";
	const halo = ctx.createRadialGradient(cx, cy, base * .2, cx, cy, base * (2.15 + punch));
	halo.addColorStop(0, rgba(theme.stops[1], .45 + punch * .4));
	halo.addColorStop(.42, rgba(theme.stops[0], .1));
	halo.addColorStop(1, "rgba(0,0,0,0)");
	ctx.fillStyle = halo;
	ctx.beginPath();
	ctx.arc(cx, cy, base * (2.3 + punch * .4), 0, Math.PI * 2);
	ctx.fill();
	ctx.beginPath();
	ctx.arc(cx, cy, base * (.78 + punch * .22), 0, Math.PI * 2);
	ctx.fillStyle = rgba(theme.stops[1], .88);
	ctx.fill();
	ctx.globalCompositeOperation = "source-over";
	ctx.beginPath();
	ctx.arc(cx, cy, base * (.46 + mid * .12), 0, Math.PI * 2);
	ctx.fillStyle = "rgba(7,8,12,0.72)";
	ctx.fill();
	ctx.globalCompositeOperation = "lighter";
	ctx.save();
	ctx.translate(cx, cy);
	ctx.rotate(spin);
	ctx.lineCap = "round";
	const n = levels.length;
	for (let i = 0; i < n; i++) {
		const a = i / n * Math.PI * 2;
		const v = levels[i] ?? 0;
		const inner = base * 1.08;
		const outer = inner + v * min * .26 + 2;
		ctx.strokeStyle = rgba(ramp(theme, i / n), .28 + v * .7);
		ctx.lineWidth = Math.max(1.6, Math.PI * 2 * inner / n * .42);
		ctx.beginPath();
		ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
		ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
		ctx.stroke();
	}
	ctx.restore();
	ctx.save();
	ctx.translate(cx, cy);
	ctx.rotate(reduced ? -.2 : -time * .16);
	ctx.lineCap = "round";
	const innerN = 42;
	for (let i = 0; i < innerN; i++) {
		const a = i / innerN * Math.PI * 2;
		const v = levels[i * 2 % n] ?? 0;
		const inner = base * .74;
		const outer = Math.max(base * .18, inner - v * base * .5);
		ctx.strokeStyle = rgba(theme.stops[2], .25 + v * .65);
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
		ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
		ctx.stroke();
	}
	ctx.restore();
	ctx.beginPath();
	ctx.arc(cx, cy, base * (1.55 + bass * .18), 0, Math.PI * 2);
	ctx.strokeStyle = rgba(theme.stops[0], .2 + mid * .35);
	ctx.lineWidth = 1;
	ctx.stroke();
	for (let k = 0; k < 3; k++) {
		const a = (reduced ? .6 : time * (.35 + k * .12)) + k * 2.15;
		const orbit = base * (1.7 + k * .28) + punch * min * .03;
		const x = cx + Math.cos(a) * orbit;
		const y = cy + Math.sin(a) * orbit * .9;
		ctx.beginPath();
		ctx.arc(x, y, 2.2 + punch * 3.5, 0, Math.PI * 2);
		ctx.fillStyle = rgba(theme.stops[2], .85);
		ctx.fill();
	}
	ctx.globalCompositeOperation = "source-over";
}
function drawBloom(ctx, w, h, scene) {
	const { levels, theme, time, punch, bass, reduced } = scene;
	const cx = w / 2;
	const cy = h * .46;
	const min = Math.min(w, h);
	const rings = 20;
	ctx.globalCompositeOperation = "lighter";
	for (let i = 0; i < rings; i++) {
		const v = levels[Math.min(levels.length - 1, i / rings * levels.length | 0)] ?? 0;
		const phase = reduced ? i / rings : (time * .28 + i / rings) % 1;
		const radius = min * (.06 + phase * .46) * (1 + v * .08);
		const alpha = (1 - phase) * (.12 + v * .72);
		const col = ramp(theme, i / rings);
		ctx.beginPath();
		ctx.arc(cx, cy, radius, 0, Math.PI * 2);
		ctx.strokeStyle = rgba(col, alpha);
		ctx.lineWidth = (1 - phase) * (1.5 + v * 9);
		ctx.stroke();
	}
	ctx.save();
	ctx.translate(cx, cy);
	ctx.rotate(reduced ? .3 : time * .06);
	ctx.lineCap = "round";
	const spokes = 40;
	for (let i = 0; i < spokes; i++) {
		const a = i / spokes * Math.PI * 2;
		const v = levels[i * 2 % levels.length] ?? 0;
		ctx.strokeStyle = rgba(theme.stops[2], .04 + v * .28);
		ctx.lineWidth = 1.25;
		ctx.beginPath();
		const reach = min * (.08 + v * .34);
		ctx.moveTo(Math.cos(a) * min * .035, Math.sin(a) * min * .035);
		ctx.lineTo(Math.cos(a) * reach, Math.sin(a) * reach);
		ctx.stroke();
	}
	ctx.restore();
	const coreR = min * (.1 + punch * .14);
	const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
	core.addColorStop(0, rgba(theme.stops[2], .95));
	core.addColorStop(.45, rgba(theme.stops[1], .4 + bass * .3));
	core.addColorStop(1, "rgba(0,0,0,0)");
	ctx.fillStyle = core;
	ctx.beginPath();
	ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
	ctx.fill();
	ctx.globalCompositeOperation = "source-over";
}
function vignette(ctx, w, h) {
	ctx.globalCompositeOperation = "source-over";
	const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .28, w / 2, h / 2, Math.max(w, h) * .72);
	g.addColorStop(0, "rgba(0,0,0,0)");
	g.addColorStop(1, "rgba(0,0,0,0.58)");
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, w, h);
}
function sample(data, t) {
	if (data.length === 0) return 0;
	const x = t * (data.length - 1);
	const i = Math.floor(x);
	const f = x - i;
	const a = data[i] ?? 0;
	return a + ((data[Math.min(data.length - 1, i + 1)] ?? a) - a) * f;
}
function mixToward(a, b, t) {
	return [
		a[0] + (b[0] - a[0]) * t,
		a[1] + (b[1] - a[1]) * t,
		a[2] + (b[2] - a[2]) * t
	];
}
function fillRound(ctx, x, y, w, h, r) {
	if (w <= .5 || h <= .5) return;
	const radius = Math.max(0, Math.min(r, w / 2, h / 2));
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, radius);
	ctx.fill();
}
var BANDS = 96;
var WAVE = 160;
var PREFS_KEY = "lumen-prefs";
var MODES = [
	{
		id: "bars",
		label: "条形",
		icon: AudioLines
	},
	{
		id: "rings",
		label: "环形",
		icon: Radius
	},
	{
		id: "bloom",
		label: "涟漪",
		icon: Aperture
	}
];
function isAudioFile(file) {
	if (file.type.startsWith("audio/")) return true;
	return /\.(mp3|wav|ogg|m4a|aac|flac|webm|mp4|mpeg)$/i.test(file.name);
}
function formatTime(seconds) {
	if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
	const whole = Math.floor(seconds);
	return `${Math.floor(whole / 60)}:${(whole % 60).toString().padStart(2, "0")}`;
}
function clampSensitivity(value) {
	if (!Number.isFinite(value)) return 1.35;
	return Math.min(3, Math.max(.45, value));
}
function VisualizerApp() {
	const rootRef = (0, import_react.useRef)(null);
	const stageRef = (0, import_react.useRef)(null);
	const canvasRef = (0, import_react.useRef)(null);
	const audioRef = (0, import_react.useRef)(null);
	const fileRef = (0, import_react.useRef)(null);
	const engineRef = (0, import_react.useRef)(null);
	const alive = (0, import_react.useRef)(true);
	const overDock = (0, import_react.useRef)(false);
	const hideTimer = (0, import_react.useRef)(0);
	const [mode, setMode] = (0, import_react.useState)("bars");
	const [themeId, setThemeId] = (0, import_react.useState)("aurora");
	const [sensitivity, setSensitivity] = (0, import_react.useState)(1.35);
	const [source, setSource] = (0, import_react.useState)("idle");
	const [playing, setPlaying] = (0, import_react.useState)(false);
	const [trackName, setTrackName] = (0, import_react.useState)("");
	const [error, setError] = (0, import_react.useState)(null);
	const [current, setCurrent] = (0, import_react.useState)(0);
	const [duration, setDuration] = (0, import_react.useState)(0);
	const [hold, setHold] = (0, import_react.useState)(true);
	const [cinema, setCinema] = (0, import_react.useState)(false);
	const [fullscreen, setFullscreen] = (0, import_react.useState)(false);
	const [dragOver, setDragOver] = (0, import_react.useState)(false);
	const [reduced, setReduced] = (0, import_react.useState)(false);
	const [ready, setReady] = (0, import_react.useState)(false);
	const settings = (0, import_react.useRef)({
		mode,
		themeId,
		sensitivity,
		source,
		playing,
		reduced
	});
	settings.current = {
		mode,
		themeId,
		sensitivity,
		source,
		playing,
		reduced
	};
	const sourceRef = (0, import_react.useRef)(source);
	const cinemaRef = (0, import_react.useRef)(cinema);
	sourceRef.current = source;
	cinemaRef.current = cinema;
	function clearHide() {
		window.clearTimeout(hideTimer.current);
	}
	function scheduleHide() {
		clearHide();
		if (overDock.current) return;
		if (sourceRef.current === "idle" && !cinemaRef.current) return;
		hideTimer.current = window.setTimeout(() => setHold(false), 2800);
	}
	function reveal() {
		setHold(true);
		scheduleHide();
	}
	(0, import_react.useEffect)(() => {
		alive.current = true;
		return () => {
			alive.current = false;
			clearHide();
		};
	}, []);
	(0, import_react.useEffect)(() => {
		const media = window.matchMedia("(prefers-reduced-motion: reduce)");
		const apply = () => setReduced(media.matches);
		apply();
		media.addEventListener("change", apply);
		return () => media.removeEventListener("change", apply);
	}, []);
	(0, import_react.useEffect)(() => {
		try {
			const raw = localStorage.getItem(PREFS_KEY);
			if (!raw) return;
			const saved = JSON.parse(raw);
			if (saved.mode === "bars" || saved.mode === "rings" || saved.mode === "bloom") setMode(saved.mode);
			if (saved.themeId && THEMES.some((theme) => theme.id === saved.themeId)) setThemeId(saved.themeId);
			if (typeof saved.sensitivity === "number") setSensitivity(clampSensitivity(saved.sensitivity));
		} catch {}
	}, []);
	const skipSave = (0, import_react.useRef)(true);
	(0, import_react.useEffect)(() => {
		if (skipSave.current) {
			skipSave.current = false;
			return;
		}
		localStorage.setItem(PREFS_KEY, JSON.stringify({
			mode,
			themeId,
			sensitivity
		}));
	}, [
		mode,
		themeId,
		sensitivity
	]);
	(0, import_react.useEffect)(() => {
		if (source === "idle" && !cinema) setHold(true);
		else scheduleHide();
	}, [source, cinema]);
	(0, import_react.useEffect)(() => {
		const audio = audioRef.current;
		const canvas = canvasRef.current;
		const stage = stageRef.current;
		const root = rootRef.current;
		if (!audio || !canvas || !stage || !root) return;
		const ctx = canvas.getContext("2d", { alpha: false });
		if (!ctx) return;
		const engine = new AudioEngine(audio);
		engineRef.current = engine;
		setReady(true);
		const view = {
			w: 0,
			h: 0,
			dpr: 1
		};
		const shown = new Float32Array(BANDS);
		const peaks = new Float32Array(BANDS);
		const target = new Float32Array(BANDS);
		const wave = new Float32Array(WAVE);
		let smoothBass = 0;
		let punch = 0;
		let last = performance.now();
		let raf = 0;
		let running = true;
		const fit = () => {
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const w = stage.clientWidth;
			const h = stage.clientHeight;
			const pw = Math.max(1, Math.round(w * dpr));
			const ph = Math.max(1, Math.round(h * dpr));
			if (canvas.width !== pw || canvas.height !== ph) {
				canvas.width = pw;
				canvas.height = ph;
			}
			view.w = w;
			view.h = h;
			view.dpr = dpr;
		};
		fit();
		const observer = new ResizeObserver(fit);
		observer.observe(stage);
		const loop = (now) => {
			if (!running) return;
			const dt = Math.min(.05, (now - last) / 1e3);
			last = now;
			const s = settings.current;
			if ((s.source === "mic" || s.source === "file" && s.playing) && engine.read(target, wave)) {
				const gain = Math.min(1.7, .45 + s.sensitivity * .4);
				for (let i = 0; i < target.length; i++) target[i] = shapeBand(target[i] ?? 0, s.sensitivity);
				for (let i = 0; i < wave.length; i++) wave[i] = (wave[i] ?? 0) * gain;
			} else if (s.source === "file") {
				target.fill(0);
				for (let i = 0; i < wave.length; i++) wave[i] = (wave[i] ?? 0) * .9;
			} else {
				idleTarget(target, now / 1e3, s.reduced);
				idleWave(wave, now / 1e3, s.reduced);
			}
			let bassAcc = 0;
			let midAcc = 0;
			let highAcc = 0;
			const bN = Math.max(1, Math.round(BANDS * .12));
			const m1 = Math.round(BANDS * .5);
			for (let i = 0; i < BANDS; i++) {
				const next = target[i] ?? 0;
				const prev = shown[i] ?? 0;
				const k = next > prev ? .48 : .1 + dt;
				shown[i] = prev + (next - prev) * Math.min(1, k);
				const level = shown[i] ?? 0;
				const peak = peaks[i] ?? 0;
				peaks[i] = level >= peak ? level : peak + (level - peak) * .035;
				if (i < bN) bassAcc += level;
				else if (i < m1) midAcc += level;
				else highAcc += level;
			}
			const bass = bassAcc / bN;
			const mid = midAcc / Math.max(1, 36);
			const high = highAcc / Math.max(1, 48);
			smoothBass += (bass - smoothBass) * .08;
			punch += (bass - punch) * .32;
			root.style.setProperty("--bass", punch.toFixed(3));
			ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
			renderScene(ctx, view.w, view.h, {
				mode: s.mode,
				theme: themeById(s.themeId),
				levels: shown,
				peaks,
				wave,
				bass: smoothBass,
				punch,
				mid,
				high,
				time: now / 1e3,
				reduced: s.reduced
			});
			raf = requestAnimationFrame(loop);
		};
		const onVis = () => {
			if (document.hidden) {
				running = false;
				cancelAnimationFrame(raf);
			} else if (!running) {
				running = true;
				last = performance.now();
				raf = requestAnimationFrame(loop);
			}
		};
		document.addEventListener("visibilitychange", onVis);
		raf = requestAnimationFrame(loop);
		const onPlay = () => setPlaying(true);
		const onPause = () => setPlaying(false);
		const onTime = () => setCurrent(audio.currentTime || 0);
		const onMeta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
		const onEnd = () => setPlaying(false);
		const onErr = () => {
			if (!engine.fileLoaded) return;
			setError("这个音轨解不了。换 mp3、wav、m4a 或 ogg 试试。");
			setPlaying(false);
		};
		audio.addEventListener("play", onPlay);
		audio.addEventListener("pause", onPause);
		audio.addEventListener("timeupdate", onTime);
		audio.addEventListener("durationchange", onMeta);
		audio.addEventListener("loadedmetadata", onMeta);
		audio.addEventListener("ended", onEnd);
		audio.addEventListener("error", onErr);
		const onFs = () => {
			const on = document.fullscreenElement === root;
			setFullscreen(on);
			if (!on) setCinema(false);
		};
		document.addEventListener("fullscreenchange", onFs);
		return () => {
			running = false;
			cancelAnimationFrame(raf);
			observer.disconnect();
			document.removeEventListener("visibilitychange", onVis);
			document.removeEventListener("fullscreenchange", onFs);
			audio.removeEventListener("play", onPlay);
			audio.removeEventListener("pause", onPause);
			audio.removeEventListener("timeupdate", onTime);
			audio.removeEventListener("durationchange", onMeta);
			audio.removeEventListener("loadedmetadata", onMeta);
			audio.removeEventListener("ended", onEnd);
			audio.removeEventListener("error", onErr);
			engine.dispose();
			engineRef.current = null;
		};
	}, []);
	async function toggleMic() {
		const engine = engineRef.current;
		if (!engine) return;
		if (source === "mic") {
			engine.stopMic();
			setSource(engine.fileLoaded ? "file" : "idle");
			setError(null);
			return;
		}
		try {
			await engine.startMic();
			if (!alive.current) return;
			setSource("mic");
			setPlaying(false);
			setError(null);
		} catch {
			if (!alive.current) return;
			engine.stopMic();
			setSource(engine.fileLoaded ? "file" : "idle");
			setError("没有麦克风权限。允许后再试，或直接上传音轨。");
		}
	}
	async function openFile(file) {
		if (!file) return;
		if (!isAudioFile(file)) {
			setError("请放下音频文件，比如 mp3、wav、m4a。");
			return;
		}
		const engine = engineRef.current;
		if (!engine) return;
		setError(null);
		try {
			await engine.loadFile(file);
			if (!alive.current) return;
			setSource("file");
			setTrackName(file.name.replace(/\.[^.]+$/, ""));
			setPlaying(true);
		} catch {
			if (!alive.current) return;
			setError("播放没开始。再点一次播放，或换一个文件。");
			setPlaying(false);
		}
	}
	async function togglePlay() {
		const engine = engineRef.current;
		if (!engine || !engine.fileLoaded) return;
		try {
			if (engine.audio.paused) {
				await engine.play();
				if (alive.current) setSource("file");
			} else engine.pause();
		} catch {
			if (alive.current) setError("浏览器拦住了自动播放。再点一次播放。");
		}
	}
	async function toggleFullscreen() {
		const root = rootRef.current;
		if (!root) return;
		if (Boolean(document.fullscreenElement) || cinema) {
			setCinema(false);
			setHold(true);
			if (document.fullscreenElement) try {
				await document.exitFullscreen();
			} catch {}
			return;
		}
		setCinema(true);
		setHold(false);
		try {
			await root.requestFullscreen();
		} catch {}
	}
	(0, import_react.useEffect)(() => {
		const onKey = (event) => {
			const target = event.target;
			if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
			if (event.code === "Space") {
				if (target instanceof HTMLButtonElement) return;
				event.preventDefault();
				togglePlay();
			} else if (event.key === "f" || event.key === "F") {
				event.preventDefault();
				toggleFullscreen();
			} else if (event.key === "1") setMode("bars");
			else if (event.key === "2") setMode("rings");
			else if (event.key === "3") setMode("bloom");
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});
	const theme = themeById(themeId);
	const immersed = !hold;
	const fsOn = fullscreen || cinema;
	const status = source === "mic" ? "麦克风正在驱动画面" : source === "file" ? trackName || "音轨" : "等待声音。现在的律动只是预览。";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		ref: rootRef,
		className: "relative h-dvh w-full overflow-hidden bg-bg text-fg select-none",
		onPointerMove: reveal,
		onPointerDown: reveal,
		onDragOver: (event) => {
			event.preventDefault();
			setDragOver(true);
		},
		onDragLeave: (event) => {
			const next = event.relatedTarget;
			if (next instanceof Node && event.currentTarget.contains(next)) return;
			setDragOver(false);
		},
		onDrop: (event) => {
			event.preventDefault();
			setDragOver(false);
			const file = event.dataTransfer.files[0];
			openFile(file);
		},
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				ref: stageRef,
				className: "absolute inset-0",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("canvas", {
					ref: canvasRef,
					className: "block h-full w-full",
					"aria-hidden": true
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("audio", {
				ref: audioRef,
				preload: "auto",
				className: "pointer-events-none absolute size-0 opacity-0"
			}),
			dragOver ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "pointer-events-none absolute inset-0 z-30 grid place-items-center bg-bg/80",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "font-display text-3xl font-bold text-fg",
					children: "松开以载入音轨"
				})
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: clsx("pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-4 transition-opacity duration-300 sm:p-6", immersed ? "opacity-0" : "opacity-100"),
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "max-w-sm",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "font-display text-xs font-bold tracking-widest text-accent",
							children: "LUMEN"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
							className: "mt-1 font-display text-4xl leading-none font-extrabold text-fg",
							children: "流光"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-3 text-sm leading-relaxed text-muted",
							children: status
						})
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2 rounded-full border border-line bg-glass px-3 py-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "flex h-4 items-end gap-0.5",
						"aria-hidden": true,
						children: [
							.55,
							.85,
							1,
							.7
						].map((vu) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "vu-bar",
							style: { ["--vu"]: String(vu) }
						}, vu))
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-xs text-muted",
						children: source === "mic" ? "麦克风" : source === "file" ? playing ? "播放中" : "已暂停" : "预览"
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: clsx("absolute inset-x-0 bottom-0 z-20 px-3 transition-[opacity,transform] duration-300 ease-out sm:px-6", immersed ? "pointer-events-none translate-y-3 opacity-0" : "translate-y-0 opacity-100"),
				style: { paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" },
				onPointerEnter: () => {
					overDock.current = true;
					reveal();
				},
				onPointerLeave: () => {
					overDock.current = false;
					scheduleHide();
				},
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto w-full max-w-3xl rounded-3xl border border-line bg-glass px-3 py-3 shadow-2xl sm:px-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap items-center justify-between gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								role: "radiogroup",
								"aria-label": "可视化模式",
								className: "flex gap-1",
								children: MODES.map((item) => {
									const Icon = item.icon;
									const active = mode === item.id;
									return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
										type: "button",
										role: "radio",
										"aria-checked": active,
										onClick: () => setMode(item.id),
										className: clsx("inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-transform duration-150 ease-out active:scale-[0.96]", active ? "bg-accent text-ink" : "text-fg hover:bg-line"),
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
											className: "size-4",
											"aria-hidden": true
										}), item.label]
									}, item.id);
								})
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: () => void toggleFullscreen(),
								"aria-pressed": fsOn,
								className: "inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm text-fg transition-transform duration-150 ease-out hover:bg-line active:scale-[0.96]",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "relative block size-4",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Maximize2, { className: clsx("absolute inset-0 size-4 transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]", fsOn ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-none") }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Minimize2, { className: clsx("absolute inset-0 size-4 transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]", fsOn ? "scale-100 opacity-100 blur-none" : "scale-[0.25] opacity-0 blur-[4px]") })]
								}), fsOn ? "退出" : "全屏"]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-3 flex items-center gap-1",
							role: "radiogroup",
							"aria-label": "配色",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "mr-1 text-xs text-muted",
									children: "配色"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "mr-2 text-xs font-medium text-fg",
									children: theme.name
								}),
								THEMES.map((item) => {
									const active = item.id === themeId;
									const [a, , c] = item.stops;
									return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										role: "radio",
										"aria-checked": active,
										"aria-label": item.name,
										onClick: () => setThemeId(item.id),
										className: "grid size-11 place-items-center rounded-full transition-transform duration-150 ease-out active:scale-[0.96]",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "block size-5 rounded-full",
											style: {
												background: `linear-gradient(140deg, rgb(${a.join(",")}) 0%, rgb(${c.join(",")}) 100%)`,
												boxShadow: active ? "0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-accent)" : "inset 0 0 0 1px rgb(255 255 255 / 22%)"
											}
										})
									}, item.id);
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-2 flex flex-wrap items-center gap-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									onClick: () => void toggleMic(),
									disabled: !ready,
									"aria-pressed": source === "mic",
									className: clsx("inline-flex h-11 items-center gap-2 rounded-full px-3 text-sm font-medium transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-40", source === "mic" ? "bg-accent text-ink" : "text-fg hover:bg-line"),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Mic, {
										className: "size-4",
										"aria-hidden": true
									}), "麦克风"]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									onClick: () => fileRef.current?.click(),
									disabled: !ready,
									"aria-pressed": source === "file",
									className: clsx("inline-flex h-11 items-center gap-2 rounded-full px-3 text-sm font-medium transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-40", source === "file" ? "bg-accent text-ink" : "text-fg hover:bg-line"),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Upload, {
										className: "size-4",
										"aria-hidden": true
									}), "上传"]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									ref: fileRef,
									type: "file",
									accept: "audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm",
									className: "sr-only",
									onChange: (event) => {
										const file = event.target.files?.[0];
										event.target.value = "";
										openFile(file);
									}
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									onClick: () => void togglePlay(),
									disabled: !ready || source !== "file" && !engineRef.current?.fileLoaded,
									"aria-label": playing ? "暂停" : "播放",
									className: "inline-flex h-11 items-center gap-2 rounded-full bg-fg px-3 text-sm font-medium text-bg transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-40",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "relative block size-4",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, { className: clsx("absolute inset-0 size-4 transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]", playing ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-none") }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pause, { className: clsx("absolute inset-0 size-4 transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]", playing ? "scale-100 opacity-100 blur-none" : "scale-[0.25] opacity-0 blur-[4px]") })]
									}), playing ? "暂停" : "播放"]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "min-w-0 flex-1 truncate text-sm text-muted",
									children: error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-danger",
										children: error
									}) : source === "file" ? trackName : "拖入音轨，或点麦克风"
								})
							]
						}),
						source === "file" && duration > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-2 flex items-center gap-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "w-10 text-xs text-muted tabular-nums",
									children: formatTime(current)
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									className: "lumen-range min-w-0 flex-1",
									type: "range",
									min: 0,
									max: duration,
									step: .01,
									value: Math.min(current, duration),
									"aria-label": "播放进度",
									onChange: (event) => {
										const next = Number(event.target.value);
										const audio = audioRef.current;
										if (!audio) return;
										audio.currentTime = next;
										setCurrent(next);
									}
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "w-10 text-right text-xs text-muted tabular-nums",
									children: formatTime(duration)
								})
							]
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "mt-1 flex items-center gap-3 text-sm text-muted",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "shrink-0",
									children: "灵敏度"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									className: "lumen-range min-w-0 flex-1",
									type: "range",
									min: .45,
									max: 3,
									step: .05,
									value: sensitivity,
									"aria-label": "灵敏度",
									onChange: (event) => setSensitivity(clampSensitivity(Number(event.target.value)))
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "w-10 text-right text-xs text-fg tabular-nums",
									children: [sensitivity.toFixed(1), "×"]
								})
							]
						})
					]
				})
			})
		]
	});
}
var SplitComponent = VisualizerApp;
//#endregion
export { SplitComponent as component };
