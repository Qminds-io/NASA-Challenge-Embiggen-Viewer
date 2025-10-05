import type { Feature as GeoJsonFeature, Geometry as GeoJsonGeometry } from "geojson";

const envBase = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
const DEFAULT_BASE = import.meta.env.DEV ? "http://localhost:8001" : "https://api.nasa.qminds.io";
const RAW_BASE_URL = envBase.length > 0 ? envBase : DEFAULT_BASE;
export const API_BASE_URL = RAW_BASE_URL.replace(/\/?$/, "");
const DELETE_SECRET = import.meta.env.VITE_ANNOTATION_DELETE_SECRET ?? "";

export type ProjectionCode = "EPSG:3857" | "EPSG:4326";
export type LayerKind = "gibs" | "trek" | "custom";

export type LayerItem = {
  layerKey: string;
  title: string;
  bodyId: string;
  bodyName: string;
  kind: LayerKind;
  projection: ProjectionCode;
  requiresDate: boolean;
  defaultDate?: string | null;
  minZoom?: number;
  maxZoom?: number;
  tileSize?: number;
  matrixSet?: string;
  imageFormat?: string;
  tileTemplate?: string;
  description?: string;
};

export type BodyEntry = {
  bodyId: string;
  bodyName: string;
  projection: ProjectionCode;
  layers: LayerItem[];
};

export type LayersCatalog = BodyEntry[];

export type AnnotationFrame = {
  layerKey: string;
  date?: string;
  projection: ProjectionCode;
  zoom?: number;
  opacity?: number;
  center?: { lon: number; lat: number };
  extent?: { minLon: number; minLat: number; maxLon: number; maxLat: number };
};

export type AnnotationFeaturePayload = {
  id?: string;
  order?: number;
  feature: GeoJsonFeature;
  properties?: Record<string, unknown>;
};

export type AnnotationCreateRequest = {
  frame: AnnotationFrame;
  features: AnnotationFeaturePayload[];
};

export type AnnotationEnvelope = {
  frame?: AnnotationFrame;
  features: AnnotationRecord[];
};

export type AnnotationRecord = {
  id: string;
  order?: number;
  feature: GeoJsonFeature;
  properties?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type AnnotationListParams = {
  swLat?: number;
  swLon?: number;
  neLat?: number;
  neLon?: number;
  layerKey?: string;
  projection?: ProjectionCode | string;
  zoom?: number;
  centerLon?: number;
  centerLat?: number;
  minLon?: number;
  minLat?: number;
  maxLon?: number;
  maxLat?: number;
};

class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

const pendingCache = new Map<string, Promise<unknown>>();

let cachedCatalog: LayersCatalog | null = null;
let cachedCatalogPromise: Promise<LayersCatalog> | null = null;

function resolveUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}

function buildCacheKey(method: string, url: string, body?: unknown): string {
  return `${method.toUpperCase()}::${url}::${body ? JSON.stringify(body) : ""}`;
}

async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
    useCache?: boolean;
  } = {}
): Promise<T> {
  const {
    method = "GET",
    body,
    headers,
    signal,
    useCache = method === "GET",
  } = options;

  const url = resolveUrl(path);
  const cacheKey = useCache ? buildCacheKey(method, url, body) : undefined;
  if (cacheKey && pendingCache.has(cacheKey)) {
    return pendingCache.get(cacheKey)! as Promise<T>;
  }

  const fetchPromise = fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let data: unknown = text;
        try {
          data = text ? JSON.parse(text) : undefined;
        } catch {
          // keep text if JSON parse fails
        }
        throw new ApiError(`API request failed (${res.status})`, res.status, data);
      }
      if (res.status === 204) {
        return undefined as T;
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        return (await res.json()) as T;
      }
      return (await res.text()) as unknown as T;
    })
    .finally(() => {
      if (cacheKey) pendingCache.delete(cacheKey);
    });

  if (cacheKey) pendingCache.set(cacheKey, fetchPromise);
  return fetchPromise;
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function pickNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(num)) {
      return num;
    }
  }
  return undefined;
}

function asProjection(value: unknown, fallback: ProjectionCode): ProjectionCode {
  if (value === "EPSG:4326" || value === "EPSG:3857") {
    return value;
  }
  return fallback;
}

