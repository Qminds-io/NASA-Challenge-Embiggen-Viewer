import { useNavigate } from "react-router-dom";

/* ========= util ========= */
function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

/** Config genérica de cuerpos */
type Proj = "EPSG:3857" | "EPSG:4326";
type BodyId =
  | "Sun"
  | "Mercury"
  | "Venus"
  | "Earth"
  | "Moon"
  | "Mars"
  | "Ceres"
  | "Jupiter"
  | "Saturn"
  | "Vesta"
  | "Europa"
  | "Titan";

type BodyConfig = {
  id: BodyId;
  name: string;
  emoji: string;
  /** 1 = primera órbita alrededor del sol (cerca), 2 = siguiente, etc. */
  ring?: number;
  /** Si es luna, indica el planeta padre (p.ej. "Earth"). */
  isMoonOf?: BodyId;
  /** Si está habilitado para abrir Map.tsx. */
  enabled: boolean;
  /** Clave que Map.tsx entiende (y proyección) — solo si enabled. */
  key?: string;
  proj?: Proj;
  /** Texto corto visible bajo el botón/tooltip. */
  label?: string;
  /** Tooltip detallado. */
  tooltip: {
    title: string;
    lines: string[];
  };
  /** Tema visual para el botón. */
  theme?: "earth" | "mars" | "ceres" | "venus" | "mercury" | "gas";
};

/** Solo cuerpos habilitados apuntan a capas que sabemos funcionan con tu Map.tsx actual */
const BODIES: BodyConfig[] = [
  // ——— Planetas habilitados ———
  {
    id: "Earth",
    name: "Tierra",
    emoji: "🌍",
    ring: 2,
    enabled: true,
    key: "gibs:MODIS_Terra_CorrectedReflectance_TrueColor",
    proj: "EPSG:3857",
    label: "GIBS — MODIS Terra True Color",
    tooltip: {
      title: "Tierra",
      lines: [
        "Fuente: NASA EOSDIS GIBS",
        "Capa por defecto: MODIS Terra True Color",
        "Proyección: EPSG:3857 (Web Mercator)",
      ],
    },
    theme: "earth",
  },
  {
    id: "Mars",
    name: "Marte",
    emoji: "🪐",
    ring: 3,
    enabled: true,
    key: "trek:Mars:https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m",
    proj: "EPSG:4326",
    label: "MOLA Color/Shaded (463m)",
    tooltip: {
      title: "Marte",
      lines: [
        "Fuente: NASA Solar System Treks",
        "Capa por defecto: MGS MOLA Color/Shaded",
        "Proyección: EPSG:4326 (WGS84)",
      ],
    },
    theme: "mars",
  },
  {
    id: "Ceres",
    name: "Ceres",
    emoji: "🛰️",
    ring: 4,
    enabled: true,
    key: "trek:Ceres:https://trek.nasa.gov/tiles/Ceres/EQ/Ceres_Dawn_FC_HAMO_ClrShade_DLR_Global_60ppd_Oct2016",
    proj: "EPSG:4326",
    label: "Dawn FC HAMO Color/Shaded (60ppd)",
    tooltip: {
      title: "Ceres",
      lines: [
        "Fuente: NASA Solar System Treks",
        "Capa por defecto: Dawn FC HAMO (Color/Shaded)",
        "Proyección: EPSG:4326 (WGS84)",
      ],
    },
    theme: "ceres",
  },

  // ——— Lunas habilitadas ———
  {
    id: "Moon",
    name: "Luna",
    emoji: "🌙",
    isMoonOf: "Earth",
    enabled: true,
    key: "trek:Moon:https://trek.nasa.gov/tiles/Moon/EQ/LRO_LOLA_ClrShade_Global_128ppd_v04",
    proj: "EPSG:4326",
    label: "LRO LOLA Color/Shaded (128ppd)",
    tooltip: {
      title: "Luna",
      lines: [
        "Fuente: NASA Solar System Treks",
        "Capa por defecto: LRO LOLA Color/Shaded",
        "Proyección: EPSG:4326 (WGS84)",
      ],
    },
    theme: "earth",
  },

  // ——— Planetas/moons “próximamente” (deshabilitados para no romper el visor) ———
  {
    id: "Mercury",
    name: "Mercurio",
    emoji: "☿️",
    ring: 1,
    enabled: false,
    tooltip: { title: "Mercurio", lines: ["Próximamente."] },
    theme: "mercury",
  },
  {
    id: "Venus",
    name: "Venus",
    emoji: "♀️",
    ring: 1.6 as any, // solo visual
    enabled: false,
    tooltip: { title: "Venus", lines: ["Próximamente."] },
    theme: "venus",
  },
  {
    id: "Vesta",
    name: "Vesta",
    emoji: "🪨",
    ring: 4.6 as any,
    enabled: false,
    tooltip: { title: "Vesta", lines: ["Próximamente."] },
    theme: "ceres",
  },
  {
    id: "Jupiter",
    name: "Júpiter",
    emoji: "♃",
    ring: 6,
    enabled: false,
    tooltip: { title: "Júpiter", lines: ["Próximamente."] },
    theme: "gas",
  },
  {
    id: "Saturn",
    name: "Saturno",
    emoji: "♄",
    ring: 7,
    enabled: false,
    tooltip: { title: "Saturno", lines: ["Próximamente."] },
    theme: "gas",
  },
  {
    id: "Europa",
    name: "Europa",
    emoji: "🧊",
    isMoonOf: "Jupiter",
    enabled: false,
    tooltip: { title: "Europa (Luna de Júpiter)", lines: ["Próximamente."] },
    theme: "gas",
  },
  {
    id: "Titan",
    name: "Titán",
    emoji: "🟤",
    isMoonOf: "Saturn",
    enabled: false,
    tooltip: { title: "Titán (Luna de Saturno)", lines: ["Próximamente."] },
    theme: "gas",
  },
];

