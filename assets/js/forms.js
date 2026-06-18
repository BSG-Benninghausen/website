/* =====================================================================
   forms.js – generischer Handler für API-Formulare (Anmeldung & Kontakt).
   Jedes <form data-api-form="/api/..."> wird per fetch an die (gemockte)
   API gesendet, inkl. Validierung, Lade-Zustand und Erfolgs-/Fehlermeldung.
   ===================================================================== */
(function () {
  "use strict";

  document.querySelectorAll("form[data-api-form]").forEach(initForm);

  function initForm(form) {
    const endpoint = form.getAttribute("data-api-form");
    const status = form.querySelector(".form-status");
    const submitBtn = form.querySelector("[type=submit]");

    const clearErrors = () => {
      form.querySelectorAll(".field--error").forEach((f) => f.classList.remove("field--error"));
    };

    const showFieldErrors = (errors) => {
      Object.keys(errors).forEach((name) => {
        const input = form.elements[name];
        if (!input) return;
        const field = input.closest(".field, .check-row") || input.parentElement;
        field.classList.add("field--error");
        let msg = field.querySelector(".field__error");
        if (!msg) {
          msg = document.createElement("p");
          msg.className = "field__error";
          field.appendChild(msg);
        }
        msg.textContent = errors[name];
      });
      const first = form.querySelector(".field--error input, .field--error select, .field--error textarea");
      if (first) first.focus();
    };

    const setStatus = (type, text) => {
      if (!status) return;
      status.className = "form-status is-visible form-status--" + (type === "ok" ? "ok" : "err");
      const icon = type === "ok"
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6 9 17l-5-5"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>';
      status.innerHTML = icon + "<span>" + text + "</span>";
    };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearErrors();
      if (status) status.classList.remove("is-visible");

      const data = Object.fromEntries(new FormData(form).entries());
      data.privacy = form.elements.privacy ? form.elements.privacy.checked : true;

      submitBtn.setAttribute("aria-busy", "true");
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const result = await res.json();

        if (res.ok && result.ok) {
          form.reset();
          setStatus("ok", BSG.escape(result.message));
          if (status) status.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          if (result.errors) showFieldErrors(result.errors);
          setStatus("err", BSG.escape(result.message || "Es ist ein Fehler aufgetreten."));
        }
      } catch (err) {
        setStatus("err", "Verbindung fehlgeschlagen. Bitte später erneut versuchen.");
      } finally {
        submitBtn.removeAttribute("aria-busy");
      }
    });
  }
})();