function guessKind(layerKey: string, rawKind?: unknown): LayerKind {
  if (rawKind === "gibs" || rawKind === "trek") {
    return rawKind;
  }
  if (layerKey.startsWith("gibs:")) return "gibs";
  if (layerKey.startsWith("trek:")) return "trek";
  return "custom";
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeLayer(
  rawLayer: unknown,
  bodyId: string,
  bodyName: string,
  fallbackProjection: ProjectionCode
): LayerItem | null {
  if (!rawLayer || typeof rawLayer !== "object") return null;

  const layerKey = pickString((rawLayer as any).layerKey, (rawLayer as any).key, (rawLayer as any).id);
  if (!layerKey) return null;

  const title = pickString((rawLayer as any).title, (rawLayer as any).name, layerKey) ?? layerKey;
  const projection = asProjection((rawLayer as any).projection, fallbackProjection);
  const kind = guessKind(layerKey, (rawLayer as any).kind);
  const tileTemplate = pickString((rawLayer as any).tileTemplate);
  const inferredRequiresDate = tileTemplate ? tileTemplate.includes("{date}") : false;
  const requiresDate = typeof (rawLayer as any).requiresDate === "boolean"
    ? (rawLayer as any).requiresDate
    : inferredRequiresDate || kind === "gibs";
  const defaultDateRaw = pickString((rawLayer as any).defaultDate);
  const defaultDate = defaultDateRaw && isIsoDate(defaultDateRaw) ? defaultDateRaw : undefined;
  const minZoom = pickNumber((rawLayer as any).minZoom, (rawLayer as any).minZoomLevel);
  const maxZoom = pickNumber((rawLayer as any).maxZoom, (rawLayer as any).maxZoomLevel);
  const tileSize = pickNumber((rawLayer as any).tileSize);
  const matrixSet = pickString((rawLayer as any).matrixSet);
  const imageFormat = pickString((rawLayer as any).imageFormat);
  const description = pickString((rawLayer as any).description, (rawLayer as any).summary);

  return {
    layerKey,
    title,
    bodyId,
    bodyName,
    kind,
    projection,
    requiresDate,
    defaultDate,
    minZoom,
    maxZoom,
    tileSize,
    matrixSet,
    imageFormat,
    tileTemplate,
    description,
  };
}

function normalizeBody(rawBody: unknown): BodyEntry | null {
  if (!rawBody || typeof rawBody !== "object") return null;

  const bodyId = pickString(
    (rawBody as any).bodyId,
    (rawBody as any).id,
    (rawBody as any).slug,
    (rawBody as any).body,
    (rawBody as any).name
  );

  const bodyName = pickString((rawBody as any).bodyName, (rawBody as any).name, bodyId) ?? bodyId ?? "";
  const projection = asProjection((rawBody as any).projection, "EPSG:3857");

  const rawLayers = Array.isArray((rawBody as any).layers)
    ? (rawBody as any).layers
    : Array.isArray((rawBody as any).items)
    ? (rawBody as any).items
    : [];

  const layers: LayerItem[] = [];
  for (const entry of rawLayers) {
    const normalized = normalizeLayer(entry, bodyId ?? bodyName ?? "unknown", bodyName ?? bodyId ?? "", projection);
    if (normalized) layers.push(normalized);
  }

  if (!bodyId || layers.length === 0) return null;

  return {
    bodyId,
    bodyName: bodyName || bodyId,
    projection,
    layers,
  };
}

function normalizeLayersResponse(data: unknown): LayersCatalog {
  if (!data) return [];

  if (Array.isArray((data as any)?.bodies)) {
    return normalizeLayersResponse((data as any).bodies as unknown[]);
  }

  if (Array.isArray(data)) {
    const result: BodyEntry[] = [];
    for (const entry of data as unknown[]) {
      const normalized = normalizeBody(entry);
      if (normalized) result.push(normalized);
    }
    return result;
  }

  if (typeof data === "object") {
    const result: BodyEntry[] = [];
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        const rawLayers = value as unknown[];
        const layers: LayerItem[] = [];
        for (const rawLayer of rawLayers) {
          const projection = asProjection((rawLayer as any)?.projection, "EPSG:3857");
          const bodyName = pickString((rawLayer as any)?.body, key) ?? key;
          const normalizedLayer = normalizeLayer(rawLayer, key, bodyName, projection);
          if (normalizedLayer) layers.push(normalizedLayer);
        }
        if (layers.length > 0) {
          const firstRaw = rawLayers[0] as any;
          result.push({
            bodyId: key,
            bodyName: pickString(firstRaw?.bodyName, firstRaw?.body, key) ?? key,
            projection: layers[0].projection,
            layers,
          });
        }
      } else {
        const normalized = normalizeBody(value);
        if (normalized) result.push(normalized);
      }
    }
    return result;
  }

  return [];
}

function ensureFeatureGeometry(
  feature: GeoJsonFeature | undefined,
  fallbackLon?: number,
  fallbackLat?: number
): GeoJsonFeature | null {
  if (feature && typeof feature === "object" && feature.geometry) return feature;
  if (typeof fallbackLon === "number" && typeof fallbackLat === "number") {
    return {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [fallbackLon, fallbackLat],
      } as GeoJsonGeometry,
      properties: {},
    };
  }
  return null;
}

