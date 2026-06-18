/* =====================================================================
   auth.js – Login-Flow (passwordless, zweistufig)
   Schritt 1: E-Mail -> Anmeldecode anfordern (Mock liefert den Code zurück)
   Schritt 2: Code eingeben -> einloggen -> weiter zum Dashboard
   ===================================================================== */
(function () {
  "use strict";

  const reqForm = document.getElementById("req-form");
  const verifyForm = document.getElementById("verify-form");
  if (!reqForm || !verifyForm) return;

  const emailInput = reqForm.querySelector("[name=email]");
  const codeInput = verifyForm.querySelector("[name=code]");
  const step2 = document.getElementById("step-2");
  const emailEcho = document.getElementById("email-echo");
  const devNote = document.getElementById("dev-code-note");

  const fieldError = (form, name, msg) => {
    const input = form.elements[name];
    if (!input) return;
    const field = input.closest(".field");
    field.classList.add("field--error");
    let p = field.querySelector(".field__error");
    if (p) p.textContent = msg;
  };
  const clearErrors = (form) => form.querySelectorAll(".field--error").forEach((f) => f.classList.remove("field--error"));

  function setStatus(form, type, text) {
    const box = form.querySelector(".form-status");
    if (!box) return;
    box.className = "form-status is-visible form-status--" + (type === "ok" ? "ok" : "err");
    const icon = type === "ok"
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6 9 17l-5-5"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>';
    box.innerHTML = icon + "<span>" + BSG.escape(text) + "</span>";
  }

  /* ---- Schritt 1: Code anfordern ---- */
  reqForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors(reqForm);
    const btn = reqForm.querySelector("[type=submit]");
    btn.setAttribute("aria-busy", "true");
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput.value }),
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        if (emailEcho) emailEcho.textContent = emailInput.value.trim();
        verifyForm.hidden = false;
        if (step2) step2.hidden = false;
        codeInput.value = d.devCode || "";       // Demo: Code automatisch eintragen
        if (devNote) devNote.textContent = "Demo-Hinweis: Es wird keine echte E-Mail verschickt. Dein Anmeldecode lautet " + d.devCode + " (bereits eingetragen).";
        reqForm.querySelector("[type=submit]").textContent = "Neuen Code anfordern";
        codeInput.focus();
      } else {
        if (d.errors) Object.keys(d.errors).forEach((k) => fieldError(reqForm, k, d.errors[k]));
        setStatus(reqForm, "err", d.message || "Fehler.");
      }
    } catch (err) {
      setStatus(reqForm, "err", "Verbindung fehlgeschlagen.");
    } finally {
      btn.removeAttribute("aria-busy");
    }
  });

  /* ---- Schritt 2: Code prüfen & einloggen ---- */
  verifyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors(verifyForm);
    const btn = verifyForm.querySelector("[type=submit]");
    btn.setAttribute("aria-busy", "true");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput.value, code: codeInput.value }),
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        setStatus(verifyForm, "ok", d.message || "Eingeloggt.");
        setTimeout(() => { window.location.href = "konto.html"; }, 600);
      } else {
        if (d.errors) Object.keys(d.errors).forEach((k) => fieldError(verifyForm, k, d.errors[k]));
        setStatus(verifyForm, "err", d.message || "Fehler.");
      }
    } catch (err) {
      setStatus(verifyForm, "err", "Verbindung fehlgeschlagen.");
    } finally {
      btn.removeAttribute("aria-busy");
    }
  });
})();
