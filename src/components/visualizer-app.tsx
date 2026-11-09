import { useEffect, useRef, useState } from "react";
import {
  Aperture,
  AudioLines,
  Maximize2,
  Mic,
  Minimize2,
  Pause,
  Play,
  Radius,
  Upload,
} from "lucide-react";
import { clsx } from "clsx";
import {
  AudioEngine,
  idleTarget,
  idleWave,
  shapeBand,
} from "@/lib/visualizer/engine";
import { renderScene, type VizMode } from "@/lib/visualizer/draw";
import { THEMES, themeById, type ThemeId } from "@/lib/visualizer/themes";

const BANDS = 96;
const WAVE = 160;
const PREFS_KEY = "lumen-prefs";

const MODES: { id: VizMode; label: string; icon: typeof AudioLines }[] = [
  { id: "bars", label: "条形", icon: AudioLines },
  { id: "rings", label: "环形", icon: Radius },
  { id: "bloom", label: "涟漪", icon: Aperture },
];

type Source = "idle" | "mic" | "file";

type Settings = {
  mode: VizMode;
  themeId: ThemeId;
  sensitivity: number;
  source: Source;
  playing: boolean;
  reduced: boolean;
};

function isAudioFile(file: File) {
  if (file.type.startsWith("audio/")) return true;
  return /\.(mp3|wav|ogg|m4a|aac|flac|webm|mp4|mpeg)$/i.test(file.name);
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function clampSensitivity(value: number) {
  if (!Number.isFinite(value)) return 1.35;
  return Math.min(3, Math.max(0.45, value));
}

export function VisualizerApp() {
  const rootRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const alive = useRef(true);
  const overDock = useRef(false);
  const hideTimer = useRef(0);

  const [mode, setMode] = useState<VizMode>("bars");
  const [themeId, setThemeId] = useState<ThemeId>("aurora");
  const [sensitivity, setSensitivity] = useState(1.35);
  const [source, setSource] = useState<Source>("idle");
  const [playing, setPlaying] = useState(false);
  const [trackName, setTrackName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hold, setHold] = useState(true);
  const [cinema, setCinema] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [ready, setReady] = useState(false);

  const settings = useRef<Settings>({
    mode,
    themeId,
    sensitivity,
    source,
    playing,
    reduced,
  });
  settings.current = { mode, themeId, sensitivity, source, playing, reduced };

  const sourceRef = useRef(source);
  const cinemaRef = useRef(cinema);
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

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearHide();
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<{
        mode: VizMode;
        themeId: string;
        sensitivity: number;
      }>;
      if (saved.mode === "bars" || saved.mode === "rings" || saved.mode === "bloom") {
        setMode(saved.mode);
      }
      if (saved.themeId && THEMES.some((theme) => theme.id === saved.themeId)) {
        setThemeId(saved.themeId as ThemeId);
      }
      if (typeof saved.sensitivity === "number") setSensitivity(clampSensitivity(saved.sensitivity));
    } catch {
      /* ignore broken prefs */
    }
  }, []);

  const skipSave = useRef(true);
  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    localStorage.setItem(PREFS_KEY, JSON.stringify({ mode, themeId, sensitivity }));
  }, [mode, themeId, sensitivity]);

  useEffect(() => {
    if (source === "idle" && !cinema) setHold(true);
    else scheduleHide();
    // scheduleHide reads refs that are updated every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, cinema]);

  useEffect(() => {
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

    const view = { w: 0, h: 0, dpr: 1 };
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

    const loop = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = settings.current;
      const live = s.source === "mic" || (s.source === "file" && s.playing);
      if (live && engine.read(target, wave)) {
        const gain = Math.min(1.7, 0.45 + s.sensitivity * 0.4);
        for (let i = 0; i < target.length; i++) target[i] = shapeBand(target[i] ?? 0, s.sensitivity);
        for (let i = 0; i < wave.length; i++) wave[i] = (wave[i] ?? 0) * gain;
      } else if (s.source === "file") {
        target.fill(0);
        for (let i = 0; i < wave.length; i++) wave[i] = (wave[i] ?? 0) * 0.9;
      } else {
        idleTarget(target, now / 1000, s.reduced);
        idleWave(wave, now / 1000, s.reduced);
      }

      let bassAcc = 0;
      let midAcc = 0;
      let highAcc = 0;
      const bN = Math.max(1, Math.round(BANDS * 0.12));
      const m1 = Math.round(BANDS * 0.5);
      for (let i = 0; i < BANDS; i++) {
        const next = target[i] ?? 0;
        const prev = shown[i] ?? 0;
        const k = next > prev ? 0.48 : 0.1 + dt;
        shown[i] = prev + (next - prev) * Math.min(1, k);
        const level = shown[i] ?? 0;
        const peak = peaks[i] ?? 0;
        peaks[i] = level >= peak ? level : peak + (level - peak) * 0.035;
        if (i < bN) bassAcc += level;
        else if (i < m1) midAcc += level;
        else highAcc += level;
      }
      const bass = bassAcc / bN;
      const mid = midAcc / Math.max(1, m1 - bN);
      const high = highAcc / Math.max(1, BANDS - m1);
      smoothBass += (bass - smoothBass) * 0.08;
      punch += (bass - punch) * 0.32;
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
        time: now / 1000,
        reduced: s.reduced,
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

  async function openFile(file: File | undefined) {
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
      } else {
        engine.pause();
      }
    } catch {
      if (alive.current) setError("浏览器拦住了自动播放。再点一次播放。");
    }
  }

  async function toggleFullscreen() {
    const root = rootRef.current;
    if (!root) return;
    const active = Boolean(document.fullscreenElement) || cinema;
    if (active) {
      setCinema(false);
      setHold(true);
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch {
          /* already left */
        }
      }
      return;
    }
    setCinema(true);
    setHold(false);
    try {
      await root.requestFullscreen();
    } catch {
      /* Cinema mode still clears the controls when the browser blocks fullscreen. */
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (event.code === "Space") {
        if (target instanceof HTMLButtonElement) return;
        event.preventDefault();
        void togglePlay();
      } else if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        void toggleFullscreen();
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
  const status =
    source === "mic"
      ? "麦克风正在驱动画面"
      : source === "file"
        ? trackName || "音轨"
        : "等待声音。现在的律动只是预览。";

  return (
    <main
      ref={rootRef}
      className="relative h-dvh w-full overflow-hidden bg-bg text-fg select-none"
      onPointerMove={reveal}
      onPointerDown={reveal}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setDragOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        const file = event.dataTransfer.files[0];
        void openFile(file);
      }}
    >
      <div ref={stageRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="block h-full w-full" aria-hidden />
      </div>
      <audio ref={audioRef} preload="auto" className="pointer-events-none absolute size-0 opacity-0" />

      {dragOver ? (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-bg/80">
          <p className="font-display text-3xl font-bold text-fg">松开以载入音轨</p>
        </div>
      ) : null}

      <header
        className={clsx(
          "pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-4 transition-opacity duration-300 sm:p-6",
          immersed ? "opacity-0" : "opacity-100",
        )}
      >
        <div className="max-w-sm">
          <p className="font-display text-xs font-bold tracking-widest text-accent">LUMEN</p>
          <h1 className="mt-1 font-display text-4xl leading-none font-extrabold text-fg">流光</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">{status}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-line bg-glass px-3 py-2">
          <span className="flex h-4 items-end gap-0.5" aria-hidden>
            {[0.55, 0.85, 1, 0.7].map((vu) => (
              <span key={vu} className="vu-bar" style={{ ["--vu" as string]: String(vu) }} />
            ))}
          </span>
          <span className="text-xs text-muted">
            {source === "mic" ? "麦克风" : source === "file" ? (playing ? "播放中" : "已暂停") : "预览"}
          </span>
        </div>
      </header>

      <div
        className={clsx(
          "absolute inset-x-0 bottom-0 z-20 px-3 transition-[opacity,transform] duration-300 ease-out sm:px-6",
          immersed ? "pointer-events-none translate-y-3 opacity-0" : "translate-y-0 opacity-100",
        )}
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        onPointerEnter={() => {
          overDock.current = true;
          reveal();
        }}
        onPointerLeave={() => {
          overDock.current = false;
          scheduleHide();
        }}
      >
        <div className="mx-auto w-full max-w-3xl rounded-3xl border border-line bg-glass px-3 py-3 shadow-2xl sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div role="radiogroup" aria-label="可视化模式" className="flex gap-1">
              {MODES.map((item) => {
                const Icon = item.icon;
                const active = mode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setMode(item.id)}
                    className={clsx(
                      "inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-transform duration-150 ease-out active:scale-[0.96]",
                      active ? "bg-accent text-ink" : "text-fg hover:bg-line",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {item.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              aria-pressed={fsOn}
              className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm text-fg transition-transform duration-150 ease-out hover:bg-line active:scale-[0.96]"
            >
              <span className="relative block size-4">
                <Maximize2
                  className={clsx(
                    "absolute inset-0 size-4 transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                    fsOn ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-none",
                  )}
                />
                <Minimize2
                  className={clsx(
                    "absolute inset-0 size-4 transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                    fsOn ? "scale-100 opacity-100 blur-none" : "scale-[0.25] opacity-0 blur-[4px]",
                  )}
                />
              </span>
              {fsOn ? "退出" : "全屏"}
            </button>
          </div>

          <div className="mt-3 flex items-center gap-1" role="radiogroup" aria-label="配色">
            <span className="mr-1 text-xs text-muted">配色</span>
            <span className="mr-2 text-xs font-medium text-fg">{theme.name}</span>
            {THEMES.map((item) => {
              const active = item.id === themeId;
              const [a, , c] = item.stops;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={item.name}
                  onClick={() => setThemeId(item.id)}
                  className="grid size-11 place-items-center rounded-full transition-transform duration-150 ease-out active:scale-[0.96]"
                >
                  <span
                    className="block size-5 rounded-full"
                    style={{
                      background: `linear-gradient(140deg, rgb(${a.join(",")}) 0%, rgb(${c.join(",")}) 100%)`,
                      boxShadow: active
                        ? "0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-accent)"
                        : "inset 0 0 0 1px rgb(255 255 255 / 22%)",
                    }}
                  />
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void toggleMic()}
              disabled={!ready}
              aria-pressed={source === "mic"}
              className={clsx(
                "inline-flex h-11 items-center gap-2 rounded-full px-3 text-sm font-medium transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-40",
                source === "mic" ? "bg-accent text-ink" : "text-fg hover:bg-line",
              )}
            >
              <Mic className="size-4" aria-hidden />
              麦克风
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={!ready}
              aria-pressed={source === "file"}
              className={clsx(
                "inline-flex h-11 items-center gap-2 rounded-full px-3 text-sm font-medium transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-40",
                source === "file" ? "bg-accent text-ink" : "text-fg hover:bg-line",
              )}
            >
              <Upload className="size-4" aria-hidden />
              上传
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void openFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => void togglePlay()}
              disabled={!ready || source !== "file" && !engineRef.current?.fileLoaded}
              aria-label={playing ? "暂停" : "播放"}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-fg px-3 text-sm font-medium text-bg transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-40"
            >
              <span className="relative block size-4">
                <Play
                  className={clsx(
                    "absolute inset-0 size-4 transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                    playing ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-none",
                  )}
                />
                <Pause
                  className={clsx(
                    "absolute inset-0 size-4 transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                    playing ? "scale-100 opacity-100 blur-none" : "scale-[0.25] opacity-0 blur-[4px]",
                  )}
                />
              </span>
              {playing ? "暂停" : "播放"}
            </button>
            <p className="min-w-0 flex-1 truncate text-sm text-muted">
              {error ? <span className="text-danger">{error}</span> : source === "file" ? trackName : "拖入音轨，或点麦克风"}
            </p>
          </div>

          {source === "file" && duration > 0 ? (
            <div className="mt-2 flex items-center gap-2">
              <span className="w-10 text-xs text-muted tabular-nums">{formatTime(current)}</span>
              <input
                className="lumen-range min-w-0 flex-1"
                type="range"
                min={0}
                max={duration}
                step={0.01}
                value={Math.min(current, duration)}
                aria-label="播放进度"
                onChange={(event) => {
                  const next = Number(event.target.value);
                  const audio = audioRef.current;
                  if (!audio) return;
                  audio.currentTime = next;
                  setCurrent(next);
                }}
              />
              <span className="w-10 text-right text-xs text-muted tabular-nums">{formatTime(duration)}</span>
            </div>
          ) : null}

          <label className="mt-1 flex items-center gap-3 text-sm text-muted">
            <span className="shrink-0">灵敏度</span>
            <input
              className="lumen-range min-w-0 flex-1"
              type="range"
              min={0.45}
              max={3}
              step={0.05}
              value={sensitivity}
              aria-label="灵敏度"
              onChange={(event) => setSensitivity(clampSensitivity(Number(event.target.value)))}
            />
            <span className="w-10 text-right text-xs text-fg tabular-nums">{sensitivity.toFixed(1)}×</span>
          </label>
        </div>
      </div>
    </main>
  );
}
