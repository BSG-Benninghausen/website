/* =====================================================================
   trainingszeiten.js – rendert die (dynamischen) Trainingszeiten
   Container: [data-training] (Übersicht), [data-training-teaser]
   (Startseite) und [data-training-mini] (Hero-Mini-Liste).
   ===================================================================== */
(function () {
  "use strict";

  const page = document.querySelector("[data-training]");
  const teaser = document.querySelector("[data-training-teaser]");
  const mini = document.querySelector("[data-training-mini]");
  if (!page && !teaser && !mini) return;

  const esc = (v) => BSG.escape(v == null ? "" : v);

  function slotHTML(t) {
    const end = t.end ? `<span>– ${esc(t.end)} Uhr</span>` : "";
    const age = t.ageGroup ? `<span class="slot__age">${esc(t.ageGroup)}</span>` : "";
    return `
      <div class="slot reveal is-in">
        <div class="slot__time">${esc(t.start)}${end}</div>
        <div><h3>${esc(t.title)}</h3><p>${esc(t.description)}</p></div>
        ${age}
      </div>`;
  }

  function miniHTML(t) {
    const range = esc(t.start) + (t.end ? "–" + esc(t.end) : "");
    return `<li><div><b>${esc(t.title)}</b><br><span>${esc(t.ageGroup)}</span></div><time>${range}</time></li>`;
  }

  async function load() {
    let items;
    try {
      const data = await (await fetch("/api/training")).json();
      if (!data.ok) throw new Error();
      items = data.items || [];
    } catch (e) {
      if (page) page.innerHTML = '<p class="load-error">Trainingszeiten konnten nicht geladen werden.</p>';
      return;
    }
    if (page) page.innerHTML = items.length ? items.map(slotHTML).join("") : '<p class="muted-note">Aktuell sind keine Trainingszeiten hinterlegt.</p>';
    if (teaser) teaser.innerHTML = items.map(slotHTML).join("");
    if (mini) mini.innerHTML = items.map(miniHTML).join("");
  }

  load();
})();
