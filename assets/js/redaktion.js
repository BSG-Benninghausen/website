/* =====================================================================
   redaktion.js – News- & Termine-Editor (dynamischer Content)
   Zugriff: manage_news (News) und/oder manage_events (Termine).
   ===================================================================== */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);

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

    const canNews = me.isAdmin || me.permissions.includes("manage_news");
    const canEvents = me.isAdmin || me.permissions.includes("manage_events");
    if (!canNews && !canEvents) { location.href = "konto.html"; return; }

    $("#red-loading").hidden = true; $("#red").hidden = false;

    if (canNews) {
      const ed = setupEditor({ listEl: $("#news-list"), form: $("#news-form"), resetBtn: $("#news-reset"), formTitle: $("#news-form-title"), api: "/api/news", newTitle: "Neue Meldung", editTitle: "Meldung bearbeiten", render: newsRow });
      await ed.load(); $("#news-section").hidden = false;
    }
    if (canEvents) {
      const TOURNAMENT_TYPES = ["Turnier", "Meisterschaft"];
      const acField = $("#event-ageclasses-field");
      const acBox = $("#event-ageclasses");
      const typeSel = $("#e-type");
      let labels = [];
      try { labels = (await (await fetch("/api/age-classes")).json()).items || []; } catch (e) { labels = []; }
      acBox.innerHTML = labels.map((l) =>
        '<label class="perm-item"><input type="checkbox" name="ageClasses" value="' + BSG.escape(l) + '"><span>' + BSG.escape(l) + "</span></label>"
      ).join("");
      const toggleAc = () => { acField.hidden = !TOURNAMENT_TYPES.includes(typeSel.value); };
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

      await loadRegistrations();
    }
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
      "</div><div><b>" + (e.registrations ? e.registrations.length : 0) + "</b></div></div>" + rows + "</div>";
  }

  async function loadRegistrations() {
    let data;
    try { data = await (await fetch("/api/admin/registrations")).json(); } catch (e) { return; }
    if (!data || !data.ok) return;
    const items = data.items || [];
    $("#registrations-list").innerHTML = items.length ? items.map(regRow).join("") : '<p class="muted-note">Keine kommenden Turniere oder Meisterschaften.</p>';
    $("#registrations-section").hidden = false;
  }

  init();
})();
