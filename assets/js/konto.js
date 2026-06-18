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

  const $ = (sel) => document.querySelector(sel);

  /* Foto clientseitig verkleinern -> Data-URL (JPEG) */
  function readAndResize(file, maxEdge = 360) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error("Keine Datei"));
      if (!/^image\//.test(file.type)) return reject(new Error("Bitte ein Bild wählen."));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Bild konnte nicht geladen werden."));
        img.onload = () => {
          let { width, height } = img;
          const scale = Math.min(1, maxEdge / Math.max(width, height));
          width = Math.round(width * scale); height = Math.round(height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
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

    fillAccountForms();
    await loadMemberships();
    wireEvents();
    $("#dash").hidden = false;
    $("#dash-loading").hidden = true;
  }

  function fillAccountForms() {
    const addr = account.address || {};
    fill($("#address-form"), { street: addr.street, zip: addr.zip, city: addr.city });
    fill($("#bank-form"), { iban: account.iban || "" });
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
          "<span>Judopass</span>" +
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
        (m.photo ? "" : '<p class="judopass__warn">Foto fehlt – bitte über „Bearbeiten" ergänzen (Pflicht für den Judopass).</p>') +
        '<div class="judopass__actions">' +
          '<button class="btn btn--outline btn--sm" data-edit="' + m.id + '">Bearbeiten</button>' +
          (active ? '<button class="btn btn--outline btn--sm" data-cancel="' + m.id + '">Kündigen</button>' : "") +
        "</div>" +
      "</article>"
    );
  }

  /* ---------- Events ---------- */
  function wireEvents() {
    // Abmelden
    $("#logout").addEventListener("click", async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "index.html";
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
      formTitle.textContent = "Mitglied anmelden"; submitLabel("Mitglied anmelden");
      mForm.hidden = false; mForm.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    function openEdit(m) {
      editingId = m.id; clearErrors(mForm);
      fill(mForm, { firstName: m.firstName, lastName: m.lastName, birthdate: m.birthdate, weightClass: m.weightClass || "", belt: m.belt || "", gender: m.gender || "", nationality: m.nationality || "" });
      setPhoto(m.photo || "");
      formTitle.textContent = "Mitglied bearbeiten"; submitLabel("Änderungen speichern");
      mForm.hidden = false; mForm.scrollIntoView({ behavior: "smooth", block: "center" });
    }

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