/* ========= Vista principal ========= */
export default function SolarSystem() {
  const navigate = useNavigate();

  const openBody = (b: BodyConfig) => {
    if (!b.enabled || !b.key || !b.proj) return;
    const hash = `#,,,${todayISO()},${b.key},${b.proj}`;
    navigate({ pathname: "/map", hash });
  };

  const enabledBodies = BODIES.filter((b) => b.enabled && !b.isMoonOf);
  const enabledMoons = BODIES.filter((b) => b.enabled && b.isMoonOf);

  return (
    <div className="min-h-screen relative bg-gradient-to-b from-slate-900 via-slate-950 to-black text-slate-100 overflow-hidden">
      {/* Encabezado */}
      <div className="max-w-6xl mx-auto px-4 pt-6">
        <div className="flex items-center gap-3">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_0_6px_rgba(56,189,248,0.25)]" />
          <h1 className="text-xl font-extrabold tracking-tight">
            Embiggen Viewer — Sistema Solar
          </h1>
        </div>
        <p className="mt-2 text-sm text-slate-300">
          Toca un cuerpo para abrir el visor con su capa predeterminada. En el visor podrás cambiar capas del mismo cuerpo.
        </p>
      </div>

      {/* Diagrama orbital (md+) */}
      <div className="hidden md:block">
        <SolarDiagram
          bodies={BODIES}
          onOpen={openBody}
        />
      </div>

      {/* Fallback móvil: tarjetas solo de habilitados */}
      <div className="block md:hidden max-w-6xl mx-auto px-4 pb-14">
        <div className="grid grid-cols-1 xs:grid-cols-2 gap-4 mt-6">
          {enabledBodies.map((b) => (
            <PlanetCard
              key={b.id}
              name={b.name}
              emoji={b.emoji}
              caption={b.label ?? ""}
              onOpen={() => openBody(b)}
              accent={
                b.theme === "earth"
                  ? "from-emerald-400/20 to-cyan-400/10"
                  : b.theme === "mars"
                  ? "from-rose-400/20 to-amber-400/10"
                  : "from-sky-400/20 to-violet-400/10"
              }
            />
          ))}
          {/* También mostramos la Luna */}
          {enabledMoons.map((m) => (
            <PlanetCard
              key={m.id}
              name={m.name}
              emoji={m.emoji}
              caption={m.label ?? ""}
              onOpen={() => openBody(m)}
              accent="from-indigo-400/20 to-fuchsia-400/10"
            />
          ))}
        </div>

        <div className="mt-10 text-xs text-slate-400">
          Fuentes: NASA EOSDIS GIBS · NASA Solar System Treks.
        </div>
      </div>

      {/* CSS embebido para las animaciones */}
      <style>{css}</style>
    </div>
  );
}

