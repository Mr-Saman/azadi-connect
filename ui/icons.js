'use strict';
const paths={
star:'<path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.3L12 17.3l-5.7 3 1.1-6.3L2.9 9.6l6.3-.9z"/>',
search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
azadi:'<path d="m4 19 8-14 8 14M8 13h8M7 19l5-3 5 3"/>',
grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
layers:'<path d="m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5"/>',
apps:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M9 9v11M6 6.5h.01M9 6.5h.01"/>',
settings:'<path d="m10 3-.7 2.2-2.1 1.2L5 6l-2 3.5 1.6 1.8v2.4L3 15.5 5 19l2.2-.4 2.1 1.2L10 22h4l.7-2.2 2.1-1.2 2.2.4 2-3.5-1.6-1.8v-2.4L21 9.5 19 6l-2.2.4-2.1-1.2L14 3z"/><circle cx="12" cy="12.5" r="3"/>',
shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
power:'<path d="M12 3v9M7 5.5a9 9 0 1 0 10 0"/>',
globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6.5h14M5 17.5h14"/>',
route:'<circle cx="5" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 6h8a4 4 0 0 1 0 8H9a2 2 0 0 0 0 4h8"/>',
monitor:'<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M12 16v5M8 21h8"/>',
plus:'<path d="M12 5v14M5 12h14"/>',
upload:'<path d="M12 16V3m-4 4 4-4 4 4M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
arrowDown:'<path d="M12 4v16m-6-6 6 6 6-6"/>',
arrowUp:'<path d="M12 20V4m-6 6 6-6 6 6"/>',
pulse:'<path d="M2 12h5l3-8 4 16 3-8h5"/>',
clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>',
code:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>',
refresh:'<path d="M20 10a8 8 0 0 0-14-4L3 9m0-6v6h6M4 14a8 8 0 0 0 14 4l3-3m0 6v-6h-6"/>',
trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>'
};
window.icon=(name)=>`<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]||paths.apps}</svg>`;
document.querySelectorAll('[data-icon]').forEach(e=>{e.innerHTML=window.icon(e.dataset.icon);});
