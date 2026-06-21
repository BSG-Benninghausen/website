export const name = "Benutzerverwaltung (Liste, Status sperren, Löschen)";

/* Login-Konten (Benutzer) – getrennt von den Mitgliedschafts-Datensätzen.
   Recht: manage_users. Geprüft: angereicherte Liste, Sperren/Entsperren (mit
   Login-Verweigerung), Löschen inkl. Schutzregeln (eigenes Konto, letzter
   Administrator, offene Mitgliedschaften). */
export default async function run(api, ck) {
  // ---- GET /api/users: Zugriffsschutz ----
  await api.logout();
  let [s, d] = await api.getJ("/api/users");
  ck("GET /api/users ausgeloggt -> 401", s === 401);

  const nina = api.email("nina");
  const ninaId = await api.newUser("Nina Normal", nina); // Rolle: member
  [s, d] = await api.getJ("/api/users");
  ck("GET /api/users als Mitglied -> 403", s === 403);

  // ---- Admin: angereicherte Liste ----
  await api.asAdmin();
  [s, d] = await api.getJ("/api/users");
  ck("GET /api/users als Admin -> 200", s === 200 && Array.isArray(d.items) && d.items.length > 1);
  const adminRow = d.items.find((u) => (u.roles || []).includes("admin"));
  ck("Admin-Zeile: isSelf + active + Zusatzfelder", !!adminRow && adminRow.isSelf === true && adminRow.active === true && typeof adminRow.membershipCount === "number" && "createdAt" in adminRow);
  ck("Haushalts-Benutzer hat membershipCount > 0", d.items.some((u) => u.membershipCount > 0));
  const ninaRow = d.items.find((u) => u.id === ninaId);
  ck("frischer Benutzer: aktiv, 0 Mitgliedschaften, nicht self", !!ninaRow && ninaRow.active === true && ninaRow.membershipCount === 0 && ninaRow.isSelf === false);
  ck("activeMembershipCount: Zahl, frisch 0, <= membershipCount", typeof ninaRow.activeMembershipCount === "number" && ninaRow.activeMembershipCount === 0 && ninaRow.activeMembershipCount <= ninaRow.membershipCount);
  ck("Haushalts-Benutzer hat activeMembershipCount > 0", d.items.some((u) => u.activeMembershipCount > 0));
  // ownerId auf Mitglieds-Zeilen (Join-Schlüssel für die verschachtelte Ansicht)
  let [ms, md] = await api.getJ("/api/admin/members");
  ck("GET /api/admin/members: jede Zeile hat ownerId == User", ms === 200 && md.items.length > 0 && md.items.every((m) => typeof m.ownerId === "string" && m.ownerId) && d.items.some((u) => u.id === md.items[0].ownerId));

  // ---- Status (sperren/entsperren): Zugriffsschutz ----
  await api.logout();
  [s, d] = await api.postJ("/api/users/status", { userId: ninaId, active: false });
  ck("status ausgeloggt -> 401", s === 401);
  await api.login(nina);
  [s, d] = await api.postJ("/api/users/status", { userId: ninaId, active: false });
  ck("status als Mitglied -> 403", s === 403);

  // ---- Admin: Validierung + Schutzregeln ----
  await api.asAdmin();
  [s, d] = await api.postJ("/api/users/status", { userId: ninaId, active: "nein" });
  ck("status nicht-boolesch -> 422", s === 422 && d.errors && d.errors.active);
  [s, d] = await api.postJ("/api/users/status", { userId: "gibt-es-nicht", active: false });
  ck("status unbekannt -> 404", s === 404);
  [s, d] = await api.postJ("/api/users/status", { userId: "usr-admin", active: false });
  ck("eigenes Konto deaktivieren -> 409", s === 409);

  // ---- Mitglied deaktivieren -> Login verweigert ----
  await api.logout();
  const codeRes = await (await api.post("/api/auth/request-code", { email: nina })).json();
  const ninaCode = codeRes.devCode; // Code im noch aktiven Zustand geholt
  await api.asAdmin();
  [s, d] = await api.postJ("/api/users/status", { userId: ninaId, active: false });
  ck("Mitglied deaktivieren -> ok", s === 200 && d.user.active === false);
  await api.logout();
  [s, d] = await api.postJ("/api/auth/login", { email: nina, code: ninaCode });
  ck("Login mit gültigem Code, Konto deaktiviert -> 403", s === 403);
  [s, d] = await api.postJ("/api/auth/request-code", { email: nina });
  ck("request-code für deaktiviertes Konto -> 403", s === 403);

  // ---- Reaktivieren -> Login geht wieder ----
  await api.asAdmin();
  [s, d] = await api.postJ("/api/users/status", { userId: ninaId, active: true });
  ck("reaktivieren -> ok", s === 200 && d.user.active === true);
  const loginAgain = await api.login(nina);
  ck("Login nach Reaktivierung -> ok", loginAgain.status === 200);

  // ---- Letzter Administrator geschützt (Verwalter mit manage_users, kein admin) ----
  const willy = api.email("willy");
  const willyId = await api.newUser("Willy Vorstand", willy);
  await api.asAdmin();
  await api.post("/api/users/roles", { userId: willyId, roles: ["vorstand"] }); // vorstand hat manage_users
  await api.login(willy);
  [s, d] = await api.getJ("/api/users");
  ck("Verwalter (manage_users) darf Liste lesen", s === 200);
  [s, d] = await api.postJ("/api/users/status", { userId: "usr-admin", active: false });
  ck("letzten aktiven Admin deaktivieren -> 409", s === 409);
  [s, d] = await api.postJ("/api/users/delete", { userId: "usr-admin" });
  ck("letzten Admin löschen -> 409", s === 409);

  // ---- Löschen: Zugriffsschutz + Schutzregeln ----
  await api.login(nina);
  [s, d] = await api.postJ("/api/users/delete", { userId: willyId });
  ck("delete als Mitglied -> 403", s === 403);

  await api.asAdmin();
  [s, d] = await api.postJ("/api/users/delete", { userId: "gibt-es-nicht" });
  ck("delete unbekannt -> 404", s === 404);
  [s, d] = await api.postJ("/api/users/delete", { userId: "usr-admin" });
  ck("eigenes Konto löschen -> 409", s === 409);
  const haus = (await api.getJ("/api/users"))[1].items.find((u) => u.membershipCount > 0);
  [s, d] = await api.postJ("/api/users/delete", { userId: haus.id });
  ck("Benutzer mit Mitgliedschaften löschen -> 409", s === 409);

  // ---- Löschen erfolgreich (Benutzer ohne Mitgliedschaften) ----
  [s, d] = await api.postJ("/api/users/delete", { userId: willyId });
  ck("Benutzer ohne Mitgliedschaften löschen -> ok", s === 200 && d.ok);
  [s, d] = await api.getJ("/api/users");
  ck("gelöschter Benutzer fehlt in Liste", !d.items.some((u) => u.id === willyId));
}
