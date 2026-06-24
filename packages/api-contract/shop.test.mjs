import { PHOTO, IBAN } from "./harness.mjs";

export const name = "Webshop (Produkte, Tier-Preise, Mitglieder-Checkout, Mandat)";

export default async function run(api, ck) {
  /* ----- Berechtigung & Rolle (Rechtstrennung) ----- */
  await api.asAdmin();
  let [s, d] = await api.getJ("/api/permissions");
  ck("17 Berechtigungen inkl. manage_shop", d.items.length === 17 && d.items.some((p) => p.key === "manage_shop"));
  [s, d] = await api.getJ("/api/roles");
  const vorstand = d.items.find((r) => r.id === "vorstand");
  const shopRole = d.items.find((r) => r.id === "shop");
  ck("Vorstand hat KEIN manage_shop (Shop = Privatperson)", !!vorstand && !vorstand.permissions.includes("manage_shop"));
  ck("Rolle 'shop' existiert mit manage_shop", !!shopRole && shopRole.permissions.includes("manage_shop"));

  /* ----- Zugriff: Config öffentlich, Katalog nur eingeloggt (Store hinter Login) ----- */
  await api.logout();
  [s, d] = await api.getJ("/api/shop-config");
  ck("GET /api/shop-config öffentlich, default aus", s === 200 && Array.isArray(d.fields) && d.values.enabled === false);
  [s, d] = await api.getJ("/api/shop/products");
  ck("GET /api/shop/products anonym -> 401 (Store hinter Login)", s === 401);

  /* ----- Schreibschutz ----- */
  [s, d] = await api.postJ("/api/shop/products", { name: "Anon" });
  ck("anonym schreibt -> 401", s === 401);

  const nina = api.email("nina");
  await api.newUser("Nina Normal", nina); // eingeloggt, aber kein Mitglied
  [s, d] = await api.getJ("/api/shop/products");
  const seedCount = d.items.length;
  ck("eingeloggtes Nicht-Mitglied sieht Katalog (Externen-Tarif)", s === 200 && seedCount > 0 && d.tier === "extern");
  const gi = d.items.find((p) => p.id === "prod-gi");
  ck("Externer sieht Externen-Preis", gi && gi.yourTier === "extern" && gi.yourPrice === 49.9);
  ck("Förderpreis wird Nicht-Verwaltung NICHT offengelegt", gi && gi.prices.gesponsert === undefined);
  [s, d] = await api.postJ("/api/shop/products", { name: "Hack", prices: { extern: 5, mitglied: 4 } });
  ck("Nicht-Betreiber -> 403", s === 403);
  [s, d] = await api.postJ("/api/shop-config", { values: { enabled: true } });
  ck("Nicht-Betreiber darf Config nicht ändern (403)", s === 403);

  /* ----- Julian (Rolle shop) verwaltet Produkte ----- */
  const julian = api.email("julian");
  const julianId = await api.newUser("Julian Becker", julian);
  await api.asAdmin();
  await api.post("/api/users/roles", { userId: julianId, roles: ["shop"] });
  await api.login(julian);

  [s, d] = await api.postJ("/api/shop/products", { name: "X", prices: { extern: 5, mitglied: 4 } });
  ck("Name zu kurz -> 422", s === 422 && d.errors && d.errors.name);
  [s, d] = await api.postJ("/api/shop/products", { name: "Testgürtel", prices: { extern: 12 } });
  ck("fehlender Mitglieder-Preis -> 422", s === 422 && d.errors && d.errors.mitglied);
  [s, d] = await api.postJ("/api/shop/products", { name: "Wettkampf-Gi", category: "gi", prices: { extern: 89.9, mitglied: 74.9, gesponsert: 44.9 }, image: PHOTO });
  ck("Produkt angelegt (201)", s === 201 && d.item.prices.gesponsert === 44.9 && d.item.image === PHOTO);
  [s, d] = await api.getJ("/api/shop/products");
  ck("Betreiber sieht Förderpreis + neues Produkt", d.items.length === seedCount + 1 && d.items.some((p) => p.prices.gesponsert != null));

  /* ----- Mitglied: Tier wechselt auf mitglied ----- */
  const mara = api.email("mara");
  await api.newUser("Mara Mitglied", mara);
  await api.setHousehold(IBAN);
  [s, d] = await api.postJ("/api/memberships", { firstName: "Mara", lastName: "Mitglied", birthdate: "1990-05-05", photo: PHOTO });
  ck("Mitgliedschaft angelegt (201)", s === 201);
  [s, d] = await api.getJ("/api/shop/products");
  const giM = d.items.find((p) => p.id === "prod-gi");
  ck("Mitglied sieht Mitglieder-Preis", d.tier === "mitglied" && giM.yourPrice === 39.9);

  /* ----- Mitglieder-Checkout: Mandat + Bestellung ----- */
  [s, d] = await api.postJ("/api/shop/orders", { items: [{ productId: "prod-gi", qty: 1 }], consent: true });
  ck("Bestellung ohne Mandat -> 409", s === 409 && d.code === "NO_MANDATE");
  [s, d] = await api.postJ("/api/shop/mandate", { consent: false, bankConsent: true });
  ck("Mandat ohne SEPA-Zustimmung -> 422", s === 422 && d.errors && d.errors.consent);
  [s, d] = await api.postJ("/api/shop/mandate", { consent: true });
  ck("Mandat ohne Bankdaten-Zustimmung -> 422", s === 422 && d.errors && d.errors.bankConsent);
  [s, d] = await api.postJ("/api/shop/mandate", { consent: true, bankConsent: true });
  ck("Mandat erteilt (201) inkl. Bankdaten-Zustimmung", s === 201 && /^DE/.test(d.mandate.iban) && d.mandate.status === "aktiv" && !!d.mandate.bankConsentAt);
  [s, d] = await api.getJ("/api/shop/mandate");
  ck("Mandat abrufbar", d.mandate && d.mandate.status === "aktiv");

  [s, d] = await api.postJ("/api/shop/orders", { items: [], consent: true });
  ck("leere Bestellung -> 422", s === 422 && d.errors && d.errors.items);
  [s, d] = await api.postJ("/api/shop/orders", { items: [{ productId: "prod-gi", qty: 2, unitPrice: 0.01 }], consent: true });
  ck("Bestellung 201, Preis serverseitig (Client-Preis ignoriert)", s === 201 && d.order.items[0].unitPrice === 39.9 && d.order.total === 79.8 && d.order.status === "mandat_erteilt");
  const orderId = d.order.id;
  [s, d] = await api.getJ("/api/shop/orders");
  ck("Mitglied sieht eigene Bestellung", d.items.some((o) => o.id === orderId));

  /* ----- Förder-Status (gesponserte Einzelperson) ----- */
  const maraId = (await api.me()).user.id;
  await api.login(julian);
  [s, d] = await api.postJ("/api/shop/sponsored", { userId: maraId, sponsored: true });
  ck("Förder-Status gesetzt (per userId)", s === 200 && d.user.shopSponsored === true);
  [s, d] = await api.postJ("/api/shop/sponsored", { email: nina, sponsored: true });
  ck("Förder-Status per E-Mail setzbar", s === 200 && d.user.shopSponsored === true);
  [s, d] = await api.postJ("/api/shop/sponsored", { email: "niemand-" + Date.now() + "@example.com", sponsored: true });
  ck("unbekannte E-Mail -> 404", s === 404);
  await api.postJ("/api/shop/sponsored", { email: nina, sponsored: false }); // zurücksetzen
  await api.login(mara);
  [s, d] = await api.getJ("/api/shop/products");
  const giG = d.items.find((p) => p.id === "prod-gi");
  const shirtG = d.items.find((p) => p.id === "prod-shirt");
  ck("Gesponserte sieht Förderpreis", d.tier === "gesponsert" && giG.yourPrice === 19.9);
  ck("ohne Förderpreis -> Fallback Mitglieder-Preis", shirtG && shirtG.yourPrice === 14);

  /* ----- Externe / Nicht-Mitglieder: kein Online-Checkout ----- */
  await api.login(nina);
  [s, d] = await api.getJ("/api/shop/products");
  ck("Nicht-Mitglied sieht Externen-Preis", d.tier === "extern");
  [s, d] = await api.postJ("/api/shop/mandate", { consent: true });
  ck("Nicht-Mitglied: kein Mandat (403)", s === 403);
  [s, d] = await api.postJ("/api/shop/orders", { items: [{ productId: "prod-gi", qty: 1 }], consent: true });
  ck("Nicht-Mitglied: kein Checkout (403)", s === 403);

  /* ----- Betreiber: Bestellübersicht & Status ----- */
  [s, d] = await api.getJ("/api/shop/admin/orders");
  ck("Nicht-Betreiber darf Admin-Bestellungen nicht sehen (403)", s === 403);
  await api.login(julian);
  [s, d] = await api.getJ("/api/shop/admin/orders");
  ck("Betreiber sieht alle Bestellungen inkl. Besitzer", s === 200 && d.items.some((o) => o.id === orderId && o.ownerName));
  [s, d] = await api.postJ("/api/shop/orders/status", { id: orderId, status: "quatsch" });
  ck("ungültiger Status -> 422", s === 422);
  [s, d] = await api.postJ("/api/shop/orders/status", { id: orderId, status: "versendet" });
  ck("Status aktualisiert (200)", s === 200 && d.order.status === "versendet");

  /* ----- Betreiber: Konfiguration (Betreiber-IBAN validiert) ----- */
  [s, d] = await api.postJ("/api/shop-config", { values: { enabled: true, operatorName: "Julian Becker", operatorIban: "DE00 0000", creditorId: "DE98ZZZ09999999999" } });
  ck("Config gespeichert, ungültige IBAN verworfen", s === 200 && d.values.enabled === true && d.values.operatorIban === "" && d.values.creditorId === "DE98ZZZ09999999999");
  [s, d] = await api.postJ("/api/shop-config", { values: { enabled: true, operatorName: "Julian Becker", operatorIban: IBAN } });
  ck("gültige Betreiber-IBAN übernommen", /^DE/.test(d.values.operatorIban));
  // Betreiber (manage_shop) sieht die vollständige Config inkl. Bankdaten.
  [s, d] = await api.getJ("/api/shop-config");
  ck("Betreiber-GET enthält Bankdaten", /^DE/.test(d.values.operatorIban) && "creditorId" in d.values);
  // Öffentliche GET liefert KEINE sensiblen Betreiber-Bankdaten.
  await api.logout();
  [s, d] = await api.getJ("/api/shop-config");
  ck("öffentliche Config ohne Bankdaten (IBAN/Gläubiger-ID)", d.values.enabled === true && d.values.operatorName === "Julian Becker" && d.values.operatorIban === undefined && d.values.creditorId === undefined);
}
