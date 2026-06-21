import { PHOTO, IBAN, ORG_IBAN } from "./harness.mjs";

export const name = "Auszahlungen (Teilnahmegebühren an Veranstalter)";

export default async function run(api, ck) {
  const fut = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  await api.asAdmin();
  let [s, d] = await api.getJ("/api/permissions");
  ck("15 Rechte inkl. manage_payouts", d.items.length === 15 && d.items.some((p) => p.key === "manage_payouts"));
  [s, d] = await api.getJ("/api/roles");
  const role = (id) => d.items.find((r) => r.id === id);
  ck("kassenwart hat manage_payouts", role("kassenwart").permissions.includes("manage_payouts"));
  ck("vorstand hat manage_payouts", role("vorstand").permissions.includes("manage_payouts"));

  [s, d] = await api.postJ("/api/events", { title: "Stadtmeisterschaft", date: fut, type: "Turnier", fee: "20", ownShare: "5", organizerName: "JC Lippstadt", organizerIban: ORG_IBAN });
  ck("Turnier mit Veranstalter+IBAN angelegt", s === 201 && d.item.organizerName === "JC Lippstadt" && /^DE89/.test(d.item.organizerIban));
  const evId = d.item.id;
  [s, d] = await api.postJ("/api/events", { title: "Kein IBAN Turnier", date: fut, type: "Turnier", fee: "10", ownShare: "0", organizerIban: "DE00 1234" });
  ck("ungültige Veranstalter-IBAN -> 422", s === 422 && d.errors.organizerIban);

  const otto = api.email("otto");
  await api.newUser("Otto Owner", otto);
  await api.login(otto);
  await api.setHousehold(IBAN);
  await api.post("/api/memberships", { firstName: "Anna", lastName: "Athlet", birthdate: "2014-01-01", gender: "weiblich", photo: PHOTO });
  await api.post("/api/memberships", { firstName: "Ben", lastName: "Boxer", birthdate: "2014-01-01", gender: "männlich", photo: PHOTO });
  const myMem = (await (await api.get("/api/memberships")).json()).items;
  for (const m of myMem) await api.post("/api/tournaments/register", { eventId: evId, membershipId: m.id });

  const kasse = api.email("kasse");
  const kId = await api.newUser("Kim Kasse", kasse);
  await api.asAdmin();
  await api.post("/api/users/roles", { userId: kId, roles: ["kassenwart"] });
  await api.login(kasse);
  [s, d] = await api.getJ("/api/admin/registrations");
  ck("kassenwart darf Anmeldungen sehen (200)", s === 200);
  const row = d.items.find((e) => e.id === evId);
  ck("count=2, payTotal=fee*count=40", row.count === 2 && row.payTotal === 40);
  ck("ownTotal=10, clubTotal=30", row.ownTotal === 10 && row.clubTotal === 30);
  ck("organizerIban + payout:null", /^DE89/.test(row.organizerIban) && row.payout === null);

  const nina = api.email("nina");
  await api.newUser("Nina Normal", nina);
  await api.login(nina);
  [s, d] = await api.getJ("/api/admin/registrations");
  ck("member -> 403", s === 403);
  [s, d] = await api.postJ("/api/payouts", { eventId: evId });
  ck("member payout -> 403", s === 403);

  await api.login(kasse);
  [s, d] = await api.postJ("/api/payouts", { eventId: evId, reference: "Startgelder Anna+Ben" });
  ck("payout 201, amount=40, status veranlasst", s === 201 && d.payout.amount === 40 && d.payout.status === "veranlasst");
  const payId = d.payout.id;
  ck("amount == fee*count (nicht fee-ownShare)", d.payout.amount === 40);
  [s, d] = await api.postJ("/api/payouts", { eventId: evId });
  ck("erneut -> 409", s === 409);
  [s, d] = await api.getJ("/api/admin/registrations");
  ck("payout im Event sichtbar", d.items.find((e) => e.id === evId).payout && d.items.find((e) => e.id === evId).payout.amount === 40);

  const termin = api.email("termin");
  const tId = await api.newUser("Tom Termin", termin);
  await api.asAdmin();
  const [, rd] = await api.postJ("/api/roles", { label: "NurTermine", permissions: ["manage_events"] });
  await api.post("/api/users/roles", { userId: tId, roles: [rd.role.id] });
  await api.login(termin);
  [s, d] = await api.getJ("/api/admin/registrations");
  ck("manage_events sieht Anmeldungen (200)", s === 200);
  [s, d] = await api.postJ("/api/payouts", { eventId: evId });
  ck("manage_events payout -> 403", s === 403);

  await api.login(kasse);
  [s, d] = await api.postJ("/api/payouts/cancel", { id: payId });
  ck("storno ok", d.ok);
  [s, d] = await api.postJ("/api/payouts", { eventId: evId });
  ck("nach storno erneut 201", s === 201);

  await api.asAdmin();
  let r2 = await api.postJ("/api/events", { title: "Leer-Turnier", date: fut, type: "Turnier", fee: "10", organizerName: "X", organizerIban: ORG_IBAN });
  const emptyEv = r2[1].item.id;
  await api.login(kasse);
  [s, d] = await api.postJ("/api/payouts", { eventId: emptyEv });
  ck("ohne Anmeldungen -> 422", s === 422);

  await api.asAdmin();
  r2 = await api.postJ("/api/events", { title: "Ohne-IBAN-Turnier", date: fut, type: "Turnier", fee: "10" });
  const noIbanEv = r2[1].item.id;
  await api.login(otto);
  const anna = (await (await api.get("/api/memberships")).json()).items.find((m) => m.firstName === "Anna");
  await api.post("/api/tournaments/register", { eventId: noIbanEv, membershipId: anna.id });
  await api.login(kasse);
  [s, d] = await api.postJ("/api/payouts", { eventId: noIbanEv });
  ck("ohne Veranstalter-IBAN -> 422", s === 422);
}
