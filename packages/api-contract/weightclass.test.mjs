import { PHOTO, IBAN } from "./harness.mjs";

export const name = "Gewichtsklassen nach Alter & Geschlecht";

export default async function run(api, ck) {
  const yr = (age) => String(new Date().getFullYear() - age) + "-01-01";
  let [s, d] = await api.getJ("/api/weight-classes");
  ck("liefert Kategorien", s === 200 && Array.isArray(d.categories) && d.categories.length >= 4);
  const senior = d.categories.find((c) => c.maxAge >= 100);
  ck("Senioren männlich != weiblich", senior.male.join() !== senior.female.join());

  await api.newUser("Carla Kunde", api.email("carla"));
  await api.setHousehold(IBAN);

  [s, d] = await api.postJ("/api/memberships", { firstName: "Max", lastName: "Mann", birthdate: yr(30), gender: "männlich", weightClass: "-90 kg", photo: PHOTO });
  ck("Mann -90 kg akzeptiert", s === 201 && d.membership.weightClass === "-90 kg");
  [s, d] = await api.postJ("/api/memberships", { firstName: "Moe", lastName: "Mann", birthdate: yr(30), gender: "männlich", weightClass: "-78 kg", photo: PHOTO });
  ck("Mann mit Frauen-Klasse -78 kg -> verworfen", s === 201 && d.membership.weightClass === "");
  [s, d] = await api.postJ("/api/memberships", { firstName: "Fia", lastName: "Frau", birthdate: yr(30), gender: "weiblich", weightClass: "-70 kg", photo: PHOTO });
  ck("Frau -70 kg akzeptiert", s === 201 && d.membership.weightClass === "-70 kg");
  [s, d] = await api.postJ("/api/memberships", { firstName: "Kid", lastName: "Kind", birthdate: yr(11), gender: "männlich", weightClass: "-100 kg", photo: PHOTO });
  ck("Kind (U13) mit Senioren-Klasse -100 kg -> verworfen", s === 201 && d.membership.weightClass === "");
  [s, d] = await api.postJ("/api/memberships", { firstName: "Kim", lastName: "Kind", birthdate: yr(11), gender: "männlich", weightClass: "-46 kg", photo: PHOTO });
  ck("Kind (U13) -46 kg akzeptiert", s === 201 && d.membership.weightClass === "-46 kg");
  const kimId = d.membership.id;
  [s, d] = await api.postJ("/api/memberships", { firstName: "Dani", lastName: "Divers", birthdate: yr(30), gender: "divers", weightClass: "-78 kg", photo: PHOTO });
  ck("divers Senior -78 kg (Vereinigung) akzeptiert", s === 201 && d.membership.weightClass === "-78 kg");

  [s, d] = await api.postJ("/api/memberships/update", { id: kimId, firstName: "Kim", lastName: "Kind", birthdate: yr(11), gender: "weiblich", weightClass: "-46 kg", photo: PHOTO });
  ck("U13 -46 kg bleibt gültig (gleiche Liste)", d.ok && d.membership.weightClass === "-46 kg");
  [s, d] = await api.postJ("/api/memberships/update", { id: kimId, firstName: "Kim", lastName: "Kind", birthdate: yr(30), gender: "männlich", weightClass: "-32 kg", photo: PHOTO });
  ck("Senior-Mann mit -32 kg -> verworfen", d.ok && d.membership.weightClass === "");
}
