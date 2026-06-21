/* Platzhalter für BSG_MOCK_SRC.

   contract/harness.mjs liest beim Modul-Laden IMMER eine mock-api.js-Quelle
   ein (readFileSync) – auch im Real-Modus, in dem ihr Inhalt nie ausgeführt
   wird (der Mock wird dann gar nicht instanziiert, alle Anfragen gehen per
   HTTP an TEST_BASE).

   Dieses eigenständige Backend-Repo enthält kein Frontend und kein
   mock-api.js. Damit der Load-Time-readFileSync nicht fehlschlägt, zeigt
   BSG_MOCK_SRC (siehe package.json -> test:contract sowie .github/workflows/ci.yml)
   auf diese leere Datei. Im Real-Modus bleibt ihr Inhalt unbenutzt.

   Die `mockOnly`-Suiten (api-switch, club-namespace) prüfen Frontend-/Mock-
   Verhalten und werden im Real-Modus ohnehin übersprungen. */
