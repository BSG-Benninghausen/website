/* =====================================================================
   konto.js – geschütztes Benutzer-Dashboard
   Lädt Konto, Mitgliedschaften & Beitragstypen aus dem Mock-Server und
   verwaltet Adresse, IBAN und Mitgliedschaften (für sich & Familie).
   ===================================================================== */
(function () {
  "use strict";

  let account = null;
  let editingId = null;     // gesetzt = Bearbeiten-Modus
  let currentPhoto = "";    // Data-URL des aktuellen Fotos
  let membershipItems = []; // zuletzt geladene Mitgliedschaften (für Bearbeiten)
  let weightCats = [];      // Gewichtsklassen-Kategorien (aus /api/weight-classes)
  let passLabel = "Mitgliedsausweis";  // Label des Mitgliedsausweises (club-config: pass_label)

  const $ = (sel) => document.querySelector(sel);

  /* Foto clientseitig verkleinern -> Data-URL (JPEG); gemeinsame Logik in BSG.readAndResize */
  const readAndResize = (file, maxEdge = 360) => BSG.readAndResize(file, maxEdge);
  function setPhoto(dataUrl) {
    currentPhoto = dataUrl || "";
    const prev = $("#m-photo-preview"); const ph = $("#m-photo-ph");
    if (currentPhoto) { prev.src = currentPhoto; prev.hidden = false; if (ph) ph.hidden = true; }
    else { prev.removeAttribute("src"); prev.hidden = true; if (ph) ph.hidden = false; }
  }

  async function postJSON(url, data) {
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return { res, data: await res.json() };
  }

  function clearErrors(form) {
    form.querySelectorAll(".field--error").forEach((f) => f.classList.remove("field--error"));
  }
  function applyErrors(form, errors) {
    Object.keys(errors || {}).forEach((name) => {
      const input = form.elements[name];
      if (!input) return;
      const field = input.closest(".field");
      if (!field) return;
      field.classList.add("field--error");
      const p = field.querySelector(".field__error");
      if (p) p.textContent = errors[name];
    });
  }
  function status(form, type, text) {
    const box = form.querySelector(".form-status");
    if (!box) return;
    box.className = "form-status is-visible form-status--" + (type === "ok" ? "ok" : "err");
    const icon = type === "ok"
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6 9 17l-5-5"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>';
    box.innerHTML = icon + "<span>" + BSG.escape(text) + "</span>";
  }
  const fill = (form, values) => {
    Object.keys(values || {}).forEach((k) => { if (form.elements[k]) form.elements[k].value = values[k] ?? ""; });
  };

  /* ---------- Initialisierung mit Auth-Guard ---------- */
  async function init() {
    let me;
    try {
      const res = await fetch("/api/auth/me");
      me = await res.json();
      if (!res.ok || !me.ok) throw new Error("unauth");
    } catch (e) {
      window.location.href = "login.html";
      return;
    }
    account = me.user;

    $("#acc-name").textContent = account.name;
    $("#acc-email").textContent = account.email;
    $("#greet-name").textContent = account.name.split(" ")[0];

    try { weightCats = (await (await fetch("/api/weight-classes")).json()).categories || []; } catch (e) { weightCats = []; }
    // Label des Mitgliedsausweises kommt aus der Club-Config (White-Label, z. B. „Judopass").
    try {
      const cd = await (await fetch("/api/club")).json();
      if (cd && cd.ok && cd.values && typeof cd.values.pass_label === "string" && cd.values.pass_label.trim()) {
        passLabel = cd.values.pass_label.trim();
      }
    } catch (e) { /* Fallback "Mitgliedsausweis" */ }

    fillAccountForms();
    await loadMemberships();
    await loadTournaments();
    wireEvents();
    $("#dash").hidden = false;
    $("#dash-loading").hidden = true;
  }

  /* ----- Gewichtsklassen passend zu Geburtsjahr + Geschlecht ----- */
  function relevantWeights(birthdate, gender) {
    const y = new Date(birthdate).getFullYear();
    if (isNaN(y)) return [];
    const j = new Date().getFullYear() - y;
    const cat = weightCats.find((c) => j >= c.minAge && j <= c.maxAge);
    if (!cat) return [];
    const male = cat.male || [], female = cat.female || [];
    if (gender === "männlich") return male.slice();
    if (gender === "weiblich") return female.slice();
    const out = male.slice();
    female.forEach((w) => { if (!out.includes(w)) out.push(w); });
    return out;
  }
  function rebuildWeights(selected, preserveInvalid) {
    const sel = $("#m-weightclass");
    if (!sel) return;
    const form = $("#membership-form");
    const list = relevantWeights(form.elements.birthdate.value, form.elements.gender.value);
    let value = selected || "";
    const opts = list.slice();
    if (value && !opts.includes(value)) { if (preserveInvalid) opts.unshift(value); else value = ""; }
    sel.innerHTML = '<option value="">Keine Angabe</option>' +
      opts.map((w) => "<option>" + BSG.escape(w) + "</option>").join("");
    sel.value = value;
  }

  function fillAccountForms() {
    const addr = account.address || {};
    fill($("#address-form"), { street: addr.street, zip: addr.zip, city: addr.city });
    fill($("#bank-form"), { iban: account.iban || "" });
    renderProfilePhoto();
  }

  /* ---------- Profilfoto (Self-Service) ---------- */
  function renderProfilePhoto() {
    const prev = $("#u-photo-preview"), ph = $("#u-photo-ph"), rm = $("#u-photo-remove");
    if (!prev) return;
    const photo = account.photo || "";
    if (photo) { prev.src = photo; prev.hidden = false; if (ph) ph.hidden = true; if (rm) rm.hidden = false; }
    else { prev.removeAttribute("src"); prev.hidden = true; if (ph) ph.hidden = false; if (rm) rm.hidden = true; }
  }
  function profileStatus(type, text) {
    const box = $("#u-photo-status"); if (!box) return;
    box.className = "form-status is-visible form-status--" + (type === "ok" ? "ok" : "err");
    box.innerHTML = "<span>" + BSG.escape(text) + "</span>";
  }
  async function saveProfilePhoto(photo) {
    const { res, data } = await postJSON("/api/account/update", { photo });
    if (res.ok && data.ok) { account = data.user; renderProfilePhoto(); profileStatus("ok", photo ? "Profilfoto gespeichert." : "Profilfoto entfernt."); }
    else profileStatus("err", (data.errors && data.errors.photo) || data.message || "Fehler.");
  }
  function wireProfilePhoto() {
    const input = $("#u-photo"), rm = $("#u-photo-remove");
    if (!input) return;
    input.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try { await saveProfilePhoto(await BSG.readAndResize(file, 480)); input.value = ""; }
      catch (err) { profileStatus("err", err.message); }
    });
    if (rm) rm.addEventListener("click", () => saveProfilePhoto(""));
  }

  /* ---------- Mitgliedschaften ---------- */
  async function loadMemberships() {
    const wrap = $("#memberships");
    try {
      const res = await fetch("/api/memberships");
      const d = await res.json();
      membershipItems = d.items || [];
      if (!membershipItems.length) {
        wrap.innerHTML = '<p class="muted-note">Noch keine Mitglieder angemeldet. Melde die Mitglieder deines Haushalts an – der Beitrag ergibt sich automatisch aus dem Alter.</p>';
      } else {
        wrap.innerHTML = membershipItems.map(judopass).join("");
      }
      renderSummary(d.summary);
    } catch (e) {
      wrap.innerHTML = '<p class="load-error">Mitgliedschaften konnten nicht geladen werden.</p>';
    }
  }

  function renderSummary(sum) {
    const box = $("#billing-summary");
    if (!box) return;
    if (!sum || !sum.activeCount) { box.hidden = true; return; }
    const memberWord = sum.activeCount === 1 ? "aktives Mitglied" : "aktive Mitglieder";
    const detail = sum.familyApplied
      ? '<span class="badge badge--aktiv">Familienbeitrag angewendet</span> – günstiger als die Einzelbeiträge (' + sum.sumIndividual + " €)."
      : "Summe der Einzelbeiträge.";
    box.hidden = false;
    box.innerHTML =
      '<div class="billing-summary__total">' +
        '<span class="muted-note">Monatlicher Gesamtbeitrag · ' + sum.activeCount + " " + memberWord + "</span>" +
        "<strong>" + sum.effectiveTotal + " € / Monat</strong>" +
      "</div>" +
      '<p class="muted-note">' + detail + "</p>";
  }

  const PHOTO_PLACEHOLDER =
    '<div class="judopass__photo judopass__photo--empty" title="Foto fehlt">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="9" r="3.2"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/></svg></div>';

  function row(label, value) {
    return '<div class="judopass__row"><span>' + label + "</span><b>" + value + "</b></div>";
  }

  function judopass(m) {
    const since = BSG.formatDate(m.startedAt);
    const birth = m.birthdate ? BSG.formatDate(m.birthdate) : "—";
    const active = m.status === "aktiv";
    const label = m.categoryLabel || m.typeLabel || "Mitglied";
    const fee = m.individualFee != null ? m.individualFee : m.feeMonthly;
    const photo = m.photo
      ? '<div class="judopass__photo"><img src="' + m.photo + '" alt="Foto von ' + BSG.escape(m.firstName) + '"></div>'
      : PHOTO_PLACEHOLDER;
    return (
      '<article class="judopass' + (active ? "" : " judopass--inactive") + '">' +
        '<div class="judopass__head">' +
          '<img class="judopass__logo" src="assets/img/drache-light.png" alt="">' +
          "<span>" + BSG.escape(passLabel) + "</span>" +
          '<span class="judopass__no">' + BSG.escape(m.passNumber || "—") + "</span>" +
        "</div>" +
        '<div class="belt-bar" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>' +
        '<div class="judopass__body">' +
          photo +
          '<div class="judopass__data">' +
            '<h3>' + BSG.escape(m.firstName) + " " + BSG.escape(m.lastName) + "</h3>" +
            '<span class="badge badge--' + (active ? "aktiv" : "gekuendigt") + '">' + BSG.escape(m.status) + "</span>" +
            '<div class="judopass__grid">' +
              row("Geboren", BSG.escape(birth)) +
              row("Beitragsklasse", BSG.escape(label)) +
              row("Gürtel", BSG.escape(m.belt || "—")) +
              row("Gewichtsklasse", m.weightClass ? BSG.escape(m.weightClass) : "—") +
              row("Beitrag", fee + " €/Mon.") +
              row("Mitglied seit", BSG.escape(since)) +
            "</div>" +
            ((m.competitionClasses && m.competitionClasses.length)
              ? '<div class="judopass__classes"><span class="judopass__classes-label">Altersklasse</span>' +
                m.competitionClasses.map((c) => '<span class="ac-badge">' + BSG.escape(c) + "</span>").join("") + "</div>"
              : "") +
          "</div>" +
        "</div>" +
        (m.photo ? "" : '<p class="judopass__warn">Foto fehlt – bitte über „Bearbeiten" ergänzen (Pflicht für den ' + BSG.escape(passLabel) + ").</p>") +
        '<div class="judopass__actions">' +
          '<button class="btn btn--outline btn--sm" data-edit="' + m.id + '">Bearbeiten</button>' +
          (active ? '<button class="btn btn--outline btn--sm" data-cancel="' + m.id + '">Kündigen</button>' : "") +
        "</div>" +
      "</article>"
    );
  }

  /* ---------- Turniere & Meisterschaften ---------- */
  const euro = (v) => (Number(v) || 0).toLocaleString("de-DE");

  function tournamentCard(e) {
    const acls = (e.ageClasses && e.ageClasses.length)
      ? e.ageClasses.map((c) => '<span class="ac-badge">' + BSG.escape(c) + "</span>").join("")
      : '<span class="muted-note">offen für alle Altersklassen</span>';
    const fee = Number(e.fee) || 0;
    let money = "";
    if (fee > 0) {
      const own = Math.min(fee, Number(e.ownShare) || 0);
      const club = fee - own;
      money = '<p class="muted-note" style="margin:4px 0 0">Eigenanteil <b>' + euro(own) + " €</b>" + (club > 0 ? " · Verein trägt " + euro(club) + " €" : "") + "</p>";
    }
    const members = (e.eligibleMembers || []);
    const memberRows = members.length
      ? members.map((m) =>
          '<div class="tournament__member">' +
            "<div><b>" + BSG.escape(m.name) + "</b> " +
            (m.competitionClasses || []).map((c) => '<span class="ac-badge">' + BSG.escape(c) + "</span>").join("") +
            "</div>" +
            (m.registered
              ? '<div style="display:flex;align-items:center;gap:10px"><span class="badge badge--aktiv">angemeldet</span>' +
                '<button class="btn btn--outline btn--sm" data-unregister="' + e.id + '" data-member="' + m.membershipId + '">Abmelden</button></div>'
              : '<button class="btn btn--primary btn--sm" data-register="' + e.id + '" data-member="' + m.membershipId + '">Anmelden</button>') +
          "</div>"
        ).join("")
      : '<p class="muted-note" style="margin-top:10px">Keine deiner Mitglieder passt in die Altersklassen dieses Turniers.</p>';
    return (
      '<div class="tournament">' +
        '<div class="tournament__head">' +
          "<div><b>" + BSG.escape(e.title) + '</b> <span class="event__type" data-type="' + BSG.escape(e.type) + '">' + BSG.escape(e.type) + "</span>" +
            '<br><span class="muted-note">' + BSG.formatDate(e.date) + (e.time ? " · " + BSG.escape(e.time) : "") + (e.location ? " · " + BSG.escape(e.location) : "") + "</span>" +
            money +
          "</div>" +
          '<div class="ac-badges">' + acls + "</div>" +
        "</div>" +
        memberRows +
      "</div>"
    );
  }

  async function loadTournaments() {
    const sec = $("#tournaments-section");
    const list = $("#tournaments-list");
    if (!sec || !list) return;
    let data;
    try { data = await (await fetch("/api/tournaments")).json(); }
    catch (e) { return; }
    if (!data || !data.ok) return;
    const items = data.items || [];
    if (!items.length) { sec.hidden = true; return; }
    list.innerHTML = items.map(tournamentCard).join("");
    sec.hidden = false;
  }

  /* ---------- Events ---------- */
  function wireEvents() {
    wireProfilePhoto();

    // Turnier-Anmeldung / -Abmeldung (Delegation)
    $("#tournaments-list").addEventListener("click", async (e) => {
      const reg = e.target.closest("[data-register]");
      const unreg = e.target.closest("[data-unregister]");
      const btn = reg || unreg;
      if (!btn) return;
      btn.setAttribute("aria-busy", "true");
      const url = reg ? "/api/tournaments/register" : "/api/tournaments/unregister";
      const eventId = btn.getAttribute(reg ? "data-register" : "data-unregister");
      const membershipId = btn.getAttribute("data-member");
      const { res, data } = await postJSON(url, { eventId, membershipId });
      if (res.ok && data.ok) await loadTournaments();
      else { btn.removeAttribute("aria-busy"); alert(data.message || "Fehler."); }
    });

    // Abmelden
    $("#logout").addEventListener("click", async () => {
      if (window.BSGNavAuth) window.BSGNavAuth.clear();
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "home.html";
    });

    // Adresse speichern
    $("#address-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target; clearErrors(form);
      const fd = Object.fromEntries(new FormData(form).entries());
      const { res, data } = await postJSON("/api/account/update", { address: fd });
      if (res.ok && data.ok) { account = data.user; status(form, "ok", "Adresse gespeichert."); }
      else { applyErrors(form, data.errors); status(form, "err", data.message || "Fehler."); }
    });

    // IBAN speichern
    $("#bank-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target; clearErrors(form);
      const fd = Object.fromEntries(new FormData(form).entries());
      const { res, data } = await postJSON("/api/account/update", { iban: fd.iban });
      if (res.ok && data.ok) { account = data.user; if (data.user.iban) form.elements.iban.value = data.user.iban; status(form, "ok", "Kontoverbindung gespeichert."); }
      else { applyErrors(form, data.errors); status(form, "err", data.message || "Fehler."); }
    });

    // Mitglied-Formular
    const mForm = $("#membership-form");
    const hint = $("#membership-hint");
    const formTitle = $("#membership-form-title");
    const submitLabel = (txt) => { const b = mForm.querySelector("[type=submit]"); if (b && b.lastChild) b.lastChild.textContent = " " + txt; };
    const photoField = () => mForm.querySelector("[data-photo-field]");

    function openCreate() {
      if (!account.address || !account.iban) {
        hint.hidden = false;
        hint.innerHTML = "Bitte hinterlege zuerst <b>Anschrift und Bankverbindung</b> deines Haushalts (unten) – darunter werden alle Mitglieder angemeldet.";
        $("#address-form").scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      hint.hidden = true; editingId = null;
      mForm.reset(); clearErrors(mForm); setPhoto("");
      rebuildWeights("", false);
      formTitle.textContent = "Mitglied anmelden"; submitLabel("Mitglied anmelden");
      mForm.hidden = false; mForm.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    function openEdit(m) {
      editingId = m.id; clearErrors(mForm);
      fill(mForm, { firstName: m.firstName, lastName: m.lastName, birthdate: m.birthdate, belt: m.belt || "", gender: m.gender || "", nationality: m.nationality || "" });
      rebuildWeights(m.weightClass || "", true);
      setPhoto(m.photo || "");
      formTitle.textContent = "Mitglied bearbeiten"; submitLabel("Änderungen speichern");
      mForm.hidden = false; mForm.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    // Gewichtsklassen-Auswahl an Geburtsjahr & Geschlecht anpassen
    $("#m-birth").addEventListener("change", () => rebuildWeights($("#m-weightclass").value, false));
    $("#m-gender").addEventListener("change", () => rebuildWeights($("#m-weightclass").value, false));

    $("#add-membership-btn").addEventListener("click", () => {
      if (!mForm.hidden && !editingId) { mForm.hidden = true; return; }
      openCreate();
    });
    $("#membership-cancel").addEventListener("click", () => { mForm.hidden = true; editingId = null; });

    // Foto auswählen -> clientseitig verkleinern
    $("#m-photo").addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      photoField().classList.remove("field--error");
      try { setPhoto(await readAndResize(file)); }
      catch (err) { photoField().classList.add("field--error"); const p = photoField().querySelector(".field__error"); if (p) p.textContent = err.message; }
    });

    // Anlegen / Speichern
    mForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearErrors(mForm);
      if (!currentPhoto) {
        photoField().classList.add("field--error");
        const p = photoField().querySelector(".field__error"); if (p) p.textContent = "Bitte ein Foto hochladen (Pflicht).";
        status(mForm, "err", "Bitte ein Foto hochladen.");
        return;
      }
      const fd = Object.fromEntries(new FormData(mForm).entries());
      const payload = {
        firstName: fd.firstName, lastName: fd.lastName, birthdate: fd.birthdate,
        weightClass: fd.weightClass, belt: fd.belt, gender: fd.gender, nationality: fd.nationality,
        photo: currentPhoto,
      };
      if (editingId) payload.id = editingId;
      const btn = mForm.querySelector("[type=submit]"); btn.setAttribute("aria-busy", "true");
      const { res, data } = await postJSON(editingId ? "/api/memberships/update" : "/api/memberships", payload);
      btn.removeAttribute("aria-busy");
      if (res.ok && data.ok) {
        mForm.reset(); setPhoto(""); editingId = null; mForm.hidden = true;
        await loadMemberships();
      } else {
        applyErrors(mForm, data.errors);
        status(mForm, "err", data.message || "Fehler.");
      }
    });

    // Aktionen je Karte (Delegation): Bearbeiten + Kündigen
    $("#memberships").addEventListener("click", async (e) => {
      const editBtn = e.target.closest("[data-edit]");
      const cancelBtn = e.target.closest("[data-cancel]");
      if (editBtn) {
        const m = membershipItems.find((x) => x.id === editBtn.getAttribute("data-edit"));
        if (m) openEdit(m);
        return;
      }
      if (cancelBtn) {
        if (!confirm("Diese Mitgliedschaft wirklich kündigen?")) return;
        const { res, data } = await postJSON("/api/memberships/cancel", { id: cancelBtn.getAttribute("data-cancel") });
        if (res.ok && data.ok) await loadMemberships();
        else alert(data.message || "Fehler beim Kündigen.");
      }
    });
  }

  init();
})();
