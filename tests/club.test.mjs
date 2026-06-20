export const name = "Vereinsdaten & Branding (White-Label /api/club)";

export default async function run(api, ck) {
  // Öffentlich lesbar (kein Login nötig)
  await api.logout();
  let [s, d] = await api.getJ("/api/club");
  ck("GET /api/club öffentlich (200)", s === 200 && d.ok === true);
  ck("liefert fields-Schema", Array.isArray(d.fields) && d.fields.length === 14 && d.fields.some((f) => f.key === "brand_name") && d.fields.some((f) => f.key === "logo"));
  ck("Seed-Werte vorhanden (Name + Sport)", d.values.name.includes("e.V.") && d.values.sport.length > 0 && d.values.brand_name.length > 0);

  // Ohne Login kein Schreibzugriff
  [s, d] = await api.postJ("/api/club", { values: { brand_name: "Hack" } });
  ck("POST ohne Login -> 401", s === 401);

  // Normaler Nutzer ohne Recht -> 403
  const nina = api.email("nina");
  await api.newUser("Nina Normal", nina);
  [s, d] = await api.postJ("/api/club", { values: { brand_name: "Hack" } });
  ck("POST ohne manage_club -> 403", s === 403);

  // Admin darf schreiben; Wert wird übernommen und ist wieder lesbar
  await api.asAdmin();
  [s, d] = await api.postJ("/api/club", { values: { brand_name: "Test Verein", email: "kontakt@test.de" } });
  ck("Admin POST ok", s === 200 && d.ok && d.values.brand_name === "Test Verein" && d.values.email === "kontakt@test.de");
  [s, d] = await api.getJ("/api/club");
  ck("Änderung persistiert", d.values.brand_name === "Test Verein" && d.values.email === "kontakt@test.de");
  ck("unangetastetes Feld bleibt erhalten", d.values.sport.length > 0);

  // Vorstand-Rolle erhält manage_club via Seed-Migration v8
  const vera = api.email("vera");
  const vId = await api.newUser("Vera Vorstand", vera);
  await api.asAdmin();
  await api.post("/api/users/roles", { userId: vId, roles: ["vorstand"] });
  await api.login(vera);
  [s, d] = await api.postJ("/api/club", { values: { locality: "Teststadt" } });
  ck("vorstand (manage_club) darf schreiben", s === 200 && d.values.locality === "Teststadt");
}
