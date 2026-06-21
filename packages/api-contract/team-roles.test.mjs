import { PHOTO } from "./harness.mjs";

export const name = "Vereinsämter (positions) getrennt von Berechtigungs-Rollen";

export default async function run(api, ck) {
  await api.asAdmin();
  let [s, d] = await api.getJ("/api/permissions");
  ck("16 Rechte inkl. manage_team", d.items.length === 16 && d.items.some((p) => p.key === "manage_team"));

  // Rollen sind reine Rechte-Objekte (keine Team-Felder mehr)
  [s, d] = await api.getJ("/api/roles");
  const role = (id) => d.items.find((r) => r.id === id);
  ck("Rollen ohne Team-Felder", d.items.every((r) => !("teamGroup" in r) && !("teamLabel" in r) && !("teamOrder" in r)));
  ck("vorstand hat manage_team", role("vorstand") && role("vorstand").permissions.includes("manage_team"));
  ck("schriftfuehrer (rechtelos) entfernt", !role("schriftfuehrer"));

  // POST /api/roles ignoriert Team-Felder still
  [s, d] = await api.postJ("/api/roles", { label: "Jugendwart", permissions: [], teamGroup: "vorstand", teamOrder: "25" });
  ck("Rolle angelegt, Team-Felder ignoriert", s === 201 && d.role.teamGroup === undefined && d.role.teamOrder === undefined);
  await api.post("/api/roles/delete", { id: d.role.id });

  // Die alte Schreib-Route auf /api/team existiert nicht
  [s, d] = await api.postJ("/api/team", { name: "X", group: "vorstand" });
  ck("POST /api/team -> 404 (keine Route)", s === 404);

  // Gating: GET /api/positions nur mit manage_team
  await api.logout();
  [s, d] = await api.getJ("/api/positions");
  ck("positions ausgeloggt -> 401", s === 401);
  const nobody = api.email("nobody");
  await api.newUser("Niemand Neu", nobody); // eingeloggt als einfaches Mitglied
  [s, d] = await api.getJ("/api/positions");
  ck("positions als Mitglied -> 403", s === 403);

  // Tina mit Foto, Kurt ohne Foto anlegen
  const tina = api.email("tina");
  const uId = await api.newUser("Tina Trainer", tina);
  [s, d] = await api.postJ("/api/account/update", { photo: PHOTO });
  ck("Foto gespeichert", d.ok && d.user.photo === PHOTO);
  [s, d] = await api.postJ("/api/account/update", { photo: "kaputt" });
  ck("ungültiges Foto -> 422", s === 422 && d.errors.photo);
  [s, d] = await api.postJ("/api/account/update", { photo: "" });
  ck("leeres Foto löscht", d.ok && d.user.photo === "");
  await api.post("/api/account/update", { photo: PHOTO });

  const kurt = api.email("kurt");
  const kId = await api.newUser("Kurt Kasse", kurt);

  // Ämter als Admin vergeben
  await api.asAdmin();
  [s, d] = await api.postJ("/api/positions", { userId: uId, group: "trainer", label: "Trainer", order: "0" });
  ck("Amt Tina angelegt -> 201", s === 201 && !!d.position.id);
  const tinaPos = d.position.id;
  [s, d] = await api.postJ("/api/positions", { userId: kId, group: "vorstand", label: "Kassenwart", order: "30" });
  ck("Amt Kurt angelegt -> 201", s === 201 && !!d.position.id);
  const kurtPos = d.position.id;

  // GET /api/positions: aufgelöste Namen + Mitglieder-Picker (selbst-ausreichend unter manage_team)
  [s, d] = await api.getJ("/api/positions");
  ck("positions mit aufgelösten Namen", d.items.some((p) => p.name === "Tina Trainer") && d.items.some((p) => p.name === "Kurt Kasse"));
  ck("positions liefert Mitglieder-Picker", Array.isArray(d.users) && d.users.length > 0 && d.users.some((u) => u.id === uId));

  // Öffentliche Team-Seite wird aus Ämtern × Nutzern berechnet
  await api.logout();
  [s, d] = await api.getJ("/api/team");
  ck("GET /api/team öffentlich", s === 200);
  const tinaEntry = d.items.find((m) => m.name === "Tina Trainer");
  const kurtEntry = d.items.find((m) => m.name === "Kurt Kasse");
  ck("Tina als Trainer mit Foto", tinaEntry && tinaEntry.group === "trainer" && tinaEntry.label === "Trainer" && tinaEntry.photo === PHOTO);
  ck("Kurt als Vorstand/Kassenwart ohne Foto", kurtEntry && kurtEntry.group === "vorstand" && kurtEntry.label === "Kassenwart" && kurtEntry.photo === "");

  // Update: Label ändern, ungültige group -> "", Validierungen
  await api.asAdmin();
  [s, d] = await api.postJ("/api/positions/update", { id: kurtPos, label: "Schatzmeister" });
  ck("Amt-Label aktualisiert", d.ok && d.position.label === "Schatzmeister");
  [s, d] = await api.postJ("/api/positions/update", { id: kurtPos, group: "quatsch" });
  ck("ungültige group -> leer", d.ok && d.position.group === "");
  // Contract: Ämter mit ungültiger/leerer group erscheinen NICHT in /api/team
  [s, d] = await api.getJ("/api/team");
  ck("ungültige group nicht in /api/team", !d.items.some((m) => m.name === "Kurt Kasse"));
  await api.post("/api/positions/update", { id: kurtPos, group: "vorstand" });
  [s, d] = await api.postJ("/api/positions", { userId: "gibt-es-nicht", label: "X" });
  ck("Amt ohne gültigen Nutzer -> 422", s === 422 && d.errors.userId);
  [s, d] = await api.postJ("/api/positions", { userId: uId, label: "" });
  ck("Amt ohne Funktionsnamen -> 422", s === 422 && d.errors.label);

  await api.logout();
  [s, d] = await api.getJ("/api/team");
  ck("Override Schatzmeister sichtbar", d.items.some((m) => m.name === "Kurt Kasse" && m.label === "Schatzmeister"));

  // Delete: Tinas Amt entfernen -> aus Team verschwunden
  await api.asAdmin();
  [s, d] = await api.postJ("/api/positions/delete", { id: tinaPos });
  ck("Amt gelöscht", d.ok);
  [s, d] = await api.postJ("/api/positions/delete", { id: "fehlt-xyz" });
  ck("Löschen unbekanntes Amt -> 404", s === 404);
  await api.logout();
  [s, d] = await api.getJ("/api/team");
  ck("Tina nicht mehr im Team", !d.items.some((m) => m.name === "Tina Trainer"));

  // Aufräumen (Idempotenz gegen ein persistentes Backend)
  await api.asAdmin();
  await api.post("/api/positions/delete", { id: kurtPos });
}
