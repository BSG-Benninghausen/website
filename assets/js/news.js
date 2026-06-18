/* news.js – lädt News aus der (gemockten) API und rendert sie.
   Funktioniert für die News-Übersicht (#news-list) und Teaser (#news-teaser). */
(function () {
  "use strict";

  const target = document.querySelector("[data-news]");
  if (!target) return;

  const limit = parseInt(target.getAttribute("data-news-limit") || "0", 10);

  function cardHTML(item, i) {
    const date = BSG.formatDate(item.date);
    return `
      <article class="news-card reveal">
        <div class="news-card__media">
          ${BSG.placeholderSVG(i + (item.title ? item.title.length : 0))}
          <span class="news-card__tag">${BSG.escape(item.tag)}</span>
        </div>
        <div class="news-card__body">
          <time datetime="${BSG.escape(item.date)}">${date}</time>
          <h3>${BSG.escape(item.title)}</h3>
          <p>${BSG.escape(item.excerpt)}</p>
          <span class="news-card__more">Weiterlesen
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </span>
        </div>
      </article>`;
  }

  async function load() {
    try {
      const res = await fetch("/api/news");
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Fehler");
      let items = data.items;
      if (limit > 0) items = items.slice(0, limit);
      target.innerHTML = items.map(cardHTML).join("");
      // neue .reveal-Elemente einblenden
      target.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-in"));
    } catch (err) {
      target.innerHTML = `<p class="load-error">Aktuelles konnte nicht geladen werden. Bitte später erneut versuchen.</p>`;
    }
  }

  load();
})();
