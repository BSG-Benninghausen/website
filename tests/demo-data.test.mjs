export const name = "Beispiel-Stammdaten (Demo-Seed) + Rollen/Ämter-Trennung";

export default async function run(api, ck) {
  await api.asAdmin();

  // --- Team-Seite (öffentlich, aus Vereinsämtern × Nutzern) ---
  let [s, d] = await api.getJ("/api/team");
  ck("Team geseedet", s === 200 && d.items.length >= 7);
  const team = (n) => d.items.find((m) => m.name === n);
  ck("Vorstand: Markus Vorbeck (1. Vorsitzender)", !!team("Markus Vorbeck") && team("Markus Vorbeck").group === "vorstand" && team("Markus Vorbeck").label === "1. Vorsitzender");
  ck("Trainer: Jens Wurf (Cheftrainer)", !!team("Jens Wurf") && team("Jens Wurf").group === "trainer");
  ck("Team-Mitglied trägt Foto", !!team("Markus Vorbeck") && /^data:image\//.test(team("Markus Vorbeck").photo || ""));

  // Decoupling auf der Team-Seite:
  ck("Amt OHNE Rechte: Petra Lauf gelistet", !!team("Petra Lauf") && team("Petra Lauf").group === "vorstand");
  ck("Amt OHNE Rechte: Mike Boden gelistet", !!team("Mike Boden") && team("Mike Boden").group === "trainer");
  ck("Rechte OHNE Amt: Carla Feder NICHT im Team", !team("Carla Feder"));

  // --- Rollen je Nutzer (Gegenprobe zum Decoupling) ---
  [s, d] = await api.getJ("/api/users");
  const usr = (n) => d.items.find((u) => u.name === n);
  ck("Petra Lauf hat nur Rolle member (keine Rechte)", !!usr("Petra Lauf") && JSON.stringify(usr("Petra Lauf").roles) === JSON.stringify(["member"]));
  ck("Carla Feder hat Rolle pressewart", !!usr("Carla Feder") && usr("Carla Feder").roles.includes("pressewart"));
  ck("Markus Vorbeck hat Rolle vorsitz1", !!usr("Markus Vorbeck") && usr("Markus Vorbeck").roles.includes("vorsitz1"));

  // --- Vereinsämter (Admin → Vereinsämter) ---
  [s, d] = await api.getJ("/api/positions");
  ck("7 Demo-Ämter mit aufgelösten Namen", d.items.length >= 7 && d.items.some((p) => p.name === "Petra Lauf" && p.label === "Schriftführerin"));
  ck("Carla Feder hat kein Amt", !d.items.some((p) => p.name === "Carla Feder"));

  // --- Mitgliedschaften (Judopass / Mitgliederliste) ---
  [s, d] = await api.getJ("/api/admin/members");
  ck("Demo-Mitglieder geseedet", d.items.length >= 5);
  const anja = d.items.find((m) => m.firstName === "Anja" && m.lastName === "Sonnenberg");
  ck("Anja Sonnenberg mit Passnummer + Foto", !!anja && /^BSG-\d{4}$/.test(anja.passNumber) && /^data:image\//.test(anja.photo || ""));
  ck("Kind Noah Falk vorhanden (Kategorie Kind)", d.items.some((m) => m.firstName === "Noah" && m.categoryLabel === "Kind"));

  // --- Folge-Passnummern zählen nach den Demo-Pässen weiter ---
  const haus = api.email("demohaus");
  await api.newUser("Demo Tester", haus);
  await api.setHousehold();
  [s, d] = await api.postJ("/api/memberships", { firstName: "Test", lastName: "Person", birthdate: "1990-01-01", photo: anjaPhoto(anja), weightClass: "-73 kg", belt: "Weißgurt", gender: "männlich", nationality: "Deutsch" });
  ck("neue Mitgliedschaft zählt nach BSG-0005 weiter", d.ok && parseInt(d.membership.passNumber.slice(4), 10) >= 6);
}

function anjaPhoto(anja) {
  return anja && anja.photo ? anja.photo : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
}
