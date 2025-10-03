// src/components/Map.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import "ol/ol.css";

import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";

import XYZ from "ol/source/XYZ";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";
import { createXYZ as createTileGridXYZ } from "ol/tilegrid";

import { fromLonLat, toLonLat } from "ol/proj";
import { defaults as defaultControls, ScaleLine } from "ol/control";

import Draw from "ol/interaction/Draw";
import Modify from "ol/interaction/Modify";
import Select from "ol/interaction/Select";
import { click } from "ol/events/condition";

import GeoJSON from "ol/format/GeoJSON";
import type Feature from "ol/Feature";
import type { FeatureLike } from "ol/Feature";
import { Point, Polygon } from "ol/geom";

import Style from "ol/style/Style";
import Stroke from "ol/style/Stroke";
import Fill from "ol/style/Fill";
import CircleStyle from "ol/style/Circle";
import Text from "ol/style/Text";

import Navbar from "./Navbar";

// ---- Declaración del global A (CDN de Aladin v3) ----
declare global {
  interface Window {
    A: any;
  }
}

/* ===== Tipos/Capas ===== */
type DrawMode = "None" | "Point" | "Polygon";
type LayerKind = "GIBS_TEMPORAL" | "GIBS_STATIC" | "HIPS";

type LayerCfgBase = {
  id: string;
  title: string;
  kind: LayerKind;
};

type LayerGIBS = LayerCfgBase & {
  kind: "GIBS_TEMPORAL" | "GIBS_STATIC";
  matrixSet: "GoogleMapsCompatible_Level9" | "GoogleMapsCompatible_Level8";
  maxServerZ: 9 | 8;
  ext: "jpg" | "png";
  temporal: boolean;
  gibsId: string;
};

type LayerHIPS = LayerCfgBase & {
  kind: "HIPS";
  survey: string;
};

type LayerCfg = LayerGIBS | LayerHIPS;

// --- Capas disponibles ---
const LAYERS: LayerCfg[] = [
  // Tierra (diurnas)
  {
    id: "MODIS_Terra_CorrectedReflectance_TrueColor",
    title: "Tierra · MODIS Terra (True Color)",
    kind: "GIBS_TEMPORAL",
    matrixSet: "GoogleMapsCompatible_Level9",
    maxServerZ: 9,
    ext: "jpg",
    temporal: true,
    gibsId: "MODIS_Terra_CorrectedReflectance_TrueColor",
  },
  {
    id: "MODIS_Aqua_CorrectedReflectance_TrueColor",
    title: "Tierra · MODIS Aqua (True Color)",
    kind: "GIBS_TEMPORAL",
    matrixSet: "GoogleMapsCompatible_Level9",
    maxServerZ: 9,
    ext: "jpg",
    temporal: true,
    gibsId: "MODIS_Aqua_CorrectedReflectance_TrueColor",
  },
  {
    id: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
    title: "Tierra · VIIRS SNPP (True Color)",
    kind: "GIBS_TEMPORAL",
    matrixSet: "GoogleMapsCompatible_Level9",
    maxServerZ: 9,
    ext: "jpg",
    temporal: true,
    gibsId: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
  },
  {
    id: "MODIS_Terra_CorrectedReflectance_Bands721",
    title: "Tierra · MODIS Terra (Bands 7-2-1 polvo/humo)",
    kind: "GIBS_TEMPORAL",
    matrixSet: "GoogleMapsCompatible_Level9",
    maxServerZ: 9,
    ext: "jpg",
    temporal: true,
    gibsId: "MODIS_Terra_CorrectedReflectance_Bands721",
  },

  // Nocturnas
  {
    id: "VIIRS_SNPP_DayNightBand_ENCC",
    title: "Nocturna · VIIRS DNB ENCC (baja iluminación)",
    kind: "GIBS_TEMPORAL",
    matrixSet: "GoogleMapsCompatible_Level8",
    maxServerZ: 8,
    ext: "jpg",
    temporal: true,
    gibsId: "VIIRS_SNPP_DayNightBand_ENCC",
  },
  {
    id: "VIIRS_CityLights_2012",
    title: "Nocturna · City Lights 2012 (estática)",
    kind: "GIBS_STATIC",
    matrixSet: "GoogleMapsCompatible_Level8",
    maxServerZ: 8,
    ext: "jpg",
    temporal: false,
    gibsId: "VIIRS_CityLights_2012",
  },

  // Cielo (HiPS)
  { id: "HIPS_DSS2_COLOR", title: "Cielo · DSS2 (óptico)", kind: "HIPS", survey: "P/DSS2/color" },
  { id: "HIPS_2MASS", title: "Cielo · 2MASS (infrarrojo)", kind: "HIPS", survey: "P/2MASS/color" },
  { id: "HIPS_PLANCK_857", title: "Cielo · Planck 857 GHz", kind: "HIPS", survey: "P/Planck/R1.00/allsky_857" },
];

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function buildGibsUrl(dateISO: string, layer: LayerGIBS) {
  if (layer.temporal) {
    return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer.gibsId}/default/${dateISO}/${layer.matrixSet}/{z}/{y}/{x}.${layer.ext}`;
  }
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer.gibsId}/default/${layer.matrixSet}/{z}/{y}/{x}.${layer.ext}`;
}

