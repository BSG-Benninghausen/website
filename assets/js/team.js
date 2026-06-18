/* =====================================================================
   team.js – rendert Vorstand & Trainerteam (dynamisch).
   Container: [data-team-vorstand] und [data-team-trainer].
   ===================================================================== */
(function () {
  "use strict";

  const vorstand = document.querySelector("[data-team-vorstand]");
  const trainer = document.querySelector("[data-team-trainer]");
  if (!vorstand && !trainer) return;

  const esc = (v) => BSG.escape(v == null ? "" : v);

  const GRADIENTS = [
    "linear-gradient(135deg,#1a1a22,#3a3340)",
    "linear-gradient(135deg,#7a1015,#e3141b)",
    "linear-gradient(135deg,#e3141b,#f3b836)",
    "linear-gradient(135deg,#23232e,#e3141b)",
    "linear-gradient(135deg,#0d0d12,#2c1015)",
    "linear-gradient(135deg,#b8860b,#f3b836)",
  ];
  function initials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }
  function gradientFor(seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    return GRADIENTS[Math.abs(h) % GRADIENTS.length];
  }

  function memberHTML(m) {
    const avatar = m.photo
      ? `<div class="member__avatar member__avatar--photo"><img src="${esc(m.photo)}" alt=""></div>`
      : `<div class="member__avatar" style="background:${gradientFor(m.name)}">${esc(initials(m.name))}</div>`;
    return `
      <article class="card member reveal is-in">
        ${avatar}
        <h3>${esc(m.name)}</h3>
        <p class="role">${esc(m.label)}</p>
      </article>`;
  }

  function render(container, items) {
    if (!container) return;
    container.innerHTML = items.length
      ? items.map(memberHTML).join("")
      : '<p class="muted-note">Noch keine Einträge.</p>';
  }

  async function load() {
    let items;
    try {
      const data = await (await fetch("/api/team")).json();
      if (!data.ok) throw new Error();
      items = data.items || [];
    } catch (e) {
      [vorstand, trainer].forEach((c) => { if (c) c.innerHTML = '<p class="load-error">Team konnte nicht geladen werden.</p>'; });
      return;
    }
    render(vorstand, items.filter((m) => m.group === "vorstand"));
    render(trainer, items.filter((m) => m.group === "trainer"));
  }

  load();
})();
