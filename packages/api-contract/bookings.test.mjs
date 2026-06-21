export const name = "Feature-Buchung / Provisionierung (bookings)";

/* Dritte Achse über dem Feature-Gating: Buchung (gebucht/provisioniert pro Mandant,
   Recht book_features). /api/capabilities filtert künftig gebucht × freigegeben.
   Default ist „alles gebucht", daher ändert sich ohne Entbuchen nichts. */
export default async function run(api, ck) {
  // Verwaltung nur mit book_features
  await api.logout();
  let [s, d] = await api.getJ("/api/bookings");
  ck("GET /api/bookings ausgeloggt -> 401", s === 401);
  const member = api.email("bookmember");
  const memberId = await api.newUser("Book Member", member);
  [s, d] = await api.getJ("/api/bookings");
  ck("GET /api/bookings als Mitglied -> 403", s === 403);
  [s, d] = await api.postJ("/api/features/book", { key: "payouts", booked: false });
  ck("book als Mitglied -> 403", s === 403);

  // Admin: alle Features standardmäßig gebucht
  await api.asAdmin();
  [s, d] = await api.getJ("/api/bookings");
  ck("Admin sieht Buchungs-Katalog (3, alle gebucht)", s === 200 && d.items.length === 3 && d.items.every((f) => f.booked === true));

  // Entbuchen versteckt das Feature in capabilities – trotz stable/public
  [s, d] = await api.postJ("/api/features/book", { key: "payouts", booked: false });
  ck("payouts entbuchen ok", s === 200 && d.booked === false);
  await api.logout();
  [s, d] = await api.getJ("/api/capabilities");
  ck("entbuchtes payouts fehlt in capabilities", !d.features.payouts && !!d.features.tournaments);

  // Wieder buchen -> wieder sichtbar
  await api.asAdmin();
  await api.postJ("/api/features/book", { key: "payouts", booked: true });
  await api.logout();
  [s, d] = await api.getJ("/api/capabilities");
  ck("rebuchtes payouts wieder sichtbar", !!d.features.payouts);

  // Buchung schlägt Freigabe: demofeature public freigeben, aber entbuchen -> unsichtbar
  await api.asAdmin();
  await api.post("/api/features/release", { key: "demofeature", release: "public" });
  await api.postJ("/api/features/book", { key: "demofeature", booked: false });
  await api.logout();
  [s, d] = await api.getJ("/api/capabilities");
  ck("nicht gebucht schlägt öffentliche Freigabe", !d.features.demofeature);

  // Recht via Migration v9: vorstand darf buchen
  const vera = api.email("verabook");
  const vId = await api.newUser("Vera Vorstand", vera);
  await api.asAdmin();
  await api.post("/api/users/roles", { userId: vId, roles: ["vorstand"] });
  await api.login(vera);
  [s, d] = await api.getJ("/api/bookings");
  ck("vorstand (book_features) darf Buchungen lesen", s === 200 && d.items.length === 3);
  [s, d] = await api.postJ("/api/features/book", { key: "tournaments", booked: false });
  ck("vorstand darf buchen/entbuchen", s === 200 && d.booked === false);

  // Validierung
  await api.asAdmin();
  [s, d] = await api.postJ("/api/features/book", { key: "gibt-es-nicht", booked: true });
  ck("unbekanntes Feature -> 404", s === 404);
  [s, d] = await api.postJ("/api/features/book", { key: "payouts", booked: "ja" });
  ck("nicht-boolesche Buchung -> 422", s === 422 && d.errors && d.errors.booked);
}
