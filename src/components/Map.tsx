import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import "ol/ol.css";

import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";

import XYZ from "ol/source/XYZ";
import WMTS from "ol/source/WMTS";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";

import { get as getProj, transform } from "ol/proj";
import { getWidth as extentWidth } from "ol/extent";
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

import WMTSTileGrid from "ol/tilegrid/WMTS";
import Navbar from "./Navbar";

/* =======================================================
   Tipos / Config
======================================================= */
type DrawMode = "None" | "Point" | "Polygon";

type GibsLayer = {
  kind: "gibs";
  id: string; // id GIBS
  title: string;
  matrixSet: "GoogleMapsCompatible_Level8" | "GoogleMapsCompatible_Level9";
  ext: "jpg" | "png";
};

type TrekBody = "Moon" | "Mars" | "Ceres";

type TrekLayer = {
  kind: "trek";
  body: TrekBody;
  title: string;
  /** Endpoint REST hasta el nombre de la capa (sin /1.0.0/...). */
  endpoint: string;
  format: "jpg" | "png";
  maxLevel?: number;
};

type AnyLayer = GibsLayer | TrekLayer;

/* ====== GIBS seguras (Earth) ====== */
const GIBS_LAYERS: GibsLayer[] = [
  // True Color (diurnas)
  { kind: "gibs", id: "MODIS_Terra_CorrectedReflectance_TrueColor", title: "🌍 MODIS Terra — True Color",  ext: "jpg", matrixSet: "GoogleMapsCompatible_Level9" },
  { kind: "gibs", id: "MODIS_Aqua_CorrectedReflectance_TrueColor",  title: "🌍 MODIS Aqua — True Color",   ext: "jpg", matrixSet: "GoogleMapsCompatible_Level9" },
  { kind: "gibs", id: "VIIRS_SNPP_CorrectedReflectance_TrueColor",  title: "🌍 VIIRS SNPP — True Color",   ext: "jpg", matrixSet: "GoogleMapsCompatible_Level9" },

  // Composiciones útiles
  { kind: "gibs", id: "MODIS_Terra_CorrectedReflectance_Bands721",  title: "🌍 MODIS Terra — 7-2-1 (polvo/humo)", ext: "jpg", matrixSet: "GoogleMapsCompatible_Level9" },
  { kind: "gibs", id: "MODIS_Terra_CorrectedReflectance_Bands367",  title: "🌍 MODIS Terra — 3-6-7 (vegetación)",   ext: "jpg", matrixSet: "GoogleMapsCompatible_Level9" },

  // Estáticos / nocturnos (⚠ Blue Marble en Level8)
  { kind: "gibs", id: "BlueMarble_ShadedRelief",                    title: "🌍 Blue Marble — Shaded Relief (estático)",  ext: "jpg", matrixSet: "GoogleMapsCompatible_Level8" },
  { kind: "gibs", id: "BlueMarble_ShadedRelief_Bathymetry",         title: "🌍 Blue Marble — Relieve + Batimetría",       ext: "jpg", matrixSet: "GoogleMapsCompatible_Level8" },
  { kind: "gibs", id: "VIIRS_CityLights_2012",                      title: "🌍 City Lights 2012 (nocturno estático)",     ext: "jpg", matrixSet: "GoogleMapsCompatible_Level8" },
];

