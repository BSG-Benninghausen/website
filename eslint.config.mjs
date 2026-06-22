// Flat-Config (ESLint 9). Bewusst dependency-frei: kein Import von Preset-Paketen,
// damit `npx eslint` ohne lokale Installation läuft und das Produkt zero-dep bleibt.
// Start als ADVISORY-Check (siehe .github/workflows/lint.yml). Regeln zunächst mild;
// nach einem Cleanup-Pass kann der Job auf "required" gehoben und die Regeln verschärft
// werden.
const browserGlobals = {
  window: "readonly", document: "readonly", fetch: "readonly", localStorage: "readonly",
  sessionStorage: "readonly", console: "readonly", setTimeout: "readonly", clearTimeout: "readonly",
  setInterval: "readonly", clearInterval: "readonly", location: "readonly", history: "readonly",
  navigator: "readonly", FormData: "readonly", URL: "readonly", URLSearchParams: "readonly",
  Headers: "readonly", Request: "readonly", Response: "readonly", FileReader: "readonly",
  Image: "readonly", Blob: "readonly", CustomEvent: "readonly", Event: "readonly",
  alert: "readonly", confirm: "readonly", prompt: "readonly", requestAnimationFrame: "readonly",
  // Projekt-Globals (in main.js / api-config.js definiert)
  BSG: "readonly", BSGApi: "readonly", BSG_API: "readonly", BSG_CLUB: "readonly", BSG_EXAMPLES: "readonly",
};

const nodeGlobals = {
  process: "readonly", console: "readonly", URL: "readonly", fetch: "readonly",
  Headers: "readonly", setTimeout: "readonly", globalThis: "readonly", Buffer: "readonly",
  // Kein __dirname/require/module: in ESM (*.mjs) nicht vorhanden – als Globals würde
  // no-undef versehentliche CommonJS-Verwendungen (Laufzeitfehler) verschlucken.
};

export default [
  {
    files: ["assets/js/**/*.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "script", globals: browserGlobals },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { args: "none" }],
      "no-constant-condition": ["warn", { checkLoops: false }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: nodeGlobals },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { args: "none" }],
    },
  },
];
