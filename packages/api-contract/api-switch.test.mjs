/* Diese Suite testet den Dispatcher selbst (Mock vs. Backend-Routing) und läuft
   nur im Mock-Modus – gegen ein echtes Backend ist sie nicht anwendbar. */
import { createMockSandbox } from "./harness.mjs";

export const name = "API-Switch (Mock/Hybrid/Real-Routing)";
export const mockOnly = true;

export default async function run(_api, ck) {
  const sb = createMockSandbox();
  const win = sb.win;
  const get = (p) => win.fetch(p, { method: "GET" });
  const jj = async (r) => [r.status, await r.json()];
  let s, d;

  [s, d] = await jj(await get("/api/news"));
  ck("Default (kein BSG_API) = mock: /api/news lokal", s === 200 && !d.backend && Array.isArray(d.items));

  win.BSG_API = { mode: "hybrid", base: "https://api.test", live: ["GET /api/news"] };
  [s, d] = await jj(await get("/api/news"));
  ck("hybrid live -> Backend", d.backend === true);
  ck("Backend-Ziel = base+path", sb.calls.some((c) => c.url === "https://api.test/api/news"));
  ck("credentials:include weitergereicht", d.creds === "include");
  [s, d] = await jj(await get("/api/events"));
  ck("hybrid non-live -> Mock", !d.backend && Array.isArray(d.items));

  win.BSG_API = { mode: "hybrid", base: "", live: ["/api/team"] };
  [s, d] = await jj(await get("/api/team"));
  ck("Pfad-Präfix /api/team -> Backend", d.backend === true);

  win.BSG_API = { mode: "real", base: "" };
  [s, d] = await jj(await get("/api/events"));
  ck("real -> Backend", d.backend === true);

  win.BSG_API = { mode: "mock" };
  [s, d] = await jj(await get("/api/events"));
  ck("mock -> wieder lokal", !d.backend);

  win.BSGApi.setMode("real");
  ck("setMode/getMode real", win.BSGApi.getMode() === "real");
  [s, d] = await jj(await get("/api/news"));
  ck("nach setMode real -> Backend", d.backend === true);
  win.BSGApi.setMode("mock");
  ck("isLive in mock = false", win.BSGApi.isLive("GET /api/news") === false);
  win.BSGApi.setMode("hybrid");
  win.BSGApi.setLive(["GET /api/news"]);
  ck("isLive hybrid trifft", win.BSGApi.isLive("GET /api/news") === true && win.BSGApi.isLive("GET /api/events") === false);
}
