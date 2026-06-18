import { PHOTO, IBAN, YEAR } from "./harness.mjs";

export const name = "Turniere & Meisterschaften (Anmeldung/Eligibilität)";

export default async function run(api, ck) {
  const Y = YEAR;
  await api.asAdmin();
  let [s, d] = await api.getJ("/api/age-classes");
  ck("age-classes Labels", d.ok && d.items.includes("U15") && d.items.includes("Senioren") && d.items.includes("M1"));
  [s, d] = await api.postJ("/api/events", { title: "U15 Pokal", date: Y + "-12-01", type: "Turnier", ageClasses: ["U15"], fee: 20, ownShare: 5 });
  ck("Turnier U15 (fee20/eigen5)", s === 201 && d.item.ageClasses[0] === "U15" && d.item.fee === 20 && d.item.ownShare === 5);
  const evU15 = d.item.id;
  [s, d] = await api.postJ("/api/events", { title: "Senioren-Meisterschaft", date: Y + "-12-02", type: "Meisterschaft", ageClasses: ["Senioren"], fee: 30, ownShare: 10 });
  ck("Meisterschaft Senioren", s === 201 && d.item.type === "Meisterschaft");
  const evSen = d.item.id;
  [s, d] = await api.postJ("/api/events", { title: "Offenes Turnier", date: Y + "-12-03", type: "Turnier", fee: 0, ownShare: 0 });
  ck("offenes Turnier (keine Klassen)", s === 201 && d.item.ageClasses.length === 0);
  const evOpen = d.item.id;
  [s, d] = await api.postJ("/api/events", { title: "Falsch", date: Y + "-12-04", type: "Turnier", fee: 5, ownShare: 10 });
  ck("ownShare>fee -> 422", s === 422 && d.errors.ownShare);

  const carla = api.email("carla");
  await api.newUser("Carla Kunde", carla);
  await api.login(carla);
  await api.setHousehold(IBAN);
  await api.post("/api/memberships", { firstName: "Kira", lastName: "Kunde", birthdate: (Y - 14) + "-01-01", photo: PHOTO });
  await api.post("/api/memberships", { firstName: "Senior", lastName: "Kunde", birthdate: (Y - 31) + "-01-01", gender: "männlich", photo: PHOTO });
  const mem = (await (await api.get("/api/memberships")).json()).items;
  const kira = mem.find((m) => m.firstName === "Kira").id;
  const senior = mem.find((m) => m.firstName === "Senior").id;

  [s, d] = await api.getJ("/api/tournaments");
  const tU15 = d.items.find((e) => e.id === evU15);
  const tSen = d.items.find((e) => e.id === evSen);
  const tOpen = d.items.find((e) => e.id === evOpen);
  ck("U15-Turnier: nur Kira eligible", tU15.eligibleMembers.length === 1 && tU15.eligibleMembers[0].membershipId === kira);
  ck("Senioren-MS: nur Senior eligible", tSen.eligibleMembers.length === 1 && tSen.eligibleMembers[0].membershipId === senior);
  ck("offenes Turnier: beide eligible", tOpen.eligibleMembers.length === 2);

  [s, d] = await api.postJ("/api/tournaments/register", { eventId: evU15, membershipId: kira });
  ck("Kira anmelden 201", s === 201);
  [s, d] = await api.postJ("/api/tournaments/register", { eventId: evU15, membershipId: kira });
  ck("doppelt -> 409", s === 409);
  [s, d] = await api.postJ("/api/tournaments/register", { eventId: evU15, membershipId: senior });
  ck("Senior in U15 -> 422", s === 422);
  [s, d] = await api.getJ("/api/tournaments");
  ck("registered-Flag gesetzt", d.items.find((e) => e.id === evU15).eligibleMembers.find((m) => m.membershipId === kira).registered === true);
  [s, d] = await api.postJ("/api/tournaments/unregister", { eventId: evU15, membershipId: kira });
  ck("abmelden ok", d.ok);

  await api.post("/api/tournaments/register", { eventId: evSen, membershipId: senior });
  [s, d] = await api.getJ("/api/admin/registrations");
  ck("member ohne Recht -> 403", s === 403);
  await api.asAdmin();
  [s, d] = await api.getJ("/api/admin/registrations");
  const senReg = d.items.find((e) => e.id === evSen);
  ck("Admin sieht Anmeldung mit Inhaber", s === 200 && senReg.registrations.length === 1 && senReg.registrations[0].ownerEmail === carla);
}