/* =============== Diagrama con órbitas animadas y dinámicas =============== */

function SolarDiagram({
  bodies,
  onOpen,
}: {
  bodies: BodyConfig[];
  onOpen: (b: BodyConfig) => void;
}) {
  // Solo renderizamos órbitas para cuerpos no-luna
  const planets = bodies.filter((b) => !b.isMoonOf && b.id !== "Sun");
  // Órbitas únicas
  const rings = Array.from(
    new Set(planets.map((p) => p.ring ?? 0))
  ).sort((a, b) => a - b);

  const earth = planets.find((p) => p.id === "Earth");
  const earthMoons = bodies.filter((b) => b.isMoonOf === "Earth");

  return (
    <div
      className="relative mx-auto mt-8 mb-16"
      style={{ width: "min(92vmin, 900px)", height: "min(92vmin, 900px)" }}
    >
      {/* Sol al centro */}
      <div className="solar-center">
        <div className="sun-glow" />
        <div className="sun-core" />
      </div>

      {/* Órbitas grandes */}
      {rings.map((ring) => {
        const radius = ringRadius(ring);
        const dur = ringDuration(ring);
        return (
          <div
            key={`ring-${ring}`}
            className="orbit"
            style={{ width: radius, height: radius }}
          >
            {/* Cada planeta en esta órbita */}
            {planets
              .filter((p) => (p.ring ?? -1) === ring)
              .map((p, idx) => {
                // Desfasar cada planeta de la misma órbita
                const extraRotate = (idx * 360) / Math.max(1, planets.filter(pl => (pl.ring ?? -1) === ring).length);
                return (
                  <div
                    key={p.id}
                    className="rotator"
                    style={{ animationDuration: dur, transform: `rotate(${extraRotate}deg)` }}
                  >
                    <div className="anchor">
                      <div
                        className="counter"
                        style={{ animation: `spin-rev ${dur} linear infinite` }}
                      >
                        <Tooltip title={p.tooltip.title} lines={p.tooltip.lines}>
                          <PlanetButton
                            label={p.name}
                            caption={p.label ?? ""}
                            emoji={p.emoji}
                            onClick={() => onOpen(p)}
                            theme={p.theme ?? "earth"}
                            disabled={!p.enabled}
                          />
                        </Tooltip>

                        {/* Sub-órbitas: solo mostramos la Luna alrededor de la Tierra por ahora */}
                        {p.id === "Earth" &&
                          earthMoons.map((m) => (
                            <SubOrbitMoon
                              key={m.id}
                              moon={m}
                              onOpen={() => onOpen(m)}
                            />
                          ))}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        );
      })}

      {/* Leyenda */}
      <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 text-xs text-slate-400">
        Fuentes: NASA EOSDIS GIBS · NASA Solar System Treks
      </div>
    </div>
  );
}

function SubOrbitMoon({
  moon,
  onOpen,
}: {
  moon: BodyConfig;
  onOpen: () => void;
}) {
  // radio y velocidad de sub-órbita (estáticos por estética)
  const subR = "9vmin";
  const dur = "18s";
  return (
    <div className="suborbit" style={{ width: subR, height: subR }}>
      <div className="subrotator" style={{ animationDuration: dur }}>
        <div className="subanchor">
          <div className="counter" style={{ animation: `spin-rev ${dur} linear infinite` }}>
            <Tooltip title={moon.tooltip.title} lines={moon.tooltip.lines} size="sm">
              <MiniMoonButton emoji={moon.emoji} title={moon.name} onClick={onOpen} disabled={!moon.enabled} />
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =============== Tooltips =============== */

function Tooltip({
  title,
  lines,
  children,
  size = "md",
}: {
  title: string;
  lines: string[];
  children: React.ReactNode;
  size?: "sm" | "md";
}) {
  return (
    <div className="relative group inline-flex">
      {children}
      <div
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 translate-y-[-100%] 
        rounded-lg border border-white/15 bg-slate-900/90 backdrop-blur px-3 py-2 shadow-2xl opacity-0 
        group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 z-50
        ${size === "sm" ? "w-44" : "w-64"}`}
      >
        <div className="text-[13px] font-semibold text-slate-100">{title}</div>
        <ul className="mt-1 text-[11px] text-slate-300 space-y-0.5">
          {lines.map((l, i) => (
            <li key={i} className="leading-snug">{l}</li>
          ))}
        </ul>
        <div className="absolute left-1/2 top-full -translate-x-1/2 w-3 h-3 rotate-45 bg-slate-900/90 border-r border-b border-white/15"></div>
      </div>
    </div>
  );
}

/* =============== Botones =============== */

function PlanetButton({
  label,
  caption,
  emoji,
  onClick,
  theme,
  disabled = false,
}: {
  label: string;
  caption: string;
  emoji: string;
  onClick: () => void;
  theme: "earth" | "mars" | "ceres" | "venus" | "mercury" | "gas";
  disabled?: boolean;
}) {
  const themeClass =
    theme === "earth"
      ? "ring-emerald"
      : theme === "mars"
      ? "ring-rose"
      : theme === "ceres"
      ? "ring-cyan"
      : theme === "venus"
      ? "ring-fuchsia"
      : theme === "mercury"
      ? "ring-amber"
      : "ring-indigo";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`planet-btn ${themeClass} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      title={label}
      aria-disabled={disabled}
    >
      <div className="text-2xl leading-none">{emoji}</div>
      <div className="mt-1 font-semibold text-sm">{label}</div>
      <div className="text-[11px] opacity-80">{caption}</div>
      {!caption && <div className="text-[11px] opacity-60">Próximamente</div>}
    </button>
  );
}

function MiniMoonButton({
  emoji,
  title,
  onClick,
  disabled = false,
}: {
  emoji: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`moon-btn ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      title={title}
      aria-disabled={disabled}
    >
      <span className="text-xl">{emoji}</span>
      <span className="sr-only">{title}</span>
    </button>
  );
}

/* =============== Fallback cards (móvil) =============== */

function PlanetCard({
  name,
  emoji,
  caption,
  onOpen,
  accent,
}: {
  name: string;
  emoji: string;
  caption: string;
  onOpen: () => void;
  accent: string;
}) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl relative overflow-hidden`}>
      <div className={`pointer-events-none absolute -inset-6 bg-gradient-to-br ${accent} blur-3xl opacity-40`} />
      <div className="relative">
        <div className="text-4xl mb-3">{emoji}</div>
        <div className="font-semibold text-lg">{name}</div>
        <div className="text-sm text-slate-300 mt-1">{caption}</div>
        <button
          onClick={onOpen}
          className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-sky-300/40 bg-sky-300/10 hover:bg-sky-300/20 text-sm"
        >
          Abrir mapa
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="opacity-80">
            <path d="M7 17L17 7M17 7H9M17 7v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

/* =============== Helpers visuales =============== */

/** Tamaño de órbita en función del índice (vmin) */
function ringRadius(ring: number | undefined): string {
  const base = 30;   // vmin
  const step = 12;   // vmin
  const r = base + step * (Number(ring ?? 1) - 1);
  return `${r}vmin`;
}

/** Duración de rotación (más lejana = más lenta) */
function ringDuration(ring: number | undefined): string {
  const base = 120; // s
  const step = 60;  // s
  const d = base + step * (Number(ring ?? 1) - 1);
  return `${d}s`;
}

/* =============== CSS específico del diagrama =============== */

const css = `
/* Centro del sistema */
.solar-center {
  position: absolute;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%);
  width: 8vmin;
  height: 8vmin;
  z-index: 2;
}
.sun-core {
  width: 100%;
  height: 100%;
  border-radius: 9999px;
  background: radial-gradient(circle at 30% 30%, #fde047, #f59e0b 60%, #b45309 100%);
  box-shadow: 0 0 40px 12px rgba(250, 204, 21, 0.35), 0 0 140px 48px rgba(250, 204, 21, 0.15);
}
.sun-glow {
  position: absolute;
  inset: -18vmin;
  border-radius: 9999px;
  background: radial-gradient(circle, rgba(250,204,21,0.14), rgba(0,0,0,0) 60%);
  filter: blur(6px);
  z-index: 1;
}

/* Órbitas (anillos) */
.orbit {
  position: absolute;
  top: 50%;
  left: 50%;
  border: 1px dashed rgba(148, 163, 184, 0.35);
  border-radius: 9999px;
  transform: translate(-50%, -50%);
  pointer-events: none; /* no bloquear clics sobre planetas */
}

/* Rotadores (giran alrededor del centro) */
.rotator {
  position: absolute;
  inset: 0;
  transform-origin: 50% 50%;
  animation: spin 120s linear infinite;
}
.counter {
  transform-origin: center;
}

/* Punto de anclaje en el borde derecho de la órbita */
.anchor {
  position: absolute;
  top: 50%;
  left: 100%;
  transform: translate(-50%, -50%);
}

/* Sub-órbita (Luna) */
.suborbit {
  position: absolute;
  top: 0; left: 0;
  transform: translate(-50%, -50%);
  border: 1px dashed rgba(148,163,184,0.3);
  border-radius: 9999px;
  pointer-events: none; /* no bloquear clics sobre la luna */
}
.subrotator { position: absolute; inset: 0; transform-origin: 50% 50%; animation: spin 18s linear infinite; }
.subanchor { position: absolute; top: 50%; left: 100%; transform: translate(-50%, -50%); }

/* Botones planeta */
.planet-btn {
  pointer-events: auto; /* asegurar que el botón sí reciba el clic */
  min-width: 10.5rem;
  max-width: 15rem;
  padding: 0.6rem 0.8rem;
  border-radius: 0.75rem;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.14);
  backdrop-filter: blur(2px);
  color: #e2e8f0;
  text-align: left;
  box-shadow: 0 8px 28px rgba(0,0,0,0.35);
  transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
}
.planet-btn:hover:not([aria-disabled="true"]) {
  transform: translateY(-2px);
  background: rgba(255,255,255,0.09);
  border-color: rgba(125, 211, 252, 0.45);
}
.ring-emerald { box-shadow: 0 0 0 4px rgba(16,185,129,0.16) inset; }
.ring-rose    { box-shadow: 0 0 0 4px rgba(244,63,94,0.16) inset; }
.ring-cyan    { box-shadow: 0 0 0 4px rgba(34,211,238,0.16) inset; }
.ring-fuchsia { box-shadow: 0 0 0 4px rgba(217,70,239,0.16) inset; }
.ring-amber   { box-shadow: 0 0 0 4px rgba(245,158,11,0.16) inset; }
.ring-indigo  { box-shadow: 0 0 0 4px rgba(99,102,241,0.16) inset; }

/* Botón Luna (compacto) */
.moon-btn {
  pointer-events: auto; /* asegurar que el botón sí reciba el clic */
  width: 3.3rem;
  height: 3.3rem;
  display: grid;
  place-items: center;
  border-radius: 9999px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.14);
  color: #e2e8f0;
  box-shadow: 0 6px 20px rgba(0,0,0,0.35);
  transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
}
.moon-btn:hover:not([aria-disabled="true"]) {
  transform: translateY(-2px);
  background: rgba(255,255,255,0.09);
  border-color: rgba(167, 139, 250, 0.45);
}

/* Animaciones */
@keyframes spin    { to { transform: rotate(360deg); } }
@keyframes spin-rev{ to { transform: rotate(-360deg); } }
`;
