/* =====================================================================
   Tests für detect-contract-change.mjs (zero-dep, node:test).
   Lauf: node --test tools/detect-contract-change.test.mjs
   ===================================================================== */
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectContractChange } from "./detect-contract-change.mjs";

const addRoute = `diff --git a/assets/js/mock-api.js b/assets/js/mock-api.js
index 1..2 100644
--- a/assets/js/mock-api.js
+++ b/assets/js/mock-api.js
@@ -612,2 +612,6 @@
     "GET /api/news": async () => {
+    "GET /api/foo": async () => {
+      return json({ ok: true });
+    },
+    "GET /api/news_old": async () => {`;

const removeRoute = `diff --git a/assets/js/mock-api.js b/assets/js/mock-api.js
index 1..2 100644
--- a/assets/js/mock-api.js
+++ b/assets/js/mock-api.js
@@ -612,4 +612,1 @@
-    "GET /api/legacy": async () => {
-      return json({ ok: true });
-    },
     "GET /api/news": async () => {`;

const seedOnly = `diff --git a/packages/api-contract/data/news.json b/packages/api-contract/data/news.json
index 1..2 100644
--- a/packages/api-contract/data/news.json
+++ b/packages/api-contract/data/news.json
@@ -1,3 +1,3 @@
-  { "title": "Alt" }
+  { "title": "Neu" }`;

const featureAdd = `diff --git a/assets/js/mock-api.js b/assets/js/mock-api.js
index 1..2 100644
--- a/assets/js/mock-api.js
+++ b/assets/js/mock-api.js
@@ -83,1 +83,2 @@
     { key: "demofeature", label: "Beispiel-Funktion (Beta)", status: "beta" },
+    { key: "newfeat", label: "Neues Feature", status: "beta" },`;

const nonContract = `diff --git a/assets/js/main.js b/assets/js/main.js
index 1..2 100644
--- a/assets/js/main.js
+++ b/assets/js/main.js
@@ -1,1 +1,2 @@
 const x = 1;
+const y = 2;`;

test("hinzugefügte Route -> minor, contract_changed", () => {
  const r = detectContractChange(addRoute);
  assert.equal(r.contract_changed, true);
  assert.equal(r.bump, "minor");
  assert.ok(r.added_routes.includes("GET /api/foo"));
});

test("entfernte Route -> major", () => {
  const r = detectContractChange(removeRoute);
  assert.equal(r.contract_changed, true);
  assert.equal(r.bump, "major");
  assert.ok(r.removed_routes.includes("GET /api/legacy"));
});

test("nur Seed-Änderung -> patch", () => {
  const r = detectContractChange(seedOnly);
  assert.equal(r.contract_changed, true);
  assert.equal(r.bump, "patch");
  assert.deepEqual(r.changed_seeds, ["news.json"]);
});

test("neues Feature -> minor, changed_features", () => {
  const r = detectContractChange(featureAdd);
  assert.equal(r.bump, "minor");
  assert.deepEqual(r.changed_features, ["newfeat"]);
});

test("Nicht-Vertrags-Änderung -> none", () => {
  const r = detectContractChange(nonContract);
  assert.equal(r.contract_changed, false);
  assert.equal(r.bump, "none");
});
