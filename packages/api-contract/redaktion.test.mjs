import { PHOTO } from "./harness.mjs";

export const name = "Redaktion (Trainingszeiten / Startseite / News-Bild)";

export default async function run(api, ck) {
  await api.asAdmin();
  let [s, d] = await api.getJ("/api/permissions");
  ck("16 Berechtigungen inkl. Content-Rechte", d.items.length === 16 && ["manage_training", "manage_site", "manage_team"].every((k) => d.items.some((p) => p.key === k)));
  [s, d] = await api.getJ("/api/roles");
  const role = (id) => d.items.find((r) => r.id === id);
  ck("trainer hat manage_training", role("trainer").permissions.includes("manage_training"));
  ck("pressewart hat manage_site", role("pressewart").permissions.includes("manage_site"));
  ck("vorstand hat manage_training+manage_site", ["manage_training", "manage_site"].every((k) => role("vorstand").permissions.includes(k)));

  await api.logout();
  [s, d] = await api.getJ("/api/training");
  ck("GET /api/training öffentlich (seed)", s === 200 && Array.isArray(d.items) && d.items.length > 0);
  [s, d] = await api.getJ("/api/team");
  ck("GET /api/team öffentlich (Array)", s === 200 && Array.isArray(d.items));
  [s, d] = await api.getJ("/api/site");
  ck("GET /api/site liefert fields+values", s === 200 && Array.isArray(d.fields) && d.values && d.values.hero_title);

  const tt = api.email("tt");
  const trId = await api.newUser("Tina Trainer", tt);
  await api.asAdmin();
  await api.post("/api/users/roles", { userId: trId, roles: ["trainer"] });
  await api.login(tt);
  [s, d] = await api.postJ("/api/training", { title: "Wettkampfgruppe", start: "19:00", end: "20:30", ageGroup: "ab U15" });
  ck("trainer darf Trainingszeit anlegen (201)", s === 201);
  const tsId = d.item && d.item.id;
  [s, d] = await api.postJ("/api/training", { title: "X", start: "" });
  ck("ohne Startzeit -> 422", s === 422 && d.errors.start);
  [s, d] = await api.postJ("/api/training/update", { id: tsId, title: "Wettkampf", start: "19:15", end: "20:30" });
  ck("update ok", d.ok && d.item.start === "19:15");
  [s, d] = await api.postJ("/api/team", { name: "Hans", role: "Trainer", group: "trainer" });
  ck("manuelle Team-CRUD entfernt -> 404", s === 404);
  [s, d] = await api.postJ("/api/site", { values: { hero_title: "Hack" } });
  ck("trainer darf KEINE Site-Texte (403)", s === 403);
  [s, d] = await api.postJ("/api/news", { title: "Hack", date: "2026-01-01", excerpt: "xxxxxxxxxx" });
  ck("trainer darf KEINE News (403)", s === 403);
  [s, d] = await api.postJ("/api/training/delete", { id: tsId });
  ck("delete ok", d.ok);

  const vv = api.email("vv");
  const voId = await api.newUser("Vera Vorstand", vv);
  await api.asAdmin();
  await api.post("/api/users/roles", { userId: voId, roles: ["vorstand"] });
  await api.login(vv);
  [s, d] = await api.postJ("/api/site", { values: { hero_title: "Neu", unknown_key: "XXX" } });
  ck("site save ok, hero_title gesetzt", d.ok && d.values.hero_title === "Neu");
  ck("unbekannte Keys ignoriert", !("unknown_key" in d.values));
  [s, d] = await api.getJ("/api/site");
  ck("GET site zeigt gespeicherten Wert", d.values.hero_title === "Neu");

  [s, d] = await api.postJ("/api/news", { title: "Mit Bild", date: "2026-06-20", excerpt: "Ein Anrisstext hier.", image: PHOTO });
  ck("News mit gültigem Bild gespeichert", s === 201 && d.item.image === PHOTO);
  [s, d] = await api.postJ("/api/news", { title: "Ohne Bild", date: "2026-06-20", excerpt: "Ein Anrisstext hier.", image: "nope" });
  ck("ungültiges Bild -> leer", s === 201 && d.item.image === "");
}
