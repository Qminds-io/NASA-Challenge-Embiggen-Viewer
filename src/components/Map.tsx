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

function writeHash(view: View, dateISO: string, layerKey: string) {
  if (!layerKey) return;
  const proj = view.getProjection().getCode();
  const center = view.getCenter() || [0, 0];
  const [lon, lat] = transform(center, proj, GEOJSON_DATA_PROJECTION);
  const zoom = view.getZoom() ?? 2;
  window.history.replaceState(
    null,
    "",
    `#${lon.toFixed(5)},${lat.toFixed(5)},${zoom.toFixed(2)},${dateISO},${layerKey},${proj}`
  );
}

function parseLayerKey(k?: string) {
  if (!k) return null;
  if (k.startsWith("gibs:")) {
    return { kind: "gibs" as const, id: k.slice(5) };
  }
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
  const initialHashRef = useRef<PermalinkState | null>(null);
  if (initialHashRef.current === null) {
    initialHashRef.current = readHash();
  }
  const hash = initialHashRef.current;
  const hashParsed = parseLayerKey(hash?.k);

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
          error instanceof Error ? error.message : "Failed to load the layer catalog."
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

  const attachTileLoadEvents = (src: XYZ) => {
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
  const ensureProjection = useCallback((targetLayer: LayerItem, keepCenter = true) => {
    const map = mapRef.current;
    if (!map) return;
    const view = map.getView();
    const currentCode = view.getProjection().getCode();
    const targetCode = targetLayer.projection;
    const minZoom = targetLayer.minZoom ?? 0;
    const maxZoom = targetLayer.maxZoom ?? 18;

    view.setMinZoom(minZoom);
    view.setMaxZoom(maxZoom);

    if (currentCode !== targetCode) {
      const centerWgs = keepCenter
        ? transform(view.getCenter() || [0, 0], currentCode, GEOJSON_DATA_PROJECTION)
        : [0, 0];
      const newView = new View({
        projection: targetCode,
        center: transform(centerWgs, GEOJSON_DATA_PROJECTION, targetCode),
        zoom: Math.max(minZoom, Math.min(view.getZoom() ?? 2, maxZoom)),
        minZoom,
        maxZoom,
      });
      map.setView(newView);
      if (baseLayerRef.current) {
        map.removeLayer(baseLayerRef.current);
        baseLayerRef.current = null;
      }
      if (targetCode === "EPSG:3857") {
        const base = new TileLayer({ source: new OSM(), zIndex: 0 });
        baseLayerRef.current = base;
        map.getLayers().insertAt(0, base);
      }
    } else if (targetCode === "EPSG:3857" && !baseLayerRef.current) {
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

    const imagery = makeImageryLayer(active);
    imageryLayerRef.current = imagery;
    map.addLayer(imagery);

    const onMove = () => {
      const currentLayer = activeRef.current;
      if (!currentLayer) return;
      writeHash(map.getView(), dateRef.current, currentLayer.layerKey);
    };
    const onPointerMove = (evt: any) => {
      const proj = map.getView().getProjection().getCode();
      const [lon, lat] = transform(evt.coordinate, proj, GEOJSON_DATA_PROJECTION);
      setCursorCoord({ lon, lat });
    };
    map.on("moveend", onMove);
    map.on("pointermove", onPointerMove);

    ensureProjection(active, false);

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
        error instanceof Error ? error.message : "Failed to load annotations."
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
        const name = window.prompt("Name/label for this annotation:", "") ?? "";
        if (name) feature.set("name", name);
        persistAnnotation(feature)
          .then(() => {
            setAnnotKey((k) => k + 1);
          })
          .catch(() => {
            alert("Could not save the annotation. Try again.");
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

  const removeFeature = useCallback(async (feature: Feature) => {
    if (!annotationsSourceRef.current) return false;
    const source = annotationsSourceRef.current;
    const id = feature.getId();
    if (id) {
      try {
        await deleteAnnotation(String(id));
      } catch (error) {
        console.error("Failed to delete annotation", error);
        return false;
      }
    }
    source.removeFeature(feature);
    return true;
  }, []);

  const deleteSelected = useCallback(async () => {
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
      alert("Some annotations could not be deleted.");
    }
    setAnnotKey((k) => k + 1);
  }, [removeFeature]);

  const exportGeoJSON = useCallback(() => {
    if (!annotationsSourceRef.current || !mapRef.current) return;
    const json = geojsonFormatter.writeFeatures(annotationsSourceRef.current.getFeatures(), {
      dataProjection: GEOJSON_DATA_PROJECTION,
      featureProjection: mapRef.current.getView().getProjection().getCode(),
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
            alert("Could not import the GeoJSON.");
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
    if (!active) return [];
    const body = catalog.find((entry) => entry.bodyId === active.bodyId);
    if (!body) return [];
    return body.layers.map((layer) => ({ id: layer.layerKey, title: layer.title }));
  }, [catalog, active]);

  const handleChangeLayer = useCallback(
    (key: string) => {
      if (!active) return;
      const next = allLayers.find((layer) => layer.layerKey === key);
      if (!next) return;
      if (next.bodyId !== active.bodyId) return;
      setActive(next);
      if (drawMode === "Point" || drawMode === "Polygon") {
        disableDraw();
        enableDraw(drawMode);
      }
    },
    [active, allLayers, drawMode, disableDraw, enableDraw]
  );

  const handleSetDrawMode = useCallback(
    (mode: DrawMode) => {
      setDrawMode(mode);
      if (mode === "Point" || mode === "Polygon") {
        enableDraw(mode);
      } else {
        disableDraw();
      }
    },
    [disableDraw, enableDraw]
  );

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

  return (
    <div className="h-full w-full relative">
      {catalogStatus === "loading" && (
        <div className="pointer-events-none fixed top-[calc(var(--navbar-h)+12px)] left-1/2 z-50 -translate-x-1/2 rounded-md border border-slate-200 bg-white/90 px-3 py-1 text-xs text-slate-600 shadow">
          Loading layer catalog...
        </div>
      )}
      {catalogStatus === "error" && catalogError && (
        <div className="pointer-events-none fixed top-[calc(var(--navbar-h)+12px)] left-1/2 z-50 -translate-x-1/2 rounded-md border border-rose-200 bg-rose-100 px-3 py-1 text-xs text-rose-700 shadow">
          {catalogError}
        </div>
      )}
      <div ref={mapDivRef} className="fixed left-0 right-0 bottom-0" style={{ top: "var(--navbar-h)" }} />
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

      <aside
        className="fixed right-4 z-40 w-80 max-w-[90vw] bg-white/80 backdrop-blur border border-slate-200 rounded-xl shadow-xl p-3 flex flex-col"
        style={{ top: "calc(var(--navbar-h) + 12px)", height: "calc(100vh - var(--navbar-h) - 24px)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="font-extrabold text-slate-900 text-sm">Notes</div>
          <div className="ml-auto" />
          <input
            placeholder="Filter..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-2 py-1.5 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
        </div>

        <div className="text-[11px] text-rose-600 mb-2">
          {tileErrors > 0
            ? `Load errors: ${tileErrors}`
            : annotationsError
            ? `Annotations: ${annotationsError}`
            : " "}
        </div>
        {annotationsLoading && (
          <div className="text-[11px] text-slate-500 mb-2">Syncing annotations...</div>
        )}

        <div className="overflow-auto min-h-0">
          {annotationsList.length === 0 ? (
            <div className="text-sm text-slate-600">
              There are no annotations. Use <b>Point</b> or <b>Polygon</b>.
            </div>
          ) : (
            <ul className="space-y-2">
              {annotationsList.map(({ feature, name, lon, lat, type }, index) => (
                <li key={index} className="border border-slate-200 rounded-lg p-2 bg-white">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-sm text-slate-900 truncate">{name}</div>
                    <span className="text-xs text-slate-500">{type}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {Number.isFinite(lon) && Number.isFinite(lat) ? `${lon.toFixed(4)}, ${lat.toFixed(4)}` : "--"}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => flyToFeature(feature)}
                      className="px-2 py-1 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50"
                    >
                      Go
                    </button>
                    <button
                      onClick={() => {
                        const newName = window.prompt("Rename:", name) ?? name;
                        feature.set("name", newName);
                        setFilter((value) => value + "");
                      }}
                      className="px-2 py-1 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50"
                    >
                      Rename
                    </button>
                    {Number.isFinite(lon) && Number.isFinite(lat) && (
                      <button
                        onClick={() => copyCoords(lon, lat)}
                        className="px-2 py-1 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50"
                      >
                        Copy coords
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        const success = await removeFeature(feature);
                        if (!success) {
                          alert("Could not delete the annotation.");
                          return;
                        }
                        setAnnotKey((k) => k + 1);
                      }}
                      className="px-2 py-1 text-xs rounded border border-rose-300 bg-rose-100 hover:bg-rose-200"
                      title="Delete this annotation"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3 text-[11px] text-slate-500">
          Imagery (c) NASA EOSDIS GIBS / Worldview - NASA Solar System Treks
        </div>
      </aside>

      <div className="fixed bottom-2 left-1/2 -translate-x-1/2 text-[11px] text-slate-500 bg-white/80 border border-slate-200 rounded-md px-2 py-1 shadow-sm">
        Scale in the corner of the map - Shortcuts: P/G/N/E/Del/R
      </div>
    </div>
  );
}
