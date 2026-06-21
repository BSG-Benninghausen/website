/* =====================================================================
   verwaltung.js – kombinierte Verwaltung von Benutzern (Login-Konten) und
   Mitgliedern (Mitgliedschafts-Datensätze). Ein Mitglied gehört über ownerId
   zu einem Benutzer (Haushalt). Ansichten: nur Benutzer / nur Mitglieder /
   verschachtelt. Details + Aktionen in einem Side-Panel (Drawer).
   Rechte: view_members (Mitglieder) und/oder manage_users (Benutzer);
   Finanzfelder nur view_finance (Server liefert sie nur dann).
   ===================================================================== */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  function esc(v) {
    if (typeof BSG !== "undefined" && BSG.escape) return BSG.escape(v == null ? "" : v);
    return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  let caps = { users: false, members: false, finance: false, team: false };
  let roles = [], users = [], members = [], vorstandPosts = [];
  let view = "nested";
  let lastTrigger = null;

  /* ---------------- Laden ---------------- */
  async function init() {
    let me;
    try { const r = await fetch("/api/auth/me"); me = await r.json(); if (!r.ok || !me.ok) { location.href = "login.html"; return; } }
    catch (e) { location.href = "login.html"; return; }
    const has = (p) => me.isAdmin || (me.permissions || []).includes(p);
    caps = { users: has("manage_users"), members: has("view_members"), finance: has("view_finance"), team: has("manage_team") };
    if (!caps.users && !caps.members) { location.href = "konto.html"; return; }

    try {
      if (caps.users) {
        roles = ((await (await fetch("/api/roles")).json()).items) || [];
        users = ((await (await fetch("/api/users")).json()).items) || [];
      }
      if (caps.members) {
        const md = await (await fetch("/api/admin/members")).json();
        members = md.items || [];
        caps.finance = !!md.canViewFinance;
      }
      if (caps.team) await reloadPositions();
    } catch (e) { $("#vw-loading").textContent = "Daten konnten nicht geladen werden."; return; }

    view = (caps.users && caps.members) ? "nested" : (caps.users ? "users" : "members");
    renderToggle();
    render();
    bindEvents();
    $("#vw-loading").hidden = true;
    $("#vw-main").hidden = false;
  }

  async function reloadUsers() { try { users = ((await (await fetch("/api/users")).json()).items) || []; } catch (e) {} }
  async function reloadPositions() { try { vorstandPosts = (((await (await fetch("/api/positions")).json()).items) || []).filter((p) => p.group === "vorstand"); } catch (e) {} }
  const userPost = (u) => vorstandPosts.find((p) => p.userId === u.id);

  /* ---------------- Helfer ---------------- */
  const roleLabel = (id) => { const r = roles.find((x) => x.id === id); return r ? r.label : id; };
  const muted = (t) => '<p class="muted-note">' + esc(t) + "</p>";
  const fmtDate = (s) => { if (!s) return "—"; try { return new Date(s).toLocaleDateString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit" }); } catch (e) { return "—"; } };
  const statusBadge = (active) => active ? '<span class="badge badge--aktiv">aktiv</span>' : '<span class="badge badge--gekuendigt">gesperrt</span>';
  const memberBadge = (m) => '<span class="badge badge--' + (m.status === "aktiv" ? "aktiv" : "gekuendigt") + '">' + esc(m.status) + "</span>";
  const acBadges = (m) => (m.competitionClasses && m.competitionClasses.length) ? m.competitionClasses.map((c) => '<span class="ac-badge">' + esc(c) + "</span>").join("") : "";
  const thumb = (m) => m.photo
    ? '<img class="member-thumb" src="' + esc(m.photo) + '" alt="">'
    : '<span class="member-thumb member-thumb--empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="9" r="3.2"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/></svg></span>';
  const membersOf = (u) => members.filter((m) => m.ownerId === u.id);
  function roleBadges(u) {
    let b = (u.roles || []).filter((r) => r !== "member").map((r) => '<span class="badge badge--intern">' + esc(roleLabel(r)) + "</span>").join("");
    const post = userPost(u);
    if (post) b += '<span class="badge badge--beta">' + esc(post.label) + "</span>";
    if ((u.activeMembershipCount || 0) > 0) b += '<span class="badge badge--aktiv">Mitglied</span>';
    return b || '<span class="muted-note">ohne Rolle</span>';
  }

  /* ---------------- Umschalter ---------------- */
  function renderToggle() {
    const opts = [];
    if (caps.users) opts.push(["users", "Nur Benutzer"]);
    if (caps.members) opts.push(["members", "Nur Mitglieder"]);
    if (caps.users && caps.members) opts.push(["nested", "Verschachtelt"]);
    const wrap = $("#vw-toggle");
    if (opts.length < 2) { wrap.hidden = true; return; }
    wrap.innerHTML = opts.map(([v, l]) =>
      '<button type="button" class="vw-toggle__btn' + (v === view ? " is-active" : "") + '" data-view="' + v + '" aria-pressed="' + (v === view) + '">' + esc(l) + "</button>"
    ).join("");
  }

  /* ---------------- Rendern ---------------- */
  function render() {
    const list = $("#vw-list");
    if (view === "users") { list.className = "adm-users"; list.innerHTML = users.map(userCard).join("") || muted("Keine Benutzer."); }
    else if (view === "members") { list.className = ""; list.innerHTML = membersTable(); }
    else { list.className = "adm-users"; list.innerHTML = users.map(nestedCard).join("") || muted("Keine Benutzer."); }
    renderMeta();
  }

  function userCard(u) {
    return '<div class="adm-user vw-row" data-user="' + esc(u.id) + '" tabindex="0" role="button">' +
      '<div class="adm-user__id"><b>' + esc(u.name) + '</b><span class="muted-note">' + esc(u.email) + "</span></div>" +
      '<div class="vw-badges">' + roleBadges(u) + " " + statusBadge(u.active) + "</div>" +
      '<div class="vw-row__meta muted-note">' + (u.activeMembershipCount || 0) + " aktiv</div>" +
    "</div>";
  }

  function nestedCard(u) {
    const kids = membersOf(u);
    const toggle = kids.length
      ? '<button type="button" class="vw-disclosure" data-expand="' + esc(u.id) + '" aria-expanded="false" aria-label="Mitglieder ein-/ausklappen">&#9656;</button>'
      : '<span class="vw-disclosure vw-disclosure--empty" aria-hidden="true"></span>';
    const childRows = kids.map((m) =>
      '<div class="vw-child" data-member="' + esc(m.id) + '" tabindex="0" role="button">' +
        thumb(m) + '<span class="vw-child__name"><b>' + esc(m.firstName) + " " + esc(m.lastName) + '</b> <span class="muted-note">' + esc(m.categoryLabel) + "</span></span>" +
        memberBadge(m) +
      "</div>").join("");
    return '<div class="adm-user vw-parent">' +
      '<div class="vw-parent__head">' + toggle +
        '<div class="vw-row vw-row--inline" data-user="' + esc(u.id) + '" tabindex="0" role="button">' +
          '<div class="adm-user__id"><b>' + esc(u.name) + '</b><span class="muted-note">' + esc(u.email) + "</span></div>" +
          '<div class="vw-badges">' + roleBadges(u) + " " + statusBadge(u.active) + "</div>" +
        "</div>" +
      "</div>" +
      '<div class="vw-children" data-children="' + esc(u.id) + '" hidden>' + (childRows || muted("Keine Mitglieder.")) + "</div>" +
    "</div>";
  }

  function membersTable() {
    const cols = ["Foto", "Name", "Pass-Nr.", "Klasse", "Altersklasse", "Status", "Haushalt"];
    if (caps.finance) cols.splice(5, 0, "Beitrag");
    const body = members.map((m) => {
      let row = "<td>" + thumb(m) + "</td><td><b>" + esc(m.firstName) + " " + esc(m.lastName) + "</b></td><td>" + esc(m.passNumber || "—") +
        "</td><td>" + esc(m.categoryLabel) + "</td><td>" + (acBadges(m) || "—") + "</td>";
      if (caps.finance) row += "<td>" + esc(m.individualFee) + " €</td>";
      row += "<td>" + memberBadge(m) + "</td><td>" + esc(m.ownerName) + "</td>";
      return '<tr class="vw-row" data-member="' + esc(m.id) + '" tabindex="0" role="button">' + row + "</tr>";
    }).join("") || '<tr><td colspan="' + cols.length + '" class="muted-note">Keine Mitglieder.</td></tr>';
    return '<div class="card" style="overflow-x:auto"><table class="data-table"><thead><tr>' +
      cols.map((c) => "<th>" + c + "</th>").join("") + "</tr></thead><tbody>" + body + "</tbody></table></div>";
  }

  function renderMeta() {
    const meta = $("#vw-meta");
    if (view === "members") {
      const active = members.filter((m) => m.status === "aktiv").length;
      meta.innerHTML = '<div class="billing-summary__total"><span class="muted-note">Mitglieder gesamt · ' + active + " aktiv</span><strong>" + members.length + "</strong></div>";
    } else {
      const active = users.filter((u) => u.active).length;
      meta.innerHTML = '<div class="billing-summary__total"><span class="muted-note">Benutzer gesamt · ' + active + " aktiv</span><strong>" + users.length + "</strong></div>";
    }
    meta.hidden = false;
  }

  /* ---------------- Drawer ---------------- */
  function openDrawer(html, trigger) {
    lastTrigger = trigger || null;
    $("#vw-drawer-body").innerHTML = html;
    $("#vw-drawer").classList.add("is-open");
    $("#vw-drawer").setAttribute("aria-hidden", "false");
    document.body.classList.add("vw-drawer-open");
    const f = $("#vw-drawer").querySelector("button, a, input, select, [tabindex]");
    if (f) f.focus();
  }
  function closeDrawer() {
    $("#vw-drawer").classList.remove("is-open");
    $("#vw-drawer").setAttribute("aria-hidden", "true");
    document.body.classList.remove("vw-drawer-open");
    if (lastTrigger && lastTrigger.focus) lastTrigger.focus();
  }
  function openUserDrawer(id, trigger) { const u = users.find((x) => x.id === id); if (u) openDrawer(userDrawerHTML(u), trigger); }
  function openMemberDrawer(id, trigger) { const m = members.find((x) => x.id === id); if (m) openDrawer(memberDrawerHTML(m), trigger); }

  function userDrawerHTML(u) {
    const roleChecks = roles.filter((r) => r.id !== "member").map((r) =>
      '<label class="perm-check"><input type="checkbox" value="' + esc(r.id) + '"' + ((u.roles || []).includes(r.id) ? " checked" : "") + "> " + esc(r.label) + "</label>").join("");
    const kids = caps.members ? membersOf(u) : [];
    const kidList = caps.members
      ? (kids.length ? '<ul class="vw-detail-list">' + kids.map((m) => "<li>" + esc(m.firstName) + " " + esc(m.lastName) + " · " + esc(m.categoryLabel) + " " + memberBadge(m) + "</li>").join("") + "</ul>" : muted("Keine Mitgliedschaften."))
      : "";
    const actions = u.isSelf
      ? muted("Eigenes Konto – Sperren/Löschen deaktiviert.")
      : '<button class="btn btn--outline btn--sm" data-toggle-active="' + esc(u.id) + '" data-active="' + (u.active ? "1" : "0") + '">' + (u.active ? "Sperren" : "Entsperren") + "</button>" +
        '<button class="btn btn--ghost btn--sm" data-del-user="' + esc(u.id) + '">Löschen</button>';
    return '<div class="drawer__section"><span class="eyebrow">Benutzer</span><h3>' + esc(u.name) + "</h3>" +
        '<p class="muted-note">' + esc(u.email) + " · " + statusBadge(u.active) + " · seit " + fmtDate(u.createdAt) + (u.isSelf ? " · du" : "") + "</p></div>" +
      '<div class="drawer__section"><h4>Rollen</h4><p class="muted-note">„Mitglied" wird automatisch gesetzt, sobald eine Mitgliedschaft besteht.</p>' +
        '<fieldset class="perm-grid">' + roleChecks + "</fieldset>" +
        (u.isSelf ? "" : '<button class="btn btn--primary btn--sm" data-save-user="' + esc(u.id) + '">Rollen speichern</button>') + "</div>" +
      (caps.members ? '<div class="drawer__section"><h4>Mitgliedschaften (' + (u.activeMembershipCount || 0) + " aktiv)</h4>" + kidList + "</div>" : "") +
      (caps.team ? vorstandSection(u) : "") +
      '<div class="drawer__section drawer__actions">' + actions + "</div>";
  }

  function vorstandSection(u) {
    const cur = userPost(u);
    const opts = '<option value="">— kein Vorstandsamt —</option>' + vorstandPosts.map((p) =>
      '<option value="' + esc(p.id) + '"' + (cur && cur.id === p.id ? " selected" : "") + ">" + esc(p.label) + "</option>").join("");
    const note = vorstandPosts.length ? "" : '<p class="muted-note">Noch keine Vorstandsposten definiert.</p>';
    return '<div class="drawer__section"><h4>Vorstandsamt</h4>' + note +
      '<div class="field"><select data-vorstand-select="' + esc(u.id) + '">' + opts + "</select></div>" +
      '<p class="muted-note">Jedes Amt hat genau eine Person. Posten werden zentral unter Admin → Vereinsämter definiert.</p></div>';
  }

  function memberDrawerHTML(m) {
    const addr = m.address ? (m.address.street + ", " + m.address.zip + " " + m.address.city) : "—";
    const rows = [["Pass-Nr.", m.passNumber || "—"], ["Klasse", m.categoryLabel || "—"], ["Gürtel", m.belt || "—"], ["Gewichtsklasse", m.weightClass || "—"], ["Status", null], ["Haushalt", m.ownerName + " (" + m.ownerEmail + ")"], ["Anschrift", addr]];
    if (caps.finance) { rows.push(["Beitrag", (m.individualFee || 0) + " €"]); rows.push(["IBAN", m.iban || "—"]); }
    const dl = rows.map(([k, v]) => '<div class="vw-dl"><dt>' + esc(k) + "</dt><dd>" + (k === "Status" ? memberBadge(m) : esc(v)) + "</dd></div>").join("");
    return '<div class="drawer__section">' + thumb(m) + '<span class="eyebrow" style="display:block;margin-top:10px">Mitglied</span><h3>' + esc(m.firstName) + " " + esc(m.lastName) + "</h3>" +
        (acBadges(m) ? '<div style="margin-top:6px">' + acBadges(m) + "</div>" : "") + "</div>" +
      '<div class="drawer__section"><dl class="vw-dl-wrap">' + dl + "</dl></div>";
  }

  /* ---------------- Status + POST ---------------- */
  function setStatus(msg, ok) {
    const el = $("#vw-status"); if (!el) return;
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

  /* ---------------- Events ---------------- */
  function bindEvents() {
    $("#vw-toggle").addEventListener("click", (e) => {
      const b = e.target.closest("[data-view]"); if (!b) return;
      view = b.getAttribute("data-view"); renderToggle(); render();
    });

    $("#vw-list").addEventListener("click", (e) => {
      const exp = e.target.closest("[data-expand]");
      if (exp) {
        const open = exp.getAttribute("aria-expanded") === "true";
        exp.setAttribute("aria-expanded", String(!open));
        exp.innerHTML = open ? "&#9656;" : "&#9662;";
        const c = $('[data-children="' + (window.CSS && CSS.escape ? CSS.escape(exp.getAttribute("data-expand")) : exp.getAttribute("data-expand")) + '"]');
        if (c) c.hidden = open;
        return;
      }
      const mem = e.target.closest("[data-member]"); if (mem) { openMemberDrawer(mem.getAttribute("data-member"), mem); return; }
      const usr = e.target.closest("[data-user]"); if (usr) { openUserDrawer(usr.getAttribute("data-user"), usr); return; }
    });
    $("#vw-list").addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const r = e.target.closest("[data-user],[data-member]"); if (!r) return;
      e.preventDefault();
      if (r.hasAttribute("data-member")) openMemberDrawer(r.getAttribute("data-member"), r);
      else openUserDrawer(r.getAttribute("data-user"), r);
    });

    $("#vw-drawer-body").addEventListener("click", async (e) => {
      const save = e.target.closest("[data-save-user]");
      if (save) {
        const id = save.getAttribute("data-save-user");
        const checked = [...$("#vw-drawer-body").querySelectorAll(".perm-grid input:checked")].map((i) => i.value);
        const { ok, data } = await post("/api/users/roles", { userId: id, roles: checked });
        setStatus(data.message || (ok ? "Rollen gespeichert." : "Fehler."), ok);
        if (ok) { await reloadUsers(); render(); openUserDrawer(id); }
        return;
      }
      const tog = e.target.closest("[data-toggle-active]");
      if (tog) {
        const id = tog.getAttribute("data-toggle-active");
        const next = tog.getAttribute("data-active") !== "1";
        const { ok, data } = await post("/api/users/status", { userId: id, active: next });
        setStatus(data.message || (ok ? "Gespeichert." : "Fehler."), ok);
        if (ok) { await reloadUsers(); render(); openUserDrawer(id); }
        return;
      }
      const del = e.target.closest("[data-del-user]");
      if (del) {
        const id = del.getAttribute("data-del-user");
        const u = users.find((x) => x.id === id) || {};
        if (!window.confirm('Benutzer „' + (u.name || "") + '" wirklich löschen? Das Login-Konto wird entfernt.')) return;
        const { ok, data } = await post("/api/users/delete", { userId: id });
        setStatus(data.message || (ok ? "Benutzer gelöscht." : "Fehler."), ok);
        if (ok) { await reloadUsers(); render(); closeDrawer(); }
        return;
      }
    });

    $("#vw-drawer-body").addEventListener("change", async (e) => {
      const sel = e.target.closest("[data-vorstand-select]");
      if (!sel) return;
      const uid = sel.getAttribute("data-vorstand-select");
      const cur = vorstandPosts.find((p) => p.userId === uid);
      const newId = sel.value;
      if ((cur && cur.id === newId) || (!cur && !newId)) return;
      let res;
      if (!newId) res = await post("/api/positions/delete", { id: cur.id });        // kein Amt -> Posten freigeben
      else res = await post("/api/positions/update", { id: newId, userId: uid });   // Amt dieser Person zuweisen (Move)
      setStatus(res.data.message || (res.ok ? "Vorstandsamt aktualisiert." : "Fehler."), res.ok);
      if (res.ok) await reloadPositions();
      render();
      openUserDrawer(uid); // Auswahl/Badges auf den tatsächlichen Stand bringen
    });

    $("#vw-drawer").addEventListener("click", (e) => { if (e.target.closest("[data-drawer-close]")) closeDrawer(); });
    $("#vw-scrim").addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#vw-drawer").classList.contains("is-open")) closeDrawer(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