/* ===== Estilo de anotaciones ===== */
const annotationStyle = (feature: FeatureLike) => {
  const name = feature.get("name") ?? "";
  const isPoint = feature.getGeometry()?.getType() === "Point";
  return new Style({
    image: isPoint
      ? new CircleStyle({
          radius: 6,
          fill: new Fill({ color: "rgba(255,255,255,0.95)" }),
          stroke: new Stroke({ color: "#0f172a", width: 2 }),
        })
      : undefined,
    stroke: new Stroke({ color: "#0f172a", width: 2 }),
    fill: new Fill({ color: "rgba(14,165,233,0.10)" }),
    text: new Text({
      text: name,
      offsetY: isPoint ? -16 : 0,
      font:
        "12px Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Helvetica Neue, Arial",
      padding: [2, 4, 2, 4],
      backgroundFill: new Fill({ color: "rgba(255,255,255,0.85)" }),
      backgroundStroke: new Stroke({ color: "#0f172a", width: 1 }),
    }),
  });
};

/* ===== Permalink (#lon,lat,zoom,fecha,layerId) ===== */
type PermalinkState = { lon?: number; lat?: number; z?: number; d?: string; l?: string };
function readHash(): PermalinkState {
  const h = window.location.hash.replace("#", "");
  if (!h) return {};
  const parts = h.split(",");
  const [lon, lat, z, d, l] = [parts[0], parts[1], parts[2], parts[3], parts[4]];
  return {
    lon: lon ? Number(lon) : undefined,
    lat: lat ? Number(lat) : undefined,
    z: z ? Number(z) : undefined,
    d: d || undefined,
    l: l || undefined,
  };
}
function writeHash(view: View, dateISO: string, layerId: string) {
  const center = toLonLat(view.getCenter() || [0, 0]);
  const zoom = view.getZoom() ?? 2;
  const lon = center[0].toFixed(5);
  const lat = center[1].toFixed(5);
  const z = (zoom ?? 2).toFixed(2);
  window.history.replaceState(null, "", `#${lon},${lat},${z},${dateISO},${layerId}`);
}

