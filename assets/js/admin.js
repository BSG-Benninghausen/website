/* =====================================================================
   admin.js – Administration: Rollen, Berechtigungen, Benutzer
   Geschützt: nur für Benutzer mit manage_roles und/oder manage_users.
   ===================================================================== */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  let perms = [];   // Berechtigungs-Katalog
  let roles = [];   // alle Rollen
  let posUsers = []; // {id,name} für den Mitglieder-Picker der Vereinsämter
  let featureRoles = []; // {id,label} für die Rollen-Auswahl der Feature-Freigabe
  let can = { roles: false, users: false, team: false, features: false };

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
    can.team = me.isAdmin || me.permissions.includes("manage_team");
    can.features = me.isAdmin || me.permissions.includes("manage_features");
    can.booking = me.isAdmin || me.permissions.includes("book_features");
    if (!can.roles && !can.users && !can.team && !can.features && !can.booking) { window.location.href = "konto.html"; return; }

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
    if (can.team) {
      await loadPositions();
      $("#team-section").hidden = false;
    }
    if (can.features) {
      await loadFeatures();
      $("#features-section").hidden = false;
    }
    if (can.booking) {
      await loadBookings();
      $("#booking-section").hidden = false;
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
              '<button class="btn btn--primary btn--sm" data-save-role="' + r.id + '">Berechtigungen speichern</button>') +
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

  /* ---------- Vereinsämter (öffentliche Team-Seite) ---------- */
  async function loadPositions() {
    try {
      const data = await (await fetch("/api/positions")).json();
      posUsers = data.users || [];
      renderUserPicker();
      renderPositions(data.items || []);
    } catch (e) {
      $("#positions-list").innerHTML = '<p class="load-error">Vereinsämter konnten nicht geladen werden.</p>';
    }
  }
  function userOptions(selected) {
    return posUsers.map((u) =>
      '<option value="' + u.id + '"' + (u.id === selected ? " selected" : "") + ">" + BSG.escape(u.name) + "</option>").join("");
  }
  function renderUserPicker(selected) {
    const sel = $("#pos-user");
    if (sel) sel.innerHTML = userOptions(selected);
  }
  function groupOptions(g) {
    const opt = (v, t) => '<option value="' + v + '"' + (g === v ? " selected" : "") + ">" + t + "</option>";
    return opt("vorstand", "Vorstand") + opt("trainer", "Trainerteam");
  }
  function renderPositions(items) {
    $("#positions-list").innerHTML = items.length ? items.map((p) =>
      '<div class="adm-role" data-position="' + p.id + '">' +
        '<div class="adm-role__head"><div><b>' + BSG.escape(p.name) + '</b> <span class="badge">' + (p.group === "trainer" ? "Trainerteam" : "Vorstand") + "</span></div>" +
          '<button class="btn btn--outline btn--sm" data-del-position="' + p.id + '">Löschen</button></div>' +
        '<div class="field-row">' +
          '<div class="field"><label>Mitglied</label><select data-pos-user>' + userOptions(p.userId) + "</select></div>" +
          '<div class="field"><label>Bereich</label><select data-pos-group>' + groupOptions(p.group) + "</select></div>" +
        "</div>" +
        '<div class="field-row">' +
          '<div class="field"><label>Funktionsname</label><input type="text" data-pos-label value="' + BSG.escape(p.label) + '"></div>' +
          '<div class="field"><label>Reihenfolge</label><input type="number" step="1" data-pos-order value="' + (Number(p.order) || 0) + '"></div>' +
        "</div>" +
        '<button class="btn btn--primary btn--sm" data-save-position="' + p.id + '">Amt speichern</button>' +
      "</div>").join("") : '<p class="muted-note">Noch keine Ämter angelegt.</p>';
  }

  /* ---------- Features & Beta-Freigabe ---------- */
  async function loadFeatures() {
    try {
      const data = await (await fetch("/api/features")).json();
      featureRoles = data.roles || [];
      renderFeatures(data.items || []);
    } catch (e) {
      $("#features-list").innerHTML = '<p class="load-error">Features konnten nicht geladen werden.</p>';
    }
  }
  // Scope eines Features auf den Selektor-Wert abbilden: "public" | "off" | "roles".
  const scopeMode = (scope) => (scope === "public" ? "public" : (scope && scope.roles ? "roles" : "off"));
  function featureRoleChecks(scope) {
    const sel = (scope && scope.roles) || [];
    return featureRoles.map((r) =>
      '<label class="perm-check"><input type="checkbox" value="' + r.id + '"' +
      (sel.includes(r.id) ? " checked" : "") + "> " + BSG.escape(r.label) + "</label>"
    ).join("");
  }
  function renderFeatures(items) {
    $("#features-list").innerHTML = items.length ? items.map((f) => {
      const mode = scopeMode(f.scope);
      const statusBadge = f.status === "beta" ? ' <span class="badge badge--beta">Beta</span>' : "";
      const opt = (v, t) => '<option value="' + v + '"' + (mode === v ? " selected" : "") + ">" + t + "</option>";
      return (
        '<div class="adm-role" data-feature-key="' + f.key + '">' +
          '<div class="adm-role__head"><div><b>' + BSG.escape(f.label) + "</b>" + statusBadge + "</div></div>" +
          '<div class="field"><label>Freigabe</label><select data-feat-scope>' +
            opt("off", "Aus (nur Vorschau für Verwalter)") +
            opt("roles", "Nur bestimmte Rollen (interne Beta)") +
            opt("public", "Öffentlich (alle)") +
          "</select></div>" +
          '<fieldset class="perm-grid" data-feat-roles' + (mode === "roles" ? "" : " hidden") + ">" + featureRoleChecks(f.scope) + "</fieldset>" +
          '<button class="btn btn--primary btn--sm" data-save-feature="' + f.key + '">Freigabe speichern</button>' +
        "</div>"
      );
    }).join("") : '<p class="muted-note">Keine Features vorhanden.</p>';
  }

  const checkedValues = (scope) => [...scope.querySelectorAll('input[type="checkbox"]:checked')].map((c) => c.value);

  /* ---------- Funktionen buchen (Provisionierung) ---------- */
  async function loadBookings() {
    try {
      const data = await (await fetch("/api/bookings")).json();
      renderBookings(data.items || []);
    } catch (e) {
      $("#booking-list").innerHTML = '<p class="load-error">Buchungen konnten nicht geladen werden.</p>';
    }
  }
  function renderBookings(items) {
    $("#booking-list").innerHTML = items.length ? items.map((f) => {
      const statusBadge = f.status === "beta" ? ' <span class="badge badge--beta">Beta</span>' : "";
      return (
        '<div class="adm-role" data-booking-key="' + f.key + '">' +
          '<div class="adm-role__head"><div><b>' + BSG.escape(f.label) + "</b>" + statusBadge + "</div></div>" +
          '<label class="perm-check"><input type="checkbox" data-book-toggle' + (f.booked ? " checked" : "") + "> Gebucht (für diesen Verein freigeschaltet)</label>" +
          '<button class="btn btn--primary btn--sm" data-save-booking="' + f.key + '">Buchung speichern</button>' +
        "</div>"
      );
    }).join("") : '<p class="muted-note">Keine Funktionen vorhanden.</p>';
  }

  function wireEvents() {
    // Neue Rolle anlegen
    const createForm = $("#role-create-form");
    if (createForm) createForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      createForm.querySelectorAll(".field--error").forEach((f) => f.classList.remove("field--error"));
      const label = createForm.elements.label.value;
      const permissions = checkedValues($("#role-perms"));
      const { res, data } = await postJSON("/api/roles", { label, permissions });
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

    // Neues Vereinsamt anlegen
    const posForm = $("#position-create-form");
    if (posForm) posForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      posForm.querySelectorAll(".field--error").forEach((f) => f.classList.remove("field--error"));
      const payload = {
        userId: posForm.elements.userId.value,
        group: posForm.elements.group.value,
        label: posForm.elements.label.value,
        order: posForm.elements.order.value,
      };
      const { res, data } = await postJSON("/api/positions", payload);
      if (res.ok && data.ok) {
        posForm.reset();
        await loadPositions();
        toast("ok", data.message);
      } else {
        if (data.errors) {
          Object.keys(data.errors).forEach((key) => {
            const el = posForm.elements[key];
            const f = el && el.closest(".field");
            if (!f) return;
            f.classList.add("field--error");
            const p = f.querySelector(".field__error"); if (p) p.textContent = data.errors[key];
          });
        }
        toast("err", data.message || "Fehler.");
      }
    });

    // Feature-Scope-Selektor: Rollen-Auswahl nur im Modus „roles" zeigen
    const featuresList = $("#features-list");
    if (featuresList) featuresList.addEventListener("change", (e) => {
      const sel = e.target.closest("[data-feat-scope]");
      if (!sel) return;
      const card = sel.closest("[data-feature-key]");
      const roleset = card && card.querySelector("[data-feat-roles]");
      if (roleset) roleset.hidden = sel.value !== "roles";
    });

    // Klicks im Admin-Bereich (Delegation)
    $("#admin").addEventListener("click", async (e) => {
      const saveRole = e.target.closest("[data-save-role]");
      const delRole = e.target.closest("[data-del-role]");
      const saveUser = e.target.closest("[data-save-user]");
      const savePos = e.target.closest("[data-save-position]");
      const delPos = e.target.closest("[data-del-position]");
      const saveFeat = e.target.closest("[data-save-feature]");
      const saveBooking = e.target.closest("[data-save-booking]");

      if (saveFeat) {
        const card = saveFeat.closest("[data-feature-key]");
        const mode = (card.querySelector("[data-feat-scope]") || {}).value;
        const release = mode === "roles" ? checkedValues(card.querySelector("[data-feat-roles]")) : mode;
        const { res, data } = await postJSON("/api/features/release", { key: saveFeat.getAttribute("data-save-feature"), release });
        toast(res.ok && data.ok ? "ok" : "err", data.message || "Fehler.");
        if (res.ok && data.ok) await loadFeatures();
      }

      if (saveBooking) {
        const card = saveBooking.closest("[data-booking-key]");
        const booked = !!(card.querySelector("[data-book-toggle]") || {}).checked;
        const { res, data } = await postJSON("/api/features/book", { key: saveBooking.getAttribute("data-save-booking"), booked });
        toast(res.ok && data.ok ? "ok" : "err", data.message || "Fehler.");
        if (res.ok && data.ok) await loadBookings();
      }

      if (saveRole) {
        const card = saveRole.closest(".adm-role");
        const permissions = checkedValues(card.querySelector(".perm-grid"));
        const { res, data } = await postJSON("/api/roles/update", { id: saveRole.getAttribute("data-save-role"), permissions });
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

      if (savePos) {
        const card = savePos.closest(".adm-role");
        const payload = {
          id: savePos.getAttribute("data-save-position"),
          userId: (card.querySelector("[data-pos-user]") || {}).value,
          group: (card.querySelector("[data-pos-group]") || {}).value,
          label: (card.querySelector("[data-pos-label]") || {}).value,
          order: (card.querySelector("[data-pos-order]") || {}).value,
        };
        const { res, data } = await postJSON("/api/positions/update", payload);
        toast(res.ok && data.ok ? "ok" : "err", data.message || "Fehler.");
        if (res.ok && data.ok) await loadPositions();
      }

      if (delPos) {
        if (!confirm("Dieses Amt wirklich löschen?")) return;
        const { res, data } = await postJSON("/api/positions/delete", { id: delPos.getAttribute("data-del-position") });
        toast(res.ok && data.ok ? "ok" : "err", data.message || "Fehler.");
        if (res.ok && data.ok) await loadPositions();
      }
    });
  }

  init();
})();
