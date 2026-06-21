/* =====================================================================
   Tests für classify-diff.mjs (zero-dep, node:test).
   Lauf: node --test tools/classify-diff.test.mjs
   ===================================================================== */
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyDiff, verifyPatch, globToRegExp, parseDiff } from "./classify-diff.mjs";

const D = {
  // rein generisch: Logikänderung in assets/js/main.js
  generic: `diff --git a/assets/js/main.js b/assets/js/main.js
index 1111111..2222222 100644
--- a/assets/js/main.js
+++ b/assets/js/main.js
@@ -10,3 +10,4 @@ function foo() {
   const a = 1;
+  const b = 2;
   return a + b;
 }`,

  // rein config: Branding in assets/data/club.json
  config: `diff --git a/assets/data/club.json b/assets/data/club.json
index 1..2 100644
--- a/assets/data/club.json
+++ b/assets/data/club.json
@@ -1,3 +1,3 @@
-  "brand_name": "Musterverein",
+  "brand_name": "Mein Verein",`,

  // generisch + Identität im selben Hunk (home.html)
  entangled: `diff --git a/home.html b/home.html
index 1..2 100644
--- a/home.html
+++ b/home.html
@@ -100,2 +100,3 @@
   <footer>
+    <a href="https://www.instagram.com/bsg_benninghausen/">Instagram</a>
   </footer>`,

  // club-config.js: neuer EXAMPLES-Eintrag (config -> droppen)
  clubExample: `diff --git a/assets/js/club-config.js b/assets/js/club-config.js
index 1..2 100644
--- a/assets/js/club-config.js
+++ b/assets/js/club-config.js
@@ -44,3 +44,9 @@
   ];
+    {
+      id: "myclub",
+      name: "Mein Verein e.V.",
+      clubSeed: "club.myclub.json",
+      theme: "assets/css/theme.myclub.css",
+    },`,

  // club-config.js: Resolver-Logik geändert (generisch -> vorschlagen)
  clubResolver: `diff --git a/assets/js/club-config.js b/assets/js/club-config.js
index 1..2 100644
--- a/assets/js/club-config.js
+++ b/assets/js/club-config.js
@@ -70,3 +70,4 @@
   try {
+    if (!id) id = DEFAULT_ID;
     var p = new URLSearchParams(location.search).get("club");
   } catch (e3) {}`,

  // Workflow-Datei: .github/workflows/** ist config (Bot darf Workflows nicht pushen)
  workflow: `diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml
index 1..2 100644
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -1,2 +1,2 @@
-  node-version: 20
+  node-version: 22`,
};

test("rein generischer Diff -> propose", () => {
  const r = classifyDiff(D.generic);
  assert.equal(r.verdict, "propose");
  assert.deepEqual(r.generic_files, ["assets/js/main.js"]);
  assert.equal(r.forbidden_hits.length, 0);
});

test("rein config Diff -> nothing", () => {
  const r = classifyDiff(D.config);
  assert.equal(r.verdict, "nothing");
  assert.deepEqual(r.config_files, ["assets/data/club.json"]);
  assert.equal(r.generic_files.length, 0);
});

test("generisch + Identität im Hunk -> needs_human (entangled)", () => {
  const r = classifyDiff(D.entangled);
  assert.equal(r.verdict, "needs_human");
  assert.deepEqual(r.entangled, ["home.html"]);
  assert.ok(r.forbidden_hits.length >= 1);
});

test("club-config.js EXAMPLES-Eintrag -> config (nothing)", () => {
  const r = classifyDiff(D.clubExample);
  assert.equal(r.verdict, "nothing");
  assert.deepEqual(r.config_files, ["assets/js/club-config.js"]);
});

test("club-config.js Resolver-Änderung -> propose", () => {
  const r = classifyDiff(D.clubResolver);
  assert.equal(r.verdict, "propose");
  assert.deepEqual(r.generic_files, ["assets/js/club-config.js"]);
});

test("Workflow-Datei (.github/workflows/**) -> config (nothing); Bot pusht keine Workflows", () => {
  const r = classifyDiff(D.workflow);
  assert.equal(r.verdict, "nothing");
  assert.deepEqual(r.config_files, [".github/workflows/ci.yml"]);
  assert.equal(r.generic_files.length, 0);
});

test("verify: sauberer generischer Patch ist clean", () => {
  assert.equal(verifyPatch(D.generic).clean, true);
});

test("verify: config-Datei im Patch ist NICHT clean", () => {
  const v = verifyPatch(D.config);
  assert.equal(v.clean, false);
  assert.ok(v.problems.some((p) => p.includes("config")));
});

test("verify: Identität im Patch ist NICHT clean", () => {
  assert.equal(verifyPatch(D.entangled).clean, false);
});

test("globToRegExp: ** quert Verzeichnisse, * bleibt im Segment", () => {
  assert.ok(globToRegExp("packages/**").test("packages/backend/api.mjs"));
  assert.ok(globToRegExp("assets/js/*.js").test("assets/js/main.js"));
  assert.ok(!globToRegExp("assets/js/*.js").test("assets/js/features/loader.js"));
  assert.ok(globToRegExp("assets/css/theme.*.css").test("assets/css/theme.example.css"));
  assert.ok(!globToRegExp("assets/css/theme.*.css").test("assets/css/styles.css"));
});

test("parseDiff: erkennt Pfad und hinzugefügte Zeilen mit Zeilennummer", () => {
  const f = parseDiff(D.generic);
  assert.equal(f.length, 1);
  assert.equal(f[0].path, "assets/js/main.js");
  assert.ok(f[0].added.some((a) => a.text.includes("const b = 2")));
});
