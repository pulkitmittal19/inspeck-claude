/* The same everyday screen in six design systems, from their real components: a toolbar of buttons, a card,
 * a form, tabs, an alert and a small table. This one: mui. */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { Plus, Trash2, MoreHorizontal, Mail, Info, Check } from 'lucide-react'

const PEOPLE = [
  { name: 'Ada Lovelace', email: 'ada@example.com', status: 'Active', plan: 'Team' },
  { name: 'Alan Turing', email: 'alan@example.com', status: 'Invited', plan: 'Pro' },
  { name: 'Grace Hopper', email: 'grace@example.com', status: 'Active', plan: 'Free' },
]


/* ---------- MUI ---------- */
import * as M from '@mui/material'
function Mui() {
  return <M.Stack spacing={4} sx={{ p: 4, width: 900 }}>
    <M.Stack direction="row" spacing={1}>
      <M.Button id="primary" variant="contained" startIcon={<Plus size={18} />}>New project</M.Button>
      <M.Button variant="outlined" startIcon={<Mail size={18} />}>Invite</M.Button>
      <M.IconButton aria-label="More"><MoreHorizontal /></M.IconButton>
      <M.Button color="error" variant="contained" startIcon={<Trash2 size={18} />}>Delete</M.Button>
    </M.Stack>
    <M.Card sx={{ width: 380 }}>
      <M.CardHeader avatar={<M.Avatar>AL</M.Avatar>} title="Ada Lovelace" subheader="ada@example.com" action={<M.Chip label="Admin" size="small" color="primary" />} />
      <M.CardContent><M.Typography variant="body2">Wrote the first program for the Analytical Engine.</M.Typography></M.CardContent>
      <M.CardActions><M.Button size="small" startIcon={<Check size={16} />}>Approve</M.Button></M.CardActions>
    </M.Card>
    <M.Stack spacing={2} sx={{ width: 380 }}>
      <M.TextField label="Email" placeholder="you@example.com" helperText="We’ll never share it." size="small" />
      <M.FormControlLabel control={<M.Checkbox />} label="Accept terms and conditions" />
      <M.FormControlLabel control={<M.Switch />} label="Airplane mode" />
    </M.Stack>
    <M.Box sx={{ width: 380 }}><M.Tabs value={0}><M.Tab label="Account" /><M.Tab label="Password" /><M.Tab label="Billing" /></M.Tabs></M.Box>
    <M.Alert severity="info" sx={{ width: 500 }}><M.AlertTitle>Heads up!</M.AlertTitle>You can add components to your app using the cli.</M.Alert>
    <M.TableContainer component={M.Paper}><M.Table size="small"><M.TableHead><M.TableRow>{['Name', 'Status', 'Plan', ''].map(h => <M.TableCell key={h}>{h}</M.TableCell>)}</M.TableRow></M.TableHead>
      <M.TableBody>{PEOPLE.map(p => <M.TableRow key={p.name}>
        <M.TableCell><M.Stack direction="row" spacing={1} alignItems="center"><M.Avatar sx={{ width: 24, height: 24, fontSize: 12 }}>{p.name[0]}</M.Avatar><span>{p.name}</span></M.Stack></M.TableCell>
        <M.TableCell><M.Chip label={p.status} size="small" variant="outlined" /></M.TableCell>
        <M.TableCell>{p.plan}</M.TableCell>
        <M.TableCell align="right"><M.IconButton size="small" aria-label="Open menu"><MoreHorizontal size={18} /></M.IconButton></M.TableCell>
      </M.TableRow>)}</M.TableBody></M.Table></M.TableContainer>
  </M.Stack>
}

createRoot(document.getElementById('root')).render(<Mui />)
window.systemReady = true
