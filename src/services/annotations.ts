import { apiFetch } from "./api";

export type FrameExtent = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

export type FrameCenter = {
  lon: number;
  lat: number;
};

export type FrameDescriptor = {
  layerKey: string;
  projection: string;
  date?: string;
  zoom?: number;
  opacity?: number;
  center: FrameCenter;
  extent: FrameExtent;
};

export type AnnotationFeature = {
  id?: number | string | null;
  order: number;
  feature: Record<string, unknown>;
  properties?: Record<string, unknown> | null;
};

export type AnnotationCollection = {
  frame: FrameDescriptor;
  features: AnnotationFeature[];
};

export type FetchAnnotationsParams = FrameDescriptor & {
  limit?: number;
};

const serializeQuery = (params: FetchAnnotationsParams) => {
  const search = new URLSearchParams();
  search.set("layerKey", params.layerKey);
  search.set("projection", params.projection);
  if (params.date) search.set("date", params.date);
  if (params.zoom !== undefined) search.set("zoom", String(params.zoom));
  if (params.opacity !== undefined) search.set("opacity", String(params.opacity));
  search.set("centerLon", params.center.lon.toFixed(6));
  search.set("centerLat", params.center.lat.toFixed(6));
  search.set("minLon", params.extent.minLon.toFixed(6));
  search.set("minLat", params.extent.minLat.toFixed(6));
  search.set("maxLon", params.extent.maxLon.toFixed(6));
  search.set("maxLat", params.extent.maxLat.toFixed(6));
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  return search.toString();
};

export async function fetchAnnotations(params: FetchAnnotationsParams): Promise<AnnotationFeature[]> {
  const query = serializeQuery(params);
  return apiFetch<AnnotationFeature[]>(`/v1/annotations?${query}`);
}

export async function saveAnnotations(collection: AnnotationCollection): Promise<AnnotationFeature[]> {
  return apiFetch<AnnotationFeature[]>("/v1/annotations", {
    method: "POST",
    json: collection,
  });
}

