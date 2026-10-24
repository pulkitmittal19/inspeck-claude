/* The same everyday screen in six design systems, from their real components: a toolbar of buttons, a card,
 * a form, tabs, an alert and a small table. This one: antd. */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { Plus, Trash2, MoreHorizontal, Mail, Info, Check } from 'lucide-react'

const PEOPLE = [
  { name: 'Ada Lovelace', email: 'ada@example.com', status: 'Active', plan: 'Team' },
  { name: 'Alan Turing', email: 'alan@example.com', status: 'Invited', plan: 'Pro' },
  { name: 'Grace Hopper', email: 'grace@example.com', status: 'Active', plan: 'Free' },
]


/* ---------- Ant Design ---------- */
import * as A from 'antd'
function Antd() {
  return <A.Space direction="vertical" size={32} style={{ padding: 32, width: 900 }}>
    <A.Space>
      <A.Button id="primary" type="primary" icon={<Plus size={14} />}>New project</A.Button>
      <A.Button icon={<Mail size={14} />}>Invite</A.Button>
      <A.Button icon={<MoreHorizontal size={14} />} aria-label="More" />
      <A.Button danger type="primary" icon={<Trash2 size={14} />}>Delete</A.Button>
    </A.Space>
    <A.Card style={{ width: 380 }} actions={[<A.Button key="a" type="link" icon={<Check size={14} />}>Approve</A.Button>]}>
      <A.Card.Meta avatar={<A.Avatar>AL</A.Avatar>} title={<A.Space>Ada Lovelace<A.Tag color="blue">Admin</A.Tag></A.Space>} description="Wrote the first program for the Analytical Engine." />
    </A.Card>
    <A.Form layout="vertical" style={{ width: 380 }}>
      <A.Form.Item label="Email" extra="We’ll never share it."><A.Input placeholder="you@example.com" /></A.Form.Item>
      <A.Form.Item><A.Checkbox>Accept terms and conditions</A.Checkbox></A.Form.Item>
      <A.Form.Item><A.Space><A.Switch size="small" /><span>Airplane mode</span></A.Space></A.Form.Item>
    </A.Form>
    <A.Tabs style={{ width: 380 }} items={['Account', 'Password', 'Billing'].map(l => ({ key: l, label: l, children: l === 'Account' ? 'Make changes to your account here.' : null }))} />
    <A.Alert type="info" showIcon message="Heads up!" description="You can add components to your app using the cli." style={{ width: 500 }} />
    <A.Table rowKey="name" pagination={false} size="small" dataSource={PEOPLE} columns={[
      { title: 'Name', key: 'n', render: p => <A.Space><A.Avatar size="small">{p.name[0]}</A.Avatar>{p.name}</A.Space> },
      { title: 'Status', key: 's', render: p => <A.Tag color={p.status === 'Active' ? 'green' : 'gold'}>{p.status}</A.Tag> },
      { title: 'Plan', dataIndex: 'plan' },
      { title: '', key: 'a', align: 'right', render: () => <A.Button type="text" size="small" icon={<MoreHorizontal size={14} />} aria-label="Open menu" /> },
    ]} />
  </A.Space>
}

createRoot(document.getElementById('root')).render(<Antd />)
window.systemReady = true