function normalizeAnnotation(raw: unknown): AnnotationRecord | null {
  if (!raw || typeof raw !== "object") return null;

  const id = pickString((raw as any).id, (raw as any).annotationId, (raw as any).uuid, String((raw as any).id));
  if (!id) return null;

  const featureRaw: GeoJsonFeature | undefined = (raw as any).feature;
  const lon = pickNumber((raw as any).lon, (raw as any).longitude);
  const lat = pickNumber((raw as any).lat, (raw as any).latitude);
  const feature = ensureFeatureGeometry(featureRaw, lon, lat);
  if (!feature) return null;

  const order = pickNumber((raw as any).order);
  const properties = typeof (raw as any).properties === "object" ? (raw as any).properties : undefined;
  const createdAt = pickString((raw as any).createdAt);
  const updatedAt = pickString((raw as any).updatedAt);

  if (properties && feature.properties && typeof feature.properties === "object") {
    feature.properties = { ...feature.properties, ...properties };
  }

  return {
    id,
    order,
    feature,
    properties,
    createdAt,
    updatedAt,
  };
}

export async function fetchHealth(signal?: AbortSignal): Promise<{ status: string }> {
  return request<{ status: string }>("/api/health", { signal, useCache: true });
}

export async function fetchLayersCatalog(signal?: AbortSignal): Promise<LayersCatalog> {
  if (cachedCatalog) {
    return cachedCatalog;
  }
  if (cachedCatalogPromise) {
    return cachedCatalogPromise;
  }
  const promise = request<unknown>("/v1/layers", { signal, useCache: false })
    .then((data) => {
      const normalized = normalizeLayersResponse(data);
      cachedCatalog = normalized;
      cachedCatalogPromise = null;
      return normalized;
    })
    .catch((error) => {
      cachedCatalogPromise = null;
      throw error;
    });
  cachedCatalogPromise = promise;
  return promise;
}

export function clearLayersCatalogCache() {
  cachedCatalog = null;
  cachedCatalogPromise = null;
}

export async function fetchAnnotations(
  params?: AnnotationListParams,
  signal?: AbortSignal
): Promise<AnnotationRecord[]> {
  const search = new URLSearchParams();
  if (params) {
    const setNumber = (key: string, value: number | undefined) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        search.set(key, String(value));
      }
    };
    const setString = (key: string, value: string | undefined) => {
      if (typeof value === "string" && value.trim().length > 0) {
        search.set(key, value.trim());
      }
    };
    setNumber('swLat', params.swLat);
    setNumber('swLon', params.swLon);
    setNumber('neLat', params.neLat);
    setNumber('neLon', params.neLon);
    setString('layerKey', params.layerKey);
    if (params.projection) setString('projection', String(params.projection));
    setNumber('zoom', params.zoom);
    setNumber('centerLon', params.centerLon);
    setNumber('centerLat', params.centerLat);
    setNumber('minLon', params.minLon);
    setNumber('minLat', params.minLat);
    setNumber('maxLon', params.maxLon);
    setNumber('maxLat', params.maxLat);
  }
  const suffix = search.toString() ? `?${search.toString()}` : "";
  const data = await request<unknown>(`/v1/annotations${suffix}`, { signal, useCache: false });
  const rawList = Array.isArray((data as any)?.items)
    ? (data as any).items
    : Array.isArray((data as any)?.features)
    ? (data as any).features
    : Array.isArray(data)
    ? data
    : [];
  const result: AnnotationRecord[] = [];
  for (const entry of rawList) {
    const normalized = normalizeAnnotation(entry);
    if (normalized) result.push(normalized);
  }
  return result;
}

export async function createAnnotations(
  payload: AnnotationCreateRequest,
  signal?: AbortSignal
): Promise<AnnotationEnvelope> {
  const data = await request<AnnotationEnvelope>("/v1/annotations", {
    method: "POST",
    body: payload,
    signal,
    useCache: false,
  });

  const features = Array.isArray(data?.features)
    ? data.features.flatMap((item) => {
        const normalized = normalizeAnnotation(item);
        return normalized ? [normalized] : [];
      })
    : [];

  return { frame: data?.frame, features };
}

export async function queryAnnotations(
  payload: AnnotationCreateRequest,
  signal?: AbortSignal
): Promise<AnnotationEnvelope> {
  const data = await request<AnnotationEnvelope>("/v1/annotations/query", {
    method: "POST",
    body: payload,
    signal,
    useCache: false,
  });

  const features = Array.isArray(data?.features)
    ? data.features.flatMap((item) => {
        const normalized = normalizeAnnotation(item);
        return normalized ? [normalized] : [];
      })
    : [];

  return { frame: data?.frame, features };
}

export async function deleteAnnotation(
  id: string,
  { secret }: { secret?: string } = {},
  signal?: AbortSignal
): Promise<void> {
  const resolvedSecret = pickString(secret, DELETE_SECRET);
  const search = new URLSearchParams();
  if (resolvedSecret) search.set("secret", resolvedSecret);
  const suffix = search.toString() ? `?${search.toString()}` : "";

  await request(`/v1/annotations/${encodeURIComponent(id)}${suffix}`, {
    method: "DELETE",
    signal,
    useCache: false,
  });
}

export { ApiError };


