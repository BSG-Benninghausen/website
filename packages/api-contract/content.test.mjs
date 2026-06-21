import { PHOTO, IBAN } from "./harness.mjs";

export const name = "Inhalte & Rechte (News/Termine/Mitglieder-Lesezugriff)";

export default async function run(api, ck) {
  await api.asAdmin();
  let [s, d] = await api.getJ("/api/permissions");
  ck("14 Berechtigungen", d.items.length === 14 && d.items.some((p) => p.key === "manage_news") && d.items.some((p) => p.key === "manage_team") && d.items.some((p) => p.key === "view_finance") && d.items.some((p) => p.key === "manage_club"));
  [s, d] = await api.getJ("/api/roles");
  const ex = ["vorstand", "pressewart", "kassenwart", "trainer"];
  ck("Beispiel-Rollen geseedet", ex.every((id) => d.items.some((r) => r.id === id)));
  ck("pressewart hat manage_news", d.items.find((r) => r.id === "pressewart").permissions.includes("manage_news"));
  ck("kassenwart hat view_members+view_finance+manage_payouts", d.items.find((r) => r.id === "kassenwart").permissions.slice().sort().join() === "manage_payouts,view_finance,view_members");

  [s, d] = await api.getJ("/api/news");
  const seedCount = d.items.length;
  ck("news seed-on-read liefert Startdaten", seedCount > 0);

  const presse = api.email("presse");
  const bobId = await api.newUser("Bob Presse", presse);
  await api.asAdmin();
  await api.post("/api/users/roles", { userId: bobId, roles: ["pressewart"] });
  await api.login(presse);
  [s, d] = await api.postJ("/api/news", { title: "Neue Meldung", date: "2026-06-20", tag: "Verein", excerpt: "Dies ist ein Test-Anriss für die News.", body: "Voller Text." });
  ck("pressewart darf News anlegen (201)", s === 201);
  const newsId = d.item.id;
  [s, d] = await api.getJ("/api/news");
  ck("News erscheint in Liste", d.items.length === seedCount + 1 && d.items.some((n) => n.id === newsId));
  [s, d] = await api.postJ("/api/news/update", { id: newsId, title: "Geändert", date: "2026-06-21", excerpt: "Aktualisierter Anrisstext hier." });
  ck("News update ok", d.ok && d.item.title === "Geändert");
  [s, d] = await api.postJ("/api/events", { title: "X", date: "2026-07-01" });
  ck("pressewart darf KEINE Termine (403)", s === 403);
  [s, d] = await api.getJ("/api/admin/members");
  ck("pressewart darf KEINE Mitglieder (403)", s === 403);
  [s, d] = await api.postJ("/api/news/delete", { id: newsId });
  ck("News delete ok", d.ok);

  const vorstand = api.email("vorstand");
  const vId = await api.newUser("Vera Vorstand", vorstand);
  await api.asAdmin();
  await api.post("/api/users/roles", { userId: vId, roles: ["vorstand"] });
  await api.login(vorstand);
  [s, d] = await api.postJ("/api/events", { title: "Sommerfest", date: "2026-08-01", time: "15:00 Uhr", type: "Event", location: "Halle" });
  ck("vorstand darf Termin anlegen", s === 201 && d.item.type === "Event");

  const carla = api.email("carla");
  await api.newUser("Carla Kunde", carla);
  await api.login(carla);
  await api.setHousehold(IBAN);
  await api.post("/api/memberships", { firstName: "Carla", lastName: "Kunde", birthdate: "1980-01-01", photo: PHOTO });
  await api.post("/api/memberships", { firstName: "Kid", lastName: "Kunde", birthdate: "2016-01-01", photo: PHOTO });

  const kasse = api.email("kasse");
  const kId = await api.newUser("Kim Kasse", kasse);
  await api.asAdmin();
  await api.post("/api/users/roles", { userId: kId, roles: ["kassenwart"] });
  await api.login(kasse);
  [s, d] = await api.getJ("/api/admin/members");
  ck("kassenwart sieht alle Mitglieder", s === 200 && d.items.length >= 2);
  ck("kassenwart canViewFinance + IBAN sichtbar", d.canViewFinance === true && d.items.some((m) => m.iban && /^DE89/.test(m.iban)));
  ck("kassenwart Haushalts-Summen vorhanden", Array.isArray(d.households) && d.households.some((h) => h.effectiveTotal > 0));
  [s, d] = await api.postJ("/api/news", { title: "Hack", date: "2026-01-01", excerpt: "xxxxxxxxxx" });
  ck("kassenwart darf KEINE News (403)", s === 403);

  const trainer = api.email("trainer");
  const tId = await api.newUser("Tom Trainer", trainer);
  await api.asAdmin();
  await api.post("/api/users/roles", { userId: tId, roles: ["trainer"] });
  await api.login(trainer);
  [s, d] = await api.getJ("/api/admin/members");
  ck("trainer sieht Mitglieder ohne Finanz", s === 200 && d.canViewFinance === false && d.items.every((m) => m.iban === undefined) && d.households === null);

  const nina = api.email("nina");
  await api.newUser("Nina Normal", nina);
  await api.login(nina);
  [s, d] = await api.getJ("/api/admin/members");
  ck("member ohne Recht -> 403", s === 403);
}
