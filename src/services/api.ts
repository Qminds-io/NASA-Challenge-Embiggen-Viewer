const rawBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? (import.meta.env.DEV ? "http://localhost:8001" : "https://api.nasa.qminds.io");
export const API_BASE_URL = rawBase.replace(/\/?$/, "");

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}

export type ApiRequestInit = RequestInit & { json?: unknown };

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, payload: unknown, message?: string) {
    super(message ?? `API request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

const isJsonResponse = (resp: Response) => {
  const contentType = resp.headers.get("Content-Type") ?? "";
  return contentType.includes("application/json");
};

export async function apiFetch<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { json, headers, body: initBody, ...rest } = init;
  const finalHeaders = new Headers(headers ?? {});
  let body: BodyInit | undefined = initBody as BodyInit | undefined;

  if (json !== undefined) {
    body = JSON.stringify(json);
    if (!finalHeaders.has("Content-Type")) {
      finalHeaders.set("Content-Type", "application/json");
    }
  }

  if (!finalHeaders.has("Accept")) {
    finalHeaders.set("Accept", "application/json");
  }

  const response = await fetch(apiUrl(path), {
    ...rest,
    body,
    headers: finalHeaders,
    mode: rest.mode ?? "cors",
    credentials: rest.credentials ?? "omit",
  });

  const parseBody = async () => {
    if (response.status === 204) return undefined;
    if (isJsonResponse(response)) {
      try {
        return await response.json();
      } catch (err) {
        if (response.ok) throw err;
        return undefined;
      }
    }
    return await response.text();
  };

  const data = await parseBody();

  if (!response.ok) {
    throw new ApiError(response.status, data);
  }

  return data as T;
}
