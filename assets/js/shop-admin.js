/* shop-admin.js – Betreiber-Oberfläche des Webshops (nur Recht manage_shop).
   Produkte (CRUD), Bestellungen (Status), Förder-Status (gesponserte Person),
   Shop-Einstellungen/Betreiber (inkl. Rechtstexte). Betreiber = Privatperson
   (z. B. Julian Becker), getrennt vom Verein. */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const CAT_LABEL = { gi: "Anzug", guertel: "Gürtel", merch: "Merch" };
  const euro = (v) => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

  async function postJSON(url, data) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    return { res, data: await res.json() };
  }
  function toast(type, text) {
    const box = $("#shop-status");
    if (!box) return;
    box.className = "form-status is-visible form-status--" + (type === "ok" ? "ok" : "err");
    box.innerHTML = "<span>" + BSG.escape(text) + "</span>";
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function formStatus(form, type, text) {
    const box = form.querySelector(".form-status");
    if (box) { box.className = "form-status is-visible form-status--" + (type === "ok" ? "ok" : "err"); box.innerHTML = "<span>" + BSG.escape(text) + "</span>"; }
  }
  const clearErrors = (form) => form.querySelectorAll(".field--error").forEach((f) => f.classList.remove("field--error"));
  function applyErrors(form, errors) {
    Object.keys(errors || {}).forEach((name) => {
      const input = form.elements[name]; if (!input) return;
      const field = input.closest(".field"); if (!field) return;
      field.classList.add("field--error");
      const p = field.querySelector(".field__error"); if (p) p.textContent = errors[name];
    });
  }

  /* ----- Optionaler Produktbild-Upload (Vorschau + Verkleinern) ----- */
  function makeImageInput() {
    let current = "";
    const input = $("#p-image"), prev = $("#p-image-preview"), ph = $("#p-image-ph"), clear = $("#p-image-clear");
    function render() {
      if (current) { prev.src = current; prev.hidden = false; if (ph) ph.hidden = true; if (clear) clear.hidden = false; }
      else { prev.removeAttribute("src"); prev.hidden = true; if (ph) ph.hidden = false; if (clear) clear.hidden = true; }
    }
    if (input) input.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0]; if (!file) return;
      try { current = await BSG.readAndResize(file, 480); render(); } catch (err) { toast("err", err.message); }
    });
    if (clear) clear.addEventListener("click", () => { current = ""; input.value = ""; render(); });
    return { get: () => current, set: (v) => { current = v || ""; if (input) input.value = ""; render(); }, reset: () => { current = ""; if (input) input.value = ""; render(); } };
  }

  /* ===================== Produkte ===================== */
  function setupProducts() {
    const form = $("#prod-form"), list = $("#prod-list");
    if (!form || !list) return;
    const img = makeImageInput();
    let items = [];

    async function load() {
      try { items = (await (await fetch("/api/shop/products")).json()).items || []; } catch (e) { items = []; }
      list.innerHTML = items.length ? items.map((p) => {
        const prices = "extern " + euro(p.prices.extern) + " · Mitglied " + euro(p.prices.mitglied) + (p.prices.gesponsert != null ? " · Förder " + euro(p.prices.gesponsert) : "");
        const off = p.active ? "" : ' <span class="muted-note">(inaktiv)</span>';
        return '<div class="adm-role"><div class="adm-role__head">' +
          "<div><b>" + BSG.escape(p.name) + "</b>" + off + '<br><span class="muted-note">' + BSG.escape((CAT_LABEL[p.category] || p.category) + " · " + prices) + "</span></div>" +
          '<div style="display:flex;gap:8px"><button class="btn btn--outline btn--sm" data-edit="' + p.id + '">Bearbeiten</button>' +
          '<button class="btn btn--outline btn--sm" data-del="' + p.id + '">Löschen</button></div></div></div>';
      }).join("") : '<p class="muted-note">Noch keine Produkte.</p>';
    }
    function reset() {
      form.reset(); form.elements.id.value = ""; img.reset();
      $("#prod-form-title").textContent = "Neues Produkt"; $("#prod-reset").hidden = true; clearErrors(form);
    }
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); clearErrors(form);
      const f = Object.fromEntries(new FormData(form).entries());
      const body = {
        id: f.id || undefined, name: f.name, category: f.category, description: f.description,
        prices: { extern: f.extern, mitglied: f.mitglied, gesponsert: f.gesponsert },
        active: !!form.elements.active.checked, order: f.order, image: img.get(),
      };
      const btn = form.querySelector("[type=submit]"); btn.setAttribute("aria-busy", "true");
      const { res, data } = await postJSON(f.id ? "/api/shop/products/update" : "/api/shop/products", body);
      btn.removeAttribute("aria-busy");
      if (res.ok && data.ok) { reset(); await load(); toast("ok", data.message); }
      else { applyErrors(form, data.errors); formStatus(form, "err", data.message || "Fehler."); }
    });
    $("#prod-reset").addEventListener("click", reset);
    list.addEventListener("click", async (e) => {
      const ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
      if (ed) {
        const p = items.find((x) => x.id === ed.getAttribute("data-edit")); if (!p) return;
        form.elements.id.value = p.id; form.elements.name.value = p.name; form.elements.category.value = p.category;
        form.elements.description.value = p.description || ""; form.elements.extern.value = p.prices.extern;
        form.elements.mitglied.value = p.prices.mitglied; form.elements.gesponsert.value = p.prices.gesponsert != null ? p.prices.gesponsert : "";
        form.elements.active.checked = p.active !== false; form.elements.order.value = p.order || 0; img.set(p.image || "");
        $("#prod-form-title").textContent = "Produkt bearbeiten"; $("#prod-reset").hidden = false;
        form.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      if (del) {
        if (!confirm("Dieses Produkt wirklich löschen?")) return;
        const { res, data } = await postJSON("/api/shop/products/delete", { id: del.getAttribute("data-del") });
        if (res.ok && data.ok) { await load(); toast("ok", data.message); } else toast("err", data.message || "Fehler.");
      }
    });
    return load;
  }

  /* ===================== Bestellungen ===================== */
  function setupOrders() {
    const list = $("#order-list");
    if (!list) return;
    const STATUSES = ["offen", "mandat_erteilt", "bezahlt", "versendet", "storniert"];
    async function load() {
      let items = [];
      try { items = (await (await fetch("/api/shop/admin/orders")).json()).items || []; } catch (e) { items = []; }
      list.innerHTML = items.length ? items.map((o) => {
        const arts = o.items.map((l) => l.qty + "× " + BSG.escape(l.name)).join(", ");
        const opts = STATUSES.map((st) => '<option value="' + st + '"' + (st === o.status ? " selected" : "") + ">" + st + "</option>").join("");
        return '<div class="adm-role"><div class="adm-role__head">' +
          "<div><b>" + BSG.escape(euro(o.total)) + "</b> · " + BSG.escape(o.tier) + '<br><span class="muted-note">' + BSG.escape(o.ownerName + " · " + o.ownerEmail) + "</span>" +
          '<br><span class="muted-note">' + arts + "</span></div>" +
          '<select class="shop-status-sel" data-order="' + o.id + '">' + opts + "</select></div></div>";
      }).join("") : '<p class="muted-note">Noch keine Bestellungen.</p>';
    }
    list.addEventListener("change", async (e) => {
      const sel = e.target.closest("[data-order]"); if (!sel) return;
      const { res, data } = await postJSON("/api/shop/orders/status", { id: sel.getAttribute("data-order"), status: sel.value });
      if (res.ok && data.ok) toast("ok", data.message); else { toast("err", data.message || "Fehler."); await load(); }
    });
    return load;
  }

  /* ===================== Förder-Status ===================== */
  function setupSponsored() {
    const form = $("#spon-form");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); clearErrors(form);
      const email = form.elements.email.value.trim();
      const sponsored = form.elements.sponsored.value === "true";
      const { res, data } = await postJSON("/api/shop/sponsored", { email, sponsored });
      if (res.ok && data.ok) { toast("ok", data.message + " (" + (data.user.email || email) + ")"); form.reset(); }
      else { applyErrors(form, data.errors); formStatus(form, "err", data.message || "Fehler."); }
    });
  }

  /* ===================== Shop-Einstellungen / Betreiber ===================== */
  function setupConfig() {
    const form = $("#config-form"), wrap = $("#config-fields");
    if (!form || !wrap) return;
    async function load() {
      let fields = [], values = {};
      try { const d = await (await fetch("/api/shop-config")).json(); fields = d.fields || []; values = d.values || {}; } catch (e) {}
      wrap.innerHTML = fields.map((f) => {
        const v = values[f.key];
        if (f.type === "checkbox") {
          return '<label class="check-row"><input type="checkbox" name="' + f.key + '"' + (v ? " checked" : "") + "><span>" + BSG.escape(f.label) + "</span></label>";
        }
        const ctrl = f.type === "textarea"
          ? '<textarea name="' + f.key + '">' + BSG.escape(v == null ? "" : v) + "</textarea>"
          : '<input type="text" name="' + f.key + '" value="' + BSG.escape(v == null ? "" : v) + '">';
        return '<div class="field"><label>' + BSG.escape(f.label) + "</label>" + ctrl + '<p class="field__error"></p></div>';
      }).join("");
    }
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); clearErrors(form);
      const values = {};
      wrap.querySelectorAll("input, textarea").forEach((el) => {
        values[el.name] = el.type === "checkbox" ? el.checked : el.value;
      });
      const btn = form.querySelector("[type=submit]"); btn.setAttribute("aria-busy", "true");
      const { res, data } = await postJSON("/api/shop-config", { values });
      btn.removeAttribute("aria-busy");
      if (res.ok && data.ok) { await load(); toast("ok", data.message); } else { applyErrors(form, data.errors); formStatus(form, "err", data.message || "Fehler."); }
    });
    return load;
  }

  async function init() {
    let me;
    try { const r = await fetch("/api/auth/me"); me = await r.json(); if (!r.ok || !me.ok) { location.href = "login.html"; return; } }
    catch (e) { location.href = "login.html"; return; }
    const canShop = me.isAdmin || (me.permissions || []).includes("manage_shop");
    if (!canShop) { location.href = "konto.html"; return; }

    $("#shop-loading").hidden = true; $("#shop").hidden = false;

    const loadProducts = setupProducts();
    const loadOrders = setupOrders();
    setupSponsored();
    const loadConfig = setupConfig();
    if (loadProducts) await loadProducts();
    if (loadOrders) await loadOrders();
    if (loadConfig) await loadConfig();
  }

  init();
})();
