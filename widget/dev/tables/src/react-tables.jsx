import React from 'react'
import { createRoot } from 'react-dom/client'
import { Table, Tag, Avatar, Button, Space } from 'antd'
import { DataGrid } from '@mui/x-data-grid'
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table'
const ROWS = window.ROWS, cells = window.cells, ICON = window.ICON
const Raw = ({ html }) => <span dangerouslySetInnerHTML={{ __html: html }} />
createRoot(document.getElementById('antd')).render(<Table rowKey="id" rowSelection={{}} pagination={false} dataSource={ROWS} columns={[
  { title: 'Name', key: 'n', render: r => <Space><Avatar size="small">{r.name[0]}</Avatar><span>{r.name}</span></Space>, ellipsis: true, width: 260 },
  { title: 'Email', dataIndex: 'email' },
  { title: 'Status', key: 's', render: r => <Tag color={r.status === 'Active' ? 'green' : 'blue'}>{r.status}</Tag> },
  { title: 'Plan', dataIndex: 'plan' }, { title: 'Amount', dataIndex: 'amount', align: 'right' },
  { title: 'Tags', key: 't', render: r => r.tags.map(t => <Tag key={t}>{t}</Tag>) },
  { title: '', key: 'a', render: () => <Space><Button size="small" icon={<Raw html={ICON.edit} />} /><Button size="small" type="link" danger>Delete</Button></Space> },
]} />)
createRoot(document.getElementById('mui')).render(<DataGrid rows={ROWS} checkboxSelection hideFooter columns={[
  { field: 'name', headerName: 'Name', width: 260, renderCell: p => <Raw html={cells.who(p.row)} /> },
  { field: 'email', headerName: 'Email', width: 200 },
  { field: 'status', headerName: 'Status', renderCell: p => <Raw html={cells.status(p.row)} /> },
  { field: 'plan', headerName: 'Plan' }, { field: 'amount', headerName: 'Amount', align: 'right', headerAlign: 'right' },
  { field: 'a', headerName: '', sortable: false, renderCell: () => <Raw html={cells.actions()} /> },
]} />)
function Tan() {
  const t = useReactTable({ data: ROWS, getCoreRowModel: getCoreRowModel(), columns: [
    { header: 'Name', cell: c => <div className="flex items-center gap-2"><span className="h-6 w-6 rounded-full bg-indigo-200"></span><span className="font-medium">{c.row.original.name}</span></div> },
    { header: 'Status', cell: c => <div className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold">{c.row.original.status}</div> },
    { header: 'Amount', cell: c => <div className="text-right font-medium">{c.row.original.amount}</div> },
    { id: 'a', cell: () => <button className="inline-flex h-8 w-8 items-center justify-center gap-2 rounded-md hover:bg-slate-100 [&_svg]:pointer-events-none [&_svg]:size-4"><span className="sr-only">Open menu</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg></button> },
  ] })
  return <div className="rounded-md border"><table className="w-full caption-bottom text-sm"><thead>{t.getHeaderGroups().map(g => <tr key={g.id} className="border-b">{g.headers.map(h => <th key={h.id} className="h-10 px-2 text-left align-middle font-medium text-slate-500">{flexRender(h.column.columnDef.header, h.getContext())}</th>)}</tr>)}</thead><tbody>{t.getRowModel().rows.map(r => <tr key={r.id} className="border-b transition-colors hover:bg-slate-50">{r.getVisibleCells().map(c => <td key={c.id} className="p-2 align-middle">{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}</tr>)}</tbody></table></div>
}
createRoot(document.getElementById('tan')).render(<Tan />)
