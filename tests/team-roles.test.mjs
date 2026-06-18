import { PHOTO } from "./harness.mjs";

export const name = "Team/Vorstand aus Rollen + Benutzerfoto";

export default async function run(api, ck) {
  await api.asAdmin();
  let [s, d] = await api.getJ("/api/permissions");
  ck("10 Rechte, kein manage_team", d.items.length === 10 && !d.items.some((p) => p.key === "manage_team"));
  [s, d] = await api.getJ("/api/roles");
  const role = (id) => d.items.find((r) => r.id === id);
  ck("trainer teamGroup=trainer", role("trainer").teamGroup === "trainer");
  ck("kassenwart teamGroup=vorstand", role("kassenwart").teamGroup === "vorstand");
  ck("Board-Rollen geseedet (vorsitz1 vorstand)", role("vorsitz1") && role("vorsitz1").teamGroup === "vorstand");
  ck("keine Rolle hat manage_team", d.items.every((r) => !(r.permissions || []).includes("manage_team")));

  [s, d] = await api.postJ("/api/team", { name: "X", role: "Y", group: "vorstand" });
  ck("POST /api/team -> 404 (Route entfernt)", s === 404);

  const tina = api.email("tina");
  const uId = await api.newUser("Tina Trainer", tina);
  await api.login(tina);
  [s, d] = await api.postJ("/api/account/update", { photo: PHOTO });
  ck("Foto gespeichert", d.ok && d.user.photo === PHOTO);
  [s, d] = await api.getJ("/api/auth/me");
  ck("me liefert photo", d.user.photo === PHOTO);
  [s, d] = await api.postJ("/api/account/update", { photo: "kaputt" });
  ck("ungültiges Foto -> 422", s === 422 && d.errors.photo);
  [s, d] = await api.postJ("/api/account/update", { photo: "" });
  ck("leeres Foto löscht", d.ok && d.user.photo === "");
  await api.post("/api/account/update", { photo: PHOTO });

  const kurt = api.email("kurt");
  const kId = await api.newUser("Kurt Kasse", kurt);
  await api.asAdmin();
  await api.post("/api/users/roles", { userId: uId, roles: ["trainer"] });
  await api.post("/api/users/roles", { userId: kId, roles: ["kassenwart"] });
  await api.logout();
  [s, d] = await api.getJ("/api/team");
  ck("GET /api/team öffentlich", s === 200);
  const tinaEntry = d.items.find((m) => m.name === "Tina Trainer");
  const kurtEntry = d.items.find((m) => m.name === "Kurt Kasse");
  ck("Tina als Trainer (group trainer, label Trainer)", tinaEntry && tinaEntry.group === "trainer" && tinaEntry.label === "Trainer");
  ck("Tina mit Foto", tinaEntry && tinaEntry.photo === PHOTO);
  ck("Kurt als Vorstand, Label Kassenwart", kurtEntry && kurtEntry.group === "vorstand" && kurtEntry.label === "Kassenwart");
  ck("Kurt ohne Foto -> leer", kurtEntry && kurtEntry.photo === "");

  await api.asAdmin();
  [s, d] = await api.postJ("/api/roles/update", { id: "kassenwart", teamLabel: "Schatzmeister" });
  ck("teamLabel override gespeichert", d.ok && d.role.teamLabel === "Schatzmeister");
  [s, d] = await api.postJ("/api/roles/update", { id: "kassenwart", teamGroup: "quatsch" });
  ck("ungültige teamGroup -> leer", d.ok && d.role.teamGroup === "");
  await api.post("/api/roles/update", { id: "kassenwart", teamGroup: "vorstand" });
  await api.logout();
  [s, d] = await api.getJ("/api/team");
  ck("Override Schatzmeister sichtbar", d.items.some((m) => m.name === "Kurt Kasse" && m.label === "Schatzmeister"));

  await api.asAdmin();
  [s, d] = await api.postJ("/api/roles", { label: "Jugendwart", permissions: [], teamGroup: "vorstand", teamOrder: "25" });
  ck("Rolle mit teamGroup/teamOrder angelegt", s === 201 && d.role.teamGroup === "vorstand" && d.role.teamOrder === 25);

  // Aufräumen (Idempotenz gegen ein persistentes Backend): teamLabel-Override zurücknehmen
  await api.post("/api/roles/update", { id: "kassenwart", teamLabel: "", teamGroup: "vorstand" });
}
