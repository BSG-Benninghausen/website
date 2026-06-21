import { PHOTO } from "./harness.mjs";

export const name = "Sponsoren (CRUD, Tiers & Anzeige-Konfiguration)";

export default async function run(api, ck) {
  await api.asAdmin();
  let [s, d] = await api.getJ("/api/permissions");
  ck("16 Berechtigungen inkl. manage_sponsors", d.items.length === 16 && d.items.some((p) => p.key === "manage_sponsors"));
  [s, d] = await api.getJ("/api/roles");
  ck("vorstand + pressewart haben manage_sponsors", ["vorstand", "pressewart"].every((id) => d.items.find((r) => r.id === id).permissions.includes("manage_sponsors")));

  // Öffentliche Lesezugriffe
  await api.logout();
  [s, d] = await api.getJ("/api/sponsors");
  const seedCount = d.items.length;
  ck("GET /api/sponsors öffentlich (seed)", s === 200 && Array.isArray(d.items) && seedCount > 0);
  ck("sortiert nach order", d.items.every((it, i) => i === 0 || d.items[i - 1].order <= it.order));
  [s, d] = await api.getJ("/api/sponsors-config");
  ck("GET /api/sponsors-config öffentlich, default aus", s === 200 && Array.isArray(d.fields) && d.values.enabled === false && d.values.displayMode === "cards");

  // Schreibschutz
  [s, d] = await api.postJ("/api/sponsors", { name: "Anon" });
  ck("anonym -> 401", s === 401);

  const presse = api.email("presse");
  const pId = await api.newUser("Paul Presse", presse);
  await api.asAdmin();
  await api.post("/api/users/roles", { userId: pId, roles: ["pressewart"] });

  const nina = api.email("nina");
  await api.newUser("Nina Normal", nina);
  await api.login(nina);
  [s, d] = await api.postJ("/api/sponsors", { name: "Hack" });
  ck("member -> 403", s === 403);
  [s, d] = await api.postJ("/api/sponsors-config", { values: { enabled: true } });
  ck("member darf Config nicht ändern (403)", s === 403);

  // Pressewart legt Sponsoren an
  await api.login(presse);
  [s, d] = await api.postJ("/api/sponsors", { name: "X" });
  ck("Name zu kurz -> 422", s === 422 && d.errors && d.errors.name);
  [s, d] = await api.postJ("/api/sponsors", { name: "Premium Bau GmbH", tier: "premium", logo: PHOTO, url: "bau.example.com", description: "Hauptsponsor", order: 1 });
  ck("Premium-Sponsor angelegt (201)", s === 201 && d.item.tier === "premium" && d.item.logo === PHOTO);
  ck("URL bekommt https:// vorangestellt", d.item.url === "https://bau.example.com");
  const premId = d.item.id;
  [s, d] = await api.postJ("/api/sponsors", { name: "Böse URL", url: "javascript:alert(1)" });
  ck("javascript:-URL wird verworfen", s === 201 && d.item.url === "");
  await api.postJ("/api/sponsors/delete", { id: d.item.id });
  [s, d] = await api.postJ("/api/sponsors", { name: "Kein Logo", logo: "nope", order: 2 });
  ck("ungültiges Logo -> leer, tier default standard", s === 201 && d.item.logo === "" && d.item.tier === "standard");
  const stdId = d.item.id;

  [s, d] = await api.getJ("/api/sponsors");
  ck("Liste enthält neue Sponsoren", d.items.length === seedCount + 2);

  // Update & Delete
  [s, d] = await api.postJ("/api/sponsors/update", { id: stdId, name: "Jetzt Premium", tier: "premium", order: 5 });
  ck("update tier+order", d.ok && d.item.tier === "premium" && d.item.order === 5);
  [s, d] = await api.postJ("/api/sponsors/update", { id: "spo-unknown", name: "Geist" });
  ck("update unbekannt -> 404", s === 404);
  [s, d] = await api.postJ("/api/sponsors/delete", { id: premId });
  ck("delete ok", d.ok);
  [s, d] = await api.postJ("/api/sponsors/delete", { id: premId });
  ck("delete erneut -> 404", s === 404);

  // Config schreiben (clamp ungültiger Modus)
  [s, d] = await api.postJ("/api/sponsors-config", { values: { enabled: true, displayMode: "xxx", tiersEnabled: true, showFooter: true } });
  ck("Config gespeichert, displayMode geklammert", d.ok && d.values.enabled === true && d.values.displayMode === "cards" && d.values.tiersEnabled === true && d.values.showFooter === true);
  [s, d] = await api.postJ("/api/sponsors-config", { values: { enabled: true, displayMode: "logos", tiersEnabled: true, showHome: true, showPage: false, showFooter: true } });
  ck("gültiger Modus übernommen", d.values.displayMode === "logos" && d.values.showPage === false);
  await api.logout();
  [s, d] = await api.getJ("/api/sponsors-config");
  ck("GET zeigt gespeicherte Config", d.values.enabled === true && d.values.displayMode === "logos");
}
