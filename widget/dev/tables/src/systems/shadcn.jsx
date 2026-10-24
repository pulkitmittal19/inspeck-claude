/* The same everyday screen in six design systems, from their real components: a toolbar of buttons, a card,
 * a form, tabs, an alert and a small table. This one: shadcn. */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { Plus, Trash2, MoreHorizontal, Mail, Info, Check } from 'lucide-react'

const PEOPLE = [
  { name: 'Ada Lovelace', email: 'ada@example.com', status: 'Active', plan: 'Team' },
  { name: 'Alan Turing', email: 'alan@example.com', status: 'Invited', plan: 'Pro' },
  { name: 'Grace Hopper', email: 'grace@example.com', status: 'Active', plan: 'Free' },
]


/* ---------- shadcn/ui: its component markup and Tailwind classes, on Radix primitives ---------- */
import * as Tabs from '@radix-ui/react-tabs'
import * as Checkbox from '@radix-ui/react-checkbox'
import * as Switch from '@radix-ui/react-switch'
import * as Avatar from '@radix-ui/react-avatar'
function Shadcn() {
  const btn = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0'
  const badge = 'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold'
  return <div className="space-y-8 p-8 text-slate-900" style={{ width: 900 }}>
    <div className="flex gap-2">
      <button id="primary" className={`${btn} h-9 px-4 py-2 bg-slate-900 text-white shadow`}><Plus />New project</button>
      <button className={`${btn} h-9 px-4 py-2 border border-slate-200 bg-white shadow-sm`}><Mail />Invite</button>
      <button className={`${btn} h-9 w-9 border border-slate-200`}><span className="sr-only">More</span><MoreHorizontal /></button>
      <button className={`${btn} h-9 px-4 py-2 bg-red-600 text-white`}><Trash2 />Delete</button>
    </div>
    <div className="rounded-xl border bg-white shadow" style={{ width: 380 }}>
      <div className="flex flex-col space-y-1.5 p-6"><div className="flex items-center gap-3">
        <Avatar.Root className="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full"><Avatar.Fallback className="flex h-full w-full items-center justify-center rounded-full bg-slate-100">AL</Avatar.Fallback></Avatar.Root>
        <div><h3 className="font-semibold leading-none tracking-tight">Ada Lovelace</h3><p className="text-sm text-slate-500">ada@example.com</p></div>
        <div className={`${badge} ml-auto border-transparent bg-slate-900 text-white`}>Admin</div>
      </div></div>
      <div className="p-6 pt-0"><p className="text-sm">Wrote the first program for the Analytical Engine.</p></div>
      <div className="flex items-center p-6 pt-0"><button className={`${btn} h-9 px-4 py-2 w-full bg-slate-900 text-white`}><Check />Approve</button></div>
    </div>
    <div className="grid gap-4" style={{ width: 380 }}>
      <div className="grid gap-2"><label htmlFor="email" className="text-sm font-medium leading-none">Email</label>
        <input id="email" placeholder="you@example.com" className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-sm" />
        <p className="text-[0.8rem] text-slate-500">We’ll never share it.</p></div>
      <div className="flex items-center space-x-2"><Checkbox.Root id="terms" className="peer h-4 w-4 shrink-0 rounded-sm border border-slate-900 shadow"><Checkbox.Indicator className="flex items-center justify-center text-current"><Check className="h-4 w-4" /></Checkbox.Indicator></Checkbox.Root>
        <label htmlFor="terms" className="text-sm font-medium leading-none">Accept terms and conditions</label></div>
      <div className="flex items-center space-x-2"><Switch.Root id="air" className="peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-slate-200 shadow-sm"><Switch.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0" /></Switch.Root>
        <label htmlFor="air" className="text-sm font-medium leading-none">Airplane mode</label></div>
    </div>
    <Tabs.Root defaultValue="account" style={{ width: 380 }}>
      <Tabs.List className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-100 p-1 text-slate-500">
        {['account', 'password', 'billing'].map(v => <Tabs.Trigger key={v} value={v} className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow">{v[0].toUpperCase() + v.slice(1)}</Tabs.Trigger>)}
      </Tabs.List>
      <Tabs.Content value="account" className="mt-2 text-sm">Make changes to your account here.</Tabs.Content>
    </Tabs.Root>
    <div role="alert" className="relative w-full rounded-lg border px-4 py-3 text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg~*]:pl-7" style={{ width: 500 }}>
      <Info className="h-4 w-4" /><h5 className="mb-1 font-medium leading-none tracking-tight">Heads up!</h5><div className="text-sm">You can add components to your app using the cli.</div>
    </div>
    <div className="rounded-md border"><table className="w-full caption-bottom text-sm"><thead><tr className="border-b">{['Name', 'Status', 'Plan', ''].map(h => <th key={h} className="h-10 px-2 text-left align-middle font-medium text-slate-500">{h}</th>)}</tr></thead>
      <tbody>{PEOPLE.map(p => <tr key={p.name} className="border-b transition-colors hover:bg-slate-50">
        <td className="p-2 align-middle"><div className="font-medium">{p.name}</div><div className="text-xs text-slate-500">{p.email}</div></td>
        <td className="p-2 align-middle"><div className={badge}>{p.status}</div></td>
        <td className="p-2 align-middle">{p.plan}</td>
        <td className="p-2 align-middle text-right"><button className={`${btn} h-8 w-8`}><span className="sr-only">Open menu</span><MoreHorizontal /></button></td>
      </tr>)}</tbody></table></div>
  </div>
}

createRoot(document.getElementById('root')).render(<Shadcn />)
window.systemReady = true
