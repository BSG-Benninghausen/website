export const name = "Vorstandsämter exklusiv (eine Person pro Posten)";

/* Vorstandsposten (group "vorstand") sind exklusiv: pro Amt/Label nur eine
   Person. Trainer-Ämter bleiben mehrfach belegbar. Recht: manage_team. */
export default async function run(api, ck) {
  await api.asAdmin();

  // Seed enthält bereits "Kassenwart" (vorstand) -> erneute Vergabe scheitert.
  let [s, d] = await api.postJ("/api/positions", { userId: "usr-demo-haus1", group: "vorstand", label: "Kassenwart" });
  ck("vorstand-Amt aus Seed erneut vergeben -> 409", s === 409 && d.errors && d.errors.label);

  // Neues vorstand-Amt anlegen
  [s, d] = await api.postJ("/api/positions", { userId: "usr-demo-haus1", group: "vorstand", label: "Beisitzer", order: 50 });
  ck("neues vorstand-Amt anlegen -> 201", s === 201 && d.position && d.position.group === "vorstand");
  const beisitzerId = d.position.id;

  // Zweite Person für dasselbe Amt -> 409
  [s, d] = await api.postJ("/api/positions", { userId: "usr-demo-haus2", group: "vorstand", label: "Beisitzer" });
  ck("zweite Person für dasselbe vorstand-Amt -> 409", s === 409 && d.errors && d.errors.label);

  // Dieselbe Zeile auf eine andere Person verschieben -> 200 (Re-Assign erlaubt)
  [s, d] = await api.postJ("/api/positions/update", { id: beisitzerId, userId: "usr-demo-haus2" });
  ck("Amt auf andere Person verschieben -> 200", s === 200 && d.position.userId === "usr-demo-haus2" && d.position.label === "Beisitzer");

  // trainer-Gruppe ist NICHT exklusiv: zwei gleichnamige Ämter sind erlaubt
  [s, d] = await api.postJ("/api/positions", { userId: "usr-demo-haus1", group: "trainer", label: "Übungsleiter" });
  ck("trainer-Amt 1 -> 201", s === 201);
  const t1 = d.position.id;
  [s, d] = await api.postJ("/api/positions", { userId: "usr-demo-haus2", group: "trainer", label: "Übungsleiter" });
  ck("trainer-Amt 2 (gleicher Name) -> 201 (nicht exklusiv)", s === 201);
  const t2 = d.position.id;

  // Aufräumen
  for (const id of [beisitzerId, t1, t2]) await api.postJ("/api/positions/delete", { id });
  [s, d] = await api.postJ("/api/positions/delete", { id: beisitzerId });
  ck("Delete nach Cleanup -> 404", s === 404);
}
