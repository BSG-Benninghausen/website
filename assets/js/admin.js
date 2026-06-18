/* =====================================================================
   admin.js – Administration: Rollen, Berechtigungen, Benutzer
   Geschützt: nur für Benutzer mit manage_roles und/oder manage_users.
   ===================================================================== */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  let perms = [];   // Berechtigungs-Katalog
  let roles = [];   // alle Rollen
  let can = { roles: false, users: false };

  async function postJSON(url, data) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    return { res, data: await res.json() };
  }
  function toast(type, text) {
    const box = $("#admin-status");
    box.className = "form-status is-visible form-status--" + (type === "ok" ? "ok" : "err");
    const icon = type === "ok"
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6 9 17l-5-5"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>';
    box.innerHTML = icon + "<span>" + BSG.escape(text) + "</span>";
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function init() {
    let me;
    try {
      const res = await fetch("/api/auth/me");
      me = await res.json();
      if (!res.ok || !me.ok) { window.location.href = "login.html"; return; }
    } catch (e) { window.location.href = "login.html"; return; }

    can.roles = me.isAdmin || me.permissions.includes("manage_roles");
    can.users = me.isAdmin || me.permissions.includes("manage_users");
    if (!can.roles && !can.users) { window.location.href = "konto.html"; return; }

    $("#admin-loading").hidden = true;
    $("#admin").hidden = false;

    if (can.roles) {
      await loadPerms();
      await loadRoles();
      renderRoleCreate();
      renderRoles();
      $("#roles-section").hidden = false;
    }
    if (can.users) {
      if (!roles.length) await loadRoles();   // für Rollen-Auswahl
      await loadUsers();
      $("#users-section").hidden = false;
    }
    wireEvents();
  }

  async function loadPerms() { perms = (await (await fetch("/api/permissions")).json()).items || []; }
  async function loadRoles() { roles = (await (await fetch("/api/roles")).json()).items || []; }

  /* ---------- Rollen ---------- */
  function permCheckboxes(checked, disabled) {
    return perms.map((p) =>
      '<label class="perm-check"><input type="checkbox" value="' + p.key + '"' +
      (checked.includes(p.key) ? " checked" : "") + (disabled ? " disabled" : "") + "> " +
      BSG.escape(p.label) + "</label>"
    ).join("");
  }

  function renderRoleCreate() {
    $("#role-perms").innerHTML =
      '<legend class="perm-legend">Berechtigungen</legend>' + permCheckboxes([], false);
  }

  function teamControls(r) {
    const g = r.teamGroup || "";
    const opt = (v, t) => '<option value="' + v + '"' + (g === v ? " selected" : "") + ">" + t + "</option>";
    return (
      '<div class="role-team">' +
        '<div class="field-row">' +
          '<div class="field"><label>Auf Team-Seite anzeigen</label>' +
            '<select data-team-group>' + opt("", "— nicht anzeigen —") + opt("vorstand", "Vorstand") + opt("trainer", "Trainerteam") + "</select></div>" +
          '<div class="field"><label>Reihenfolge</label>' +
            '<input type="number" step="1" data-team-order value="' + (Number(r.teamOrder) || 0) + '"></div>' +
        "</div>" +
        '<div class="field"><label>Funktionsname (optional)</label>' +
          '<input type="text" data-team-label placeholder="Standard: ' + BSG.escape(r.label) + '" value="' + BSG.escape(r.teamLabel || "") + '"></div>' +
      "</div>"
    );
  }

  function renderRoles() {
    $("#roles-list").innerHTML = roles.map((r) => {
      const isAdminRole = r.id === "admin";
      const checked = isAdminRole ? perms.map((p) => p.key) : (r.permissions || []);
      return (
        '<div class="adm-role" data-role="' + r.id + '">' +
          '<div class="adm-role__head">' +
            "<div><b>" + BSG.escape(r.label) + "</b>" + (r.system ? ' <span class="badge badge--gekuendigt">System</span>' : "") + "</div>" +
            (!r.system ? '<button class="btn btn--outline btn--sm" data-del-role="' + r.id + '">Löschen</button>' : "") +
          "</div>" +
          (isAdminRole
            ? '<p class="muted-note">Besitzt immer alle Berechtigungen.</p>'
            : '<fieldset class="perm-grid">' + permCheckboxes(checked, false) + "</fieldset>" +
              teamControls(r) +
              '<button class="btn btn--primary btn--sm" data-save-role="' + r.id + '">Berechtigungen &amp; Anzeige speichern</button>') +
        "</div>"
      );
    }).join("");
  }

  /* ---------- Benutzer ---------- */
  async function loadUsers() {
    const wrap = $("#users-list");
    try {
      const items = (await (await fetch("/api/users")).json()).items || [];
      wrap.innerHTML = items.map(userRow).join("");
    } catch (e) {
      wrap.innerHTML = '<p class="load-error">Benutzer konnten nicht geladen werden.</p>';
    }
  }
  function userRow(u) {
    const roleChecks = roles.map((r) =>
      '<label class="perm-check"><input type="checkbox" value="' + r.id + '"' +
      ((u.roles || []).includes(r.id) ? " checked" : "") + "> " + BSG.escape(r.label) + "</label>"
    ).join("");
    return (
      '<div class="adm-user" data-user="' + u.id + '">' +
        '<div class="adm-user__id"><b>' + BSG.escape(u.name) + "</b><span>" + BSG.escape(u.email) + "</span></div>" +
        '<fieldset class="perm-grid">' + roleChecks + "</fieldset>" +
        '<button class="btn btn--primary btn--sm" data-save-user="' + u.id + '">Rollen speichern</button>' +
      "</div>"
    );
  }

  const checkedValues = (scope) => [...scope.querySelectorAll('input[type="checkbox"]:checked')].map((c) => c.value);

  function wireEvents() {
    // Neue Rolle anlegen
    const createForm = $("#role-create-form");
    if (createForm) createForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      createForm.querySelectorAll(".field--error").forEach((f) => f.classList.remove("field--error"));
      const label = createForm.elements.label.value;
      const permissions = checkedValues($("#role-perms"));
      const teamGroup = createForm.elements.teamGroup.value;
      const teamLabel = createForm.elements.teamLabel.value;
      const teamOrder = createForm.elements.teamOrder.value;
      const { res, data } = await postJSON("/api/roles", { label, permissions, teamGroup, teamLabel, teamOrder });
      if (res.ok && data.ok) {
        createForm.reset();
        await loadRoles(); renderRoles();
        if (can.users) await loadUsers();
        toast("ok", data.message);
      } else {
        if (data.errors && data.errors.label) {
          const f = createForm.elements.label.closest(".field");
          f.classList.add("field--error");
          const p = f.querySelector(".field__error"); if (p) p.textContent = data.errors.label;
        }
        toast("err", data.message || "Fehler.");
      }
    });

    // Klicks im Admin-Bereich (Delegation)
    $("#admin").addEventListener("click", async (e) => {
      const saveRole = e.target.closest("[data-save-role]");
      const delRole = e.target.closest("[data-del-role]");
      const saveUser = e.target.closest("[data-save-user]");

      if (saveRole) {
        const card = saveRole.closest(".adm-role");
        const permissions = checkedValues(card.querySelector(".perm-grid"));
        const teamGroup = (card.querySelector("[data-team-group]") || {}).value || "";
        const teamLabel = (card.querySelector("[data-team-label]") || {}).value || "";
        const teamOrder = (card.querySelector("[data-team-order]") || {}).value || 0;
        const { res, data } = await postJSON("/api/roles/update", { id: saveRole.getAttribute("data-save-role"), permissions, teamGroup, teamLabel, teamOrder });
        toast(res.ok && data.ok ? "ok" : "err", data.message || "Fehler.");
        if (res.ok && data.ok) await loadRoles();
      }

      if (delRole) {
        if (!confirm("Diese Rolle wirklich löschen?")) return;
        const { res, data } = await postJSON("/api/roles/delete", { id: delRole.getAttribute("data-del-role") });
        if (res.ok && data.ok) { await loadRoles(); renderRoles(); if (can.users) await loadUsers(); }
        toast(res.ok && data.ok ? "ok" : "err", data.message || "Fehler.");
      }

      if (saveUser) {
        const row = saveUser.closest(".adm-user");
        const newRoles = checkedValues(row.querySelector(".perm-grid"));
        const { res, data } = await postJSON("/api/users/roles", { userId: saveUser.getAttribute("data-save-user"), roles: newRoles });
        toast(res.ok && data.ok ? "ok" : "err", data.message || "Fehler.");
        if (res.ok && data.ok) await loadUsers();
      }
    });
  }

  init();
})();
