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
  const eventRow = (e) => adminRow(e.title, BSG.formatDate(e.date) + " · " + (e.type || "") + (e.time ? " · " + e.time : ""), e.id);

  function setupEditor(o) {
    let items = [];
    async function load() {
      items = (await (await fetch(o.api)).json()).items || [];
      o.listEl.innerHTML = items.length ? items.map(o.render).join("") : '<p class="muted-note">Noch keine Einträge.</p>';
    }
    function reset() {
      o.form.reset(); o.form.elements.id.value = "";
      o.formTitle.textContent = o.newTitle; o.resetBtn.hidden = true; clearErrors(o.form);
    }
    o.form.addEventListener("submit", async (e) => {
      e.preventDefault(); clearErrors(o.form);
      const fd = Object.fromEntries(new FormData(o.form).entries());
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
        if (it) { fillForm(o.form, it); o.form.elements.id.value = it.id; o.formTitle.textContent = o.editTitle; o.resetBtn.hidden = false; o.form.scrollIntoView({ behavior: "smooth", block: "center" }); }
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
      const ed = setupEditor({ listEl: $("#events-list"), form: $("#event-form"), resetBtn: $("#event-reset"), formTitle: $("#event-form-title"), api: "/api/events", newTitle: "Neuer Termin", editTitle: "Termin bearbeiten", render: eventRow });
      await ed.load(); $("#events-section").hidden = false;
    }
  }

  init();
})();
