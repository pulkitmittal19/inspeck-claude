/* The same everyday screen in six design systems, from their real components: a toolbar of buttons, a card,
 * a form, tabs, an alert and a small table. This one: primer. */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { Plus, Trash2, MoreHorizontal, Mail, Info, Check } from 'lucide-react'

const PEOPLE = [
  { name: 'Ada Lovelace', email: 'ada@example.com', status: 'Active', plan: 'Team' },
  { name: 'Alan Turing', email: 'alan@example.com', status: 'Invited', plan: 'Pro' },
  { name: 'Grace Hopper', email: 'grace@example.com', status: 'Active', plan: 'Free' },
]


/* ---------- Primer (GitHub) ---------- */
import * as P from '@primer/react'
import { PlusIcon, MailIcon, KebabHorizontalIcon, TrashIcon, CheckIcon, InfoIcon } from '@primer/octicons-react'
function Primer() {
  return <P.ThemeProvider><P.BaseStyles><P.Box sx={{ p: 5, width: 900, display: 'grid', gap: 5 }}>
    <P.Box sx={{ display: 'flex', gap: 2 }}>
      <P.Button id="primary" variant="primary" leadingVisual={PlusIcon}>New project</P.Button>
      <P.Button leadingVisual={MailIcon}>Invite</P.Button>
      <P.IconButton icon={KebabHorizontalIcon} aria-label="More" />
      <P.Button variant="danger" leadingVisual={TrashIcon}>Delete</P.Button>
    </P.Box>
    <P.Box sx={{ width: 380, borderWidth: 1, borderStyle: 'solid', borderColor: 'border.default', borderRadius: 2, p: 3 }}>
      <P.Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}><P.Avatar size={32} src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect width='1' height='1' fill='%23ddd'/%3E%3C/svg%3E" /><P.Box><P.Text as="div" sx={{ fontWeight: 'bold' }}>Ada Lovelace</P.Text><P.Text as="div" sx={{ color: 'fg.muted', fontSize: 1 }}>ada@example.com</P.Text></P.Box><P.Label sx={{ ml: 'auto' }} variant="accent">Admin</P.Label></P.Box>
      <P.Text as="p" sx={{ fontSize: 1 }}>Wrote the first program for the Analytical Engine.</P.Text>
      <P.Button block leadingVisual={CheckIcon}>Approve</P.Button>
    </P.Box>
    <P.Box sx={{ width: 380, display: 'grid', gap: 3 }}>
      <P.FormControl><P.FormControl.Label>Email</P.FormControl.Label><P.TextInput placeholder="you@example.com" block /><P.FormControl.Caption>We’ll never share it.</P.FormControl.Caption></P.FormControl>
      <P.FormControl><P.Checkbox /><P.FormControl.Label>Accept terms and conditions</P.FormControl.Label></P.FormControl>
    </P.Box>
    <P.UnderlineNav aria-label="Settings">{['Account', 'Password', 'Billing'].map((l, i) => <P.UnderlineNav.Item key={l} href="#" aria-current={i === 0 ? 'page' : undefined}>{l}</P.UnderlineNav.Item>)}</P.UnderlineNav>
    <P.Flash sx={{ width: 500 }}><P.Octicon icon={InfoIcon} /> You can add components to your app using the cli.</P.Flash>
    <P.Box as="table" sx={{ borderCollapse: 'collapse', width: '100%', fontSize: 1, '& td, & th': { borderBottom: '1px solid', borderColor: 'border.default', p: 2, textAlign: 'left' } }}>
      <thead><tr>{['Name', 'Status', 'Plan', ''].map(h => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{PEOPLE.map(p => <tr key={p.name}>
        <td><P.Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}><P.Avatar size={20} src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect width='1' height='1' fill='%23ccd'/%3E%3C/svg%3E" />{p.name}</P.Box></td>
        <td><P.Label variant={p.status === 'Active' ? 'success' : 'attention'}>{p.status}</P.Label></td>
        <td>{p.plan}</td>
        <td style={{ textAlign: 'right' }}><P.IconButton size="small" variant="invisible" icon={KebabHorizontalIcon} aria-label="Open menu" /></td>
      </tr>)}</tbody>
    </P.Box>
  </P.Box></P.BaseStyles></P.ThemeProvider>
}

createRoot(document.getElementById('root')).render(<Primer />)
window.systemReady = true
