/* =====================================================================
   redaktion.js – Redaktions-Editor (dynamischer Content)
   Bereiche je nach Recht: News (manage_news), Termine (manage_events),
   Trainingszeiten (manage_training), Startseiten-Texte (manage_site),
   Auszahlungen (manage_payouts), Mitgliedsbeiträge (manage_fees).
   Jede Sektion nur bei vorhandenem Recht.
   (Team/Vorstand wird automatisch aus Rollen erzeugt – siehe Admin.)
   ===================================================================== */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  let CAN_PAYOUTS = false;

  async function postJSON(url, data) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    return { res, data: await res.json() };
  }
  function toast(type, text) {
    const box = $("#red-status");
    box.className = "form-status is-visible form-status--" + (type === "ok" ? "ok" : "err");
    const icon = type === "ok"
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6 9 17l-5-5"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>';
    box.innerHTML = icon + "<span>" + BSG.escape(text) + "</span>";
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function status(form, type, text) {
    const box = form.querySelector(".form-status");
    if (!box) return;
    box.className = "form-status is-visible form-status--" + (type === "ok" ? "ok" : "err");
    box.innerHTML = "<span>" + BSG.escape(text) + "</span>";
  }
  const clearErrors = (form) => form.querySelectorAll(".field--error").forEach((f) => f.classList.remove("field--error"));
  function applyErrors(form, errors) {
    Object.keys(errors || {}).forEach((name) => {
      const input = form.elements[name];
      if (!input) return;
      const field = input.closest(".field"); if (!field) return;
      field.classList.add("field--error");
      const p = field.querySelector(".field__error"); if (p) p.textContent = errors[name];
    });
  }
  function fillForm(form, values) {
    Object.keys(values).forEach((k) => { if (form.elements[k]) form.elements[k].value = values[k] ?? ""; });
  }

  function adminRow(title, sub, id) {
    return (
      '<div class="adm-role"><div class="adm-role__head">' +
        "<div><b>" + BSG.escape(title) + '</b><br><span class="muted-note">' + BSG.escape(sub) + "</span></div>" +
        '<div style="display:flex;gap:8px">' +
          '<button class="btn btn--outline btn--sm" data-edit="' + id + '">Bearbeiten</button>' +
          '<button class="btn btn--outline btn--sm" data-del="' + id + '">Löschen</button>' +
        "</div></div></div>"
    );
  }
  const newsRow = (n) => adminRow(n.title, BSG.formatDate(n.date) + (n.tag ? " · " + n.tag : ""), n.id);
  const fmtEuro = (v) => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString("de-DE", { minimumFractionDigits: 0 });
  function moneyNote(e) {
    const fee = Number(e.fee) || 0;
    if (fee <= 0) return "";
    const own = Math.min(fee, Number(e.ownShare) || 0);
    return " · Gebühr " + fmtEuro(fee) + " € (Eigenanteil " + fmtEuro(own) + " €, Verein " + fmtEuro(fee - own) + " €)";
  }
  function eventRow(e) {
    let sub = BSG.formatDate(e.date) + " · " + (e.type || "") + (e.time ? " · " + e.time : "") + moneyNote(e);
    let html = adminRow(e.title, sub, e.id);
    if (Array.isArray(e.ageClasses) && e.ageClasses.length) {
      const badges = e.ageClasses.map((c) => '<span class="ac-badge">' + BSG.escape(c) + "</span>").join("");
      html = html.replace("</div></div></div>", "</div></div><div class=\"ac-badges\" style=\"margin-top:8px\">" + badges + "</div></div>");
    }
    return html;
  }
  const trainingRow = (t) => adminRow(t.title, t.start + (t.end ? "–" + t.end : "") + " Uhr" + (t.ageGroup ? " · " + t.ageGroup : ""), t.id);
  const sponsorRow = (s) => adminRow(s.name, (s.tier === "premium" ? "Premium" : "Standard") + (s.url ? " · " + s.url : ""), s.id);

  /* Optionaler Bild-Upload (News): Vorschau + Verkleinern via BSG.readAndResize */
  function makeImageInput(o) {
    let current = "";
    const input = $(o.input), prev = $(o.preview), ph = $(o.ph), clear = $(o.clear), field = $(o.field);
    function render() {
      if (current) { prev.src = current; prev.hidden = false; if (ph) ph.hidden = true; if (clear) clear.hidden = false; }
      else { prev.removeAttribute("src"); prev.hidden = true; if (ph) ph.hidden = false; if (clear) clear.hidden = true; }
    }
    input.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (field) field.classList.remove("field--error");
      try { current = await BSG.readAndResize(file, 480); render(); }
      catch (err) { if (field) { field.classList.add("field--error"); const p = field.querySelector(".field__error"); if (p) p.textContent = err.message; } }
    });
    if (clear) clear.addEventListener("click", () => { current = ""; input.value = ""; render(); });
    return {
      get: () => current,
      set: (v) => { current = v || ""; input.value = ""; render(); },
      reset: () => { current = ""; input.value = ""; render(); },
    };
  }

  function setupEditor(o) {
    let items = [];
    async function load() {
      items = (await (await fetch(o.api)).json()).items || [];
      o.listEl.innerHTML = items.length ? items.map(o.render).join("") : '<p class="muted-note">Noch keine Einträge.</p>';
    }
    function reset() {
      o.form.reset(); o.form.elements.id.value = "";
      o.formTitle.textContent = o.newTitle; o.resetBtn.hidden = true; clearErrors(o.form);
      if (o.onReset) o.onReset();
    }
    o.form.addEventListener("submit", async (e) => {
      e.preventDefault(); clearErrors(o.form);
      const fd = Object.fromEntries(new FormData(o.form).entries());
      if (o.collect) o.collect(fd);
      const btn = o.form.querySelector("[type=submit]"); btn.setAttribute("aria-busy", "true");
      const { res, data } = await postJSON(fd.id ? o.api + "/update" : o.api, fd);
      btn.removeAttribute("aria-busy");
      if (res.ok && data.ok) { reset(); await load(); toast("ok", data.message); }
      else { applyErrors(o.form, data.errors); status(o.form, "err", data.message || "Fehler."); }
    });
    o.resetBtn.addEventListener("click", reset);
    o.listEl.addEventListener("click", async (e) => {
      const ed = e.target.closest("[data-edit]");
      const del = e.target.closest("[data-del]");
      if (ed) {
        const it = items.find((i) => i.id === ed.getAttribute("data-edit"));
        if (it) { fillForm(o.form, it); if (o.onFill) o.onFill(it); o.form.elements.id.value = it.id; o.formTitle.textContent = o.editTitle; o.resetBtn.hidden = false; o.form.scrollIntoView({ behavior: "smooth", block: "center" }); }
      }
      if (del) {
        if (!confirm("Diesen Eintrag wirklich löschen?")) return;
        const { res, data } = await postJSON(o.api + "/delete", { id: del.getAttribute("data-del") });
        if (res.ok && data.ok) { await load(); toast("ok", data.message); } else toast("err", data.message || "Fehler.");
      }
    });
    return { load };
  }

  async function init() {
    let me;
    try { const r = await fetch("/api/auth/me"); me = await r.json(); if (!r.ok || !me.ok) { location.href = "login.html"; return; } }
    catch (e) { location.href = "login.html"; return; }

    const can = (p) => me.isAdmin || me.permissions.includes(p);
    const canNews = can("manage_news");
    const canEvents = can("manage_events");
    const canTraining = can("manage_training");
    const canSite = can("manage_site");
    const canPayouts = can("manage_payouts");
    const canSponsors = can("manage_sponsors");
    const canFees = can("manage_fees");
    CAN_PAYOUTS = canPayouts;
    if (!canNews && !canEvents && !canTraining && !canSite && !canPayouts && !canSponsors && !canFees) { location.href = "konto.html"; return; }

    $("#red-loading").hidden = true; $("#red").hidden = false;

    if (canNews) {
      const img = makeImageInput({ input: "#n-image", preview: "#n-image-preview", ph: "#n-image-ph", clear: "#n-image-clear", field: "[data-news-image-field]" });
      const ed = setupEditor({
        listEl: $("#news-list"), form: $("#news-form"), resetBtn: $("#news-reset"), formTitle: $("#news-form-title"),
        api: "/api/news", newTitle: "Neue Meldung", editTitle: "Meldung bearbeiten", render: newsRow,
        collect: (fd) => { fd.image = img.get(); },
        onFill: (it) => { img.set(it.image || ""); },
        onReset: () => { img.reset(); },
      });
      await ed.load(); $("#news-section").hidden = false;
    }
    if (canEvents) {
      const TOURNAMENT_TYPES = ["Turnier", "Meisterschaft"];
      const acField = $("#event-ageclasses-field");
      const orgField = $("#event-organizer-field");
      const acBox = $("#event-ageclasses");
      const typeSel = $("#e-type");
      let labels = [];
      try { labels = (await (await fetch("/api/age-classes")).json()).items || []; } catch (e) { labels = []; }
      acBox.innerHTML = labels.map((l) =>
        '<label class="perm-item"><input type="checkbox" name="ageClasses" value="' + BSG.escape(l) + '"><span>' + BSG.escape(l) + "</span></label>"
      ).join("");
      const toggleAc = () => { const isT = TOURNAMENT_TYPES.includes(typeSel.value); acField.hidden = !isT; orgField.hidden = !isT; };
      typeSel.addEventListener("change", toggleAc);
      const setChecks = (vals) => {
        const set = new Set(vals || []);
        acBox.querySelectorAll('input[name="ageClasses"]').forEach((cb) => { cb.checked = set.has(cb.value); });
      };

      const ed = setupEditor({
        listEl: $("#events-list"), form: $("#event-form"), resetBtn: $("#event-reset"), formTitle: $("#event-form-title"),
        api: "/api/events", newTitle: "Neuer Termin", editTitle: "Termin bearbeiten", render: eventRow,
        collect: (fd) => {
          delete fd.ageClasses;
          fd.ageClasses = Array.from(acBox.querySelectorAll('input[name="ageClasses"]:checked')).map((cb) => cb.value);
        },
        onFill: (it) => { setChecks(it.ageClasses); toggleAc(); },
        onReset: () => { setChecks([]); toggleAc(); },
      });
      await ed.load(); $("#events-section").hidden = false;
      toggleAc();
    }

    if (canEvents || canPayouts) {
      await loadRegistrations();
    }
    if (canPayouts) {
      await loadPayouts();
    }

    if (canTraining) {
      const ed = setupEditor({ listEl: $("#training-list"), form: $("#training-form"), resetBtn: $("#training-reset"), formTitle: $("#training-form-title"), api: "/api/training", newTitle: "Neue Trainingszeit", editTitle: "Trainingszeit bearbeiten", render: trainingRow });
      await ed.load(); $("#training-section").hidden = false;
    }

    if (canSite) {
      await setupSiteEditor();
    }

    if (canFees) {
      await setupFeesEditor();
    }

    if (canSponsors) {
      const img = makeImageInput({ input: "#s-logo", preview: "#s-logo-preview", ph: "#s-logo-ph", clear: "#s-logo-clear", field: "[data-sponsor-logo-field]" });
      const ed = setupEditor({
        listEl: $("#sponsors-list"), form: $("#sponsor-form"), resetBtn: $("#sponsor-reset"), formTitle: $("#sponsor-form-title"),
        api: "/api/sponsors", newTitle: "Neuer Sponsor", editTitle: "Sponsor bearbeiten", render: sponsorRow,
        collect: (fd) => { fd.logo = img.get(); },
        onFill: (it) => { img.set(it.logo || ""); },
        onReset: () => { img.reset(); },
      });
      await ed.load();
      await setupSponsorsConfigEditor();
      $("#sponsors-section").hidden = false;
    }
  }

  /* Sponsoren-Anzeige-Einstellungen: festes Formular (Checkboxen + Select). */
  async function setupSponsorsConfigEditor() {
    const form = $("#sponsors-config-form");
    let data;
    try { data = await (await fetch("/api/sponsors-config")).json(); } catch (e) { return; }
    if (!data || !data.ok) return;
    const v = data.values || {};
    const setCb = (name, on) => { if (form.elements[name]) form.elements[name].checked = !!on; };
    setCb("enabled", v.enabled); setCb("tiersEnabled", v.tiersEnabled);
    setCb("showHome", v.showHome); setCb("showPage", v.showPage); setCb("showFooter", v.showFooter);
    if (form.elements.displayMode) form.elements.displayMode.value = v.displayMode || "cards";
    if (form.elements.title) form.elements.title.value = v.title || "";
    if (form.elements.subtitle) form.elements.subtitle.value = v.subtitle || "";
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const values = {
        enabled: form.elements.enabled.checked,
        tiersEnabled: form.elements.tiersEnabled.checked,
        showHome: form.elements.showHome.checked,
        showPage: form.elements.showPage.checked,
        showFooter: form.elements.showFooter.checked,
        displayMode: form.elements.displayMode.value,
        title: form.elements.title.value,
        subtitle: form.elements.subtitle.value,
      };
      const btn = form.querySelector("[type=submit]"); btn.setAttribute("aria-busy", "true");
      const { res, data: d } = await postJSON("/api/sponsors-config", { values });
      btn.removeAttribute("aria-busy");
      if (res.ok && d.ok) { status(form, "ok", d.message); toast("ok", d.message); }
      else status(form, "err", d.message || "Fehler.");
    });
  }

  /* Startseiten-Texte: dynamisches Formular aus /api/site */
  async function setupSiteEditor() {
    const form = $("#site-form"); const wrap = $("#site-fields");
    let data;
    try { data = await (await fetch("/api/site")).json(); } catch (e) { return; }
    if (!data || !data.ok) return;
    const fields = data.fields || [];
    wrap.innerHTML = fields.map((f) => {
      const v = BSG.escape((data.values && data.values[f.key]) || "");
      const ctrl = f.type === "textarea"
        ? '<textarea id="site-' + f.key + '" name="' + f.key + '">' + v + "</textarea>"
        : '<input id="site-' + f.key + '" name="' + f.key + '" type="text" value="' + v + '">';
      return '<div class="field"><label for="site-' + f.key + '">' + BSG.escape(f.label) + "</label>" + ctrl + "</div>";
    }).join("");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      const btn = form.querySelector("[type=submit]"); btn.setAttribute("aria-busy", "true");
      const { res, data: d } = await postJSON("/api/site", { values });
      btn.removeAttribute("aria-busy");
      if (res.ok && d.ok) { status(form, "ok", d.message); toast("ok", d.message); }
      else status(form, "err", d.message || "Fehler.");
    });
    $("#site-section").hidden = false;
  }

  /* Mitgliedsbeiträge: dynamisches Formular aus /api/membership-types.
     Editierbar sind die Euro-Beträge je Altersband + die Familien-Pauschale;
     die Bandstruktur (Label/Altersbereich) wird nur als Kontext angezeigt. */
  async function setupFeesEditor() {
    const form = $("#fees-form"); const wrap = $("#fees-fields");
    let data;
    try { data = await (await fetch("/api/membership-types")).json(); } catch (e) { return; }
    if (!data || !data.ok) return;
    const bands = Array.isArray(data.ageBands) ? data.ageBands : [];
    const eur = (v) => Math.round((Number(v) || 0) * 100) / 100;
    const rangeOf = (b) => (Number(b.maxAge) >= 199 ? "ab " + b.minAge : b.minAge + "–" + b.maxAge) + " J.";
    const feeRow = (label, id, val) =>
      '<div class="field"><label for="fee-' + id + '">' + label + ' <span class="muted-note">(€ / Monat)</span></label>' +
      '<input id="fee-' + id + '" name="' + id + '" type="number" min="0" step="0.01" inputmode="decimal" value="' + eur(val) + '"></div>';
    wrap.innerHTML =
      bands.map((b) => feeRow(BSG.escape(b.label) + " · " + rangeOf(b), "band-" + b.id, b.feeMonthly)).join("") +
      feeRow("Familien-Pauschale", "family", data.familyFlatMonthly);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        ageBands: bands.map((b) => ({ id: b.id, feeMonthly: Number(form.elements["band-" + b.id].value) })),
        familyFlatMonthly: Number(form.elements.family.value),
      };
      const btn = form.querySelector("[type=submit]"); btn.setAttribute("aria-busy", "true");
      const { res, data: d } = await postJSON("/api/membership-types", payload);
      btn.removeAttribute("aria-busy");
      if (res.ok && d.ok) { status(form, "ok", d.message); toast("ok", d.message); }
      else status(form, "err", (d && d.message) || "Fehler.");
    });
    $("#fees-section").hidden = false;
  }

  function payoutPanel(e) {
    const fee = Number(e.fee) || 0;
    if (fee <= 0) return "";
    const payTotal = Number(e.payTotal) || 0;
    const ownTotal = Number(e.ownTotal) || 0, clubTotal = Number(e.clubTotal) || 0;
    const head = '<div class="payout"><div class="payout__sum"><span>Teilnahmegebühren gesamt</span><strong>' + fmtEuro(payTotal) + " €</strong></div>" +
      '<p class="muted-note">Geb&uuml;hr ' + fmtEuro(fee) + " € × " + (e.count || 0) + " Anmeldung(en)" +
      (ownTotal || clubTotal ? " · davon Eigenanteile " + fmtEuro(ownTotal) + " €, Verein tr&auml;gt " + fmtEuro(clubTotal) + " €" : "") + "</p>";
    let action;
    if (e.payout) {
      const p = e.payout;
      action = '<div class="payout__done"><span class="badge badge--aktiv">&uuml;berwiesen</span> ' +
        fmtEuro(p.amount) + " € an " + BSG.escape(p.organizerName || "Veranstalter") + " (" + BSG.escape(p.organizerIban || "") + ")<br>" +
        '<span class="muted-note">veranlasst am ' + BSG.formatDate(p.initiatedAt) + " durch " + BSG.escape(p.initiatedByName || "—") +
        (p.reference ? " · Verwendungszweck: " + BSG.escape(p.reference) : "") + "</span>" +
        (CAN_PAYOUTS ? '<div style="margin-top:8px"><button class="btn btn--outline btn--sm" data-payout-cancel="' + p.id + '">Storno</button></div>' : "") +
        "</div>";
    } else if (!CAN_PAYOUTS) {
      action = "";
    } else if (!e.organizerIban) {
      action = '<p class="muted-note">Bitte Veranstalter-IBAN im Termin hinterlegen, um die &Uuml;berweisung zu veranlassen.</p>';
    } else if (!e.count) {
      action = '<p class="muted-note">Noch keine Anmeldungen &ndash; nichts zu &uuml;berweisen.</p>';
    } else {
      action = '<div class="payout__to muted-note">An ' + BSG.escape(e.organizerName || "Veranstalter") + " · " + BSG.escape(e.organizerIban) + "</div>" +
        '<button class="btn btn--primary btn--sm" data-payout="' + e.id + '">&Uuml;berweisung veranlassen</button>';
    }
    return head + action + "</div>";
  }

  function regRow(e) {
    const acls = (e.ageClasses && e.ageClasses.length)
      ? ' · ' + e.ageClasses.map((c) => '<span class="ac-badge">' + BSG.escape(c) + "</span>").join("")
      : "";
    const fee = Number(e.fee) || 0;
    const own = Math.min(fee, Number(e.ownShare) || 0);
    const money = fee > 0 ? '<span class="muted-note"> · Eigenanteil ' + own.toLocaleString("de-DE") + " € (Verein " + (fee - own).toLocaleString("de-DE") + " €)</span>" : "";
    const rows = (e.registrations || []).length
      ? '<table class="adm-mini-table"><tbody>' + e.registrations.map((r) =>
          "<tr><td><b>" + BSG.escape(r.firstName + " " + r.lastName) + "</b>" +
          (r.competitionClasses && r.competitionClasses.length ? " " + r.competitionClasses.map((c) => '<span class="ac-badge">' + BSG.escape(c) + "</span>").join("") : "") +
          "</td><td class='muted-note'>" + BSG.escape(r.ownerName) + "<br>" + BSG.escape(r.ownerEmail) + "</td></tr>"
        ).join("") + "</tbody></table>"
      : '<p class="muted-note">Noch keine Anmeldungen.</p>';
    return '<div class="adm-role"><div class="adm-role__head"><div><b>' + BSG.escape(e.title) + "</b> " +
      '<span class="badge">' + BSG.escape(e.type) + "</span>" + acls + "<br>" +
      '<span class="muted-note">' + BSG.formatDate(e.date) + "</span>" + money +
      "</div><div><b>" + (e.registrations ? e.registrations.length : 0) + "</b></div></div>" + rows + payoutPanel(e) + "</div>";
  }

  async function loadRegistrations() {
    let data;
    try { data = await (await fetch("/api/admin/registrations")).json(); } catch (e) { return; }
    if (!data || !data.ok) return;
    const items = data.items || [];
    const listEl = $("#registrations-list");
    listEl.innerHTML = items.length ? items.map(regRow).join("") : '<p class="muted-note">Keine kommenden Turniere oder Meisterschaften.</p>';
    $("#registrations-section").hidden = false;
    if (!listEl.dataset.wired) {
      listEl.dataset.wired = "1";
      listEl.addEventListener("click", async (ev) => {
        const pay = ev.target.closest("[data-payout]");
        const cancel = ev.target.closest("[data-payout-cancel]");
        if (pay) {
          const reference = prompt("Verwendungszweck (optional):", "Teilnahmegebühren");
          if (reference === null) return;
          const btn = pay; btn.setAttribute("aria-busy", "true");
          const { res, data: d } = await postJSON("/api/payouts", { eventId: pay.getAttribute("data-payout"), reference });
          if (res.ok && d.ok) { toast("ok", d.message); await loadRegistrations(); await loadPayouts(); }
          else { btn.removeAttribute("aria-busy"); toast("err", d.message || "Fehler."); }
        }
        if (cancel) {
          if (!confirm("Diese Überweisung wirklich stornieren?")) return;
          const { res, data: d } = await postJSON("/api/payouts/cancel", { id: cancel.getAttribute("data-payout-cancel") });
          if (res.ok && d.ok) { toast("ok", d.message); await loadRegistrations(); await loadPayouts(); }
          else toast("err", d.message || "Fehler.");
        }
      });
    }
  }

  async function loadPayouts() {
    let data;
    try { data = await (await fetch("/api/payouts")).json(); } catch (e) { return; }
    if (!data || !data.ok) return;
    const items = data.items || [];
    $("#payouts-list").innerHTML = items.length
      ? items.map((p) =>
          '<div class="adm-role"><div class="adm-role__head"><div><b>' + fmtEuro(p.amount) + " € · " + BSG.escape(p.eventTitle) + "</b><br>" +
          '<span class="muted-note">an ' + BSG.escape(p.organizerName || "Veranstalter") + " · " + BSG.escape(p.organizerIban || "") +
          " · veranlasst am " + BSG.formatDate(p.initiatedAt) + " durch " + BSG.escape(p.initiatedByName || "—") + "</span></div>" +
          '<span class="badge badge--aktiv">überwiesen</span></div></div>'
        ).join("")
      : '<p class="muted-note">Noch keine Überweisungen veranlasst.</p>';
    $("#payouts-section").hidden = false;
  }

  init();
})();
