import { apiFetch } from "./api";

export type LayerKind = "gibs" | "trek" | string;

export type ApiLayer = {
  layerKey: string;
  title: string;
  kind: LayerKind;
  body: string;
  projection: "EPSG:3857" | "EPSG:4326" | string;
  matrixSet?: string;
  imageFormat?: string;
  tileTemplate: string;
  maxZoom?: number;
  defaultDate?: string;
};

export type LayerCatalog = Record<string, ApiLayer[]>;

let catalogCache: LayerCatalog | null = null;
let catalogPromise: Promise<LayerCatalog> | null = null;

export async function getLayerCatalog(force = false): Promise<LayerCatalog> {
  if (!force && catalogCache) {
    return catalogCache;
  }

  if (!force && catalogPromise) {
    return catalogPromise;
  }

  catalogPromise = apiFetch<LayerCatalog>("/v1/layers")
    .then((catalog) => {
      catalogCache = catalog;
      return catalog;
    })
    .finally(() => {
      catalogPromise = null;
    });

  return catalogPromise;
}

export function flattenCatalog(catalog: LayerCatalog): ApiLayer[] {
  return Object.values(catalog).flat();
}

export function findLayer(catalog: LayerCatalog, key: string): ApiLayer | undefined {
  for (const layers of Object.values(catalog)) {
    const match = layers.find((layer) => layer.layerKey === key);
    if (match) return match;
  }
  return undefined;
}

export const layerNeedsDate = (layer: ApiLayer) => layer.tileTemplate.includes("{date}");

export const layerDefaultDate = (layer: ApiLayer, fallbackISO: string) =>
  layer.defaultDate && layer.defaultDate.length > 0 ? layer.defaultDate : fallbackISO;

export function resetLayerCatalogCache() {
  catalogCache = null;
  catalogPromise = null;
}
