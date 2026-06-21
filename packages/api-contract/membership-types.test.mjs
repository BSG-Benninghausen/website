import { PHOTO, IBAN, YEAR } from "./harness.mjs";

export const name = "Mitgliedsbeiträge editierbar (membership-types)";

export default async function run(api, ck) {
  await api.asAdmin();
  let [s, d] = await api.getJ("/api/permissions");
  ck("manage_fees im Berechtigungs-Katalog", d.items.some((p) => p.key === "manage_fees"));
  [s, d] = await api.getJ("/api/roles");
  ck("kassenwart hat manage_fees", d.items.find((r) => r.id === "kassenwart").permissions.includes("manage_fees"));

  [s, d] = await api.getJ("/api/membership-types");
  ck("GET liefert ageBands + familyFlatMonthly", s === 200 && Array.isArray(d.ageBands) && d.ageBands.length > 0 && typeof d.familyFlatMonthly === "number");
  const adult = d.ageBands.find((b) => b.maxAge >= 199) || d.ageBands[d.ageBands.length - 1];

  // Mitglied ohne Recht darf Beiträge NICHT ändern
  const nina = api.email("nina");
  await api.newUser("Nina Normal", nina);
  await api.login(nina);
  [s, d] = await api.postJ("/api/membership-types", { ageBands: [{ id: adult.id, feeMonthly: 99 }], familyFlatMonthly: 200 });
  ck("Mitglied ohne Recht -> 403", s === 403);

  // Kassenwart darf Beiträge speichern
  const kasse = api.email("kasse");
  const kId = await api.newUser("Kim Kasse", kasse);
  await api.asAdmin();
  await api.post("/api/users/roles", { userId: kId, roles: ["kassenwart"] });
  await api.login(kasse);
  [s, d] = await api.postJ("/api/membership-types", { ageBands: [{ id: adult.id, feeMonthly: 19.5 }], familyFlatMonthly: 30 });
  ck("kassenwart darf Beiträge speichern (200)", s === 200 && d.ok);
  ck("Antwort enthält aktualisierten Beitrag", d.ageBands.find((b) => b.id === adult.id).feeMonthly === 19.5 && d.familyFlatMonthly === 30);

  // Persistenz: GET liefert die geänderten Werte; Bandstruktur bleibt erhalten
  [s, d] = await api.getJ("/api/membership-types");
  ck("GET spiegelt Änderung", d.ageBands.find((b) => b.id === adult.id).feeMonthly === 19.5 && d.familyFlatMonthly === 30);
  ck("Bandstruktur (label/Altersbereich) unverändert", d.ageBands.find((b) => b.id === adult.id).label === adult.label && d.ageBands.find((b) => b.id === adult.id).maxAge === adult.maxAge);

  // Negativer Wert wird auf 0 geklemmt
  [s, d] = await api.postJ("/api/membership-types", { ageBands: [{ id: adult.id, feeMonthly: -5 }], familyFlatMonthly: 30 });
  ck("negativer Beitrag -> 0", d.ageBands.find((b) => b.id === adult.id).feeMonthly === 0);
  await api.postJ("/api/membership-types", { ageBands: [{ id: adult.id, feeMonthly: 22 }], familyFlatMonthly: 30 });

  // Neue Mitgliedschaft erbt den aktualisierten Beitrag
  const carla = api.email("carla");
  await api.newUser("Carla Kunde", carla);
  await api.login(carla);
  await api.setHousehold(IBAN);
  [s, d] = await api.postJ("/api/memberships", { firstName: "Carla", lastName: "Kunde", birthdate: (YEAR - 30) + "-01-01", photo: PHOTO });
  ck("neue Mitgliedschaft nutzt aktualisierten Beitrag", s === 201 && d.membership.individualFee === 22);
}
