/**
 * Vytvoří bezpečnou absolutní URL pro redirect v Route Handlers.
 *
 * Render předává aplikaci interní request URL (např. localhost:10000),
 * proto se v produkci nesmí používat request.url jako primární základ.
 * APP_URL lze později nastavit na vlastní doménu. Render jinak automaticky
 * poskytuje RENDER_EXTERNAL_URL.
 */
export function redirectUrl(path: string, request: Request): URL {
  const configuredBase = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
  const base = configuredBase || request.url;

  return new URL(path, base.endsWith("/") ? base : `${base}/`);
}
