/* =====================================================================
   club-namespace.test.mjs – White-Label Content-Seed-Namespace (Mock).

   Der ns-fähige Seed-Loader (loadClubData) erlaubt einem Fork/Beispiel,
   Inhalte additiv über "<base>.<ns>.json" zu überschreiben, ohne die
   generische "<base>.json" zu divergieren. Hier geprüft (ohne ns-Fixtures
   im generischen Produkt): ist ein ns gesetzt, aber keine club-spezifische
   Datei vorhanden, fällt der Loader sauber auf die generische Datei zurück.
   Der positive Override-Pfad (mit echter <base>.<ns>.json) wird im Fork-E2E
   abgedeckt. mockOnly: prüft den In-Browser-Loader, nicht das HTTP-Backend.
   ===================================================================== */
import { createMockSandbox } from "./harness.mjs";

export const name = "White-Label Content-Namespace (Seed-Loader-Fallback)";
export const mockOnly = true;

const getJ = async (sb, path) => {
  const r = await sb.win.fetch(path, { method: "GET" });
  return [r.status, await r.json()];
};

export default async function run(_api, ck) {
  // ns gesetzt, aber es existiert keine "*.<ns>.json" -> Fallback auf generische Seeds.
  const sb = createMockSandbox({ clubNs: "kein-fork-xyz" });

  const [siteS, site] = await getJ(sb, "/api/site");
  ck("ns ohne Override -> generische site.json (Fallback)", siteS === 200 && site && site.values && typeof site.values.hero_title === "string");

  const [newsS, news] = await getJ(sb, "/api/news");
  ck("ns ohne Override -> generische news.json (Fallback)", newsS === 200 && Array.isArray(news.items));

  // Default-Passprefix kommt aus der Club-Config (generische club.json ohne passPrefix) -> "MV-".
  const code = await (await sb.win.fetch("/api/auth/request-code", { method: "POST", body: JSON.stringify({ email: "admin@example.com" }) })).json();
  await sb.win.fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@example.com", code: code.devCode }) });
  const [, club] = await getJ(sb, "/api/club");
  ck("generische Club-Config hat keinen passPrefix (Default MV-)", club && club.values && !club.values.passPrefix);
}
