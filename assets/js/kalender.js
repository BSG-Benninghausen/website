/* kalender.js – lädt Termine aus der (gemockten) API, zeigt kommende zuerst. */
(function () {
  "use strict";

  const target = document.querySelector("[data-events]");
  if (!target) return;

  const limit = parseInt(target.getAttribute("data-events-limit") || "0", 10);

  function eventHTML(item) {
    const dm = BSG.dayMonth(item.date);
    const weekday = BSG.formatDate(item.date, { weekday: "long" });
    const acls = (item.ageClasses && item.ageClasses.length)
      ? `<div class="ac-badges" style="margin-top:8px">${item.ageClasses.map((c) => `<span class="ac-badge">${BSG.escape(c)}</span>`).join("")}</div>`
      : "";
    const fee = Number(item.fee) || 0;
    let money = "";
    if (fee > 0) {
      const own = Math.min(fee, Number(item.ownShare) || 0);
      const club = fee - own;
      money = `<p class="muted-note" style="margin-top:6px">Eigenanteil ${own.toLocaleString("de-DE")} €${club > 0 ? ` <span class="muted-note">(Verein trägt ${club.toLocaleString("de-DE")} €)</span>` : ""}</p>`;
    }
    return `
      <article class="event reveal">
        <div class="event__date">
          <span class="d">${dm.d}</span>
          <span class="m">${BSG.escape(dm.m)}</span>
        </div>
        <div>
          <h3>${BSG.escape(item.title)}</h3>
          <p>${BSG.escape(weekday)} · ${BSG.escape(item.time)} · ${BSG.escape(item.location)}</p>
          ${acls}
          ${money}
        </div>
        <span class="event__type" data-type="${BSG.escape(item.type)}">${BSG.escape(item.type)}</span>
      </article>`;
  }

  async function load() {
    try {
      const res = await fetch("/api/events");
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Fehler");

      const today = new Date(); today.setHours(0, 0, 0, 0);
      let items = data.items.filter((e) => new Date(e.date) >= today);
      if (limit > 0) items = items.slice(0, limit);

      if (!items.length) {
        target.innerHTML = `<p class="load-error">Aktuell sind keine kommenden Termine eingetragen. Schau bald wieder vorbei!</p>`;
        return;
      }
      target.innerHTML = items.map(eventHTML).join("");
      target.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-in"));
    } catch (err) {
      target.innerHTML = `<p class="load-error">Termine konnten nicht geladen werden. Bitte später erneut versuchen.</p>`;
    }
  }

  load();
})();