/* ====== TREKS (REST, EPSG:4326) ====== */
const TREK_LAYERS: TrekLayer[] = [
  /* ——— Mars ——— */
  {
    kind: "trek",
    body: "Mars",
    title: "🪐 Mars — MOLA Color Shaded Relief (463m)",
    endpoint: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m",
    format: "jpg",
    maxLevel: 10,
  },
  {
    kind: "trek",
    body: "Mars",
    title: "🪐 Mars — Viking MDIM21 Color Mosaic (232m)",
    endpoint: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m",
    format: "jpg",
    maxLevel: 10,
  },

  /* ——— Moon ——— */
  {
    kind: "trek",
    body: "Moon",
    title: "🌙 Moon — LRO LOLA Color Shaded (128ppd)",
    endpoint: "https://trek.nasa.gov/tiles/Moon/EQ/LRO_LOLA_ClrShade_Global_128ppd_v04",
    format: "png",
    maxLevel: 8,
  },

  /* ——— Ceres ——— */
  {
    kind: "trek",
    body: "Ceres",
    title: "🪐 Ceres — Dawn FC HAMO Color Shaded (60ppd, 2016)",
    endpoint: "https://trek.nasa.gov/tiles/Ceres/EQ/Ceres_Dawn_FC_HAMO_ClrShade_DLR_Global_60ppd_Oct2016",
    format: "jpg",
    maxLevel: 10,
  },
];

// Lista plana para búsquedas internas
const LAYERS: AnyLayer[] = [...GIBS_LAYERS, ...TREK_LAYERS];

/* ===== util fecha ===== */
function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/* ===== util GIBS URL ===== */
function buildGibsUrl(dateISO: string, layer: GibsLayer) {
  // WMTS estilo REST (GIBS permite usarlo como XYZ)
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer.id}/default/${dateISO}/${layer.matrixSet}/{z}/{y}/{x}.${layer.ext}`;
}

/* ===== Estilo de anotaciones ===== */
const annotationStyle = (feature: FeatureLike) => {
  const name = feature.get("name") ?? "";
  const isPoint = feature.getGeometry()?.getType() === "Point";
  return new Style({
    image: isPoint
      ? new CircleStyle({ radius: 6, fill: new Fill({ color: "rgba(255,255,255,0.95)" }), stroke: new Stroke({ color: "#0f172a", width: 2 }) })
      : undefined,
    stroke: new Stroke({ color: "#0f172a", width: 2 }),
    fill: new Fill({ color: "rgba(14,165,233,0.10)" }),
    text: new Text({
      text: name,
      offsetY: isPoint ? -16 : 0,
      font: "12px Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Helvetica Neue, Arial",
      padding: [2, 4, 2, 4],
      backgroundFill: new Fill({ color: "rgba(255,255,255,0.85)" }),
      backgroundStroke: new Stroke({ color: "#0f172a", width: 1 }),
    }),
  });
};

/* ===== Permalink (#lon,lat,zoom,fecha,layerKey,proj) ===== */
type PermalinkState = { lon?: number; lat?: number; z?: number; d?: string; k?: string; p?: string };
function readHash(): PermalinkState {
  const h = window.location.hash.replace("#", "");
  if (!h) return {};
  const parts = h.split(",");
  const [lon, lat, z, d, k, p] = [parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]];
  return {
    lon: lon ? Number(lon) : undefined,
    lat: lat ? Number(lat) : undefined,
    z: z ? Number(z) : undefined,
    d: d || undefined,
    k: k || undefined,
    p: p || undefined,
  };
}
function writeHash(view: View, dateISO: string, layerKey: string) {
  const proj = view.getProjection().getCode();
  const center = view.getCenter() || [0, 0];
  const [lon, lat] = transform(center, proj, "EPSG:4326");
  const zoom = view.getZoom() ?? 2;
  window.history.replaceState(null, "", `#${lon.toFixed(5)},${lat.toFixed(5)},${zoom.toFixed(2)},${dateISO},${layerKey},${proj}`);
}

/* ===== helpers de clave de capa ===== */
const layerKey = (l: AnyLayer) =>
  l.kind === "gibs" ? `gibs:${l.id}` : `trek:${l.body}:${l.endpoint}`;

function parseLayerKey(k?: string) {
  if (!k) return null;
  if (k.startsWith("gibs:")) {
    return { kind: "gibs" as const, id: k.slice(5) };
  }
  if (k.startsWith("trek:")) {
    // trek:<Body>:<endpoint>
    const rest = k.slice(5);
    const firstColon = rest.indexOf(":");
    if (firstColon === -1) return null;
    const body = rest.slice(0, firstColon) as TrekBody;
    const endpoint = rest.slice(firstColon + 1);
    return { kind: "trek" as const, body, endpoint };
  }
  return null;
}