/* ======================== App ======================== */
export default function App() {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const hipsDivRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const hash = readHash();

  // Estado UI
  const [date, setDate] = useState<string>(hash.d ?? todayISO());
  const dateRef = useRef(date);
  useEffect(() => { dateRef.current = date; }, [date]);

  const defaultLayer = LAYERS.find((l) => l.id === hash.l) ?? LAYERS[0];
  const [layer, setLayer] = useState<LayerCfg>(defaultLayer);
  const layerRef = useRef(layer);
  useEffect(() => { layerRef.current = layer; }, [layer]);

  const [opacity, setOpacity] = useState<number>(1);
  const [drawMode, setDrawMode] = useState<DrawMode>("None");
  const [isModifyOn, setIsModifyOn] = useState(false);
  const [tilePending, setTilePending] = useState(0);
  const [tileErrors, setTileErrors] = useState(0);
  const tileErrorsRef = useRef(0);
  useEffect(() => { tileErrorsRef.current = tileErrors; }, [tileErrors]);

  const [cursorCoord, setCursorCoord] = useState<{ lon: number; lat: number } | null>(null);
  const [filter, setFilter] = useState("");

  // Refs OL
  const mapRef = useRef<Map | null>(null);
  const baseLayerRef = useRef<TileLayer<OSM> | null>(null);
  const gibsLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const annotationsSourceRef = useRef<VectorSource | null>(null);
  const drawRef = useRef<Draw | null>(null);
  const modifyRef = useRef<Modify | null>(null);
  const selectRef = useRef<Select | null>(null);

  // Aladin (CDN)
  const aladinInstanceRef = useRef<any | null>(null);

  const annotationsStyle = useMemo(() => annotationStyle, []);

  /* ===== Altura navbar + updateSize del mapa/hips ===== */
  useEffect(() => {
    const applyNavbarHeight = () => {
      const h = headerRef.current?.offsetHeight ?? 64;
      document.documentElement.style.setProperty("--navbar-h", `${h}px`);
      if (mapRef.current) requestAnimationFrame(() => mapRef.current?.updateSize());
      if (hipsDivRef.current) {
        hipsDivRef.current.style.top = `var(--navbar-h)`;
        hipsDivRef.current.style.height = `calc(100vh - var(--navbar-h))`;
      }
    };
    applyNavbarHeight();
    const ro = new ResizeObserver(applyNavbarHeight);
    if (headerRef.current) ro.observe(headerRef.current);
    window.addEventListener("resize", applyNavbarHeight);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", applyNavbarHeight);
    };
  }, []);

  // Inicializar mapa OL
  useEffect(() => {
    if (!mapDivRef.current) return;

    const base = new TileLayer({ source: new OSM(), visible: false });
    baseLayerRef.current = base;

    const initialGibs = (() => {
      if ((layer as LayerCfg).kind === "HIPS") return undefined;
      const g = layer as LayerGIBS;
      return new XYZ({
        url: buildGibsUrl(date, g),
        crossOrigin: "anonymous",
        tilePixelRatio: 1,
        tileGrid: createTileGridXYZ({ maxZoom: g.maxServerZ, minZoom: 0, tileSize: 256 }),
      });
    })();

    const onStart = () => setTilePending((p) => p + 1);
    const onEnd = () => setTilePending((p) => Math.max(0, p - 1));
    const onError = () => { setTilePending((p) => Math.max(0, p - 1)); setTileErrors((e) => e + 1); };
    if (initialGibs) {
      initialGibs.on("tileloadstart", onStart);
      initialGibs.on("tileloadend", onEnd);
      initialGibs.on("tileloaderror", onError);
    }

    const gibs = new TileLayer({ source: initialGibs, opacity, visible: layer.kind !== "HIPS" });
    gibsLayerRef.current = gibs;

    const annotationsSource = new VectorSource();
    annotationsSourceRef.current = annotationsSource;
    const annotations = new VectorLayer({ source: annotationsSource, style: annotationsStyle });

    const view = new View({
      center: hash.lon !== undefined && hash.lat !== undefined ? fromLonLat([hash.lon, hash.lat]) : fromLonLat([0, 0]),
      zoom: hash.z ?? 2,
      projection: "EPSG:3857",
    });

    const map = new Map({
      target: mapDivRef.current,
      layers: [base, gibs, annotations],
      view,
      controls: defaultControls({ zoom: true, rotate: true, attribution: false }).extend([new ScaleLine()]),
    });

    const onMove = () => writeHash(map.getView(), dateRef.current, layerRef.current.id);
    const onPointerMove = (evt: any) => {
      if (layerRef.current.kind === "HIPS") return;
      const [lon, lat] = toLonLat(evt.coordinate);
      setCursorCoord({ lon, lat });
    };
    map.on("moveend", onMove);
    map.on("pointermove", onPointerMove);

    mapRef.current = map;

    setTimeout(() => map.updateSize(), 0);

    return () => {
      if (initialGibs) {
        initialGibs.un("tileloadstart", onStart);
        initialGibs.un("tileloadend", onEnd);
        initialGibs.un("tileloaderror", onError);
      }
      map.un("moveend", onMove);
      map.un("pointermove", onPointerMove);
      map.setTarget(undefined);
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cambios de fecha/capa → GIBS o HiPS
  useEffect(() => {
    const showHIPS = layer.kind === "HIPS";
    if (mapDivRef.current) mapDivRef.current.style.display = showHIPS ? "none" : "block";
    if (hipsDivRef.current) hipsDivRef.current.style.display = showHIPS ? "block" : "none";

    baseLayerRef.current?.setVisible(false);

    // ── GIBS
    if (layer.kind !== "HIPS") {
      const g = layer as LayerGIBS;
      if (!gibsLayerRef.current || !mapRef.current) return;

      const newSource = new XYZ({
        url: buildGibsUrl(date, g),
        crossOrigin: "anonymous",
        tilePixelRatio: 1,
        tileGrid: createTileGridXYZ({ maxZoom: g.maxServerZ, minZoom: 0, tileSize: 256 }),
      });

      setTileErrors(0);
      setTilePending(0);
      const onStart = () => setTilePending((p) => p + 1);
      const onEnd = () => setTilePending((p) => Math.max(0, p - 1));
      const onError = () => { setTilePending((p) => Math.max(0, p - 1)); setTileErrors((e) => e + 1); };
      newSource.on("tileloadstart", onStart);
      newSource.on("tileloadend", onEnd);
      newSource.on("tileloaderror", onError);

      gibsLayerRef.current.setSource(newSource);
      gibsLayerRef.current.setVisible(true);
      writeHash(mapRef.current.getView(), date, layer.id);

      // Fallback automático para DNB ENCC si “hoy” falla mucho
      if (layer.id === "VIIRS_SNPP_DayNightBand_ENCC") {
        const isToday = date === todayISO();
        setTimeout(() => {
          if (isToday && tileErrorsRef.current > 8) {
            const d = new Date();
            d.setDate(d.getDate() - 1);
            const y = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
            setDate(y);
          }
        }, 1800);
      }
      return;
    }

    // ── HIPS (Aladin desde CDN: window.A)
    (async () => {
      if (!hipsDivRef.current) return;

      const boot = () => {
        const A = (window as any).A;
        if (!A) {
          setTimeout(boot, 50);
          return;
        }
        if (!aladinInstanceRef.current) {
          aladinInstanceRef.current = A.aladin(hipsDivRef.current, {
            survey: (layer as LayerHIPS).survey,
            fov: 180,
            projection: "AIT",
            showLayersControl: true,
            showFullscreenControl: true,
            showFrame: false,
          });
        } else {
          aladinInstanceRef.current.setImageSurvey((layer as LayerHIPS).survey);
        }
      };

      boot();
    })();
  }, [date, layer]);

  // Opacidad
  useEffect(() => {
    if (gibsLayerRef.current) gibsLayerRef.current.setOpacity(opacity);
  }, [opacity]);

  /* ===== Interacciones ===== */
  const disableDraw = () => {
    if (!mapRef.current) return;
    if (drawRef.current) { mapRef.current.removeInteraction(drawRef.current); drawRef.current = null; }
  };
  const disableModify = () => {
    if (!mapRef.current) return;
    if (modifyRef.current) { mapRef.current.removeInteraction(modifyRef.current); modifyRef.current = null; }
    if (selectRef.current) { mapRef.current.removeInteraction(selectRef.current); selectRef.current = null; }
  };

  const enableDraw = (type: "Point" | "Polygon") => {
    if (!mapRef.current || !annotationsSourceRef.current) return;
    disableDraw();
    const draw = new Draw({ source: annotationsSourceRef.current, type });
    draw.on("drawend", (evt) => {
      const f = evt.feature;
      const name = window.prompt("Nombre/etiqueta para esta anotación:", "") ?? "";
      f.set("name", name);

      const g = f.getGeometry();
      if (g) {
        const g4326 = g.clone().transform("EPSG:3857", "EPSG:4326");
        let coords: any = null;
        if (g4326.getType() === "Point") coords = (g4326 as Point).getCoordinates();
        else if (g4326.getType() === "Polygon") coords = (g4326 as Polygon).getCoordinates();
        f.set("coords", coords);
      }
      setAnnotKey((k) => k + 1);
    });
    mapRef.current.addInteraction(draw);
    drawRef.current = draw;
  };

  const toggleModify = () => {
    if (!mapRef.current || !annotationsSourceRef.current) return;
    if (isModifyOn) { disableModify(); setIsModifyOn(false); return; }
    const select = new Select({ condition: click });
    const modify = new Modify({ features: select.getFeatures() });
    mapRef.current.addInteraction(select);
    mapRef.current.addInteraction(modify);
    selectRef.current = select;
    modifyRef.current = modify;
    setIsModifyOn(true);
  };

  const deleteSelected = () => {
    if (!annotationsSourceRef.current) return;
    const sel = selectRef.current?.getFeatures();
    if (sel && sel.getLength() > 0) {
      const toRemove: Feature[] = [];
      sel.forEach((f) => toRemove.push(f as Feature));
      toRemove.forEach((f) => annotationsSourceRef.current!.removeFeature(f));
      sel.clear();
    } else {
      const feats = annotationsSourceRef.current.getFeatures();
      if (feats.length > 0) annotationsSourceRef.current.removeFeature(feats[feats.length - 1]);
    }
    setAnnotKey((k) => k + 1);
  };

  // Export/Import
  const exportGeoJSON = () => {
    if (!annotationsSourceRef.current) return;
    const format = new GeoJSON();
    const json = format.writeFeatures(annotationsSourceRef.current.getFeatures(), {
      featureProjection: "EPSG:3857",
      dataProjection: "EPSG:4326",
      decimals: 6,
    });
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `annotations_${Date.now()}.geojson`; a.click();
    URL.revokeObjectURL(url);
  };
  const importGeoJSON = (file: File) => {
    if (!annotationsSourceRef.current) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result);
        const format = new GeoJSON();
        const features = format.readFeatures(text, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });
        annotationsSourceRef.current!.addFeatures(features);
        setAnnotKey((k) => k + 1);
      } catch { alert("No se pudo importar el GeoJSON."); }
    };
    reader.readAsText(file);
  };

  // Lista de anotaciones + filtro
  const [annotKey, setAnnotKey] = useState(0);
  useEffect(() => {
    if (!annotationsSourceRef.current) return;
    const fn = () => setAnnotKey((k) => k + 1);
    annotationsSourceRef.current.on("addfeature", fn);
    annotationsSourceRef.current.on("removefeature", fn);
    return () => {
      annotationsSourceRef.current?.un("addfeature", fn);
      annotationsSourceRef.current?.un("removefeature", fn);
    };
  }, []);
  const annotationsList = useMemo(() => {
    if (!annotationsSourceRef.current) return [];
    const items = annotationsSourceRef.current.getFeatures().map((f, i) => {
      const raw = f.get("name");
      const name = typeof raw === "string" && raw.length > 0 ? raw : `Anotación ${i + 1}`;
      let lon = NaN, lat = NaN;
      const geom = f.getGeometry();
      if (geom?.getType() === "Point") {
        const [lo, la] = toLonLat((geom as Point).getCoordinates()); lon = lo; lat = la;
      } else if (geom?.getType() === "Polygon") {
        const ip = (geom as Polygon).getInteriorPoint();
        const [lo, la] = toLonLat(ip.getCoordinates()); lon = lo; lat = la;
      }
      return { feature: f, name, lon, lat, type: geom?.getType() };
    });
    if (!filter.trim()) return items;
    const q = filter.trim().toLowerCase();
    return items.filter((it) => it.name.toLowerCase().includes(q));
  }, [annotKey, filter]);

  // Utilidades UI
  const flyToFeature = (f: Feature) => {
    if (!mapRef.current) return;
    const geom = f.getGeometry(); const view = mapRef.current.getView();
    if (!geom || !view) return;
    view.fit(geom.getExtent(), { duration: 400, maxZoom: 10, padding: [48, 48, 48, 48] });
  };
  const resetView = () => {
    if (!mapRef.current) return;
    mapRef.current.getView().animate({ center: fromLonLat([0, 0]), zoom: 2, duration: 350 });
  };
  const copyCoords = async (lon: number, lat: number) => {
    try { await navigator.clipboard.writeText(`${lon.toFixed(5)}, ${lat.toFixed(5)}`); } catch {}
  };

  /* ============== RENDER ============== */
  return (
    <div className="h-full w-full relative">
      {/* Mapa (OL) */}
      <div ref={mapDivRef} className="fixed left-0 right-0 bottom-0" style={{ top: "var(--navbar-h)" }} />

      {/* Contenedor Aladin (HiPS) */}
      <div
        ref={hipsDivRef}
        className="fixed left-0 right-0 bottom-0"
        style={{
          top: "var(--navbar-h)",
          height: "calc(100vh - var(--navbar-h))",
          background: "#000",
          display: layer.kind === "HIPS" ? "block" : "none",
          zIndex: 10
        }}
      />

      {/* NAVBAR (tu componente) */}
      <Navbar
        headerRef={headerRef as MutableRefObject<HTMLElement | null>}
        tilePending={tilePending}
        layerId={layer.id}
        layers={LAYERS.map(({ id, title }) => ({ id, title }))}
        onChangeLayer={(id: string) => setLayer(LAYERS.find((l) => l.id === id)!)}
        date={date}
        onChangeDate={setDate}
        drawMode={drawMode}
        onSetDrawMode={(m: DrawMode) => {
          setDrawMode(m);
          if (m === "Point" || m === "Polygon") enableDraw(m);
          else disableDraw();
        }}
        isModifyOn={isModifyOn}
        onToggleModify={() => { toggleModify(); }}
        onDeleteSelected={deleteSelected}
        opacity={opacity}
        onOpacityChange={setOpacity}
        onExport={exportGeoJSON}
        onImport={importGeoJSON}
        onResetView={resetView}
        cursorCoord={cursorCoord}
      />

      {/* Panel lateral (anotaciones) solo en GIBS */}
      {layer.kind !== "HIPS" && (
        <aside
          className="fixed right-4 z-40 w-80 max-w-[90vw] bg-white/80 backdrop-blur border border-slate-200 rounded-xl shadow-xl p-3 flex flex-col"
          style={{ top: "calc(var(--navbar-h) + 12px)", height: "calc(100vh - var(--navbar-h) - 24px)" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="font-extrabold text-slate-900 text-sm">Anotaciones</div>
            <div className="ml-auto" />
            <input
              placeholder="Filtrar…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-2 py-1.5 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>

          <div className="text-[11px] text-rose-600 mb-2">
            {tileErrors > 0 ? `Errores de carga: ${tileErrors}` : " "}
          </div>

          <div className="overflow-auto min-h-0">
            {annotationsList.length === 0 ? (
              <div className="text-sm text-slate-600">No hay anotaciones. Usa <b>Punto</b> o <b>Polígono</b>.</div>
            ) : (
              <ul className="space-y-2">
                {annotationsList.map(({ feature, name, lon, lat, type }, i) => (
                  <li key={i} className="border border-slate-200 rounded-lg p-2 bg-white">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-sm text-slate-900 truncate">{name}</div>
                      <span className="text-xs text-slate-500">{type}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {Number.isFinite(lon) && Number.isFinite(lat) ? `${lon.toFixed(4)}, ${lat.toFixed(4)}` : "—"}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <button onClick={() => flyToFeature(feature)} className="px-2 py-1 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50">Ir</button>
                      <button
                        onClick={() => {
                          const newName = window.prompt("Cambiar nombre:", name) ?? name;
                          feature.set("name", newName);
                          setFilter((f) => f + "");
                        }}
                        className="px-2 py-1 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50"
                      >Renombrar</button>
                      {Number.isFinite(lon) && Number.isFinite(lat) && (
                        <button onClick={() => copyCoords(lon, lat)} className="px-2 py-1 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50">Copiar coords</button>
                      )}
                      <button
                        onClick={() => {
                          if (!annotationsSourceRef.current) return;
                          annotationsSourceRef.current.removeFeature(feature);
                          setAnnotKey((k) => k + 1);
                        }}
                        className="px-2 py-1 text-xs rounded border border-rose-300 bg-rose-100 hover:bg-rose-200"
                        title="Borrar esta anotación"
                      >Borrar</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-3 text-[11px] text-slate-500">Imagery © NASA EOSDIS GIBS / Worldview</div>
        </aside>
      )}

      {/* Pie */}
      <div className="fixed bottom-2 left-1/2 -translate-x-1/2 text-[11px] text-slate-500 bg-white/80 border border-slate-200 rounded-md px-2 py-1 shadow-sm">
        {layer.kind === "HIPS"
          ? "Aladin Lite (HiPS) · Usa el control de capas en la esquina"
          : "Escala en la esquina del mapa · Atajos: P/G/N/E/Del/R"}
      </div>
    </div>
  );
}
