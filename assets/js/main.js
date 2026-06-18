/* =====================================================================
   main.js – gemeinsame UI-Logik (Navigation, Footer-Jahr, Reveal)
   ===================================================================== */
(function () {
  "use strict";

  /* ----- Mobile-Navigation ----- */
  const toggle = document.querySelector(".nav__toggle");
  const menu = document.querySelector(".nav__menu");
  if (toggle && menu) {
    const close = () => {
      menu.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    };
    toggle.addEventListener("click", () => {
      const open = menu.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", close));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    window.addEventListener("resize", () => { if (window.innerWidth > 900) close(); });
  }

  /* ----- Konto-Dropdown ----- */
  const userBtn = document.querySelector(".nav__user-btn");
  const userMenu = document.querySelector(".nav__user");
  if (userBtn && userMenu) {
    const closeUser = () => {
      userMenu.classList.remove("is-open");
      userBtn.setAttribute("aria-expanded", "false");
    };
    userBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      userBtn.setAttribute("aria-expanded", String(userMenu.classList.toggle("is-open")));
    });
    document.addEventListener("click", (e) => { if (!userMenu.contains(e.target)) closeUser(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeUser(); });
  }

  /* ----- Abmelden (Navigation) ----- */
  document.querySelectorAll("[data-logout]").forEach((b) => {
    b.addEventListener("click", async () => {
      try { await fetch("/api/auth/logout", { method: "POST" }); } catch (e) {}
      window.location.href = "index.html";
    });
  });

  /* ----- Aktiven Navigationspunkt markieren ----- */
  const here = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav__links a, .nav__dropdown a").forEach((a) => {
    const target = a.getAttribute("href");
    if (target === here || (here === "index.html" && target === "index.html")) {
      a.classList.add("is-active");
      a.setAttribute("aria-current", "page");
    }
  });

  /* ----- Footer-Jahr ----- */
  document.querySelectorAll("[data-year]").forEach((el) => {
    el.textContent = new Date().getFullYear();
  });

  /* ----- Scroll-Reveal ----- */
  const items = document.querySelectorAll(".reveal");
  if (items.length && "IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    items.forEach((el) => io.observe(el));
  } else {
    items.forEach((el) => el.classList.add("is-in"));
  }

  /* ----- Konto-Bereich in der Navigation ----- */
  const accountLinks = document.querySelectorAll("[data-account-link]");
  const accountMenu = document.querySelector("[data-account-menu]");
  const navHasManaged = document.querySelector("[data-admin-link], [data-redaktion-link], [data-members-link]");
  if (accountLinks.length || accountMenu || navHasManaged) {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d || !d.ok || !d.user) return; // ausgeloggt: Login-Link bleibt sichtbar
        accountLinks.forEach((a) => { a.hidden = true; });
        if (accountMenu) {
          accountMenu.hidden = false;
          const name = (d.user.name || "").trim();
          const nameEl = accountMenu.querySelector("[data-account-name]");
          if (nameEl) nameEl.textContent = name.split(" ")[0] || "Konto";
          const av = accountMenu.querySelector("[data-account-avatar]");
          if (av) {
            if (d.user.photo) {
              av.style.backgroundImage = 'url("' + d.user.photo + '")';
              av.classList.add("has-photo");
            } else {
              av.textContent = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
            }
          }
        }
        const has = (p) => d.isAdmin || (d.permissions && d.permissions.includes(p));
        const reveal = (sel) => document.querySelectorAll(sel).forEach((a) => { a.hidden = false; });
        if (has("manage_roles") || has("manage_users")) reveal("[data-admin-link]");
        if (has("manage_news") || has("manage_events") || has("manage_training") || has("manage_site") || has("manage_payouts")) reveal("[data-redaktion-link]");
        if (has("view_members")) reveal("[data-members-link]");
      })
      .catch(() => {});
  }

  /* ----- Editierbare Startseiten-Texte anwenden ([data-site="key"]) ----- */
  const siteEls = document.querySelectorAll("[data-site]");
  if (siteEls.length) {
    fetch("/api/site")
      .then((r) => r.json())
      .then((d) => {
        if (!d || !d.ok || !d.values) return;
        siteEls.forEach((el) => {
          const key = el.getAttribute("data-site");
          const val = d.values[key];
          if (typeof val === "string" && val.trim()) el.textContent = val;
        });
      })
      .catch(() => {});
  }
})();

/* ----- gemeinsame Helfer (global) ----- */
const BSG = {
  /** Datum (ISO) hübsch auf Deutsch formatieren */
  formatDate(iso, opts) {
    try {
      return new Date(iso).toLocaleDateString("de-DE", opts || { day: "2-digit", month: "long", year: "numeric" });
    } catch (e) { return iso; }
  },
  dayMonth(iso) {
    const d = new Date(iso);
    return {
      d: d.toLocaleDateString("de-DE", { day: "2-digit" }),
      m: d.toLocaleDateString("de-DE", { month: "short" }).replace(".", ""),
    };
  },
  escape(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  },
  /** Bild clientseitig auf maxEdge verkleinern -> JPEG-Data-URL (Promise) */
  readAndResize(file, maxEdge = 400) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error("Keine Datei"));
      if (!/^image\//.test(file.type)) return reject(new Error("Bitte ein Bild wählen."));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Bild konnte nicht geladen werden."));
        img.onload = () => {
          let { width, height } = img;
          const scale = Math.min(1, maxEdge / Math.max(width, height));
          width = Math.round(width * scale); height = Math.round(height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  },
  /** Deko-SVG für News/Medien-Platzhalter (variiert per Seed) */
  placeholderSVG(seed) {
    const palettes = [
      ["#0d0d12", "#e3141b"],
      ["#1a1a22", "#f6c453"],
      ["#2c1015", "#ff5a2a"],
      ["#23232e", "#e3141b"],
    ];
    const [a, b] = palettes[Math.abs(seed) % palettes.length];
    return `
      <svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true">
        <defs><linearGradient id="g${seed}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${a}"/>
        </linearGradient></defs>
        <rect width="400" height="250" fill="url(#g${seed})"/>
        <circle cx="320" cy="40" r="120" fill="${b}" opacity=".22"/>
        <circle cx="70" cy="220" r="90" fill="${b}" opacity=".15"/>
        <path d="M200 96c-22 0-40 18-40 40 0 30 40 58 40 58s40-28 40-58c0-22-18-40-40-40z" fill="none" stroke="${b}" stroke-width="3" opacity=".55"/>
        <circle cx="200" cy="132" r="13" fill="${b}" opacity=".8"/>
      </svg>`;
  },
};
