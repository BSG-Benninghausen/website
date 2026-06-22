export const name = "Health-Check (öffentlicher Status-Endpunkt)";

/* GET /api/health: öffentlicher, auth-freier Status-Endpunkt für Monitoring.
   Vertrag bewusst schlank und white-label-neutral: ok=true, ein nicht-leeres
   service-Feld (Wert tenant-/deploy-spezifisch, daher nicht festgenagelt) und
   status==="ok". Gleiche Zusicherungen gelten für Mock und reales Backend. */
export default async function run(api, ck) {
  const [s, d] = await api.getJ("/api/health");
  ck("GET /api/health -> 200", s === 200);
  ck("Antwort ok:true", !!d && d.ok === true);
  ck("service-Feld ist nicht-leerer String", !!d && typeof d.service === "string" && d.service.length > 0);
  ck("status === 'ok'", !!d && d.status === "ok");
}
