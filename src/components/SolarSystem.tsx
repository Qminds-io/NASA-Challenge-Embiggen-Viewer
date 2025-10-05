import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchLayersCatalog, type LayersCatalog } from "../services/api";

/* ========= config logo ========= */
const LOGO_SRC = "/Logo.png"; // ruta del logo (SVG/PNG)

/* ========= util ========= */
function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

/** Sincroniza animación con tiempo real (fase) */
function realTimeDelaySeconds(durationSec: number): string {
  const nowSec = Date.now() / 1000;
  const progress = nowSec % durationSec;
  return `-${progress}s`;
}

/** Config genÃ©rica de cuerpos */
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
  emoji: string;       // fallback si no hay icono
  iconSrc?: string;    // ruta a SVG en /public/icons
  ring?: number;       // órbita (1 = más interna)
  isMoonOf?: BodyId;   // si es luna, planeta padre
  enabled: boolean;
  key?: string;        // clave del viewer (Map.tsx)
  proj?: Proj;
  label?: string;      // caption visible
  tooltip: { title: string; lines: string[] };
  theme?: "earth" | "mars" | "ceres" | "venus" | "mercury" | "gas";
};

/** === Catálogo ===
 * Asegúrate de tener los SVG en /public/icons/<nombre>.svg
 */
