/* =====================================================================
   MOCK-SERVER  ·  BSG Benninghausen
   ---------------------------------------------------------------------
   Diese Website ist rein statisch. Wo normalerweise ein Server nötig wäre
   (Formulare absenden, News & Termine laden), simuliert dieses Modul ein
   Backend, indem es `window.fetch` für Routen unter `/api/...` abfängt.

   So bleibt der restliche Frontend-Code "echt": er ruft ganz normal
   `fetch('/api/...')` auf. Möchte der Verein später ein richtiges Backend
   anbinden, genügt es, dieses Script zu entfernen und die /api-Endpunkte
   serverseitig bereitzustellen – am Frontend ändert sich nichts.

   KEIN echter Datenversand. Eingaben werden nur lokal im Browser
   (localStorage) abgelegt, damit man die Funktion demonstrieren kann.
   ===================================================================== */
(function () {
  "use strict";

  const LATENCY = [280, 620];           // simulierte Antwortzeit (ms)
  const STORE_KEYS = {
    anmeldung: "bsg_mock_anmeldungen",
    kontakt: "bsg_mock_kontakte",
  };

  const realFetch = window.fetch.bind(window);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd = ([a, b]) => Math.round(a + Math.random() * (b - a));

  function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  function saveLocal(key, entry) {
    try {
      const list = JSON.parse(localStorage.getItem(key) || "[]");
      list.push(entry);
      localStorage.setItem(key, JSON.stringify(list));
    } catch (e) {
      /* localStorage evtl. deaktiviert – für die Demo unkritisch */
    }
  }

  const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());

  /* ----- Datenquellen laden (statische JSON-Dateien) ----- */
  async function loadData(file) {
    // bewusst der ECHTE fetch, damit wir uns nicht selbst abfangen
    const res = await realFetch("assets/data/" + file, { cache: "no-cache" });
    if (!res.ok) throw new Error("Konnte " + file + " nicht laden");
    return res.json();
  }

  /* ----- Route-Handler ----- */
  const routes = {
    "GET /api/news": async () => {
      const news = await loadData("news.json");
      news.sort((a, b) => new Date(b.date) - new Date(a.date));
      return json({ ok: true, items: news });
    },

    "GET /api/events": async () => {
      const events = await loadData("events.json");
      events.sort((a, b) => new Date(a.date) - new Date(b.date));
      return json({ ok: true, items: events });
    },

    "POST /api/anmeldung": async (body) => {
      const errors = {};
      if (!body.name || body.name.trim().length < 2) errors.name = "Bitte Namen angeben.";
      if (!isEmail(body.email)) errors.email = "Bitte gültige E-Mail-Adresse angeben.";
      if (!body.group) errors.group = "Bitte eine Trainingsgruppe wählen.";
      if (!body.privacy) errors.privacy = "Bitte der Datenverarbeitung zustimmen.";
      if (Object.keys(errors).length) {
        return json({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      }
      const entry = { ...body, id: "ANM-" + Date.now(), receivedAt: new Date().toISOString() };
      saveLocal(STORE_KEYS.anmeldung, entry);
      return json({
        ok: true,
        id: entry.id,
        message:
          "Vielen Dank, " + body.name.trim().split(" ")[0] +
          "! Deine Anmeldung zum Probetraining ist eingegangen. Wir melden uns in Kürze. " +
          "Du kannst auch einfach spontan zum nächsten Training vorbeikommen.",
      }, 201);
    },

    "POST /api/kontakt": async (body) => {
      const errors = {};
      if (!body.name || body.name.trim().length < 2) errors.name = "Bitte Namen angeben.";
      if (!isEmail(body.email)) errors.email = "Bitte gültige E-Mail-Adresse angeben.";
      if (!body.message || body.message.trim().length < 10) errors.message = "Bitte eine etwas ausführlichere Nachricht (min. 10 Zeichen).";
      if (!body.privacy) errors.privacy = "Bitte der Datenverarbeitung zustimmen.";
      if (Object.keys(errors).length) {
        return json({ ok: false, message: "Bitte Eingaben prüfen.", errors }, 422);
      }
      const entry = { ...body, id: "MSG-" + Date.now(), receivedAt: new Date().toISOString() };
      saveLocal(STORE_KEYS.kontakt, entry);
      return json({
        ok: true,
        id: entry.id,
        message: "Danke für deine Nachricht! Wir haben sie erhalten und melden uns so schnell wie möglich.",
      });
    },
  };

  /* ----- fetch abfangen ----- */
  window.fetch = async function (input, init = {}) {
    const url = typeof input === "string" ? input : input.url;
    const method = (init.method || (typeof input === "object" && input.method) || "GET").toUpperCase();

    // Pfad normalisieren: nur /api/... wird gemockt
    let path;
    try {
      path = new URL(url, window.location.origin).pathname;
    } catch (e) {
      path = url;
    }

    if (!path.startsWith("/api/")) {
      return realFetch(input, init);
    }

    const key = method + " " + path;
    const handler = routes[key];

    await wait(rnd(LATENCY)); // realistische Latenz

    if (!handler) {
      return json({ ok: false, message: "Endpoint nicht gefunden (Mock)." }, 404);
    }

    let body = {};
    if (init.body) {
      try { body = JSON.parse(init.body); } catch (e) { body = {}; }
    }

    try {
      return await handler(body);
    } catch (err) {
      return json({ ok: false, message: "Mock-Serverfehler: " + err.message }, 500);
    }
  };

  console.info(
    "%c BSG Mock-Server aktiv ",
    "background:#3b40a0;color:#fff;border-radius:4px;padding:2px 6px",
    "– /api/* Anfragen werden lokal simuliert (kein echtes Backend)."
  );
})();
