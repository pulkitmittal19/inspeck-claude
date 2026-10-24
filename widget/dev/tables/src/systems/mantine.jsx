/* The same everyday screen in six design systems, from their real components: a toolbar of buttons, a card,
 * a form, tabs, an alert and a small table. This one: mantine. */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { Plus, Trash2, MoreHorizontal, Mail, Info, Check } from 'lucide-react'

const PEOPLE = [
  { name: 'Ada Lovelace', email: 'ada@example.com', status: 'Active', plan: 'Team' },
  { name: 'Alan Turing', email: 'alan@example.com', status: 'Invited', plan: 'Pro' },
  { name: 'Grace Hopper', email: 'grace@example.com', status: 'Active', plan: 'Free' },
]


/* ---------- Mantine ---------- */
import * as N from '@mantine/core'
import '@mantine/core/styles.css'
function Mantine() {
  return <N.MantineProvider><N.Stack gap="xl" p="xl" w={900}>
    <N.Group gap="xs">
      <N.Button id="primary" leftSection={<Plus size={16} />}>New project</N.Button>
      <N.Button variant="default" leftSection={<Mail size={16} />}>Invite</N.Button>
      <N.ActionIcon variant="default" size="lg" aria-label="More"><MoreHorizontal size={18} /></N.ActionIcon>
      <N.Button color="red" leftSection={<Trash2 size={16} />}>Delete</N.Button>
    </N.Group>
    <N.Card withBorder shadow="sm" padding="lg" w={380}>
      <N.Group><N.Avatar radius="xl">AL</N.Avatar><div><N.Text fw={500}>Ada Lovelace</N.Text><N.Text size="sm" c="dimmed">ada@example.com</N.Text></div><N.Badge ml="auto">Admin</N.Badge></N.Group>
      <N.Text size="sm" mt="md">Wrote the first program for the Analytical Engine.</N.Text>
      <N.Button fullWidth mt="md" leftSection={<Check size={16} />}>Approve</N.Button>
    </N.Card>
    <N.Stack gap="md" w={380}>
      <N.TextInput label="Email" placeholder="you@example.com" description="We’ll never share it." />
      <N.Checkbox label="Accept terms and conditions" />
      <N.Switch label="Airplane mode" />
    </N.Stack>
    <N.Tabs defaultValue="account" w={380}><N.Tabs.List><N.Tabs.Tab value="account">Account</N.Tabs.Tab><N.Tabs.Tab value="password">Password</N.Tabs.Tab><N.Tabs.Tab value="billing">Billing</N.Tabs.Tab></N.Tabs.List><N.Tabs.Panel value="account" pt="xs">Make changes to your account here.</N.Tabs.Panel></N.Tabs>
    <N.Alert variant="light" title="Heads up!" icon={<Info size={16} />} w={500}>You can add components to your app using the cli.</N.Alert>
    <N.Table withTableBorder><N.Table.Thead><N.Table.Tr>{['Name', 'Status', 'Plan', ''].map(h => <N.Table.Th key={h}>{h}</N.Table.Th>)}</N.Table.Tr></N.Table.Thead>
      <N.Table.Tbody>{PEOPLE.map(p => <N.Table.Tr key={p.name}>
        <N.Table.Td><N.Group gap="sm"><N.Avatar size="sm" radius="xl">{p.name[0]}</N.Avatar><N.Text size="sm">{p.name}</N.Text></N.Group></N.Table.Td>
        <N.Table.Td><N.Badge variant="light" color={p.status === 'Active' ? 'green' : 'orange'}>{p.status}</N.Badge></N.Table.Td>
        <N.Table.Td>{p.plan}</N.Table.Td>
        <N.Table.Td ta="right"><N.ActionIcon variant="subtle" aria-label="Open menu"><MoreHorizontal size={16} /></N.ActionIcon></N.Table.Td>
      </N.Table.Tr>)}</N.Table.Tbody></N.Table>
  </N.Stack></N.MantineProvider>
}

createRoot(document.getElementById('root')).render(<Mantine />)
window.systemReady = true
