/* =====================================================================
   benutzer.js – Verwaltung der Login-Konten (Benutzer). Recht: manage_users.
   Liste mit Rollenzuweisung, Sperren/Entsperren und Löschen. Getrennt von der
   Mitglieder-Seite (Mitgliedschafts-Datensätze) – ein Konto kann mehrere
   Mitgliedschaften „besitzen" (Haushalt).
   ===================================================================== */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  function esc(v) {
    if (typeof BSG !== "undefined" && BSG.escape) return BSG.escape(v == null ? "" : v);
    return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  let roles = [];
  let users = [];

  async function init() {
    let me;
    try { const r = await fetch("/api/auth/me"); me = await r.json(); if (!r.ok || !me.ok) { location.href = "login.html"; return; } }
    catch (e) { location.href = "login.html"; return; }
    if (!(me.isAdmin || (me.permissions || []).includes("manage_users"))) { location.href = "konto.html"; return; }

    try {
      roles = ((await (await fetch("/api/roles")).json()).items) || [];
      await loadUsers();
    } catch (e) { $("#users-loading").textContent = "Benutzer konnten nicht geladen werden."; return; }

    $("#users-loading").hidden = true;
    $("#users-list").hidden = false;
    bindActions();
  }

  async function loadUsers() {
    users = ((await (await fetch("/api/users")).json()).items) || [];
    render();
  }

  function fmtDate(s) {
    if (!s) return "—";
    try { return new Date(s).toLocaleDateString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit" }); }
    catch (e) { return "—"; }
  }

  function userCard(u) {
    const roleChecks = roles.map((r) =>
      '<label class="perm-check"><input type="checkbox" value="' + esc(r.id) + '"' +
      ((u.roles || []).includes(r.id) ? " checked" : "") + "> " + esc(r.label) + "</label>"
    ).join("");
    const statusBadge = u.active
      ? '<span class="badge badge--aktiv">aktiv</span>'
      : '<span class="badge badge--gekuendigt">gesperrt</span>';
    const meta =
      '<span class="muted-note">' + esc(u.email) + "</span>" +
      '<span class="muted-note">' + statusBadge + " · " + (u.membershipCount || 0) +
        " Mitgliedschaft(en) · seit " + fmtDate(u.createdAt) + (u.isSelf ? " · du" : "") + "</span>";
    const actions = u.isSelf
      ? '<span class="muted-note">eigenes Konto</span>'
      : '<button class="btn btn--outline btn--sm" data-toggle-active="' + esc(u.id) + '" data-active="' + (u.active ? "1" : "0") + '">' +
          (u.active ? "Sperren" : "Entsperren") + "</button>" +
        '<button class="btn btn--ghost btn--sm" data-del-user="' + esc(u.id) + '">Löschen</button>';
    return (
      '<div class="adm-user" data-user="' + esc(u.id) + '">' +
        '<div class="adm-user__id"><b>' + esc(u.name) + "</b>" + meta + "</div>" +
        '<fieldset class="perm-grid">' + roleChecks + "</fieldset>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px">' +
          '<button class="btn btn--primary btn--sm" data-save-user="' + esc(u.id) + '">Rollen speichern</button>' +
          actions +
        "</div>" +
      "</div>"
    );
  }

  function render() {
    $("#users-list").innerHTML = users.map(userCard).join("") || '<p class="muted-note">Keine Benutzer.</p>';
    const meta = $("#users-meta");
    if (meta) {
      meta.hidden = false;
      meta.innerHTML = '<div class="billing-summary__total"><span class="muted-note">Benutzer gesamt · ' +
        users.filter((u) => u.active).length + " aktiv</span><strong>" + users.length + "</strong></div>";
    }
  }

  function setStatus(msg, ok) {
    const el = $("#users-status");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "form-status" + (msg ? " is-visible" : "") + (ok === false ? " form-status--err" : ok === true ? " form-status--ok" : "");
  }

  async function post(path, body) {
    try {
      const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      return { ok: r.ok && d.ok, data: d };
    } catch (e) { return { ok: false, data: { message: "Verbindung fehlgeschlagen." } }; }
  }

  function bindActions() {
    $("#users-list").addEventListener("click", async (e) => {
      const card = e.target.closest("[data-user]");
      if (!card) return;
      const id = card.getAttribute("data-user");
      const u = users.find((x) => x.id === id) || {};

      if (e.target.closest("[data-save-user]")) {
        const checked = [...card.querySelectorAll(".perm-grid input:checked")].map((i) => i.value);
        const { ok, data } = await post("/api/users/roles", { userId: id, roles: checked });
        setStatus(data.message || (ok ? "Rollen gespeichert." : "Fehler."), ok);
        if (ok) await loadUsers();
        return;
      }
      const toggle = e.target.closest("[data-toggle-active]");
      if (toggle) {
        const next = toggle.getAttribute("data-active") !== "1"; // aktiv -> sperren (false)
        const { ok, data } = await post("/api/users/status", { userId: id, active: next });
        setStatus(data.message || (ok ? "Gespeichert." : "Fehler."), ok);
        if (ok) await loadUsers();
        return;
      }
      if (e.target.closest("[data-del-user]")) {
        if (!window.confirm('Benutzer „' + (u.name || "") + '" wirklich löschen? Das Login-Konto wird entfernt.')) return;
        const { ok, data } = await post("/api/users/delete", { userId: id });
        setStatus(data.message || (ok ? "Benutzer gelöscht." : "Fehler."), ok);
        if (ok) await loadUsers();
        return;
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
