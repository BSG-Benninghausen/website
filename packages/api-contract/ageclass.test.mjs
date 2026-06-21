import { PHOTO, IBAN, YEAR } from "./harness.mjs";

export const name = "Wettkampf-Altersklassen (Jahrgangsprinzip)";

export default async function run(api, ck) {
  const Y = YEAR;
  await api.newUser("T U", api.email("ageclass"));
  await api.setHousehold(IBAN);
  const add = (birthYear, gender) => api.post("/api/memberships", { firstName: "A" + birthYear, lastName: "Test", birthdate: birthYear + "-01-01", gender, photo: PHOTO });
  await add(Y - 14);              // J=14 -> U15
  await add(Y - 18, "männlich");  // J=18 -> U21, Senioren
  await add(Y - 10);              // J=10 -> U11, U12
  await add(Y - 33, "weiblich");  // J=33 -> Senioren, F1
  await add(Y - 12);              // J=12 -> U13, U14

  const d = await (await api.get("/api/memberships")).json();
  const by = (j) => d.items.find((m) => m.firstName === "A" + (Y - j)).competitionClasses;
  ck("J=14 -> [U15]", JSON.stringify(by(14)) === '["U15"]');
  ck("J=18 männlich -> [U21,Senioren]", JSON.stringify(by(18)) === '["U21","Senioren"]');
  ck("J=10 -> [U11,U12]", JSON.stringify(by(10)) === '["U11","U12"]');
  ck("J=12 -> [U13,U14]", JSON.stringify(by(12)) === '["U13","U14"]');
  ck("J=33 weiblich -> [Senioren,F1]", JSON.stringify(by(33)) === '["Senioren","F1"]');
}
