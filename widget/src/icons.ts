import type { IconSpec } from './dom'

const p = (d: string): [string, Record<string, string>] => ['path', { d }]

export const ICONS = {
  /* Inspeck's magnifier with code brackets, the same glyph as the extension. */
  inspect: [p('M17.5 17.5L22 22'), p('M20 11a9 9 0 1 0-18 0 9 9 0 0 0 18 0Z'), p('M14.5 9.5l.9.8c.4.3.6.5.6.7s-.2.4-.6.7l-.9.8'),
    p('M7.5 9.5l-.9.8c-.4.3-.6.5-.6.7s.2.4.6.7l.9.8'), p('M12 8.5 10 13.5')],
  close: [p('M6.5 6.5l11 11M17.5 6.5l-11 11')],
  /* `</>`: the CSS shows as you hover. */
  code: [p('M8.5 7.5L4 12l4.5 4.5'), p('M15.5 7.5L20 12l-4.5 4.5'), p('M13.5 5.5l-3 13')],
  copy: [['rect', { x: '8.5', y: '8.5', width: '11', height: '11', rx: '2' }], p('M15.5 8.5v-3a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3')],
  enter: [p('M19 6v5a3 3 0 0 1-3 3H6'), p('M10 10l-4 4 4 4')],
  note: [p('M5 5h14v10h-9l-4 4v-4H5z')],
  check: [p('M5 12.5l4.5 4.5L19 7.5')],
  trash: [p('M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5')],
  chevron: [p('M9.5 6l6 6-6 6')],
} satisfies Record<string, IconSpec>

export type IconName = keyof typeof ICONS
