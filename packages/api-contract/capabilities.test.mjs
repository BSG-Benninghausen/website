export const name = "Feature-Gating & Beta-Freigabe (capabilities)";

/* Prüft das Zwei-Achsen-Modell:
   - Reifegrad (status: stable|beta) aus dem Feature-Katalog,
   - Freigabe-Scope (public|off|{roles}) vom Superadmin (manage_features).
   /api/capabilities antwortet nutzer-spezifisch; /api/features verwaltet die Freigabe. */
export default async function run(api, ck) {
  /* 1. Defaults, ausgeloggt: nur öffentliche (stable) Features sichtbar */
  await api.logout();
  let [s, d] = await api.getJ("/api/capabilities");
  ck("capabilities öffentlich -> 200", s === 200 && d.ok);
  ck("payouts (stable/public) sichtbar", !!d.features.payouts && d.features.payouts.public === true && d.features.payouts.status === "stable");
  ck("tournaments (stable/public) sichtbar", !!d.features.tournaments && d.features.tournaments.public === true);
  ck("demofeature (beta/off) ausgeblendet", !d.features.demofeature);

  /* 2. Verwaltung nur mit manage_features */
  [s, d] = await api.getJ("/api/features");
  ck("features-Verwaltung ausgeloggt -> 401", s === 401);
  const memberEmail = api.email("capmember");
  const memberId = await api.newUser("Cap Member", memberEmail); // eingeloggt als Mitglied
  [s, d] = await api.getJ("/api/features");
  ck("features-Verwaltung als Mitglied -> 403", s === 403);
  [s, d] = await api.postJ("/api/features/release", { key: "demofeature", release: "public" });
  ck("release als Mitglied -> 403", s === 403);

  /* 3. Admin: Vorschau (off-Feature) + Verwaltung */
  await api.asAdmin();
  [s, d] = await api.getJ("/api/capabilities");
  ck("Admin sieht demofeature als Vorschau", !!d.features.demofeature && d.features.demofeature.public === false && d.features.demofeature.status === "beta");
  [s, d] = await api.getJ("/api/features");
  ck("features-Katalog: 3 Einträge", s === 200 && d.items.length === 3);
  ck("features liefert Rollen-Auswahl", Array.isArray(d.roles) && d.roles.some((r) => r.id === "trainer"));
  ck("demofeature Default-Scope = off", d.items.find((f) => f.key === "demofeature").scope === "off");

  /* 4. Interne Beta: an Rolle „trainer" freigeben */
  [s, d] = await api.postJ("/api/features/release", { key: "demofeature", release: ["trainer"] });
  ck("Freigabe an Rolle trainer -> ok", s === 200 && d.scope && Array.isArray(d.scope.roles) && d.scope.roles.includes("trainer"));

  // Mitglied OHNE trainer-Rolle: unsichtbar
  await api.login(memberEmail);
  [s, d] = await api.getJ("/api/capabilities");
  ck("Mitglied ohne Rolle sieht interne Beta nicht", !d.features.demofeature);

  // Mitglied MIT trainer-Rolle: sichtbar, aber als intern (public:false)
  await api.asAdmin();
  await api.post("/api/users/roles", { userId: memberId, roles: ["trainer"] });
  await api.login(memberEmail);
  [s, d] = await api.getJ("/api/capabilities");
  ck("Mitglied mit trainer-Rolle sieht interne Beta", !!d.features.demofeature && d.features.demofeature.public === false && d.features.demofeature.status === "beta");

  /* 5. Öffentliche Beta: an alle -> ausgeloggt sichtbar (mit Beta-Status) */
  await api.asAdmin();
  await api.post("/api/features/release", { key: "demofeature", release: "public" });
  await api.logout();
  [s, d] = await api.getJ("/api/capabilities");
  ck("öffentliche Beta ausgeloggt sichtbar", !!d.features.demofeature && d.features.demofeature.public === true && d.features.demofeature.status === "beta");

  /* 6. Wieder abschalten */
  await api.asAdmin();
  await api.post("/api/features/release", { key: "demofeature", release: "off" });
  await api.logout();
  [s, d] = await api.getJ("/api/capabilities");
  ck("abgeschaltet -> wieder unsichtbar", !d.features.demofeature);

  /* 7. Validierung */
  await api.asAdmin();
  [s, d] = await api.postJ("/api/features/release", { key: "gibt-es-nicht", release: "public" });
  ck("unbekanntes Feature -> 404", s === 404);
  [s, d] = await api.postJ("/api/features/release", { key: "payouts", release: "quatsch" });
  ck("ungültige Freigabe -> 422", s === 422 && d.errors && d.errors.release);
}
