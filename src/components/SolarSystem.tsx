import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getLayerCatalog, layerDefaultDate, layerNeedsDate, type ApiLayer, type LayerCatalog } from "../services/layers";

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

type BodyMeta = {
  label: string;
  emoji: string;
  accent: string;
};

const BODY_META: Record<string, BodyMeta> = {
  earth: { label: "Earth", emoji: "🌍", accent: "from-emerald-400/20 to-cyan-400/10" },
  moon: { label: "Moon", emoji: "🌕", accent: "from-indigo-400/20 to-fuchsia-400/10" },
  mars: { label: "Mars", emoji: "🔴", accent: "from-rose-400/20 to-amber-400/10" },
  ceres: { label: "Ceres", emoji: "🪐", accent: "from-sky-400/20 to-violet-400/10" },
};

const ORDER = ["earth", "moon", "mars", "ceres"];

export default function SolarSystem() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<LayerCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getLayerCatalog()
      .then((data) => {
        if (cancelled) return;
        setCatalog(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load the catalog");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const cards = useMemo(() => {
    if (!catalog) return [] as Array<{ body: string; layer: ApiLayer }>;
    const entries: Array<{ body: string; layer: ApiLayer }> = [];
    for (const [body, layers] of Object.entries(catalog)) {
      if (!layers || layers.length === 0) continue;
      entries.push({ body, layer: layers[0] });
    }
    return entries.sort((a, b) => {
      const ia = ORDER.indexOf(a.body.toLowerCase());
      const ib = ORDER.indexOf(b.body.toLowerCase());
      if (ia === -1 && ib === -1) return a.body.localeCompare(b.body);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [catalog]);

  const go = (layer: ApiLayer) => {
    const needsDate = layerNeedsDate(layer);
    const date = needsDate ? layerDefaultDate(layer, todayISO()) : todayISO();
    const projection = layer.projection === "EPSG:4326" ? "EPSG:4326" : "EPSG:3857";
    const hash = `#,,,${date},${layer.layerKey},${projection}`;
    navigate({ pathname: "/map", hash });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-900 via-slate-950 to-black text-slate-100">
        Loading layer catalog...
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-900 via-slate-950 to-black text-slate-100 px-4 text-center">
        Could not load the layer catalog: {error}
      </div>
    );
  }

  if (!cards.length) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-900 via-slate-950 to-black text-slate-100 px-4 text-center">
        No layers available.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black text-slate-100">
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-2">
        <div className="flex items-center gap-3">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_0_6px_rgba(56,189,248,0.25)]" />
          <h1 className="text-xl font-extrabold tracking-tight">
            Embiggen Viewer - Solar System
          </h1>
        </div>
        <p className="mt-2 text-sm text-slate-300">
          Choose a body to open the map with its default layer from the new API. In the map view you can only switch between layers for the same body.
        </p>
      </div>

      <div className="max-w-6xl mx-auto px-4 pb-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
          {cards.map(({ body, layer }) => {
            const meta = BODY_META[body.toLowerCase()] ?? { label: body, emoji: "🌐", accent: "from-slate-400/20 to-slate-700/10" };
            const caption = layer.title;
            return (
              <PlanetCard
                key={layer.layerKey}
                name={meta.label}
                emoji={meta.emoji}
                caption={caption}
                onOpen={() => go(layer)}
                accent={meta.accent}
              />
            );
          })}
        </div>

        <div className="mt-10 text-xs text-slate-400">
          Source: api.qminds.io (proxy for NASA EOSDIS GIBS and Solar System Treks).
        </div>
      </div>
    </div>
  );
}

type PlanetCardProps = {
  name: string;
  emoji: string;
  caption: string;
  onOpen: () => void;
  accent: string;
};

function PlanetCard({ name, emoji, caption, onOpen, accent }: PlanetCardProps) {
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
          Open map
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="opacity-80">
            <path d="M7 17L17 7M17 7H9M17 7v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
