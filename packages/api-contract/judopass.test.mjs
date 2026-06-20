import { PHOTO, IBAN } from "./harness.mjs";

export const name = "Judopass / Mitglieder bearbeiten";

export default async function run(api, ck) {
  const carla = api.email("carla");
  await api.newUser("Carla Kunde", carla);
  await api.login(carla);
  await api.setHousehold(IBAN);

  let [s, d] = await api.postJ("/api/memberships", { firstName: "Carla", lastName: "Kunde", birthdate: "1985-05-01" });
  ck("ohne Foto -> 422", s === 422 && d.errors.photo);
  [s, d] = await api.postJ("/api/memberships", { firstName: "Carla", lastName: "Kunde", birthdate: "1985-05-01", photo: "notanimage" });
  ck("ungültiges Foto -> 422", s === 422 && d.errors.photo);
  [s, d] = await api.postJ("/api/memberships", { firstName: "Carla", lastName: "Kunde", birthdate: "1985-05-01", photo: PHOTO, weightClass: "-57 kg", belt: "Gelbgurt", gender: "weiblich", nationality: "Deutsch" });
  ck("mit Foto -> 201", s === 201 && d.ok);
  ck("Passnummer Format BSG-NNNN", /^BSG-\d{4}$/.test(d.membership.passNumber));
  ck("Gewichtsklasse/Gürtel/Geschlecht/Nat.", d.membership.weightClass === "-57 kg" && d.membership.belt === "Gelbgurt" && d.membership.gender === "weiblich" && d.membership.nationality === "Deutsch");
  const memId = d.membership.id;
  const started = d.membership.startedAt;
  const pass1 = d.membership.passNumber;
  const pass1n = parseInt(pass1.slice(4), 10);
  [s, d] = await api.postJ("/api/memberships", { firstName: "Kai", lastName: "Kunde", birthdate: "2016-03-03", photo: PHOTO });
  ck("zweite Anlage -> Passnr +1, kind", parseInt(d.membership.passNumber.slice(4), 10) === pass1n + 1 && d.membership.ageCategory === "kind");
  [s, d] = await api.postJ("/api/memberships", { firstName: "Xx", lastName: "Yy", birthdate: "1990-01-01", photo: PHOTO, weightClass: "-999 kg", nationality: "Klingonisch", belt: "Lila" });
  ck("ungültige Auswahlwerte -> ignoriert (leer)", s === 201 && d.membership.weightClass === "" && d.membership.nationality === "" && d.membership.belt === "");

  [s, d] = await api.postJ("/api/memberships/update", { id: memId, firstName: "Carla", lastName: "Kundé", birthdate: "2015-01-01", photo: PHOTO, belt: "Orangegurt" });
  ck("update ok (Tippfehler + Geburtsdatum)", s === 200 && d.membership.lastName === "Kundé");
  ck("Altersklasse neu berechnet (kind)", d.membership.ageCategory === "kind" && d.membership.individualFee === 7);
  ck("Passnummer + startedAt unverändert", d.membership.passNumber === pass1 && d.membership.startedAt === started);
  ck("Gürtel aktualisiert", d.membership.belt === "Orangegurt");
  [s, d] = await api.postJ("/api/memberships/update", { id: memId, firstName: "Carla", lastName: "Kunde", birthdate: "2015-01-01" });
  ck("update ohne Foto -> 422", s === 422 && d.errors.photo);

  await api.newUser("Bob Other", api.email("bob"));
  [s, d] = await api.postJ("/api/memberships/update", { id: memId, firstName: "H", lastName: "Hack", birthdate: "2000-01-01", photo: PHOTO });
  ck("fremde Mitgliedschaft -> 404", s === 404);

  await api.asAdmin();
  [s, d] = await api.getJ("/api/admin/members");
  ck("admin members enthält photo+passNumber", d.items.length >= 2 && d.items.every((m) => "photo" in m && "passNumber" in m) && d.items.some((m) => m.passNumber === pass1));
}
