/* shop.js – öffentlicher Webshop (Betreiber = Privatperson, nicht der Verein).
   Wird auf allen Club-Seiten geladen:
   - blendet den Menü-Link [data-shop-nav] ein (wenn Shop aktiv & verlinkt)
   - auf shop.html: Katalog mit Tier-Preisen (extern/mitglied/gesponsert),
     Warenkorb und Checkout (SEPA-Lastschrift NUR für aktive Mitglieder).
   Externe/Nicht-Mitglieder: Preise sichtbar, Checkout aus -> „per Anfrage"
   (mailto an den Betreiber, graceful degradation ohne API/Backend). */
(function () {
  "use strict";

  const NAV_NS = (window.BSG_CLUB && window.BSG_CLUB.ns) || "bsg";
  const NAV_CACHE_KEY = (NAV_NS === "bsg" ? "" : NAV_NS + ":") + "bsg_shop_nav";
  const navCacheShown = () => { try { return localStorage.getItem(NAV_CACHE_KEY) === "1"; } catch (e) { return false; } };
  const writeNavCache = (v) => { try { v ? localStorage.setItem(NAV_CACHE_KEY, "1") : localStorage.removeItem(NAV_CACHE_KEY); } catch (e) {} };
  // Login-Status optimistisch aus dem Auth-Cache von main.js (gleicher Key/Namespace) –
  // für das Menülink-Gating auf Nicht-Shop-Seiten ohne eigenen /api/auth/me-Aufruf.
  const AUTH_CACHE_KEY = (NAV_NS === "bsg" ? "" : NAV_NS + ":") + "bsg_nav_auth";
  const cachedLoggedIn = () => { try { return !!JSON.parse(localStorage.getItem(AUTH_CACHE_KEY) || "null"); } catch (e) { return false; } };

  function esc(v) {
    if (typeof BSG !== "undefined" && BSG.escape) return BSG.escape(v);
    return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const euro = (v) => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  const TIER_LABEL = { extern: "Externen-Preis", mitglied: "Mitglieder-Preis", gesponsert: "Förderpreis" };
  const CAT_LABEL = { gi: "Anzug", guertel: "Gürtel", merch: "Merch" };

  /* ----- Menü-Link (sprungfrei aus optimistischem Cache, analog sponsors.js) ----- */
  function addNavLink() {
    document.querySelectorAll(".nav__links").forEach((ul) => {
      if (ul.querySelector("[data-shop-nav]")) return;
      const li = document.createElement("li");
      li.setAttribute("data-shop-nav", "");
      const a = document.createElement("a");
      a.href = "shop.html";
      a.textContent = "Shop";
      if (/shop\.html$/.test(location.pathname)) { a.setAttribute("aria-current", "page"); a.classList.add("is-active"); }
      li.appendChild(a);
      const ref = ul.querySelector('a[href="kalender.html"]');
      if (ref && ref.parentElement && ref.parentElement.parentElement === ul) ul.insertBefore(li, ref.parentElement.nextSibling);
      else ul.appendChild(li);
    });
  }
  const removeNavLink = () => document.querySelectorAll("[data-shop-nav]").forEach((el) => el.remove());
  function setNavShown(show) { writeNavCache(show); if (show) addNavLink(); else removeNavLink(); }

  /* ===================== Katalog / Warenkorb (nur auf shop.html) ===================== */
  const catalogEl = document.querySelector("[data-shop-catalog]");

  const state = { cfg: null, products: [], isMember: false, loggedIn: false, iban: "", name: "", cart: [] };

  function tierBadge(p) {
    if (p.yourTier === "extern") return "";
    return `<span class="tier-badge tier-badge--${esc(p.yourTier)}">${esc(TIER_LABEL[p.yourTier] || p.yourTier)}</span>`;
  }
  function strikeExtern(p) {
    if (p.yourTier === "extern" || p.yourPrice >= p.prices.extern) return "";
    return `<span class="shop-card__was">${esc(euro(p.prices.extern))}</span>`;
  }

  function productCard(p) {
    const img = p.image
      ? `<img class="shop-card__img" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`
      : `<div class="shop-card__img shop-card__img--ph" aria-hidden="true">${CAT_LABEL[p.category] || "Shop"}</div>`;
    const memberHint = (!state.isMember && p.prices.mitglied < p.prices.extern)
      ? `<p class="shop-card__hint">Mitglieder: ${esc(euro(p.prices.mitglied))}</p>` : "";
    return `<article class="shop-card card reveal">
      ${img}
      <span class="shop-card__cat">${esc(CAT_LABEL[p.category] || p.category)}</span>
      <h3>${esc(p.name)}</h3>
      ${p.description ? `<p class="shop-card__desc">${esc(p.description)}</p>` : ""}
      <p class="shop-card__price">${strikeExtern(p)}<strong>${esc(euro(p.yourPrice))}</strong> ${tierBadge(p)}</p>
      ${memberHint}
      <button type="button" class="btn btn--primary btn--sm" data-add="${esc(p.id)}">In den Warenkorb</button>
    </article>`;
  }

  function renderCatalog() {
    if (!catalogEl) return;
    if (!state.products.length) { catalogEl.innerHTML = `<p class="muted-note">Aktuell sind keine Produkte verfügbar.</p>`; return; }
    catalogEl.innerHTML = `<div class="grid grid--3">${state.products.map(productCard).join("")}</div>`;
    catalogEl.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-in"));
  }

  function cartLine(item) {
    const p = state.products.find((x) => x.id === item.productId);
    if (!p) return "";
    return `<div class="cart-item">
      <div class="cart-item__info"><b>${esc(p.name)}</b><span class="muted-note">${esc(euro(p.yourPrice))} · Stück</span></div>
      <div class="cart-item__qty">
        <button type="button" class="btn btn--outline btn--sm" data-dec="${esc(p.id)}" aria-label="weniger">–</button>
        <span>${item.qty}</span>
        <button type="button" class="btn btn--outline btn--sm" data-inc="${esc(p.id)}" aria-label="mehr">+</button>
      </div>
      <div class="cart-item__sum"><strong>${esc(euro(p.yourPrice * item.qty))}</strong>
        <button type="button" class="cart-item__rm" data-rm="${esc(p.id)}" aria-label="entfernen">×</button></div>
    </div>`;
  }
  function cartTotal() {
    return state.cart.reduce((s, it) => {
      const p = state.products.find((x) => x.id === it.productId);
      return s + (p ? p.yourPrice * it.qty : 0);
    }, 0);
  }

  function renderCart() {
    const box = document.querySelector("[data-shop-cart]");
    const summary = document.querySelector("[data-shop-summary]");
    const checkout = document.querySelector("[data-shop-checkout]");
    const inquiry = document.querySelector("[data-shop-inquiry]");
    if (!box) return;
    if (!state.cart.length) {
      box.innerHTML = `<p class="muted-note">Dein Warenkorb ist leer.</p>`;
      if (summary) summary.hidden = true;
      if (checkout) checkout.hidden = true;
      if (inquiry) inquiry.hidden = true;
      return;
    }
    box.innerHTML = state.cart.map(cartLine).join("");
    if (summary) { summary.hidden = false; summary.innerHTML = `<span>Gesamt</span><strong>${esc(euro(cartTotal()))}</strong>`; }
    // Checkout nur für eingeloggte, aktive Mitglieder (SEPA-Lastschrift). Sonst „per Anfrage".
    if (state.isMember) { if (checkout) checkout.hidden = false; if (inquiry) inquiry.hidden = true; renderCheckoutMeta(); }
    else { if (checkout) checkout.hidden = true; if (inquiry) { inquiry.hidden = false; renderInquiry(); } }
  }

  function renderCheckoutMeta() {
    const ibanEl = document.querySelector("[data-shop-iban]");
    const missing = document.querySelector("[data-shop-iban-missing]");
    const hasIban = !!state.iban;
    if (ibanEl) { ibanEl.textContent = hasIban ? state.iban : "—"; ibanEl.closest("[data-shop-iban-wrap]") && (ibanEl.closest("[data-shop-iban-wrap]").hidden = !hasIban); }
    if (missing) missing.hidden = hasIban;
    const submit = document.querySelector("[data-shop-submit]");
    if (submit) submit.disabled = !hasIban;
  }

  function renderInquiry() {
    const el = document.querySelector("[data-shop-inquiry]");
    if (!el) return;
    const email = (state.cfg && state.cfg.operatorEmail) || "";
    const lines = state.cart.map((it) => {
      const p = state.products.find((x) => x.id === it.productId);
      return p ? `- ${it.qty}x ${p.name}` : "";
    }).filter(Boolean).join("\n");
    const subject = encodeURIComponent("Shop-Anfrage");
    const body = encodeURIComponent("Hallo,\n\nich interessiere mich für folgende Artikel:\n" + lines + "\n\nViele Grüße");
    const note = state.loggedIn
      ? "Der Online-Kauf per Lastschrift ist Vereinsmitgliedern vorbehalten. Als Nicht-Mitglied kannst du per Anfrage bestellen:"
      : "Melde dich als Mitglied an, um per Lastschrift zu bestellen – oder frage als Gast direkt beim Betreiber an:";
    el.innerHTML = `<p>${esc(note)}</p>` + (email
      ? `<a class="btn btn--outline" href="mailto:${esc(email)}?subject=${subject}&body=${body}">Per E-Mail anfragen</a>`
      : `<p class="muted-note">Bitte kontaktiere den Betreiber.</p>`)
      + (!state.loggedIn ? ` <a class="btn btn--primary" href="login.html">Anmelden</a>` : "");
  }

  function addToCart(id) {
    const it = state.cart.find((x) => x.productId === id);
    if (it) it.qty += 1; else state.cart.push({ productId: id, qty: 1 });
    renderCart();
  }
  function changeQty(id, delta) {
    const it = state.cart.find((x) => x.productId === id);
    if (!it) return;
    it.qty += delta;
    if (it.qty < 1) state.cart = state.cart.filter((x) => x.productId !== id);
    renderCart();
  }
  const removeFromCart = (id) => { state.cart = state.cart.filter((x) => x.productId !== id); renderCart(); };

  function bindCatalogEvents() {
    if (catalogEl) catalogEl.addEventListener("click", (e) => {
      const add = e.target.closest("[data-add]");
      if (add) addToCart(add.getAttribute("data-add"));
    });
    const box = document.querySelector("[data-shop-cart]");
    if (box) box.addEventListener("click", (e) => {
      const inc = e.target.closest("[data-inc]"); const dec = e.target.closest("[data-dec]"); const rm = e.target.closest("[data-rm]");
      if (inc) changeQty(inc.getAttribute("data-inc"), 1);
      else if (dec) changeQty(dec.getAttribute("data-dec"), -1);
      else if (rm) removeFromCart(rm.getAttribute("data-rm"));
    });
  }

  function status(type, text) {
    const box = document.querySelector("[data-shop-status]");
    if (!box) return;
    box.className = "form-status is-visible form-status--" + (type === "ok" ? "ok" : "err");
    box.innerHTML = "<span>" + esc(text) + "</span>";
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  async function postJSON(url, data) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    return { res, data: await res.json() };
  }

  async function submitOrder(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const consent = form.querySelector("[name=consent]");
    const bankConsent = form.querySelector("[name=bankConsent]");
    if (!bankConsent || !bankConsent.checked) { status("err", "Bitte der Nutzung deiner beim Verein hinterlegten Bankdaten zustimmen."); return; }
    if (!consent || !consent.checked) { status("err", "Bitte das SEPA-Lastschriftmandat bestätigen."); return; }
    if (!state.cart.length) { status("err", "Dein Warenkorb ist leer."); return; }
    const btn = form.querySelector("[type=submit]"); if (btn) btn.setAttribute("aria-busy", "true");
    const noteEl = form.querySelector("[name=note]");
    const payload = { items: state.cart.map((it) => ({ productId: it.productId, qty: it.qty })), consent: true, note: noteEl ? noteEl.value : "" };
    const placeOrder = () => postJSON("/api/shop/orders", payload);
    try {
      // Bestellung zuerst versuchen; bestehendes Mandat wird wiederverwendet.
      let o = await placeOrder();
      // Nur wenn noch KEIN aktives Mandat existiert: einmalig erteilen und erneut bestellen.
      if (o.res.status === 409 && o.data && o.data.code === "NO_MANDATE") {
        const m = await postJSON("/api/shop/mandate", { consent: true, bankConsent: true });
        if (!m.res.ok || !m.data.ok) {
          if (m.data && m.data.code === "ACCOUNT_INCOMPLETE") status("err", "Bitte zuerst deine IBAN im Konto hinterlegen.");
          else status("err", (m.data && m.data.message) || "Mandat konnte nicht erteilt werden.");
          return;
        }
        o = await placeOrder();
      }
      if (o.res.ok && o.data.ok) {
        state.cart = [];
        renderCart();
        status("ok", o.data.message || "Bestellung aufgegeben.");
        await loadOrders();
      } else if (o.data && o.data.code === "ACCOUNT_INCOMPLETE") {
        status("err", "Bitte zuerst deine IBAN im Konto hinterlegen.");
      } else {
        status("err", (o.data && o.data.message) || "Bestellung fehlgeschlagen.");
      }
    } catch (err) {
      status("err", "Verbindungsfehler. Bitte später erneut versuchen.");
    } finally {
      if (btn) btn.removeAttribute("aria-busy");
    }
  }

  async function loadOrders() {
    const box = document.querySelector("[data-shop-orders]");
    if (!box || !state.loggedIn) return;
    try {
      const d = await (await fetch("/api/shop/orders")).json();
      const items = (d && d.ok && d.items) || [];
      if (!items.length) { box.innerHTML = `<p class="muted-note">Noch keine Bestellungen.</p>`; return; }
      box.innerHTML = items.map((o) => {
        const arts = o.items.map((l) => `${l.qty}× ${esc(l.name)}`).join(", ");
        return `<div class="order-row"><div><b>${esc(euro(o.total))}</b> <span class="muted-note">· ${esc(arts)}</span></div>
          <span class="order-status order-status--${esc(o.status)}">${esc(o.status)}</span></div>`;
      }).join("");
      const section = box.closest("[data-shop-orders-section]"); if (section) section.hidden = false;
    } catch (e) {}
  }

  // Login autoritativ prüfen (für Redirect-Gate + Konto-/Mitglieds-Daten).
  async function refreshLoggedIn() {
    try {
      const me = await (await fetch("/api/auth/me")).json();
      if (me && me.ok && me.user) { state.loggedIn = true; state.iban = me.user.iban || ""; state.name = me.user.name || ""; }
      else { state.loggedIn = false; }
    } catch (e) { /* Netzfehler: Status unverändert lassen */ }
  }

  async function loadCatalog() {
    if (!catalogEl) return;
    if (state.loggedIn) {
      try {
        const mem = await (await fetch("/api/memberships")).json();
        state.isMember = !!(mem && mem.ok && (mem.items || []).some((m) => m.status === "aktiv"));
      } catch (e) {}
    }
    try {
      const d = await (await fetch("/api/shop/products")).json();
      state.products = (d && d.ok && d.items) || [];
    } catch (e) { catalogEl.innerHTML = `<p class="load-error">Produkte konnten nicht geladen werden.</p>`; return; }
    renderCatalog();
    renderCart();
    const form = document.querySelector("[data-shop-checkout-form]");
    if (form && !form._bound) { form._bound = true; form.addEventListener("submit", submitOrder); }
    bindCatalogEvents();
    await loadOrders();
  }

  function applyTexts() {
    if (!state.cfg) return;
    document.querySelectorAll("[data-shop-title]").forEach((el) => { if (state.cfg.title) el.textContent = state.cfg.title; });
    document.querySelectorAll("[data-shop-subtitle]").forEach((el) => { el.textContent = state.cfg.subtitle || ""; el.hidden = !state.cfg.subtitle; });
    document.querySelectorAll("[data-shop-operator]").forEach((el) => { if (state.cfg.operatorName) el.textContent = state.cfg.operatorName; });
    document.querySelectorAll("[data-shop-operator-address]").forEach((el) => { el.textContent = state.cfg.operatorAddress || "—"; });
    const legal = { impressum: state.cfg.legalImpressum, agb: state.cfg.legalAgb, widerruf: state.cfg.legalWiderruf };
    document.querySelectorAll("[data-shop-legal]").forEach((el) => { el.textContent = legal[el.getAttribute("data-shop-legal")] || "—"; });
  }

  async function load() {
    let cfg = null;
    try {
      const c = await (await fetch("/api/shop-config")).json();
      if (c && c.ok && c.values) cfg = c.values;
    } catch (e) { return; } // Netzfehler: optimistischen Cache behalten
    state.cfg = cfg;
    if (cfg) applyTexts(); // immer (auch auf shop-recht.html, selbst wenn Shop aus)

    if (!cfg || !cfg.enabled) {
      setNavShown(false);
      if (catalogEl) {
        const disabled = document.querySelector("[data-shop-disabled]");
        if (disabled) disabled.hidden = false;
        catalogEl.innerHTML = "";
      }
      return;
    }

    if (catalogEl) {
      // Store komplett hinter dem Login: Login autoritativ prüfen, sonst Redirect.
      await refreshLoggedIn();
      setNavShown(!!(cfg.showPage && state.loggedIn));
      if (!state.loggedIn) { location.href = "login.html"; return; }
      const disabled = document.querySelector("[data-shop-disabled]");
      if (disabled) disabled.hidden = true;
      await loadCatalog();
    } else {
      // Nicht-Shop-Seiten: Menülink nur eingeloggt (optimistisch aus dem Auth-Cache).
      setNavShown(!!(cfg.showPage && cachedLoggedIn()));
    }
  }

  // Menülink-Status nach dem Live-Auth-Abgleich von main.js auffrischen (Login/Logout ohne Reload).
  window.addEventListener("bsg:auth-change", () => {
    if (catalogEl) return; // Shop-Seite hat ihren eigenen autoritativen Pfad
    if (state.cfg && state.cfg.enabled) setNavShown(!!(state.cfg.showPage && cachedLoggedIn()));
  });

  if (navCacheShown()) addNavLink();
  load();
})();
