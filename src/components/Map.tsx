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

import { transform, transformExtent } from "ol/proj";
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
import type Geometry from "ol/geom/Geometry";


import Style from "ol/style/Style";
import Stroke from "ol/style/Stroke";
import Fill from "ol/style/Fill";
import CircleStyle from "ol/style/Circle";
import Text from "ol/style/Text";

import TileGrid from "ol/tilegrid/TileGrid";
import Navbar from "./Navbar";
import { apiUrl } from "../services/api";
import { findLayer, flattenCatalog, getLayerCatalog, layerDefaultDate, layerNeedsDate } from "../services/layers";
import type { ApiLayer, LayerCatalog } from "../services/layers";
import { fetchAnnotations, saveAnnotations } from "../services/annotations";

import type { FrameDescriptor } from "../services/annotations";


type DrawMode = "None" | "Point" | "Polygon";

type PermalinkState = { lon?: number; lat?: number; z?: number; d?: string; k?: string; p?: string };

type LayerOption = { id: string; title: string };

const SUPPORTED_PROJECTIONS = new Set(["EPSG:3857", "EPSG:4326"]);

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

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

const resolveTileTemplate = (template: string, dateISO: string) =>
  template.includes("{date}") ? template.replace(/\{date\}/g, encodeURIComponent(dateISO)) : template;
