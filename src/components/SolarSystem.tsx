import { useNavigate } from "react-router-dom";

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

/** layerKey esperado por Map.tsx:
 *  - GIBS:  gibs:<gibsId>
 *  - TREK:  trek:<Body>:<endpoint>
 */
const KEYS = {
  Earth: {
    key: "gibs:MODIS_Terra_CorrectedReflectance_TrueColor",
    proj: "EPSG:3857" as const,
    caption: "GIBS — MODIS Terra True Color",
  },
  Moon: {
    key: "trek:Moon:https://trek.nasa.gov/tiles/Moon/EQ/LRO_LOLA_ClrShade_Global_128ppd_v04",
    proj: "EPSG:4326" as const,
    caption: "LRO LOLA Color Shaded (128ppd)",
  },
  Mars: {
    key: "trek:Mars:https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m",
    proj: "EPSG:4326" as const,
    caption: "MOLA Color Shaded Relief (463m)",
  },
  Ceres: {
    key: "trek:Ceres:https://trek.nasa.gov/tiles/Ceres/EQ/Ceres_Dawn_FC_HAMO_ClrShade_DLR_Global_60ppd_Oct2016",
    proj: "EPSG:4326" as const,
    caption: "Dawn FC HAMO Color Shaded (60ppd)",
  },
} as const;

type BodyId = keyof typeof KEYS;

export default function SolarSystem() {
  const navigate = useNavigate();

  const go = (body: BodyId) => {
    const cfg = KEYS[body];
    // Map.tsx parsea: #lon,lat,zoom,fecha,layerKey,proj
    const hash = `#,,,${todayISO()},${cfg.key},${cfg.proj}`;
    navigate({ pathname: "/map", hash });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black text-slate-100">
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-2">
        <div className="flex items-center gap-3">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_0_6px_rgba(56,189,248,0.25)]" />
          <h1 className="text-xl font-extrabold tracking-tight">
            Embiggen Viewer — Sistema Solar
          </h1>
        </div>
        <p className="mt-2 text-sm text-slate-300">
          Elige un cuerpo para abrir el mapa con sus capas predeterminadas. En la vista del mapa solo podrás cambiar entre capas del mismo cuerpo.
        </p>
      </div>

      <div className="max-w-6xl mx-auto px-4 pb-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
          <PlanetCard
            name="Tierra"
            emoji="🌍"
            caption={KEYS.Earth.caption}
            onOpen={() => go("Earth")}
            accent="from-emerald-400/20 to-cyan-400/10"
          />
          <PlanetCard
            name="Luna"
            emoji="🌙"
            caption={KEYS.Moon.caption}
            onOpen={() => go("Moon")}
            accent="from-indigo-400/20 to-fuchsia-400/10"
          />
          <PlanetCard
            name="Marte"
            emoji="🪐"
            caption={KEYS.Mars.caption}
            onOpen={() => go("Mars")}
            accent="from-rose-400/20 to-amber-400/10"
          />
          <PlanetCard
            name="Ceres"
            emoji="🛰️"
            caption={KEYS.Ceres.caption}
            onOpen={() => go("Ceres")}
            accent="from-sky-400/20 to-violet-400/10"
          />
        </div>

        <div className="mt-10 text-xs text-slate-400">
          Fuentes: NASA EOSDIS GIBS · NASA Solar System Treks.
        </div>
      </div>
    </div>
  );
}

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
