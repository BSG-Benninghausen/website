export const name = "Beispiel-Stammdaten (Demo-Seed) + Rollen/Ämter-Trennung";

export default async function run(api, ck) {
  await api.asAdmin();

  // --- Team-Seite (öffentlich, aus Vereinsämtern × Nutzern) ---
  let [s, d] = await api.getJ("/api/team");
  ck("Team geseedet", s === 200 && d.items.length >= 7);
  const team = (n) => d.items.find((m) => m.name === n);
  ck("Vorstand: Markus Muster (1. Vorsitzender)", !!team("Markus Muster") && team("Markus Muster").group === "vorstand" && team("Markus Muster").label === "1. Vorsitzender");
  ck("Trainer: Jens Muster (Cheftrainer)", !!team("Jens Muster") && team("Jens Muster").group === "trainer");
  ck("Team-Mitglied trägt Foto", !!team("Markus Muster") && /^data:image\//.test(team("Markus Muster").photo || ""));

  // Decoupling auf der Team-Seite:
  ck("Amt OHNE Rechte: Petra Muster gelistet", !!team("Petra Muster") && team("Petra Muster").group === "vorstand");
  ck("Amt OHNE Rechte: Mike Muster gelistet", !!team("Mike Muster") && team("Mike Muster").group === "trainer");
  ck("Rechte OHNE Amt: Carla Muster NICHT im Team", !team("Carla Muster"));

  // --- Rollen je Nutzer (Gegenprobe zum Decoupling) ---
  [s, d] = await api.getJ("/api/users");
  const usr = (n) => d.items.find((u) => u.name === n);
  ck("Petra Muster hat nur Rolle member (keine Rechte)", !!usr("Petra Muster") && JSON.stringify(usr("Petra Muster").roles) === JSON.stringify(["member"]));
  ck("Carla Muster hat Rolle pressewart", !!usr("Carla Muster") && usr("Carla Muster").roles.includes("pressewart"));
  ck("Markus Muster hat Rolle vorsitz1", !!usr("Markus Muster") && usr("Markus Muster").roles.includes("vorsitz1"));

  // --- Vereinsämter (Admin → Vereinsämter) ---
  [s, d] = await api.getJ("/api/positions");
  ck("7 Demo-Ämter mit aufgelösten Namen", d.items.length >= 7 && d.items.some((p) => p.name === "Petra Muster" && p.label === "Schriftführerin"));
  ck("Carla Muster hat kein Amt", !d.items.some((p) => p.name === "Carla Muster"));

  // --- Mitgliedschaften (Judopass / Mitgliederliste) ---
  [s, d] = await api.getJ("/api/admin/members");
  ck("Demo-Mitglieder geseedet", d.items.length >= 5);
  const anja = d.items.find((m) => m.firstName === "Anja" && m.lastName === "Muster");
  ck("Anja Muster mit Passnummer + Foto", !!anja && /^MV-\d{4}$/.test(anja.passNumber) && /^data:image\//.test(anja.photo || ""));
  ck("Kind Noah Beispiel vorhanden (Kategorie Kind)", d.items.some((m) => m.firstName === "Noah" && m.categoryLabel === "Kind"));

  // --- Folge-Passnummern zählen nach den Demo-Pässen weiter ---
  const haus = api.email("demohaus");
  await api.newUser("Demo Tester", haus);
  await api.setHousehold();
  [s, d] = await api.postJ("/api/memberships", { firstName: "Test", lastName: "Person", birthdate: "1990-01-01", photo: anjaPhoto(anja), weightClass: "-73 kg", belt: "Weißgurt", gender: "männlich", nationality: "Deutsch" });
  ck("neue Mitgliedschaft zählt nach MV-0005 weiter", d.ok && parseInt(d.membership.passNumber.slice(4), 10) >= 6);
}

function anjaPhoto(anja) {
  return anja && anja.photo ? anja.photo : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
}