export default function MapView() {
  const hash = useMemo(() => readHash(), []);

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);

  const [catalog, setCatalog] = useState<LayerCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const [active, setActive] = useState<ApiLayer | null>(null);
  const activeRef = useRef<ApiLayer | null>(null);

  const [date, setDate] = useState<string>(hash.d ?? "");
  const dateRef = useRef(date);

  const [opacity, setOpacity] = useState<number>(1);
  const [drawMode, setDrawMode] = useState<DrawMode>("None");
  const [isModifyOn, setIsModifyOn] = useState(false);
  const [tilePending, setTilePending] = useState(0);
  const [tileErrors, setTileErrors] = useState(0);
  const [cursorCoord, setCursorCoord] = useState<{ lon: number; lat: number } | null>(null);
  const [filter, setFilter] = useState("");

  const [annotationsLoading, setAnnotationsLoading] = useState(false);
  const [annotationsSaving, setAnnotationsSaving] = useState(false);
  const [annotationsError, setAnnotationsError] = useState<string | null>(null);

  const mapRef = useRef<Map | null>(null);
  const imageryLayerRef = useRef<TileLayer<any> | null>(null);
  const baseLayerRef = useRef<TileLayer<OSM> | null>(null);
  const annotationsSourceRef = useRef<VectorSource | null>(null);
  const drawRef = useRef<Draw | null>(null);
  const modifyRef = useRef<Modify | null>(null);
  const selectRef = useRef<Select | null>(null);

  const annotationsStyle = useMemo(() => annotationStyle, []);
  const geoJsonFormat = useMemo(() => new GeoJSON(), []);
  const skipPersistRef = useRef(false);
  const saveTimeoutRef = useRef<number | null>(null);
  const fetchTimeoutRef = useRef<number | null>(null);

  useEffect(() => { dateRef.current = date; }, [date]);
  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    getLayerCatalog()
      .then((data) => {
        if (cancelled) return;
        setCatalog(data);
        setCatalogError(null);
        setCatalogLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setCatalogError(err instanceof Error ? err.message : "No se pudo cargar el catalogo");
        setCatalogLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const allLayers = useMemo(() => (catalog ? flattenCatalog(catalog) : []), [catalog]);

  useEffect(() => {
    if (!catalog || active) return;
    let next: ApiLayer | undefined;
    if (hash.k) {
      next = findLayer(catalog, hash.k);
      if (!next && hash.k.startsWith("trek:")) {
        const parts = hash.k.split(":");
        if (parts.length >= 2) {
          const bodyFromKey = parts[1].toLowerCase();
          next = allLayers.find((layer) => layer.body.toLowerCase() === bodyFromKey);
        }
      }
      if (!next && hash.k.startsWith("gibs:")) {
        next = allLayers.find((layer) => layer.kind === "gibs");
      }
    }
    if (!next) {
      next = allLayers.find((layer) => layer.kind === "gibs") ?? allLayers[0];
    }
    if (next) setActive(next);
  }, [catalog, active, allLayers, hash.k]);

  useEffect(() => {
    if (!active) return;
    setDate((prev) => (prev && prev.length > 0 ? prev : layerDefaultDate(active, todayISO())));
  }, [active]);

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

  const computeFrame = (): FrameDescriptor | null => {
    const map = mapRef.current;
    const layer = activeRef.current;
    if (!map || !layer) return null;
    const view = map.getView();
    const projectionCode = view.getProjection().getCode();
    const size = map.getSize();
    if (!size) return null;
    const extent = view.calculateExtent(size);
    const extent4326 = transformExtent(extent, projectionCode, "EPSG:4326");
    const center = transform(view.getCenter() || [0, 0], projectionCode, "EPSG:4326");
    return {
      layerKey: layer.layerKey,
      projection: projectionCode,
      date: layerNeedsDate(layer) ? (dateRef.current || undefined) : undefined,
      zoom: view.getZoom() ?? undefined,
      opacity,
      center: { lon: center[0], lat: center[1] },
      extent: {
        minLon: extent4326[0],
        minLat: extent4326[1],
        maxLon: extent4326[2],
        maxLat: extent4326[3],
      },
    };
  };

  const scheduleFetchAnnotations = () => {
    if (fetchTimeoutRef.current) window.clearTimeout(fetchTimeoutRef.current);
    fetchTimeoutRef.current = window.setTimeout(() => {
      fetchTimeoutRef.current = null;
      void loadAnnotations();
    }, 250);
  };

  const loadAnnotations = async () => {
    const source = annotationsSourceRef.current;
    const map = mapRef.current;
    if (!source || !map || !activeRef.current) return;
    const frame = computeFrame();
    if (!frame) return;
    setAnnotationsLoading(true);
    try {
      const remote = await fetchAnnotations(frame);
      const viewProj = map.getView().getProjection().getCode();
      skipPersistRef.current = true;
      source.clear();
      remote.forEach((item) => {
        const feature = geoJsonFormat.readFeature(item.feature as Record<string, unknown>, { dataProjection: "EPSG:4326", featureProjection: viewProj }) as Feature<Geometry>;
        if (item.id !== undefined && item.id !== null) feature.setId(item.id);
        feature.set("order", item.order);
        if (item.properties) {
          Object.entries(item.properties).forEach(([key, value]) => {
            feature.set(key, value);
          });
        }
        source.addFeature(feature);
      });
      skipPersistRef.current = false;
      setAnnotationsError(null);
      setAnnotKey((k) => k + 1);
    } catch (err) {
      if (err instanceof Error) setAnnotationsError(err.message);
      else setAnnotationsError("No se pudieron cargar las anotaciones.");
    } finally {
      setAnnotationsLoading(false);
      skipPersistRef.current = false;
    }
  };

  const schedulePersistAnnotations = () => {
    if (skipPersistRef.current) return;
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(() => {
      saveTimeoutRef.current = null;
      void persistAnnotations();
    }, 400);
  };

  const persistAnnotations = async () => {
    const source = annotationsSourceRef.current;
    const map = mapRef.current;
    if (!source || !map) return;
    const frame = computeFrame();
    if (!frame) return;
    const viewProj = map.getView().getProjection().getCode();
    const sourceFeatures = source.getFeatures();
    const payload = sourceFeatures.map((feat, index) => {
      const featureObject = geoJsonFormat.writeFeatureObject(feat, {
        featureProjection: viewProj,
        dataProjection: "EPSG:4326",
        decimals: 6,
      });
      const { geometry, ...props } = feat.getProperties();
      return {
        id: (feat.getId() as string | number | null) ?? undefined,
        order: index,
        feature: featureObject,
        properties: props,
      };
    });
    setAnnotationsSaving(true);
    try {
      const saved = await saveAnnotations({ frame, features: payload });
      skipPersistRef.current = true;
      saved.forEach((item, index) => {
        const feature = sourceFeatures[index];
        if (!feature) return;
        if (item.id !== undefined && item.id !== null) feature.setId(item.id);
        feature.set("order", item.order);
        if (item.properties) {
          Object.entries(item.properties).forEach(([key, value]) => {
            feature.set(key, value);
          });
        }
      });
      skipPersistRef.current = false;
      setAnnotationsError(null);
      setAnnotKey((k) => k + 1);
    } catch (err) {
      skipPersistRef.current = false;
      setAnnotationsError(err instanceof Error ? err.message : "No se pudieron guardar las anotaciones.");
    } finally {
      setAnnotationsSaving(false);
    }
  };

  const makeImageryLayer = (layer: ApiLayer) => {
    const template = resolveTileTemplate(layer.tileTemplate, dateRef.current || layerDefaultDate(layer, todayISO()));
    const url = apiUrl(template);

    if (layer.projection === "EPSG:4326") {
      const extent: [number, number, number, number] = [-180, -90, 180, 90];
      const size = extentWidth(extent) / 256;
      const max = layer.maxZoom ?? 10;
      const resolutions = new Array(max + 1).fill(0).map((_, z) => (size / 2) / Math.pow(2, z));
      const tileGrid = new TileGrid({
        extent,
        origin: [-180, 90],
        tileSize: 256,
        resolutions,
      });

      const source = new XYZ({
        url,
        projection: "EPSG:4326",
        tileGrid,
        wrapX: true,
        crossOrigin: "anonymous",
      });
      const cleanup = attachTileLoadEvents(source);
      const lyr = new TileLayer({ source, opacity, zIndex: 1 });
      (lyr as any).__cleanup = cleanup;
      return lyr;
    }

    const source = new XYZ({
      url,
      projection: "EPSG:3857",
      wrapX: true,
      crossOrigin: "anonymous",
      maxZoom: layer.maxZoom,
    });
    const cleanup = attachTileLoadEvents(source);
    const lyr = new TileLayer({ source, opacity, zIndex: 1 });
    (lyr as any).__cleanup = cleanup;
    return lyr;
  };

  const ensureProjection = (layer: ApiLayer, keepCenter = true) => {
    const map = mapRef.current;
    if (!map) return;
    const targetProj = layer.projection === "EPSG:4326" ? "EPSG:4326" : "EPSG:3857";
    const view = map.getView();
    const currentProj = view.getProjection().getCode();

    if (currentProj !== targetProj) {
      const center4326 = keepCenter ? transform(view.getCenter() || [0, 0], currentProj, "EPSG:4326") : [0, 0];
      const newView = new View({
        projection: targetProj,
        center: transform(center4326, "EPSG:4326", targetProj),
        zoom: Math.max(2, Math.min(view.getZoom() ?? 2, layer.maxZoom ?? (targetProj === "EPSG:4326" ? 10 : 14))),
        maxZoom: layer.maxZoom ?? (targetProj === "EPSG:4326" ? 10 : 14),
      });
      map.setView(newView);
    } else {
      view.setMaxZoom(layer.maxZoom ?? (targetProj === "EPSG:4326" ? 10 : 14));
    }

    if (targetProj === "EPSG:3857") {
      if (!baseLayerRef.current) {
        const base = new TileLayer({ source: new OSM(), zIndex: 0 });
        baseLayerRef.current = base;
        map.getLayers().insertAt(0, base);
      }
    } else if (baseLayerRef.current) {
      map.removeLayer(baseLayerRef.current);
      baseLayerRef.current = null;
    }

    setTimeout(() => map.updateSize(), 0);
  };
  useEffect(() => {
    if (!mapDivRef.current || !active) return;
    if (mapRef.current) return;

    const desiredProj = hash.p && SUPPORTED_PROJECTIONS.has(hash.p) ? (hash.p as "EPSG:3857" | "EPSG:4326") : (active.projection === "EPSG:4326" ? "EPSG:4326" : "EPSG:3857");

    const view = new View({
      projection: desiredProj,
      center:
        hash.lon !== undefined && hash.lat !== undefined
          ? transform([hash.lon, hash.lat], "EPSG:4326", desiredProj)
          : transform([0, 0], "EPSG:4326", desiredProj),
      zoom: hash.z ?? 2,
      maxZoom: active.maxZoom ?? (desiredProj === "EPSG:4326" ? 10 : 14),
    });

    const map = new Map({
      target: mapDivRef.current,
      layers: [],
      view,
      controls: defaultControls({ zoom: true, rotate: true, attribution: false }).extend([new ScaleLine()]),
    });

    if (desiredProj === "EPSG:3857") {
      const base = new TileLayer({ source: new OSM(), zIndex: 0 });
      baseLayerRef.current = base;
      map.addLayer(base);
    }

    const annotationsSource = new VectorSource();
    annotationsSourceRef.current = annotationsSource;
    const annotations = new VectorLayer({ source: annotationsSource, style: annotationsStyle, zIndex: 2 });
    map.addLayer(annotations);

    const imagery = makeImageryLayer(active);
    imageryLayerRef.current = imagery;
    map.addLayer(imagery);

    const onMove = () => {
      const layer = activeRef.current;
      if (!layer) return;
      writeHash(map.getView(), dateRef.current || layerDefaultDate(layer, todayISO()), layer.layerKey);
      scheduleFetchAnnotations();
    };

    const onPointerMove = (evt: any) => {
      const proj = map.getView().getProjection().getCode();
      const [lon, lat] = transform(evt.coordinate, proj, "EPSG:4326");
      setCursorCoord({ lon, lat });
    };

    map.on("moveend", onMove);
    map.on("pointermove", onPointerMove);

    ensureProjection(active, true);

    mapRef.current = map;
    setTimeout(() => map.updateSize(), 0);
    scheduleFetchAnnotations();

    return () => {
      map.un("moveend", onMove);
      map.un("pointermove", onPointerMove);
      if (imageryLayerRef.current && (imageryLayerRef.current as any).__cleanup) {
        (imageryLayerRef.current as any).__cleanup();
      }
      map.setTarget(undefined);
      mapRef.current = null;
    };
  }, [active, annotationsStyle, hash.lat, hash.lon, hash.p, hash.z]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !active) return;

    const replaceImagery = (newLayer: TileLayer<any>) => {
      const old = imageryLayerRef.current;
      if (old) {
        map.removeLayer(old);
        if ((old as any).__cleanup) (old as any).__cleanup();
      }
      imageryLayerRef.current = newLayer;
      map.addLayer(newLayer);
      writeHash(map.getView(), dateRef.current || layerDefaultDate(active, todayISO()), active.layerKey);
    };

    ensureProjection(active);
    const lyr = makeImageryLayer(active);
    replaceImagery(lyr);
    scheduleFetchAnnotations();
  }, [active, date]);

  useEffect(() => {
    if (imageryLayerRef.current) imageryLayerRef.current.setOpacity(opacity);
  }, [opacity]);
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
      const name = window.prompt("Nombre para la anotacion:", "") ?? "";
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
      schedulePersistAnnotations();
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
    modify.on("modifyend", schedulePersistAnnotations);
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
    schedulePersistAnnotations();
  };

  const exportGeoJSON = () => {
    if (!annotationsSourceRef.current) return;
    const json = geoJsonFormat.writeFeatures(annotationsSourceRef.current.getFeatures(), {
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
        const features = geoJsonFormat.readFeatures(text, {
          dataProjection: "EPSG:4326",
          featureProjection: mapRef.current?.getView().getProjection().getCode() || "EPSG:3857",
        });
        skipPersistRef.current = true;
        annotationsSourceRef.current!.addFeatures(features);
        skipPersistRef.current = false;
        setAnnotKey((k) => k + 1);
        schedulePersistAnnotations();
      } catch {
        skipPersistRef.current = false;
        alert("No se pudo importar el GeoJSON.");
      }
    };
    reader.readAsText(file);
  };
  const [annotKey, setAnnotKey] = useState(0);
  useEffect(() => {
    const source = annotationsSourceRef.current;
    if (!source) return;
    const handleChange = () => {
      setAnnotKey((k) => k + 1);
      if (!skipPersistRef.current) schedulePersistAnnotations();
    };
    source.on("addfeature", handleChange);
    source.on("removefeature", handleChange);
    source.on("changefeature", handleChange);
    return () => {
      source.un("addfeature", handleChange);
      source.un("removefeature", handleChange);
      source.un("changefeature", handleChange);
    };
  }, []);

  const annotationsList = useMemo(() => {
    if (!annotationsSourceRef.current || !mapRef.current) return [];
    const proj = mapRef.current.getView().getProjection().getCode();
    const items = annotationsSourceRef.current.getFeatures().map((f, i) => {
      const raw = f.get("name");
      const name = typeof raw === "string" && raw.length > 0 ? raw : `Anotacion ${i + 1}`;
      let lon = NaN;
      let lat = NaN;
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

  const flyToFeature = (f: Feature) => {
    if (!mapRef.current) return;
    const geom = f.getGeometry();
    const view = mapRef.current.getView();
    if (!geom || !view) return;
    view.fit(geom.getExtent(), { duration: 400, maxZoom: 10, padding: [48, 48, 48, 48] });
  };

  const resetView = () => {
    if (!mapRef.current || !active) return;
    const proj = mapRef.current.getView().getProjection().getCode();
    mapRef.current.getView().animate({ center: transform([0, 0], "EPSG:4326", proj), zoom: 2, duration: 350 });
  };

  const copyCoords = async (lon: number, lat: number) => {
    try {
      await navigator.clipboard.writeText(`${lon.toFixed(5)}, ${lat.toFixed(5)}`);
    } catch {
      // noop
    }
  };
  const layersForNavbar: LayerOption[] = useMemo(() => {
    if (!catalog || !active) return [];
    const byBodyLower = catalog[active.body.toLowerCase()];
    const byBody = catalog[active.body];
    const list = byBodyLower ?? byBody ?? [];
    return list.map((l) => ({ id: l.layerKey, title: l.title }));
  }, [catalog, active]);

  const handleChangeLayer = (key: string) => {
    if (!active) return;
    const next = allLayers.find((layer) => layer.layerKey === key);
    if (!next) return;
    if (next.body.toLowerCase() !== active.body.toLowerCase()) return;

    setActive(next);
    scheduleFetchAnnotations();
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

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
      if (fetchTimeoutRef.current) window.clearTimeout(fetchTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "p") handleSetDrawMode("Point");
      else if (e.key.toLowerCase() === "g") handleSetDrawMode("Polygon");
      else if (e.key.toLowerCase() === "n") handleSetDrawMode("None");
      else if (e.key.toLowerCase() === "e") toggleModify();
      else if (e.key === "Delete") deleteSelected();
      else if (e.key.toLowerCase() === "r") resetView();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isModifyOn, drawMode, active]);
  if (!active) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
        {catalogError
          ? `No se pudo cargar el catalogo de capas: ${catalogError}`
          : catalogLoading
            ? "Cargando catalogo de capas..."
            : "No hay capas disponibles."}
      </div>
    );
  }

  const isDateDisabled = !layerNeedsDate(active);

  return (
    <div className="h-full w-full relative">
      <div ref={mapDivRef} className="fixed left-0 right-0 bottom-0" style={{ top: "var(--navbar-h)" }} />

      <Navbar
        headerRef={headerRef as MutableRefObject<HTMLElement | null>}
        tilePending={tilePending}
        layerId={active.layerKey}
        layers={layersForNavbar}
        onChangeLayer={handleChangeLayer}
        date={date}
        onChangeDate={setDate}
        isDateDisabled={isDateDisabled}
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

      <aside
        className="fixed right-4 z-40 w-80 max-w-[90vw] bg-white/80 backdrop-blur border border-slate-200 rounded-xl shadow-xl p-3 flex flex-col"
        style={{ top: "calc(var(--navbar-h) + 12px)", height: "calc(100vh - var(--navbar-h) - 24px)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="font-extrabold text-slate-900 text-sm">Anotaciones</div>
          <div className="ml-auto" />
          <input
            placeholder="Filtrar..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-2 py-1.5 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
        </div>

        <div className="text-[11px] mb-2">
          {annotationsError ? (
            <span className="text-rose-600">Anotaciones: {annotationsError}</span>
          ) : annotationsLoading ? (
            <span className="text-slate-500">Cargando anotaciones...</span>
          ) : annotationsSaving ? (
            <span className="text-slate-500">Guardando anotaciones...</span>
          ) : tileErrors > 0 ? (
            <span className="text-rose-600">Errores de carga: {tileErrors}</span>
          ) : (
            <span className="text-slate-400"> </span>
          )}
        </div>

        <div className="overflow-auto min-h-0">
          {annotationsList.length === 0 ? (
            <div className="text-sm text-slate-600">
              No hay anotaciones. Usa <b>Punto</b> o <b>Poligono</b>.
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
                    {Number.isFinite(lon) && Number.isFinite(lat) ? `${lon.toFixed(4)}, ${lat.toFixed(4)}` : "--"}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <button onClick={() => flyToFeature(feature)} className="px-2 py-1 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50">Ir</button>
                    <button
                      onClick={() => {
                        const newName = window.prompt("Cambiar nombre:", name) ?? name;
                        feature.set("name", newName);
                        setFilter((f) => f + "");
                        schedulePersistAnnotations();
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
                      title="Borrar esta anotacion"
                    >Borrar</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3 text-[11px] text-slate-500">
          Imagery - NASA EOSDIS GIBS / NASA Solar System Treks
        </div>
      </aside>

      <div className="fixed bottom-2 left-1/2 -translate-x-1/2 text-[11px] text-slate-500 bg-white/80 border border-slate-200 rounded-md px-2 py-1 shadow-sm">
        Escala en la esquina del mapa - Atajos: P/G/N/E/Del/R
      </div>
    </div>
  );
}




