/* sponsors.js – öffentliche Sponsoren-Anzeige.
   Wird auf allen Club-Seiten geladen und besitzt die gesamte Frontend-Logik:
   - blendet den Menü-Link [data-sponsors-nav] ein (wenn showPage)
   - rendert jeden [data-sponsors]-Container (Startseite & eigene Seite)
   - injiziert optional eine kompakte Logo-Leiste in den Footer (showFooter)
   Steuerung komplett über /api/sponsors-config (enabled/displayMode/tiers/show*).
   Ist die Funktion aus (enabled:false) oder gibt es keine Sponsoren, passiert nichts. */
(function () {
  "use strict";

  // Immer HTML-escapen: BSG.escape ist eine globale const-Bindung (kein window.BSG),
  // daher direkt referenzieren; Fallback escapt selbst (nie unescaped in innerHTML).
  function esc(v) {
    if (typeof BSG !== "undefined" && BSG.escape) return BSG.escape(v);
    return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  // Nur http/https-Links zulassen (analog safeUrl in main.js); sonst kein Link.
  const safeUrl = (u) => (/^https?:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "");

  function logoBox(s) {
    const inner = s.logo
      ? `<img src="${esc(s.logo)}" alt="${esc(s.name)}" loading="lazy">`
      : `<span class="sponsor-logo__name">${esc(s.name)}</span>`;
    return `<span class="sponsor-logo">${inner}</span>`;
  }

  function cardHTML(s) {
    const prem = s.tier === "premium" ? " sponsor--premium" : "";
    const desc = s.description ? `<p>${esc(s.description)}</p>` : "";
    const href = safeUrl(s.url);
    const link = href ? `<a class="sponsor-link" href="${esc(href)}" target="_blank" rel="noopener">Zur Website →</a>` : "";
    return `<article class="sponsor sponsor--card card reveal${prem}">${logoBox(s)}<h3>${esc(s.name)}</h3>${desc}${link}</article>`;
  }

  function logoItem(s, withReveal) {
    const prem = s.tier === "premium" ? " sponsor--premium" : "";
    const rev = withReveal === false ? "" : " reveal";
    const cls = `sponsor${rev}${prem}`;
    const href = safeUrl(s.url);
    return href
      ? `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener" title="${esc(s.name)}">${logoBox(s)}</a>`
      : `<div class="${cls}" title="${esc(s.name)}">${logoBox(s)}</div>`;
  }

  function groupHTML(list, mode) {
    if (mode === "cards") return `<div class="sponsors__group sponsors__group--cards grid grid--3">${list.map(cardHTML).join("")}</div>`;
    if (mode === "logos") return `<div class="sponsors__group sponsors__group--logos grid grid--4">${list.map((s) => logoItem(s)).join("")}</div>`;
    return `<div class="sponsors__group sponsors__group--band">${list.map((s) => logoItem(s)).join("")}</div>`;
  }

  const premiumFirst = (list) => list.filter((s) => s.tier === "premium").concat(list.filter((s) => s.tier !== "premium"));

  function render(target, sponsors, cfg) {
    const mode = cfg.displayMode;
    let html;
    if (cfg.tiersEnabled) {
      const prem = sponsors.filter((s) => s.tier === "premium");
      const std = sponsors.filter((s) => s.tier !== "premium");
      html = "";
      if (prem.length) html += `<div class="sponsors__tier sponsors__tier--premium">${groupHTML(prem, mode)}</div>`;
      if (std.length) html += `<div class="sponsors__tier sponsors__tier--standard">${groupHTML(std, mode)}</div>`;
    } else {
      html = groupHTML(sponsors, mode);
    }
    target.innerHTML = `<div class="sponsors sponsors--${esc(mode)}">${html}</div>`;
    target.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-in"));
  }

  function renderFooter(sponsors, cfg) {
    const wrap = document.querySelector(".site-footer .wrap");
    if (!wrap || wrap.querySelector(".sponsors-footer")) return;
    const ordered = cfg.tiersEnabled ? premiumFirst(sponsors) : sponsors;
    const el = document.createElement("div");
    el.className = "sponsors-footer";
    el.innerHTML =
      `<span class="sponsors-footer__label">${esc(cfg.title || "Sponsoren")}</span>` +
      `<div class="sponsors-footer__row">${ordered.map((s) => logoItem(s, false)).join("")}</div>`;
    const bottom = wrap.querySelector(".footer-bottom");
    if (bottom) wrap.insertBefore(el, bottom); else wrap.appendChild(el);
  }

  function addNavLink() {
    const onPage = /sponsoren\.html$/.test(location.pathname);
    document.querySelectorAll(".nav__links").forEach((ul) => {
      if (ul.querySelector("[data-sponsors-nav]")) return;
      const li = document.createElement("li");
      li.setAttribute("data-sponsors-nav", "");
      const a = document.createElement("a");
      a.href = "sponsoren.html";
      a.textContent = "Sponsoren";
      if (onPage) a.setAttribute("aria-current", "page");
      li.appendChild(a);
      const ref = ul.querySelector('a[href="kalender.html"]');
      if (ref && ref.parentElement && ref.parentElement.parentElement === ul) ul.insertBefore(li, ref.parentElement.nextSibling);
      else ul.appendChild(li);
    });
  }

  function setTitles(cfg) {
    document.querySelectorAll("[data-sponsors-title]").forEach((el) => { if (cfg.title) el.textContent = cfg.title; });
    document.querySelectorAll("[data-sponsors-subtitle]").forEach((el) => { el.textContent = cfg.subtitle || ""; el.hidden = !cfg.subtitle; });
  }

  async function load() {
    let cfg, sponsors;
    try {
      // Erst die Config laden; ist die Funktion aus (Default), sparen wir die zweite Anfrage.
      const cData = await (await fetch("/api/sponsors-config")).json();
      if (!cData.ok || !cData.values || !cData.values.enabled) return;
      cfg = cData.values;
      const sData = await (await fetch("/api/sponsors")).json();
      if (!sData.ok) return;
      sponsors = sData.items || [];
    } catch (e) { return; }

    if (!sponsors.length) return;

    // Menü-Link zur eigenen Sponsoren-Seite
    if (cfg.showPage) addNavLink();

    setTitles(cfg);

    document.querySelectorAll("[data-sponsors]").forEach((target) => {
      if (target.hasAttribute("data-sponsors-home") && !cfg.showHome) return;
      render(target, sponsors, cfg);
      const section = target.closest("[data-sponsors-section]");
      if (section) section.hidden = false;
    });

    if (cfg.showFooter) renderFooter(sponsors, cfg);
  }

  load();
})();
