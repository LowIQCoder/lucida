export function getRuntimeConfig() {
  return globalThis.__APP_CONFIG__ ?? {};
}

export function getApiBaseUrl() {
  return getRuntimeConfig().backendUrl ?? "";
}

export function resolveApiUrl(pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = getApiBaseUrl().replace(/\/$/, "");
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}
