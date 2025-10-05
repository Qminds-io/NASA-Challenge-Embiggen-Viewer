import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import "ol/ol.css";

import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";

import XYZ from "ol/source/XYZ";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";

import { defaults as defaultControls, ScaleLine } from "ol/control";
import Draw from "ol/interaction/Draw";
import Modify from "ol/interaction/Modify";
import Select from "ol/interaction/Select";
import { click } from "ol/events/condition";

import GeoJSON from "ol/format/GeoJSON";
import type Feature from "ol/Feature";
import type { FeatureLike } from "ol/Feature";
import { Point, Polygon } from "ol/geom";
import type Geometry from "ol/geom/Geometry";

import Style from "ol/style/Style";
import Stroke from "ol/style/Stroke";
import Fill from "ol/style/Fill";
import CircleStyle from "ol/style/Circle";
import Text from "ol/style/Text";

import { transform, transformExtent } from "ol/proj";
import type { ProjectionLike } from "ol/proj";
import { createXYZ as createTileGridXYZ } from "ol/tilegrid";

import Navbar from "./Navbar";
import {
  API_BASE_URL,
  createAnnotations,
  deleteAnnotation,
  fetchAnnotations,
  fetchLayersCatalog,
  type AnnotationCreateRequest,
  type AnnotationRecord,
  type LayerItem,
  type LayersCatalog,
  type ProjectionCode,
} from "../services/api";

type DrawMode = "None" | "Point" | "Polygon";
type Coord = { lon: number; lat: number } | null;

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
  { kind: "gibs", id: "MODIS_Terra_CorrectedReflectance_TrueColor", title: "🌍 MODIS Terra — True Color",  ext: "jpg", matrixSet: "GoogleMapsCompatible_Level9" },
  { kind: "gibs", id: "MODIS_Aqua_CorrectedReflectance_TrueColor",  title: "🌍 MODIS Aqua — True Color",   ext: "jpg", matrixSet: "GoogleMapsCompatible_Level9" },
  { kind: "gibs", id: "VIIRS_SNPP_CorrectedReflectance_TrueColor",  title: "🌍 VIIRS SNPP — True Color",   ext: "jpg", matrixSet: "GoogleMapsCompatible_Level9" },
  { kind: "gibs", id: "MODIS_Terra_CorrectedReflectance_Bands721",  title: "🌍 MODIS Terra — 7-2-1 (polvo/humo)", ext: "jpg", matrixSet: "GoogleMapsCompatible_Level9" },
  { kind: "gibs", id: "MODIS_Terra_CorrectedReflectance_Bands367",  title: "🌍 MODIS Terra — 3-6-7 (vegetación)",   ext: "jpg", matrixSet: "GoogleMapsCompatible_Level9" },
  { kind: "gibs", id: "BlueMarble_ShadedRelief",                    title: "🌍 Blue Marble — Shaded Relief (estático)",  ext: "jpg", matrixSet: "GoogleMapsCompatible_Level8" },
  { kind: "gibs", id: "BlueMarble_ShadedRelief_Bathymetry",         title: "🌍 Blue Marble — Relieve + Batimetría",       ext: "jpg", matrixSet: "GoogleMapsCompatible_Level8" },
  { kind: "gibs", id: "VIIRS_CityLights_2012",                      title: "🌍 City Lights 2012 (nocturno estático)",     ext: "jpg", matrixSet: "GoogleMapsCompatible_Level8" },
];

