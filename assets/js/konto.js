/* =====================================================================
   konto.js – geschütztes Benutzer-Dashboard
   Lädt Konto, Mitgliedschaften & Beitragstypen aus dem Mock-Server und
   verwaltet Adresse, IBAN und Mitgliedschaften (für sich & Familie).
   ===================================================================== */
(function () {
  "use strict";

  let account = null;

  const $ = (sel) => document.querySelector(sel);

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
    await loadTypes();
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

  /* ---------- Beitragstypen ---------- */
  async function loadTypes() {
    try {
      const res = await fetch("/api/membership-types");
      const d = await res.json();
      const sel = $("#m-type");
      d.items.forEach((t) => {
        const o = document.createElement("option");
        o.value = t.id;
        o.textContent = t.label + " – " + t.feeMonthly + " €/Monat";
        sel.appendChild(o);
      });
    } catch (e) { /* ignore */ }
  }

  /* ---------- Mitgliedschaften ---------- */
  async function loadMemberships() {
    const wrap = $("#memberships");
    try {
      const res = await fetch("/api/memberships");
      const d = await res.json();
      if (!d.items.length) {
        wrap.innerHTML = '<p class="muted-note">Noch keine Mitgliedschaften. Schließe deine erste Mitgliedschaft ab – für dich oder ein Familienmitglied.</p>';
        return;
      }
      wrap.innerHTML = d.items.map(membershipCard).join("");
    } catch (e) {
      wrap.innerHTML = '<p class="load-error">Mitgliedschaften konnten nicht geladen werden.</p>';
    }
  }

  function membershipCard(m) {
    const since = BSG.formatDate(m.startedAt);
    const rel = m.relation === "self" ? "Ich selbst" : "Familienmitglied";
    const active = m.status === "aktiv";
    return (
      '<article class="membership">' +
        '<div class="membership__main">' +
          "<h3>" + BSG.escape(m.firstName) + " " + BSG.escape(m.lastName) + "</h3>" +
          "<p>" + BSG.escape(m.typeLabel) + " · " + m.feeMonthly + " €/Monat · " + rel + "</p>" +
          '<p class="membership__meta">seit ' + since + "</p>" +
        "</div>" +
        '<div class="membership__side">' +
          '<span class="badge badge--' + (active ? "aktiv" : "gekuendigt") + '">' + BSG.escape(m.status) + "</span>" +
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

    // Mitgliedschaft-Formular ein-/ausblenden
    const mForm = $("#membership-form");
    $("#add-membership-btn").addEventListener("click", () => {
      const show = mForm.hidden;
      mForm.hidden = !show;
      if (show) {
        // Adresse/IBAN aus Konto vorbefüllen (Pflicht beim Abschluss)
        const addr = account.address || {};
        fill(mForm, { street: addr.street, zip: addr.zip, city: addr.city, iban: account.iban || "" });
        mForm.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
    $("#membership-cancel").addEventListener("click", () => { mForm.hidden = true; });

    // Mitgliedschaft abschließen
    mForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearErrors(mForm);
      const fd = Object.fromEntries(new FormData(mForm).entries());
      const payload = {
        firstName: fd.firstName, lastName: fd.lastName, birthdate: fd.birthdate,
        relation: fd.relation, type: fd.type,
        address: { street: fd.street, zip: fd.zip, city: fd.city }, iban: fd.iban,
      };
      const btn = mForm.querySelector("[type=submit]");
      btn.setAttribute("aria-busy", "true");
      const { res, data } = await postJSON("/api/memberships", payload);
      btn.removeAttribute("aria-busy");
      if (res.ok && data.ok) {
        status(mForm, "ok", data.message);
        mForm.reset();
        mForm.hidden = true;
        const meRes = await fetch("/api/auth/me"); account = (await meRes.json()).user;
        fillAccountForms();
        await loadMemberships();
      } else {
        applyErrors(mForm, data.errors);
        status(mForm, "err", data.message || "Fehler.");
      }
    });

    // Kündigen (Delegation)
    $("#memberships").addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-cancel]");
      if (!btn) return;
      if (!confirm("Diese Mitgliedschaft wirklich kündigen?")) return;
      const { res, data } = await postJSON("/api/memberships/cancel", { id: btn.getAttribute("data-cancel") });
      if (res.ok && data.ok) await loadMemberships();
      else alert(data.message || "Fehler beim Kündigen.");
    });
  }

  init();
})();