/* =======================================================
   Map (principal)
======================================================= */
export default function App() {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const hash = readHash();

  // Estado UI
  const [date, setDate] = useState<string>(hash.d ?? todayISO());
  const dateRef = useRef(date);
  useEffect(() => { dateRef.current = date; }, [date]);

  // Capa activa (respetar hash; si no coincide, fallback silencioso al mismo “dominio”)
  const hashParsed = parseLayerKey(hash.k);
  let defaultLayer: AnyLayer | undefined = LAYERS.find((l) => layerKey(l) === (hash.k ?? ""));
  if (!defaultLayer && hashParsed?.kind === "gibs") {
    defaultLayer = GIBS_LAYERS[0];
  } else if (!defaultLayer && hashParsed?.kind === "trek") {
    defaultLayer = TREK_LAYERS.find((t) => t.body === hashParsed!.body) ?? TREK_LAYERS[0];
  }
  if (!defaultLayer) defaultLayer = LAYERS[0];

  const [active, setActive] = useState<AnyLayer>(defaultLayer);

  const [opacity, setOpacity] = useState<number>(1);
  const [drawMode, setDrawMode] = useState<DrawMode>("None");
  const [isModifyOn, setIsModifyOn] = useState(false);
  const [tilePending, setTilePending] = useState(0);
  const [tileErrors, setTileErrors] = useState(0);
  const [cursorCoord, setCursorCoord] = useState<{ lon: number; lat: number } | null>(null);
  const [filter, setFilter] = useState("");

  // Refs OL
  const mapRef = useRef<Map | null>(null);
  const imageryLayerRef = useRef<TileLayer<any> | null>(null);
  const baseLayerRef = useRef<TileLayer<OSM> | null>(null);
  const annotationsSourceRef = useRef<VectorSource | null>(null);
  const drawRef = useRef<Draw | null>(null);
  const modifyRef = useRef<Modify | null>(null);
  const selectRef = useRef<Select | null>(null);

  const annotationsStyle = useMemo(() => annotationStyle, []);

  /* ===== Navbar height + map.updateSize ===== */
  useEffect(() => {
    const applyNavbarHeight = () => {
      const h = headerRef.current?.offsetHeight ?? 64;
      document.documentElement.style.setProperty("--navbar-h", `${h}px`);
      if (mapRef.current) requestAnimationFrame(() => mapRef.current?.updateSize());
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

  // Helpers de carga para cualquier source de teselas
  const attachTileLoadEvents = (src: any) => {
    const onStart = () => setTilePending((p) => p + 1);
    const onEnd   = () => setTilePending((p) => Math.max(0, p - 1));
    const onError = () => { setTilePending((p) => Math.max(0, p - 1)); setTileErrors((e) => e + 1); };
    src.on("tileloadstart", onStart);
    src.on("tileloadend", onEnd);
    src.on("tileloaderror", onError);
    return () => {
      src.un("tileloadstart", onStart);
      src.un("tileloadend", onEnd);
      src.un("tileloaderror", onError);
    };
  };

  // Crear capa de imagen (GIBS o TREK) REST manual
  const makeImageryLayerREST = (sel: TrekLayer | GibsLayer) => {
    if ((sel as GibsLayer).kind === "gibs") {
      const gsel = sel as GibsLayer;
      const src = new XYZ({
        url: buildGibsUrl(dateRef.current, gsel),
        crossOrigin: "anonymous",
        tilePixelRatio: 1,
      });
      const cleanup = attachTileLoadEvents(src);
      const lyr = new TileLayer({ source: src, opacity, zIndex: 1 });
      (lyr as any).__cleanup = cleanup;
      return lyr;
    } else {
      const tsel = sel as TrekLayer;
      // TREK WMTS en EPSG:4326 (WGS84Quad) con Grid manual (REST)
      const projection = getProj("EPSG:4326")!;
      const extent = [-180, -90, 180, 90];
      const size = extentWidth(extent) / 256; // 360/256
      const max = tsel.maxLevel ?? 10;
      const resolutions = new Array(max + 1).fill(0).map((_, z) => (size / 2) / Math.pow(2, z));
      const matrixIds = new Array(max + 1).fill(0).map((_, z) => String(z));

      const grid = new WMTSTileGrid({
        origin: [-180, 90],
        resolutions,
        matrixIds,
        tileSize: [256, 256],
        extent,
      });

      const src = new WMTS({
        requestEncoding: "REST",
        url: `${tsel.endpoint}/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.${tsel.format}`,
        layer: "default",
        matrixSet: "default028mm",
        format: tsel.format === "jpg" ? "image/jpeg" : "image/png",
        style: "default",
        projection,
        tileGrid: grid,
        wrapX: true,
        crossOrigin: "anonymous",
      });
      const cleanup = attachTileLoadEvents(src);
      const lyr = new TileLayer({ source: src, opacity, zIndex: 1 });
      (lyr as any).__cleanup = cleanup;
      return lyr;
    }
  };

  // Cambiar proyección + reconfigurar capas base/imagery
  const ensureProjection = (targetProj: "EPSG:3857" | "EPSG:4326", keepCenter = true) => {
    const map = mapRef.current;
    if (!map) return;
    const currProj = map.getView().getProjection().getCode();
    if (currProj === targetProj) return;

    const centerWgs =
      keepCenter
        ? transform(map.getView().getCenter() || [0, 0], currProj, "EPSG:4326")
        : [0, 0];

    const view = new View({
      projection: targetProj,
      center: transform(centerWgs, "EPSG:4326", targetProj),
      zoom: Math.max(2, Math.min(map.getView().getZoom() ?? 2, 12)),
    });
    map.setView(view);

    if (baseLayerRef.current) {
      map.removeLayer(baseLayerRef.current);
      baseLayerRef.current = null;
    }
    if (targetProj === "EPSG:3857") {
      const base = new TileLayer({ source: new OSM(), zIndex: 0 });
      baseLayerRef.current = base;
      map.getLayers().insertAt(0, base);
    }

    setTimeout(() => map.updateSize(), 0);
  };

  // Inicializar mapa con la capa por defecto
  useEffect(() => {
    if (!mapDivRef.current) return;

    const initProj: "EPSG:3857" | "EPSG:4326" =
      (hash.p as any) ?? (defaultLayer.kind === "gibs" ? "EPSG:3857" : "EPSG:4326");

    const view = new View({
      projection: initProj,
      center:
        hash.lon !== undefined && hash.lat !== undefined
          ? transform([hash.lon, hash.lat], "EPSG:4326", initProj)
          : transform([0, 0], "EPSG:4326", initProj),
      zoom: hash.z ?? 2,
    });

    const map = new Map({
      target: mapDivRef.current,
      layers: [],
      view,
      controls: defaultControls({ zoom: true, rotate: true, attribution: false }).extend([new ScaleLine()]),
    });

    if (initProj === "EPSG:3857") {
      const base = new TileLayer({ source: new OSM(), zIndex: 0 });
      baseLayerRef.current = base;
      map.addLayer(base);
    }

    // Anotaciones
    const annotationsSource = new VectorSource();
    annotationsSourceRef.current = annotationsSource;
    const annotations = new VectorLayer({ source: annotationsSource, style: annotationsStyle, zIndex: 2 });
    map.addLayer(annotations);

    // Imagery inicial
    const imagery = makeImageryLayerREST(defaultLayer);
    imageryLayerRef.current = imagery;
    map.addLayer(imagery);

    // Eventos
    const onMove = () => writeHash(map.getView(), dateRef.current, layerKey(active));
    const onPointerMove = (evt: any) => {
      const proj = map.getView().getProjection().getCode();
      const [lon, lat] = transform(evt.coordinate, proj, "EPSG:4326");
      setCursorCoord({ lon, lat });
    };
    map.on("moveend", onMove);
    map.on("pointermove", onPointerMove);

    // Proyección correcta (por si el hash pedía otra)
    ensureProjection(defaultLayer.kind === "gibs" ? "EPSG:3857" : "EPSG:4326");

    mapRef.current = map;
    setTimeout(() => map.updateSize(), 0);

    return () => {
      map.un("moveend", onMove);
      map.un("pointermove", onPointerMove);
      if (imageryLayerRef.current && (imageryLayerRef.current as any).__cleanup) {
        (imageryLayerRef.current as any).__cleanup();
      }
      map.setTarget(undefined);
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cambios de fecha (GIBS) o capa → reemplazar source / reproyectar si aplica
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const replaceImagery = (newLayer: TileLayer<any>) => {
      const old = imageryLayerRef.current;
      if (old) {
        map.removeLayer(old);
        if ((old as any).__cleanup) (old as any).__cleanup();
      }
      imageryLayerRef.current = newLayer;
      map.addLayer(newLayer);
      writeHash(map.getView(), dateRef.current, layerKey(active));
    };

    const targetProj = active.kind === "gibs" ? "EPSG:3857" : "EPSG:4326";
    ensureProjection(targetProj);

    if (active.kind === "gibs") {
      const lyr = makeImageryLayerREST(active);
      replaceImagery(lyr);
    } else {
      const lyr = makeImageryLayerREST(active);
      replaceImagery(lyr);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, active]);

  // Opacidad
  useEffect(() => {
    if (imageryLayerRef.current) imageryLayerRef.current.setOpacity(opacity);
  }, [opacity]);

  /* ================= Interacciones ================= */
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
      const proj = mapRef.current!.getView().getProjection().getCode();
      if (g) {
        const g4326 = g.clone().transform(proj, "EPSG:4326");
        let coords: any = null;
        if (g4326.getType() === "Point") {
          coords = (g4326 as Point).getCoordinates();
        } else if (g4326.getType() === "Polygon") {
          coords = (g4326 as Polygon).getCoordinates();
        }
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

  // Borrar selección o última
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

  // Export/Import GeoJSON (EPSG:4326)
  const exportGeoJSON = () => {
    if (!annotationsSourceRef.current) return;
    const format = new GeoJSON();
    const json = format.writeFeatures(annotationsSourceRef.current.getFeatures(), {
      featureProjection: mapRef.current?.getView().getProjection().getCode() || "EPSG:3857",
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
        const features = format.readFeatures(text, {
          dataProjection: "EPSG:4326",
          featureProjection: mapRef.current?.getView().getProjection().getCode() || "EPSG:3857",
        });
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
    if (!annotationsSourceRef.current || !mapRef.current) return [];
    const proj = mapRef.current.getView().getProjection().getCode();
    const items = annotationsSourceRef.current.getFeatures().map((f, i) => {
      const raw = f.get("name");
      const name = (typeof raw === "string" && raw.length > 0) ? raw : `Anotación ${i + 1}`;
      let lon = NaN, lat = NaN;
      const geom = f.getGeometry();
      if (geom) {
        let pos: [number, number];
        if (geom.getType() === "Polygon") {
          pos = (geom as Polygon).getInteriorPoint().getCoordinates() as [number, number];
        } else {
          pos = (geom as Point | any).getCoordinates() as [number, number];
        }
        const [lo, la] = transform(pos, proj, "EPSG:4326");
        lon = lo; lat = la;
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
    const proj = mapRef.current.getView().getProjection().getCode();
    mapRef.current.getView().animate({ center: transform([0, 0], "EPSG:4326", proj), zoom: 2, duration: 350 });
  };
  const copyCoords = async (lon: number, lat: number) => {
    try { await navigator.clipboard.writeText(`${lon.toFixed(5)}, ${lat.toFixed(5)}`); } catch {}
  };

  /* ===== Layers para Navbar: SOLO del mismo “dominio” ===== */
  const layersForNavbar = useMemo(() => {
    if (active.kind === "gibs") {
      return GIBS_LAYERS.map((l) => ({ id: layerKey(l), title: l.title }));
    }
    // mismo cuerpo treks
    return TREK_LAYERS.filter((t) => t.body === active.body)
      .map((l) => ({ id: layerKey(l), title: l.title }));
  }, [active]);

  const handleChangeLayer = (key: string) => {
    const next = LAYERS.find((l) => layerKey(l) === key);
    if (!next) return;

    // Bloquear cambios de planeta: debe pertenecer al mismo dominio
    const sameDomain =
      (active.kind === "gibs" && next.kind === "gibs") ||
      (active.kind === "trek" && next.kind === "trek" && next.body === active.body);

    if (!sameDomain) return; // ignorar silenciosamente

    setActive(next);
    if (drawMode === "Point" || drawMode === "Polygon") {
      // recrear interacción por si cambió proyección
      disableDraw();
      enableDraw(drawMode);
    }
  };

  const handleSetDrawMode = (m: DrawMode) => {
    setDrawMode(m);
    if (m === "Point" || m === "Polygon") enableDraw(m);
    else disableDraw();
  };

  // Atajos de teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "p")      handleSetDrawMode("Point");
      else if (e.key.toLowerCase() === "g") handleSetDrawMode("Polygon");
      else if (e.key.toLowerCase() === "n") handleSetDrawMode("None");
      else if (e.key.toLowerCase() === "e") toggleModify();
      else if (e.key === "Delete")          deleteSelected();
      else if (e.key.toLowerCase() === "r") resetView();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModifyOn, drawMode, active]);

  /* ============== RENDER ============== */
  return (
    <div className="h-full w-full relative">
      {/* Mapa full-screen (debajo del navbar) */}
      <div ref={mapDivRef} className="fixed left-0 right-0 bottom-0" style={{ top: "var(--navbar-h)" }} />

      {/* NAVBAR (tu componente intacto, ahora con opciones filtradas) */}
      <Navbar
        headerRef={headerRef as MutableRefObject<HTMLElement | null>}
        tilePending={tilePending}
        layerId={layerKey(active)}
        layers={layersForNavbar}
        onChangeLayer={handleChangeLayer}
        date={date}
        onChangeDate={setDate}
        drawMode={drawMode}
        onSetDrawMode={handleSetDrawMode}
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

      {/* Panel lateral (anotaciones) */}
      <aside
        className="fixed right-4 z-40 w-80 max-w-[90vw] bg-white/80 backdrop-blur border border-slate-200 rounded-xl shadow-xl p-3 flex flex-col"
        style={{ top: "calc(var(--navbar-h) + 12px)", height: "calc(100vh - var(--navbar-h) - 24px)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="font-extrabold text-slate-900 text-sm">Notes</div>
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
            <div className="text-sm text-slate-600">
              There are no annotations. Use <b>Point</b> or <b>Polygon</b>.
            </div>
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
                        // refrescar lista
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

        <div className="mt-3 text-[11px] text-slate-500">
          Imagery © NASA EOSDIS GIBS / Worldview · NASA Solar System Treks
        </div>
      </aside>

      {/* Pie discreto */}
      <div className="fixed bottom-2 left-1/2 -translate-x-1/2 text-[11px] text-slate-500 bg-white/80 border border-slate-200 rounded-md px-2 py-1 shadow-sm">
        Scale in the corner of the map · Shortcuts: P/G/N/E/Del/R
      </div>
    </div>
  );
}