const BODIES: BodyConfig[] = [
  {
    id: "Earth",
    name: "Tierra",
    emoji: "🌍",
    iconSrc: "/icons/tierra.png",
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
    iconSrc: "/icons/marte.png",
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
    iconSrc: "/icons/neptuno.png",
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

  // Lunas habilitadas
  {
    id: "Moon",
    name: "Luna",
    emoji: "🌙",
    iconSrc: "/icons/moon.svg",
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

  // Próximos (deshabilitados por ahora, pero con iconos listos)
  {
    id: "Mercury",
    name: "Mercurio",
    emoji: "☿️",
    iconSrc: "/icons/mercurio.png",
    ring: 1,
    enabled: false,
    tooltip: { title: "Mercurio", lines: ["Próximamente."] },
    theme: "mercury",
  },
  {
    id: "Venus",
    name: "Venus",
    emoji: "♀️",
    iconSrc: "/icons/venus.png",
    ring: 1.6 as any,
    enabled: false,
    tooltip: { title: "Venus", lines: ["Próximamente."] },
    theme: "venus",
  },
  {
    id: "Vesta",
    name: "Vesta",
    emoji: "🪨",
    iconSrc: "/icons/urano.png",
    ring: 4.6 as any,
    enabled: false,
    tooltip: { title: "Vesta", lines: ["Próximamente."] },
    theme: "ceres",
  },
  {
    id: "Jupiter",
    name: "Júpiter",
    emoji: "♃",
    iconSrc: "/icons/jupiter.png",
    ring: 6,
    enabled: false,
    tooltip: { title: "Júpiter", lines: ["Próximamente."] },
    theme: "gas",
  },
  {
    id: "Saturn",
    name: "Saturno",
    emoji: "♄",
    iconSrc: "/icons/saturno.png",
    ring: 7,
    enabled: false,
    tooltip: { title: "Saturno", lines: ["Próximamente."] },
    theme: "gas",
  },
  {
    id: "Europa",
    name: "Europa",
    emoji: "🧊",
    iconSrc: "/icons/europa.svg",
    isMoonOf: "Jupiter",
    enabled: false,
    tooltip: { title: "Europa (Luna de Júpiter)", lines: ["Próximamente."] },
    theme: "gas",
  },
  {
    id: "Titan",
    name: "Titán",
    emoji: "🟤",
    iconSrc: "/icons/titan.svg",
    isMoonOf: "Saturn",
    enabled: false,
    tooltip: { title: "Titán (Luna de Saturno)", lines: ["Próximamente."] },
    theme: "gas",
  },
];

/* ========= Vista principal ========= */
export default function SolarSystem() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<LayersCatalog>([]);
  const [catalogStatus, setCatalogStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCatalogStatus("loading");
    fetchLayersCatalog()
      .then((data) => {
        if (cancelled) return;
        setCatalog(data);
        setCatalogStatus("ready");
        setCatalogError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to load layer catalog", error);
        setCatalogStatus("error");
        setCatalogError(error instanceof Error ? error.message : "No se pudo cargar el catalogo");
      });
    return () => {
      cancelled = true;
    };
  }, []);


  const catalogBodies = useMemo(() => {
    const map = new Map(catalog.map((entry) => [entry.bodyId, entry]));
    return BODIES.map((body) => {
      const entry = map.get(body.id);
      if (!entry || entry.layers.length === 0) {
        return { ...body, enabled: false, key: undefined, proj: undefined, label: body.label };
      }
      const defaultLayer = entry.layers[0];
      return {
        ...body,
        enabled: true,
        key: defaultLayer.layerKey,
        proj: defaultLayer.projection as Proj,
        label: defaultLayer.title,
      };
    });
  }, [catalog]);

  const openBody = (b: BodyConfig) => {
    if (!b.enabled || !b.key || !b.proj) return;
    const hash = `#,,,${todayISO()},${b.key},${b.proj}`;
    navigate({ pathname: "/map", hash });
  };

  const bodiesList = catalogStatus === "ready" ? catalogBodies : BODIES;
  const enabledBodies = bodiesList.filter((b) => b.enabled && !b.isMoonOf);
  const enabledMoons = bodiesList.filter((b) => b.enabled && b.isMoonOf);

  return (
    <div className="min-h-screen relative bg-gradient-to-b from-slate-900 via-slate-950 to-black text-slate-100 overflow-hidden">
      {/* Encabezado */}
      <div className="max-w-6xl mx-auto px-4 pt-6">
        <div className="flex items-center gap-3">
          <img
            src={LOGO_SRC}
            alt="Quantic View logo"
            className="h-20 w-20 rounded-md shadow-sm object-contain"
            loading="eager"
            decoding="async"
          />
          <h1 className="text-xl font-extrabold tracking-tight">
            Quantic View â€” Solar System
          </h1>
        </div>
        <p className="mt-2 text-sm text-slate-300">
          Tap a body to open the viewer with its default layer. In the viewer, you can change layers for the same body.
        </p>
        {catalogStatus === "error" && catalogError && (
          <div className="mt-3 text-xs text-rose-400">{catalogError}</div>
        )}
        {catalogStatus === "loading" && (
          <div className="mt-3 text-xs text-slate-300">Cargando catalogo...</div>
        )}

      </div>

      {/* Diagrama orbital (md+) */}
      <div className="hidden md:block">
        <SolarDiagram bodies={bodiesList} onOpen={openBody} />
      </div>

      {/* Fallback mÃ³vil: tarjetas solo de habilitados */}
      <div className="block md:hidden max-w-6xl mx-auto px-4 pb-14">
        <div className="grid grid-cols-1 xs:grid-cols-2 gap-4 mt-6">
          {enabledBodies.map((b) => (
            <PlanetCard
              key={b.id}
              name={b.name}
              emoji={b.emoji}
              iconSrc={b.iconSrc}
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
          {enabledMoons.map((m) => (
            <PlanetCard
              key={m.id}
              name={m.name}
              emoji={m.emoji}
              iconSrc={m.iconSrc}
              caption={m.label ?? ""}
              onOpen={() => openBody(m)}
              accent="from-indigo-400/20 to-fuchsia-400/10"
            />
          ))}
        </div>

        <div className="mt-10 text-xs text-slate-400">
          Fuentes: NASA EOSDIS GIBS Â· NASA Solar System Treks.
        </div>
      </div>

      {/* Repositorios (inferior izquierda) */}
      <div
        className="fixed left-3 bottom-3 z-40 max-w-[88vw] md:max-w-xs"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label="Repositorios del proyecto"
      >
        <div className="rounded-xl border border-white/10 bg-white/10 backdrop-blur px-3 py-2 shadow-lg">
          <div className="text-[11px] uppercase tracking-wide text-slate-300 mb-1">
            Repositorios
          </div>
          <ul className="text-sm text-slate-100 space-y-1">
            <li>
              <a
                href="https://github.com/Qminds-io/NASA-Challenge-Embiggen-Viewer"
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 hover:text-sky-300 hover:underline underline-offset-2"
                title="Abrir repo del Viewer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="opacity-90">
                  <path fillRule="evenodd" d="M12 .5a12 12 0 0 0-3.79 23.4c.6.11.82-.26.82-.58v-2.02c-3.34.73-4.04-1.61-4.04-1.61-.55-1.41-1.35-1.78-1.35-1.78-1.1-.75.09-.73.09-.73 1.22.09 1.86 1.26 1.86 1.26 1.08 1.86 2.82 1.32 3.5 1.01.11-.79.42-1.32.76-1.62-2.66-.3-5.47-1.33-5.47-5.92 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.16 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.67 1.64.25 2.86.13 3.16.77.84 1.23 1.91 1.23 3.22 0 4.6-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.21.7.82.58A12 12 0 0 0 12 .5Z" />
                </svg>
                <span className="truncate">Embiggen Viewer</span>
              </a>
            </li>
            <li>
              <a
                href="https://github.com/Qminds-io/NASA-challenge-embiggen-api"
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 hover:text-sky-300 hover:underline underline-offset-2"
                title="Abrir repo de la API"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="opacity-90">
                  <path fillRule="evenodd" d="M12 .5a12 12 0 0 0-3.79 23.4c.6.11.82-.26.82-.58v-2.02c-3.34.73-4.04-1.61-4.04-1.61-.55-1.41-1.35-1.78-1.35-1.78-1.1-.75.09-.73.09-.73 1.22.09 1.86 1.26 1.86 1.26 1.08 1.86 2.82 1.32 3.5 1.01.11-.79.42-1.32.76-1.62-2.66-.3-5.47-1.33-5.47-5.92 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.16 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.67 1.64.25 2.86.13 3.16.77.84 1.23 1.91 1.23 3.22 0 4.6-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.21.7.82.58A12 12 0  0 0 12 .5Z" />
                </svg>
                <span className="truncate">Embiggen API</span>
              </a>
            </li>
          </ul>
        </div>
      </div>

      {/* CSS embebido */}
      <style>{css}</style>
    </div>
  );
}

/* =============== Diagrama con Ã³rbitas animadas y dinÃ¡micas =============== */

function SolarDiagram({
  bodies,
  onOpen,
}: {
  bodies: BodyConfig[];
  onOpen: (b: BodyConfig) => void;
}) {
  const planets = bodies.filter((b) => !b.isMoonOf && b.id !== "Sun");
  const rings = Array.from(new Set(planets.map((p) => p.ring ?? 0))).sort(
    (a, b) => a - b
  );
  const earthMoons = bodies.filter((b) => b.isMoonOf === "Earth");

  return (
    <div
      className="relative mx-auto mt-8 mb-16"
      style={{ width: "min(92vmin, 900px)", height: "min(92vmin, 900px)" }}
    >
      {/* Sol (decorativo) */}
      <div className="solar-center">
        <div className="sun-glow" />
        <div className="sun-core" />
      </div>

      {/* Ã“rbitas */}
      {rings.map((ring) => {
        const radius = ringRadius(ring);
        const durSec = durationSeconds(ring);
        const durStr = `${durSec}s`;
        const planetsInRing = planets.filter((p) => (p.ring ?? -1) === ring);

        return (
          <div
            key={`ring-${ring}`}
            className="orbit"
            style={{ width: radius, height: radius }}
          >
            {planetsInRing.map((p, idx) => {
              const extraRotate =
                (idx * 360) / Math.max(1, planetsInRing.length);
              const delay = realTimeDelaySeconds(durSec);

              return (
                <div
                  key={p.id}
                  className="rotator"
                  style={{
                    animationDuration: durStr,
                    animationDelay: delay,
                    transform: `rotate(${extraRotate}deg)`,
                  }}
                >
                  <div className="anchor">
                    <div
                      className="counter"
                      style={{
                        animation: `spin-rev ${durStr} linear infinite`,
                        animationDelay: delay,
                      }}
                    >
                      <PlanetButton
                        id={p.id}
                        label={p.name}
                        caption={p.label ?? ""}
                        emoji={p.emoji}
                        iconSrc={p.iconSrc}
                        onClick={() => onOpen(p)}
                        theme={p.theme ?? "earth"}
                        disabled={!p.enabled}
                      />

                      {/* Sub-órbita Luna (centrada respecto a Tierra) */}
                      {p.id === "Earth" &&
                        earthMoons.map((m) => {
                          const moonDurSec = 18;
                          const moonDelay = realTimeDelaySeconds(moonDurSec);
                          return (
                            <SubOrbitMoon
                              key={m.id}
                              moon={m}
                              onOpen={() => onOpen(m)}
                              animDurationSec={moonDurSec}
                              animDelay={moonDelay}
                            />
                          );
                        })}
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
        Fuentes: NASA EOSDIS GIBS Â· NASA Solar System Treks
      </div>
    </div>
  );
}

function SubOrbitMoon({
  moon,
  onOpen,
  animDurationSec,
  animDelay,
}: {
  moon: BodyConfig;
  onOpen: () => void;
  animDurationSec: number;
  animDelay: string;
}) {
  const subR = "9vmin";
  const dur = `${animDurationSec}s`;

  return (
    <div className="suborbit" style={{ width: subR, height: subR }}>
      <div
        className="subrotator"
        style={{ animationDuration: dur, animationDelay: animDelay }}
      >
        <div className="subanchor">
          <div
            className="counter"
            style={{
              animation: `spin-rev ${dur} linear infinite`,
              animationDelay: animDelay,
            }}
          >
            <MiniMoonButton
              emoji={moon.emoji}
              title={moon.name}
              caption={moon.label ?? ""}
              onClick={onOpen}
              disabled={!moon.enabled}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* =============== Botones con icono/emoji + card on hover =============== */

function PlanetButton({
  id,
  label,
  caption,
  emoji,
  iconSrc,
  onClick,
  theme,
  disabled = false,
}: {
  id?: BodyId;
  label: string;
  caption: string;
  emoji: string;
  iconSrc?: string;
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
    <div className="planet-wrap group inline-flex items-center justify-center">
      {/* Icono visible (SVG o emoji fallback) */}
      <button
        data-id={id}
        onClick={onClick}
        disabled={disabled}
        className={`planet-emoji-btn ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        title={label}
        aria-disabled={disabled}
      >
        {iconSrc ? (
          <img
            src={iconSrc}
            alt=""
            className="planet-icon"
            loading="eager"
            decoding="async"
          />
        ) : (
          <span className="text-2xl leading-none">{emoji}</span>
        )}
        <span className="sr-only">{label}</span>
      </button>

      {/* Card (aparece al hover/focus) */}
      <button
        onClick={onClick}
        disabled={disabled}
        className={`planet-card ${themeClass} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        aria-hidden={disabled ? "true" : "false"}
        tabIndex={-1}
      >
        <div className="font-semibold text-sm">{label}</div>
        <div className="text-[11px] opacity-80">{caption || "PrÃ³ximamente"}</div>
      </button>
    </div>
  );
}

function MiniMoonButton({
  emoji,
  title,
  caption,
  onClick,
  disabled = false,
}: {
  emoji: string;
  title: string;
  caption: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="planet-wrap group inline-flex items-center justify-center">
      <button
        onClick={onClick}
        disabled={disabled}
        className={`moon-emoji-btn ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        title={title}
        aria-disabled={disabled}
      >
        <span className="text-xl">{emoji}</span>
        <span className="sr-only">{title}</span>
      </button>

      <button
        onClick={onClick}
        disabled={disabled}
        className={`moon-card ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        aria-hidden={disabled ? "true" : "false"}
        tabIndex={-1}
      >
        <div className="text-[13px] font-semibold text-slate-100">{title}</div>
        <div className="text-[11px] opacity-80">{caption || "PrÃ³ximamente"}</div>
      </button>
    </div>
  );
}

/* =============== Fallback cards (mÃ³vil) =============== */

function PlanetCard({
  name,
  emoji,
  iconSrc,
  caption,
  onOpen,
  accent,
}: {
  name: string;
  emoji: string;
  iconSrc?: string;
  caption: string;
  onOpen: () => void;
  accent: string;
}) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/5 p-4 shadow-xl relative overflow-hidden`}>
      <div className={`pointer-events-none absolute -inset-6 bg-gradient-to-br ${accent} blur-3xl opacity-40`} />
      <div className="relative">
        <div className="mb-3">
          {iconSrc ? (
            <img src={iconSrc} alt="" className="w-8 h-8 md:w-9 md:h-9" />
          ) : (
            <span className="text-4xl">{emoji}</span>
          )}
        </div>
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

function ringRadius(ring: number | undefined): string {
  const base = 30; // vmin
  const step = 12; // vmin
  const r = base + step * (Number(ring ?? 1) - 1);
  return `${r}vmin`;
}

function durationSeconds(ring: number | undefined): number {
  const base = 120; // s
  const step = 60; // s
  return base + step * (Number(ring ?? 1) - 1);
}

/* =============== CSS especÃ­fico del diagrama =============== */

const css = `
:root{
  --planet-emoji-size: 2.8rem; /* diámetro del botón del planeta */
  --moon-emoji-size:   2.4rem; /* diámetro del botón de la luna */
}

/* Centro del sistema (decorativo) */
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

/* No capturar eventos del sol */
.solar-center, .sun-core, .sun-glow { pointer-events: none; }

/* Ã“rbitas (anillos) */
.orbit {
  position: absolute;
  top: 50%;
  left: 50%;
  border: 1px dashed rgba(148, 163, 184, 0.35);
  border-radius: 9999px;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

/* Rotadores */
.rotator { position: absolute; inset: 0; transform-origin: 50% 50%; animation: spin 120s linear infinite; }
.counter { transform-origin: center; }

/* Ancla: planeta en el borde derecho de cada órbita */
.anchor { position: absolute; top: 50%; left: 100%; transform: translate(-50%, -50%); }

/* Sub-órbita (Luna) — centrada respecto a la Tierra */
.suborbit {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  border: 1px dashed rgba(148,163,184,0.3);
  border-radius: 9999px;
  pointer-events: auto;
  z-index: 5;
}
.subrotator { position: absolute; inset: 0; transform-origin: 50% 50%; animation: spin 18s linear infinite; }
.subanchor { position: absolute; top: 50%; left: 100%; transform: translate(-50%, -50%); }

/* ====== Botones (icono/emoji) + Card ====== */
.planet-wrap{ position: relative; isolation: isolate; z-index: 10; }
.planet-wrap:hover, .planet-wrap:focus-within{ z-index: 99; }

/* Botón planeta */
.planet-emoji-btn {
  position: relative;
  width: var(--planet-emoji-size);
  height: var(--planet-emoji-size);
  display: grid;
  place-items: center;
  border-radius: 9999px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.14);
  color: #e2e8f0;
  box-shadow: 0 6px 20px rgba(0,0,0,0.35);
  transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
  pointer-events: auto;
  z-index: 10;
  line-height: 1;
  outline-offset: 2px;
}
.planet-emoji-btn:hover:not([aria-disabled="true"]) {
  transform: translateY(-2px);
  background: rgba(255,255,255,0.09);
  border-color: rgba(125, 211, 252, 0.45);
}

/* Hitbox extra para la Tierra (clic cómodo) */
.planet-emoji-btn[data-id="Earth"]::after{
  content: "";
  position: absolute;
  inset: -8px;
  border-radius: 9999px;
  pointer-events: auto;
}

/* Tamaño del SVG/IMG del planeta (75% del botón) */
.planet-icon{
  width:  calc(var(--planet-emoji-size) * 0.75);
  height: calc(var(--planet-emoji-size) * 0.75);
  object-fit: contain;
}

/* Card de planeta */
.planet-card {
  position: absolute;
  left: 50%;
  top: calc(100% + 10px);
  transform: translateX(-50%);
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
  transition: opacity 160ms ease, transform 160ms ease;
  opacity: 0;
  pointer-events: none;
  z-index: 50;
}
.planet-emoji-btn:hover + .planet-card,
.planet-emoji-btn:focus-visible + .planet-card,
.planet-card:hover,
.planet-card:focus-visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(-50%) translateY(-2px);
}

/* Aros de color para card */
.ring-emerald { box-shadow: 0 0 0 4px rgba(16,185,129,0.16) inset; }
.ring-rose    { box-shadow: 0 0 0 4px rgba(244,63,94,0.16) inset; }
.ring-cyan    { box-shadow: 0 0 0 4px rgba(34,211,238,0.16) inset; }
.ring-fuchsia { box-shadow: 0 0 0 4px rgba(217,70,239,0.16) inset; }
.ring-amber   { box-shadow: 0 0 0 4px rgba(245,158,11,0.16) inset; }
.ring-indigo  { box-shadow: 0 0 0 4px rgba(99,102,241,0.16) inset; }

/* Botón Luna */
.moon-emoji-btn {
  width: var(--moon-emoji-size);
  height: var(--moon-emoji-size);
  display: grid;
  place-items: center;
  border-radius: 9999px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.14);
  color: #e2e8f0;
  box-shadow: 0 6px 20px rgba(0,0,0,0.35);
  transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
  pointer-events: auto;
  z-index: 10;
  line-height: 1;
  outline-offset: 2px;
}
.moon-emoji-btn:hover:not([aria-disabled="true"]) {
  transform: translateY(-2px);
  background: rgba(255,255,255,0.09);
  border-color: rgba(167, 139, 250, 0.45);
}

/* Card de luna */
.moon-card {
  position: absolute;
  left: 50%;
  top: calc(100% + 10px);
  transform: translateX(-50%);
  min-width: 10rem;
  max-width: 13rem;
  padding: 0.5rem 0.6rem;
  border-radius: 0.6rem;
  background: rgba(15,23,42,0.9);
  border: 1px solid rgba(255,255,255,0.14);
  color: #e2e8f0;
  box-shadow: 0 8px 28px rgba(0,0,0,0.35);
  transition: opacity 160ms ease, transform 160ms ease;
  opacity: 0;
  pointer-events: none;
  z-index: 50;
}
.moon-emoji-btn:hover + .moon-card,
.moon-emoji-btn:focus-visible + .moon-card,
.moon-card:hover,
.moon-card:focus-visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(-50%) translateY(-2px);
}

/* Animaciones */
@keyframes spin    { to { transform: rotate(360deg); } }
@keyframes spin-rev{ to { transform: rotate(-360deg); } }
`;
