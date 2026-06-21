/* Test für prerender-branding.mjs (applyBranding) – node --test, zero-dep. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyBranding } from "./prerender-branding.mjs";

const club = {
  name: "BSG Benninghausen e.V.",
  brand_name: "BSG Benninghausen",
  brand_sub: "Judo · Benninghausen",
  short_name: "BSG Judo",
  tagline: "Judo in Benninghausen",
  theme_color: "#0d0d12",
  logo: "assets/img/bsg-logo.png",
};

const page = (pageTitle) =>
  `<!DOCTYPE html><html lang="de" data-club-site data-page-title="${pageTitle}">` +
  `<head><title>Musterverein e.V. – Sport in Musterstadt</title>` +
  `<meta name="theme-color" content="#1c2230">` +
  `<meta name="apple-mobile-web-app-title" content="Musterverein"></head>` +
  `<body><a class="brand"><img class="brand__logo" src="assets/img/drache.png" alt="" data-club-logo>` +
  `<span class="brand__name"><span data-club="brand_name">Musterverein</span>` +
  `<small data-club="brand_sub">Sport · Musterstadt</small></span></a></body></html>`;

test("stempelt Unterseite: <Seitentitel> – <Verein> + Marke/Meta/Logo", () => {
  const out = applyBranding(page("Kontakt &amp; Impressum"), club);
  assert.match(out, /<title>Kontakt &amp; Impressum – BSG Benninghausen e\.V\.<\/title>/);
  assert.match(out, /<meta name="theme-color" content="#0d0d12">/);
  assert.match(out, /<meta name="apple-mobile-web-app-title" content="BSG Judo">/);
  assert.match(out, /data-club="brand_name">BSG Benninghausen</);
  assert.match(out, /data-club="brand_sub">Judo · Benninghausen</);
  assert.match(out, /class="brand__logo" src="assets\/img\/bsg-logo\.png"/);
  assert.doesNotMatch(out, /Musterverein/);
});

test("Startseite (leerer page-title): <Verein> – <Tagline>", () => {
  const out = applyBranding(page(""), club);
  assert.match(out, /<title>BSG Benninghausen e\.V\. – Judo in Benninghausen<\/title>/);
});

test("idempotent: erneutes Stempeln ändert nichts", () => {
  const once = applyBranding(page("Team"), club);
  assert.equal(applyBranding(once, club), once);
});