/* ====== TREKS (REST, EPSG:4326) ====== */
const TREK_LAYERS: TrekLayer[] = [
  { kind: "trek", body: "Mars", title: "🪐 Mars — MOLA Color Shaded Relief (463m)", endpoint: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m", format: "jpg", maxLevel: 10 },
  { kind: "trek", body: "Mars", title: "🪐 Mars — Viking MDIM21 Color Mosaic (232m)", endpoint: "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m", format: "jpg", maxLevel: 10 },
  { kind: "trek", body: "Moon", title: "🌙 Moon — LRO LOLA Color Shaded (128ppd)", endpoint: "https://trek.nasa.gov/tiles/Moon/EQ/LRO_LOLA_ClrShade_Global_128ppd_v04", format: "png", maxLevel: 8 },
  { kind: "trek", body: "Ceres", title: "🪐 Ceres — Dawn FC HAMO Color Shaded (60ppd, 2016)", endpoint: "https://trek.nasa.gov/tiles/Ceres/EQ/Ceres_Dawn_FC_HAMO_ClrShade_DLR_Global_60ppd_Oct2016", format: "jpg", maxLevel: 10 },
];

// Lista plana para búsquedas internas
const LAYERS: AnyLayer[] = [...GIBS_LAYERS, ...TREK_LAYERS];

/* ===== util fecha ===== */
function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
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

const GEOJSON_DATA_PROJECTION = "EPSG:4326";
const EARTH_EXTENT: [number, number, number, number] = [-180, -90, 180, 90];

function todayISO() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

function readHash(): PermalinkState {
  const h = window.location.hash.replace("#", "");
  if (!h) return {};
  const parts = h.split(",");
  const [lon, lat, z, d, k, p] = parts;
  return {
    lon: lon ? Number(lon) : undefined,
    lat: lat ? Number(lat) : undefined,
    z: z ? Number(z) : undefined,
    d: d || undefined,
    k: k || undefined,
    p: p || undefined,
  };
}
function writeHash(view: View, dateISO: string, lkey: string) {
  const proj = view.getProjection().getCode();
  const center = view.getCenter() || [0, 0];
  const [lon, lat] = transform(center, proj, GEOJSON_DATA_PROJECTION);
  const zoom = view.getZoom() ?? 2;
  window.history.replaceState(null, "", `#${lon.toFixed(5)},${lat.toFixed(5)},${zoom.toFixed(2)},${dateISO},${lkey},${proj}`);
}

/* ===== helpers de clave de capa ===== */
const layerKey = (l: AnyLayer) => (l.kind === "gibs" ? `gibs:${l.id}` : `trek:${l.body}:${l.endpoint}`);
function parseLayerKey(k?: string) {
  if (!k) return null;
  if (k.startsWith("gibs:")) return { kind: "gibs" as const, id: k.slice(5) };
  if (k.startsWith("trek:")) {
    const rest = k.slice(5);
    const firstColon = rest.indexOf(":");
    if (firstColon === -1) {
      return { kind: "trek" as const, body: rest };
    }
    const body = rest.slice(0, firstColon);
    const endpoint = rest.slice(firstColon + 1);
    return { kind: "trek" as const, body, endpoint };
  }
  return { kind: "custom" as const };
}

function isProjectionCode(value: unknown): value is ProjectionCode {
  return value === "EPSG:4326" || value === "EPSG:3857";
}

function buildTileUrl(layer: LayerItem, dateISO: string) {
  const base = API_BASE_URL.length > 0 ? API_BASE_URL : "";
  if (layer.tileTemplate) {
    let template = layer.tileTemplate;
    if (template.includes("{date}")) {
      const dateValue = dateISO || layer.defaultDate || todayISO();
      template = template.replace("{date}", encodeURIComponent(dateValue));
    }
    if (!template.startsWith("/")) {
      template = `/${template}`;
    }
    return `${base}${template}`;
  }
  const encodedKey = encodeURIComponent(layer.layerKey);
  const query = dateISO ? `?date=${encodeURIComponent(dateISO)}` : "";
  return `${base}/v1/layers/${encodedKey}/tiles/{z}/{x}/{y}${query}`;
}
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

const layerKey = (layer: LayerItem) => layer.layerKey;

export default function MapView() {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const hash = readHash();

  // Estado UI
  const [date, setDate] = useState<string>(hash.d ?? todayISO());
  const dateRef = useRef(date);
  useEffect(() => { dateRef.current = date; }, [date]);

  const hashParsed = parseLayerKey(hash.k);
  let defaultLayer: AnyLayer | undefined = LAYERS.find((l) => layerKey(l) === (hash.k ?? ""));
  if (!defaultLayer && hashParsed?.kind === "gibs") defaultLayer = GIBS_LAYERS[0];
  else if (!defaultLayer && hashParsed?.kind === "trek") defaultLayer = TREK_LAYERS.find((t) => t.body === hashParsed!.body) ?? TREK_LAYERS[0];
  if (!defaultLayer) defaultLayer = LAYERS[0];

  const [date, setDate] = useState<string>(hash?.d ?? todayISO());
  const dateRef = useRef(date);
  useEffect(() => {
    dateRef.current = date;
  }, [date]);

  const [catalogStatus, setCatalogStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<LayersCatalog>([]);

  const allLayers = useMemo(() => catalog.flatMap((body) => body.layers), [catalog]);

  const [active, setActive] = useState<LayerItem | null>(null);
  const activeRef = useRef<LayerItem | null>(null);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const [opacity, setOpacity] = useState<number>(1);
  const [drawMode, setDrawMode] = useState<DrawMode>("None");
  const [isModifyOn, setIsModifyOn] = useState(false);
  const [tilePending, setTilePending] = useState(0);
  const [tileErrors, setTileErrors] = useState(0);
  const [cursorCoord, setCursorCoord] = useState<Coord>(null);
  const [filter, setFilter] = useState("");
  const [annotKey, setAnnotKey] = useState(0);
  const [annotationsLoading, setAnnotationsLoading] = useState(false);
  const [annotationsError, setAnnotationsError] = useState<string | null>(null);

  // NUEVO: control del panel Notes en móvil
  const [notesOpen, setNotesOpen] = useState(false);

  // Refs OL
  const mapRef = useRef<Map | null>(null);
  const imageryLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const baseLayerRef = useRef<TileLayer<OSM> | null>(null);
  const annotationsSourceRef = useRef<VectorSource | null>(null);
  const drawRef = useRef<Draw | null>(null);
  const modifyRef = useRef<Modify | null>(null);
  const selectRef = useRef<Select | null>(null);

  const annotationsStyleMemo = useMemo(() => annotationStyle, []);
  const geojsonFormatter = useMemo(() => new GeoJSON(), []);

  useEffect(() => {
    let cancelled = false;
    setCatalogStatus("loading");
    fetchLayersCatalog()
      .then((data) => {
        if (cancelled) return;
        setCatalog(data);
        setCatalogError(null);
        setCatalogStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to load layers catalog", error);
        setCatalogStatus("error");
        setCatalogError(
          error instanceof Error ? error.message : "No se pudo cargar el catalogo de capas."
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const initialLayerResolvedRef = useRef(false);
  useEffect(() => {
    if (initialLayerResolvedRef.current) return;
    if (catalogStatus !== "ready") return;
    if (allLayers.length === 0) return;

    let candidate = hash?.k ? allLayers.find((layer) => layer.layerKey === hash.k) : undefined;
    if (!candidate && hashParsed?.kind === "gibs") {
      candidate = allLayers.find((layer) => layer.kind === "gibs");
    }
    if (!candidate && hashParsed?.kind === "trek" && hashParsed.body) {
      candidate = allLayers.find((layer) => layer.bodyId === hashParsed.body);
    }
    if (!candidate) {
      candidate = allLayers[0];
    }
    if (candidate) {
      setActive(candidate);
      if (!hash?.d && candidate.defaultDate) {
        setDate(candidate.defaultDate);
      }
    }
    initialLayerResolvedRef.current = true;
  }, [catalogStatus, allLayers, hash, hashParsed]);

  const dateInitializedFromLayerRef = useRef(Boolean(hash?.d));
  useEffect(() => {
    if (!active) return;
    if (dateInitializedFromLayerRef.current) return;
    if (active.defaultDate) {
      setDate(active.defaultDate);
      dateInitializedFromLayerRef.current = true;
    }
  }, [active]);

  useEffect(() => {
    const applyNavbarHeight = () => {
      const h = headerRef.current?.offsetHeight ?? 64;
      document.documentElement.style.setProperty("--navbar-h", `${h}px`);
      if (mapRef.current) {
        requestAnimationFrame(() => mapRef.current?.updateSize());
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

  // Helpers de carga
  const attachTileLoadEvents = (src: any) => {
    const onStart = () => setTilePending((p) => p + 1);
    const onEnd = () => setTilePending((p) => Math.max(0, p - 1));
    const onError = () => {
      setTilePending((p) => Math.max(0, p - 1));
      setTileErrors((e) => e + 1);
    };
    src.on("tileloadstart", onStart);
    src.on("tileloadend", onEnd);
    src.on("tileloaderror", onError);
    return () => {
      src.un("tileloadstart", onStart);
      src.un("tileloadend", onEnd);
      src.un("tileloaderror", onError);
    };
  };

  // Crear capa REST (GIBS o TREK)
  const makeImageryLayerREST = (sel: TrekLayer | GibsLayer) => {
    if ((sel as GibsLayer).kind === "gibs") {
      const gsel = sel as GibsLayer;
      const src = new XYZ({ url: buildGibsUrl(dateRef.current, gsel), crossOrigin: "anonymous", tilePixelRatio: 1 });
      const cleanup = attachTileLoadEvents(src);
      const lyr = new TileLayer({ source: src, opacity, zIndex: 1 });
      (lyr as any).__cleanup = cleanup;
      return lyr;
    } else {
      const tsel = sel as TrekLayer;
      const projection = getProj("EPSG:4326")!;
      const extent = [-180, -90, 180, 90];
      const size = extentWidth(extent) / 256; // 360/256
      const max = tsel.maxLevel ?? 10;
      const resolutions = new Array(max + 1).fill(0).map((_, z) => (size / 2) / Math.pow(2, z));
      const matrixIds = new Array(max + 1).fill(0).map((_, z) => String(z));

      const grid = new WMTSTileGrid({ origin: [-180, 90], resolutions, matrixIds, tileSize: [256, 256], extent });

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

  // Proyección
  const ensureProjection = (targetProj: "EPSG:3857" | "EPSG:4326", keepCenter = true) => {
    const map = mapRef.current;
    if (!map) return;
    const view = map.getView();
    const currentCode = view.getProjection().getCode();
    const targetCode = targetLayer.projection;
    const minZoom = targetLayer.minZoom ?? 0;
    const maxZoom = targetLayer.maxZoom ?? 18;

    const centerWgs = keepCenter ? transform(map.getView().getCenter() || [0, 0], currProj, "EPSG:4326") : [0, 0];

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
    } else if (targetCode !== "EPSG:3857" && baseLayerRef.current) {
      map.removeLayer(baseLayerRef.current);
      baseLayerRef.current = null;
    }

    setTimeout(() => map.updateSize(), 0);
  }, []);

  const makeImageryLayer = useCallback(
    (layer: LayerItem) => {
      const url = buildTileUrl(layer, dateRef.current);
      const tileGrid =
        layer.projection === "EPSG:4326"
          ? createTileGridXYZ({
              extent: EARTH_EXTENT,
              minZoom: layer.minZoom ?? 0,
              maxZoom: layer.maxZoom ?? 10,
              tileSize: layer.tileSize ?? 256,
            })
          : undefined;
      const source = new XYZ({
        url,
        crossOrigin: "anonymous",
        wrapX: true,
        tilePixelRatio: 1,
        projection: layer.projection as ProjectionLike,
        tileGrid,
        minZoom: layer.minZoom,
        maxZoom: layer.maxZoom,
      });
      const cleanup = attachTileLoadEvents(source);
      const tileLayer = new TileLayer({ source, opacity, zIndex: 1 });
      (tileLayer as unknown as { __cleanup?: () => void }).__cleanup = cleanup;
      return tileLayer;
    },
    [opacity]
  );

  // Init mapa
  useEffect(() => {
    if (!mapDivRef.current) return;
    if (mapRef.current) return;
    if (!active) return;

    const initialProjection: ProjectionCode = isProjectionCode(hash?.p)
      ? (hash?.p as ProjectionCode)
      : active.projection;
    const initialCenter =
      hash?.lon !== undefined && hash?.lat !== undefined
        ? transform([hash.lon, hash.lat], GEOJSON_DATA_PROJECTION, initialProjection)
        : transform([0, 0], GEOJSON_DATA_PROJECTION, initialProjection);

    const view = new View({
      projection: initialProjection,
      center: initialCenter,
      zoom: hash?.z ?? 2,
      minZoom: active.minZoom ?? 0,
      maxZoom: active.maxZoom ?? 18,
    });

    const map = new Map({
      target: mapDivRef.current,
      layers: [],
      view,
      controls: defaultControls({ zoom: true, rotate: true, attribution: false }).extend([new ScaleLine()]),
    });

    if (initialProjection === "EPSG:3857") {
      const base = new TileLayer({ source: new OSM(), zIndex: 0 });
      baseLayerRef.current = base;
      map.addLayer(base);
    }

    const annotationsSource = new VectorSource();
    annotationsSourceRef.current = annotationsSource;
    const annotationsLayer = new VectorLayer({ source: annotationsSource, style: annotationsStyleMemo, zIndex: 2 });
    map.addLayer(annotationsLayer);

    const imagery = makeImageryLayerREST(defaultLayer);
    imageryLayerRef.current = imagery;
    map.addLayer(imagery);

    const onMove = () => writeHash(map.getView(), dateRef.current, layerKey(active));
    const onPointerMove = (evt: any) => {
      const proj = map.getView().getProjection().getCode();
      const [lon, lat] = transform(evt.coordinate, proj, GEOJSON_DATA_PROJECTION);
      setCursorCoord({ lon, lat });
    };
    map.on("moveend", onMove);
    map.on("pointermove", onPointerMove);

    ensureProjection(defaultLayer.kind === "gibs" ? "EPSG:3857" : "EPSG:4326");

    mapRef.current = map;
    setTimeout(() => map.updateSize(), 0);

    return () => {
      map.un("moveend", onMove);
      map.un("pointermove", onPointerMove);
      if (imageryLayerRef.current) {
        const cleanup = (imageryLayerRef.current as unknown as { __cleanup?: () => void }).__cleanup;
        if (cleanup) cleanup();
      }
      map.setTarget(undefined);
      mapRef.current = null;
    };
  }, [active, ensureProjection, makeImageryLayer, hash, annotationsStyleMemo]);

  // Cambios de fecha/capa
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const currentLayer = active;
    if (!currentLayer) return;

    ensureProjection(currentLayer);

    const replaceImagery = (newLayer: TileLayer<XYZ>) => {
      const old = imageryLayerRef.current;
      if (old) {
        map.removeLayer(old);
        const cleanup = (old as unknown as { __cleanup?: () => void }).__cleanup;
        if (cleanup) cleanup();
      }
      imageryLayerRef.current = newLayer;
      map.addLayer(newLayer);
      setTileErrors(0);
      writeHash(map.getView(), dateRef.current, currentLayer.layerKey);
    };

    const newLayer = makeImageryLayer(currentLayer);
    replaceImagery(newLayer);
  }, [active, date, ensureProjection, makeImageryLayer]);

    const lyr = makeImageryLayerREST(active);
    replaceImagery(lyr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, active]);

  // Opacidad
  useEffect(() => {
    if (imageryLayerRef.current) {
      imageryLayerRef.current.setOpacity(opacity);
    }
  }, [opacity]);

  const buildFramePayload = useCallback((): AnnotationCreateRequest["frame"] | null => {
    const map = mapRef.current;
    const layer = activeRef.current;
    if (!map || !layer) return null;
    const view = map.getView();
    const projection = view.getProjection().getCode() as ProjectionCode;
    const center4326 = transform(view.getCenter() || [0, 0], projection, GEOJSON_DATA_PROJECTION);
    const extent4326 = transformExtent(view.calculateExtent(map.getSize()), projection, GEOJSON_DATA_PROJECTION);
    return {
      layerKey: layer.layerKey,
      date: dateRef.current,
      projection,
      zoom: view.getZoom() ?? undefined,
      opacity,
      center: { lon: center4326[0], lat: center4326[1] },
      extent: {
        minLon: extent4326[0],
        minLat: extent4326[1],
        maxLon: extent4326[2],
        maxLat: extent4326[3],
      },
    };
  }, [opacity]);

  const persistAnnotation = useCallback(
    async (feature: Feature) => {
      const map = mapRef.current;
      const source = annotationsSourceRef.current;
      if (!map || !source) return;
      const frame = buildFramePayload();
      if (!frame) return;

      const projection = map.getView().getProjection().getCode();
      const clone = feature.clone();
      const properties = { ...feature.getProperties() } as Record<string, unknown>;
      delete properties.geometry;

      const geoFeature = geojsonFormatter.writeFeatureObject(clone, {
        dataProjection: GEOJSON_DATA_PROJECTION,
        featureProjection: projection,
      });

      if (geoFeature.properties && typeof geoFeature.properties === "object") {
        geoFeature.properties = { ...geoFeature.properties, ...properties };
      } else {
        geoFeature.properties = { ...properties };
      }

      const payload: AnnotationCreateRequest = {
        frame,
        features: [
          {
            id: typeof feature.getId() === "string" ? String(feature.getId()) : undefined,
            order: source.getFeatures().length,
            feature: geoFeature,
            properties,
          },
        ],
      };

      const response = await createAnnotations(payload);
      if (response.features.length > 0) {
        const created = response.features[0];
        feature.setId(created.id);
        const mergedProps = [created.feature?.properties, created.properties];
        for (const props of mergedProps) {
          if (props && typeof props === "object") {
            for (const [key, value] of Object.entries(props)) {
              feature.set(key, value);
            }
          }
        }
        const nameProp = feature.get("name");
        if (typeof nameProp !== "string" || nameProp.length === 0) {
          const candidate =
            (created.feature?.properties as Record<string, unknown> | undefined)?.name ??
            (created.properties as Record<string, unknown> | undefined)?.name ??
            null;
          if (typeof candidate === "string") {
            feature.set("name", candidate);
          }
        }
      }
    },
    [buildFramePayload, geojsonFormatter]
  );

  const loadAnnotations = useCallback(async () => {
    if (!mapRef.current || !annotationsSourceRef.current) return;
    const frame = buildFramePayload();
    const extent = frame?.extent;
    const queryParams = frame
      ? {
          layerKey: frame.layerKey,
          projection: frame.projection,
          zoom: frame.zoom,
          centerLon: frame.center?.lon,
          centerLat: frame.center?.lat,
          minLon: extent?.minLon,
          minLat: extent?.minLat,
          maxLon: extent?.maxLon,
          maxLat: extent?.maxLat,
          swLon: extent?.minLon,
          swLat: extent?.minLat,
          neLon: extent?.maxLon,
          neLat: extent?.maxLat,
        }
      : undefined;
    setAnnotationsLoading(true);
    setAnnotationsError(null);
    try {
      const records = await fetchAnnotations(queryParams);
      const source = annotationsSourceRef.current;
      const proj = mapRef.current.getView().getProjection().getCode();
      source.clear();
      records.forEach((record: AnnotationRecord) => {
        const feature = geojsonFormatter.readFeature(record.feature, {
          dataProjection: GEOJSON_DATA_PROJECTION,
          featureProjection: proj,
        }) as Feature<Geometry>;
        feature.setId(record.id);
        const mergedProps = [record.feature?.properties, record.properties];
        for (const props of mergedProps) {
          if (props && typeof props === "object") {
            for (const [key, value] of Object.entries(props)) {
              feature.set(key, value);
            }
          }
        }
        source.addFeature(feature);
      });
      setAnnotKey((k) => k + 1);
    } catch (error) {
      console.error("Failed to load annotations", error);
      setAnnotationsError(
        error instanceof Error ? error.message : "No se pudieron cargar las anotaciones."
      );
    } finally {
      setAnnotationsLoading(false);
    }
  }, [geojsonFormatter]);

  useEffect(() => {
    if (!mapRef.current || !annotationsSourceRef.current) return;
    void loadAnnotations();
  }, [loadAnnotations, active]);
  const disableDraw = useCallback(() => {
    if (!mapRef.current) return;
    if (drawRef.current) {
      mapRef.current.removeInteraction(drawRef.current);
      drawRef.current = null;
    }
  }, []);

  const disableModify = useCallback(() => {
    if (!mapRef.current) return;
    if (modifyRef.current) {
      mapRef.current.removeInteraction(modifyRef.current);
      modifyRef.current = null;
    }
    if (selectRef.current) {
      mapRef.current.removeInteraction(selectRef.current);
      selectRef.current = null;
    }
  }, []);

  const enableDraw = useCallback(
    (type: "Point" | "Polygon") => {
      if (!mapRef.current || !annotationsSourceRef.current) return;
      disableDraw();
      const draw = new Draw({ source: annotationsSourceRef.current, type });
      draw.on("drawend", (evt) => {
        const feature = evt.feature;
        const name = window.prompt("Nombre/etiqueta para esta anotacion:", "") ?? "";
        if (name) feature.set("name", name);
        persistAnnotation(feature)
          .then(() => {
            setAnnotKey((k) => k + 1);
          })
          .catch(() => {
            alert("No se pudo guardar la anotacion. Intenta nuevamente.");
            annotationsSourceRef.current?.removeFeature(feature);
          });
      });
      mapRef.current.addInteraction(draw);
      drawRef.current = draw;
    },
    [disableDraw, persistAnnotation]
  );

  const toggleModify = useCallback(() => {
    if (!mapRef.current || !annotationsSourceRef.current) return;
    if (isModifyOn) {
      disableModify();
      setIsModifyOn(false);
      return;
    }
    const select = new Select({ condition: click });
    const modify = new Modify({ features: select.getFeatures() });
    mapRef.current.addInteraction(select);
    mapRef.current.addInteraction(modify);
    selectRef.current = select;
    modifyRef.current = modify;
    setIsModifyOn(true);
  }, [disableModify, isModifyOn]);

  const deleteSelected = () => {
    if (!annotationsSourceRef.current) return;
    const source = annotationsSourceRef.current;
    const selected = selectRef.current?.getFeatures();
    const targets: Feature[] = [];
    if (selected && selected.getLength() > 0) {
      selected.forEach((f) => targets.push(f as Feature));
      selected.clear();
    } else {
      const feats = source.getFeatures();
      if (feats.length > 0) targets.push(feats[feats.length - 1]);
    }
    if (targets.length === 0) return;

    const failures: Feature[] = [];
    for (const feature of targets) {
      const success = await removeFeature(feature);
      if (!success) failures.push(feature);
    }
    if (failures.length > 0) {
      alert("Algunas anotaciones no se pudieron eliminar.");
    }
    setAnnotKey((k) => k + 1);
  }, [removeFeature]);

  // Export/Import GeoJSON
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
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `annotations_${Date.now()}.geojson`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [geojsonFormatter]);

  const importGeoJSON = useCallback(
    (file: File) => {
      if (!annotationsSourceRef.current || !mapRef.current) return;
      const reader = new FileReader();
      reader.onload = () => {
        (async () => {
          try {
            const text = String(reader.result);
            const features = geojsonFormatter.readFeatures(text, {
              dataProjection: GEOJSON_DATA_PROJECTION,
              featureProjection: mapRef.current!.getView().getProjection().getCode(),
            });
            if (features.length === 0) return;
            for (const feature of features) {
              annotationsSourceRef.current!.addFeature(feature);
              try {
                await persistAnnotation(feature);
              } catch (error) {
                console.error("Failed to persist imported annotation", error);
                annotationsSourceRef.current!.removeFeature(feature);
              }
            }
            setAnnotKey((k) => k + 1);
          } catch (error) {
            console.error("Cannot import GeoJSON", error);
            alert("No se pudo importar el GeoJSON.");
          }
        })();
      };
      reader.readAsText(file);
    },
    [geojsonFormatter, persistAnnotation]
  );

  useEffect(() => {
    const source = annotationsSourceRef.current;
    if (!source) return;
    const fn = () => setAnnotKey((k) => k + 1);
    source.on("addfeature", fn);
    source.on("removefeature", fn);
    return () => {
      source.un("addfeature", fn);
      source.un("removefeature", fn);
    };
  }, []);

  const annotationsList = useMemo(() => {
    if (!annotationsSourceRef.current || !mapRef.current) return [];
    const proj = mapRef.current.getView().getProjection().getCode();
    const items = annotationsSourceRef.current.getFeatures().map((feature, index) => {
      const rawName = feature.get("name");
      const name = typeof rawName === "string" && rawName.trim().length > 0 ? rawName : `Annotation ${index + 1}`;
      const geom = feature.getGeometry();
      let lon = NaN;
      let lat = NaN;
      if (geom) {
        let coordinate: [number, number];
        if (geom.getType() === "Polygon") {
          coordinate = (geom as Polygon).getInteriorPoint().getCoordinates() as [number, number];
        } else {
          coordinate = (geom as Point).getCoordinates() as [number, number];
        }
        const [lo, la] = transform(coordinate, proj, GEOJSON_DATA_PROJECTION);
        lon = lo;
        lat = la;
      }
      return { feature, name, lon, lat, type: geom?.getType() };
    });
    if (!filter.trim()) return items;
    const query = filter.trim().toLowerCase();
    return items.filter((item) => item.name.toLowerCase().includes(query));
  }, [annotKey, filter]);

  const flyToFeature = useCallback((feature: Feature) => {
    if (!mapRef.current) return;
    const geom = feature.getGeometry();
    if (!geom) return;
    const view = mapRef.current.getView();
    view.fit(geom.getExtent(), { duration: 400, maxZoom: 10, padding: [48, 48, 48, 48] });
  }, []);

  const resetView = useCallback(() => {
    if (!mapRef.current) return;
    const view = mapRef.current.getView();
    const proj = view.getProjection().getCode();
    view.animate({ center: transform([0, 0], GEOJSON_DATA_PROJECTION, proj), zoom: 2, duration: 350 });
  }, []);

  const copyCoords = useCallback(async (lon: number, lat: number) => {
    try {
      await navigator.clipboard.writeText(`${lon.toFixed(5)}, ${lat.toFixed(5)}`);
    } catch (error) {
      console.error("Clipboard copy failed", error);
    }
  }, []);
  const layersForNavbar = useMemo(() => {
    if (active.kind === "gibs") return GIBS_LAYERS.map((l) => ({ id: layerKey(l), title: l.title }));
    return TREK_LAYERS.filter((t) => t.body === (active as any).body).map((l) => ({ id: layerKey(l), title: l.title }));
  }, [active]);

  const handleChangeLayer = (key: string) => {
    const next = LAYERS.find((l) => layerKey(l) === key);
    if (!next) return;
    const sameDomain =
      (active.kind === "gibs" && next.kind === "gibs") ||
      (active.kind === "trek" && next.kind === "trek" && (next as TrekLayer).body === (active as TrekLayer).body);
    if (!sameDomain) return;
    setActive(next);
    if (drawMode === "Point" || drawMode === "Polygon") {
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
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "p") handleSetDrawMode("Point");
      else if (event.key.toLowerCase() === "g") handleSetDrawMode("Polygon");
      else if (event.key.toLowerCase() === "n") handleSetDrawMode("None");
      else if (event.key.toLowerCase() === "e") toggleModify();
      else if (event.key === "Delete") void deleteSelected();
      else if (event.key.toLowerCase() === "r") resetView();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSetDrawMode, toggleModify, deleteSelected, resetView]);

  /* ============== RENDER ============== */
  const annotationsCount = annotationsList.length;

  return (
    <div className="h-full w-full relative">
      {catalogStatus === "loading" && (
        <div className="pointer-events-none fixed top-[calc(var(--navbar-h)+12px)] left-1/2 z-50 -translate-x-1/2 rounded-md border border-slate-200 bg-white/90 px-3 py-1 text-xs text-slate-600 shadow">
          Cargando catalogo de capas...
        </div>
      )}
      {catalogStatus === "error" && catalogError && (
        <div className="pointer-events-none fixed top-[calc(var(--navbar-h)+12px)] left-1/2 z-50 -translate-x-1/2 rounded-md border border-rose-200 bg-rose-100 px-3 py-1 text-xs text-rose-700 shadow">
          {catalogError}
        </div>
      )}
      <div ref={mapDivRef} className="fixed left-0 right-0 bottom-0" style={{ top: "var(--navbar-h)" }} />

      {/* NAVBAR */}
      <Navbar
        headerRef={headerRef as MutableRefObject<HTMLElement | null>}
        tilePending={tilePending}
        layerId={active ? layerKey(active) : ""}
        layers={layersForNavbar}
        onChangeLayer={handleChangeLayer}
        date={date}
        onChangeDate={setDate}
        drawMode={drawMode}
        onSetDrawMode={handleSetDrawMode}
        isModifyOn={isModifyOn}
        onToggleModify={() => {
          toggleModify();
        }}
        onDeleteSelected={() => {
          void deleteSelected();
        }}
        opacity={opacity}
        onOpacityChange={setOpacity}
        onExport={exportGeoJSON}
        onImport={importGeoJSON}
        onResetView={resetView}
        cursorCoord={cursorCoord}
      />

      {/* ======== PANEL NOTES ======== */}
      {/* Desktop: panel lateral como siempre */}
      <aside
        className="
          hidden md:flex
          fixed right-4 z-40 w-80
          bg-white/80 backdrop-blur border border-slate-200 rounded-xl shadow-xl p-3 flex-col
        "
        style={{ top: "calc(var(--navbar-h) + 12px)", height: "calc(100vh - var(--navbar-h) - 24px)" }}
        aria-label="Notes panel"
      >
        <NotesHeader
          filter={filter}
          setFilter={setFilter}
          tileErrors={tileErrors}
        />
        <NotesList
          annotationsList={annotationsList}
          flyToFeature={flyToFeature}
          copyCoords={copyCoords}
          deleteFeature={(f) => { annotationsSourceRef.current?.removeFeature(f); setAnnotKey((k) => k + 1); }}
          setFilter={setFilter}
        />
        <NotesFooter />
      </aside>

      {/* Móvil: bottom-sheet */}
      <aside
        className={`
          md:hidden fixed left-0 right-0 z-40
          bg-white/90 backdrop-blur border-t border-slate-200 shadow-2xl
          transition-transform duration-300
          ${notesOpen ? "translate-y-0" : "translate-y-[calc(60vh+env(safe-area-inset-bottom,0px))]"}
        `}
        style={{
          top: `calc(100vh - 60vh)`,
          paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 8px)",
        }}
        aria-label="Notes panel móvil"
      >
        {/* Handler */}
        <div className="flex justify-center pt-2">
          <div className="h-1.5 w-12 rounded-full bg-slate-300" />
        </div>

        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 mb-2 mt-2">
            <div className="font-extrabold text-slate-900 text-sm">Notes</div>
            <span className="text-xs text-slate-500">({annotationsCount})</span>
            <div className="ml-auto" />
            <input
              placeholder="Filtrar…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-3 py-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400 w-40"
            />
            <button
              onClick={() => setNotesOpen(false)}
              className="ml-1 px-3 py-2 text-xs rounded-md border border-slate-300 bg-white hover:bg-slate-50"
              aria-label="Cerrar Notes"
            >
              Cerrar
            </button>
          </div>

          <div className="text-[11px] text-rose-600 mb-1 min-h-[14px]">
            {tileErrors > 0 ? `Errores de carga: ${tileErrors}` : " "}
          </div>

          <div className="h-[50vh] overflow-auto -mx-1 px-1">
            <NotesList
              annotationsList={annotationsList}
              flyToFeature={flyToFeature}
              copyCoords={copyCoords}
              deleteFeature={(f) => { annotationsSourceRef.current?.removeFeature(f); setAnnotKey((k) => k + 1); }}
              setFilter={setFilter}
            />
            <div className="py-2" />
          </div>

          <NotesFooter className="mt-2" />
        </div>
      </aside>

      {/* FAB para abrir Notes en móvil */}
      <button
        onClick={() => setNotesOpen((v) => !v)}
        className="
          md:hidden fixed right-3 z-40
          rounded-full shadow-lg border border-slate-300 bg-white/90 backdrop-blur
          active:scale-[0.98] transition
          flex items-center gap-2
        "
        style={{
          bottom: "calc(env(safe-area-inset-bottom,0px) + 12px)",
          padding: "10px 12px"
        }}
        aria-expanded={notesOpen}
        aria-controls="notes-bottom-sheet"
        aria-label="Abrir Notes"
        title="Notes"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="opacity-80">
          <path d="M9 4h10a1 1 0 0 1 1 1v10M9 4v10a1 1 0 0 1-1 1H4M9 4l11 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="text-sm font-semibold text-slate-800">Notes</span>
        <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-slate-800 text-white">{annotationsCount}</span>
      </button>

      {/* Pie discreto */}
      <div className="fixed bottom-2 left-1/2 -translate-x-1/2 text-[11px] text-slate-500 bg-white/80 border border-slate-200 rounded-md px-2 py-1 shadow-sm">
        Scale in the corner of the map · Shortcuts: P/G/N/E/Del/R
      </div>

      {/* CSS para safe-area y ajustes menores */}
      <style>{`
        @supports (padding: max(0px)) {
          :root { --safe-bottom: env(safe-area-inset-bottom, 0px); }
        }
      `}</style>
    </div>
  );
}

/* ===== Subcomponentes de Notes (reutilizados en desktop y móvil) ===== */
function NotesHeader({
  filter, setFilter, tileErrors,
}: {
  filter: string;
  setFilter: (v: string) => void;
  tileErrors: number;
}) {
  return (
    <>
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
      <div className="text-[11px] text-rose-600 mb-2">{tileErrors > 0 ? `Errores de carga: ${tileErrors}` : " "}</div>
    </>
  );
}

function NotesList({
  annotationsList,
  flyToFeature,
  copyCoords,
  deleteFeature,
  setFilter,
}: {
  annotationsList: { feature: Feature; name: string; lon: number; lat: number; type: string | undefined }[];
  flyToFeature: (f: Feature) => void;
  copyCoords: (lon: number, lat: number) => void;
  deleteFeature: (f: Feature) => void;
  setFilter: (v: string) => void;
}) {
  if (annotationsList.length === 0) {
    return (
      <div className="text-sm text-slate-600">
        There are no annotations. Use <b>Point</b> or <b>Polygon</b>.
      </div>
    );
  }

  return (
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
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button onClick={() => flyToFeature(feature)} className="px-3 py-2 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50 active:scale-[0.99]">Ir</button>
            <button
              onClick={() => {
                const newName = window.prompt("Cambiar nombre:", name) ?? name;
                feature.set("name", newName);
                setFilter(""); // refrescar
              }}
              className="px-3 py-2 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50 active:scale-[0.99]"
            >
              Renombrar
            </button>
            {Number.isFinite(lon) && Number.isFinite(lat) && (
              <button onClick={() => copyCoords(lon, lat)} className="px-3 py-2 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50 active:scale-[0.99]">Copiar coords</button>
            )}
            <button
              onClick={() => deleteFeature(feature)}
              className="px-3 py-2 text-xs rounded border border-rose-300 bg-rose-100 hover:bg-rose-200 active:scale-[0.99]"
              title="Borrar esta anotación"
            >
              Borrar
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function NotesFooter({ className = "" }: { className?: string }) {
  return (
    <div className={`mt-3 text-[11px] text-slate-500 ${className}`}>
      Imagery © NASA EOSDIS GIBS / Worldview · NASA Solar System Treks
    </div>
  );
}
