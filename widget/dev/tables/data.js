/* The same rows for every table, so each library is tested on the same contents. */
window.ROWS = [
  { id: 1, name: 'Aisha Rahman', email: 'aisha@acme.io', status: 'Active', plan: 'Pro', amount: '$1,240.00', date: '12 Oct 2026', tags: ['Design', 'Admin'] },
  { id: 2, name: 'Ben Ortiz', email: 'ben@acme.io', status: 'Invited', plan: 'Team', amount: '$310.50', date: '3 Sep 2026', tags: ['Research'] },
  { id: 3, name: 'Chen Wei', email: 'chen@acme.io', status: 'Suspended', plan: 'Free', amount: '$0.00', date: '28 Aug 2026', tags: ['Eng', 'On call'] },
  { id: 4, name: 'Dana Kowalczyk-Brennan with a very long name that truncates', email: 'dana@acme.io', status: 'Active', plan: 'Enterprise', amount: '$18,900.00', date: '1 Jan 2026', tags: ['Sales'] },
  { id: 5, name: 'Emeka Obi', email: 'emeka@acme.io', status: 'Active', plan: 'Pro', amount: '$1,240.00', date: '19 Jul 2026', tags: [] },
]
window.ICON = {
  edit: '<svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  trash: '<svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
  mail: '<svg class="ico" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>',
}
/* Icons that ignore the pointer, as shadcn/ui and most Tailwind kits make them. */
document.head.insertAdjacentHTML('beforeend', `<style>
  .ico { pointer-events: none; vertical-align: middle; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 12px; background: #dcfce7; color: #166534; }
  .badge.Invited { background: #e0e7ff; color: #3730a3; } .badge.Suspended { background: #fee2e2; color: #991b1b; }
  .tag { display: inline-block; margin-right: 4px; padding: 1px 6px; border-radius: 4px; background: #f1f5f9; font-size: 11px; }
  .who { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .who .av { flex: none; width: 24px; height: 24px; border-radius: 50%; background: #c7d2fe; }
  .who .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .act { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: 1px solid #e5e7eb; border-radius: 6px; background: #fff; cursor: pointer; }
  body { font: 14px system-ui, sans-serif; margin: 24px; }
</style>`)
window.cells = {
  who: r => `<span class="who"><span class="av"></span><span class="nm">${r.name}</span></span>`,
  email: r => `<a href="mailto:${r.email}">${ICON.mail} ${r.email}</a>`,
  status: r => `<span class="badge ${r.status}">${r.status}</span>`,
  tags: r => r.tags.map(t => `<span class="tag">${t}</span>`).join(''),
  actions: () => `<button class="act" aria-label="Edit">${ICON.edit}</button> <button class="act" aria-label="Delete">${ICON.trash}</button>`,
}
