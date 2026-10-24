import React, { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import * as RDialog from '@radix-ui/react-dialog'
import * as RPopover from '@radix-ui/react-popover'
import * as RMenu from '@radix-ui/react-dropdown-menu'
import * as RTooltip from '@radix-ui/react-tooltip'
import { Dialog as HDialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { Toaster as Sonner, toast as sonner } from 'sonner'
import hot, { Toaster as HotToaster } from 'react-hot-toast'
import { Dialog as MDialog, DialogTitle as MTitle, DialogContent, Drawer as MDrawer, Snackbar, Button as MButton } from '@mui/material'
import { Modal as AModal, Drawer as ADrawer, message as amessage, Button as AButton } from 'antd'

const Body = ({ id }) => (
  <div className="ov-body" data-ov={id}>
    <h3 className="ov-title">{id} title</h3>
    <p className="ov-text">Some words inside the {id}.</p>
    <input className="ov-input" placeholder="Type here" />
    <button className="ov-btn">Confirm</button>
  </div>
)

function App() {
  const [open, setOpen] = useState({})
  const set = (k, v) => setOpen(o => ({ ...o, [k]: v }))
  useEffect(() => {
    window.overlay = {
      open: k => {
        if (k === 'native-dialog') document.getElementById('native-dialog').showModal()
        else if (k === 'native-popover') document.getElementById('native-popover').showPopover()
        else if (k === 'sonner') sonner('Sonner toast: saved', { duration: 4000, className: 'toast-sonner' })
        else if (k === 'hot') hot('Hot toast: saved', { duration: 4000, className: 'toast-hot' })
        else if (k === 'antd-message') amessage.info({ content: 'Ant message: saved', duration: 4, className: 'toast-antd' })
        else set(k, true)
      },
      close: k => {
        if (k === 'native-dialog') document.getElementById('native-dialog').close()
        else if (k === 'native-popover') document.getElementById('native-popover').hidePopover()
        else set(k, false)
      },
      isOpen: k => {
        if (k === 'native-dialog') return document.getElementById('native-dialog').open
        if (k === 'native-popover') return document.getElementById('native-popover').matches(':popover-open')
        const toast = { sonner: '.toast-sonner', hot: '.toast-hot', 'antd-message': '.toast-antd' }[k]
        return !!document.querySelector(toast ?? `[data-ov="${k}"]`)
      },
    }
  }, [])
  return (
    <RTooltip.Provider>
      <h1>Overlays</h1>
      <dialog id="native-dialog"><Body id="native-dialog" /></dialog>
      <div popover="auto" id="native-popover" style={{ padding: 16, border: '1px solid #ccc' }}><Body id="native-popover" /></div>

      <RDialog.Root open={!!open['radix-dialog']} onOpenChange={v => set('radix-dialog', v)}>
        <RDialog.Portal>
          <RDialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)' }} />
          <RDialog.Content style={{ position: 'fixed', top: '30%', left: '30%', width: 360, padding: 20, background: '#fff', borderRadius: 12 }}>
            <RDialog.Title>Radix dialog</RDialog.Title><RDialog.Description>desc</RDialog.Description><Body id="radix-dialog" />
          </RDialog.Content>
        </RDialog.Portal>
      </RDialog.Root>

      <RDialog.Root open={!!open['radix-sheet']} onOpenChange={v => set('radix-sheet', v)}>
        <RDialog.Portal>
          <RDialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)' }} />
          <RDialog.Content style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 360, padding: 20, background: '#fff' }}>
            <RDialog.Title>Sheet (shadcn)</RDialog.Title><RDialog.Description>desc</RDialog.Description><Body id="radix-sheet" />
          </RDialog.Content>
        </RDialog.Portal>
      </RDialog.Root>

      <RPopover.Root open={!!open['radix-popover']} onOpenChange={v => set('radix-popover', v)}>
        <RPopover.Trigger id="radix-popover-trigger" style={{ marginTop: 200 }}>Radix popover</RPopover.Trigger>
        <RPopover.Portal><RPopover.Content style={{ padding: 16, background: '#fff', border: '1px solid #ccc' }}><Body id="radix-popover" /></RPopover.Content></RPopover.Portal>
      </RPopover.Root>

      <RMenu.Root open={!!open['radix-menu']} onOpenChange={v => set('radix-menu', v)}>
        <RMenu.Trigger id="radix-menu-trigger" style={{ marginLeft: 200 }}>Radix menu</RMenu.Trigger>
        <RMenu.Portal><RMenu.Content style={{ padding: 8, background: '#fff', border: '1px solid #ccc' }}>
          <div data-ov="radix-menu"><RMenu.Item className="ov-title">Duplicate</RMenu.Item><RMenu.Item className="ov-text">Archive</RMenu.Item><RMenu.Item className="ov-btn">Delete</RMenu.Item></div>
        </RMenu.Content></RMenu.Portal>
      </RMenu.Root>

      <RTooltip.Root open={!!open['radix-tooltip']}>
        <RTooltip.Trigger id="radix-tooltip-trigger" style={{ marginLeft: 200 }}>Radix tooltip</RTooltip.Trigger>
        <RTooltip.Portal><RTooltip.Content style={{ padding: '4px 8px', background: '#111', color: '#fff', borderRadius: 6 }}><span data-ov="radix-tooltip" className="ov-title">Copy link</span></RTooltip.Content></RTooltip.Portal>
      </RTooltip.Root>

      <HDialog open={!!open['headless-dialog']} onClose={() => set('headless-dialog', false)} style={{ position: 'relative', zIndex: 50 }}>
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)' }} />
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <DialogPanel style={{ width: 360, padding: 20, background: '#fff', borderRadius: 12 }}><DialogTitle>Headless UI</DialogTitle><Body id="headless-dialog" /></DialogPanel>
        </div>
      </HDialog>

      <MDialog open={!!open['mui-dialog']} onClose={() => set('mui-dialog', false)}><MTitle>MUI dialog</MTitle><DialogContent><Body id="mui-dialog" /></DialogContent></MDialog>
      <MDrawer anchor="right" open={!!open['mui-drawer']} onClose={() => set('mui-drawer', false)}><div style={{ width: 340, padding: 20 }}><Body id="mui-drawer" /></div></MDrawer>
      <Snackbar open={!!open['mui-snackbar']} autoHideDuration={4000} onClose={() => set('mui-snackbar', false)} message={<span data-ov="mui-snackbar" className="ov-title">MUI snackbar: saved</span>} />

      <AModal open={!!open['antd-modal']} title="Ant modal" onCancel={() => set('antd-modal', false)} onOk={() => set('antd-modal', false)}><Body id="antd-modal" /></AModal>
      <ADrawer open={!!open['antd-drawer']} title="Ant drawer" onClose={() => set('antd-drawer', false)}><Body id="antd-drawer" /></ADrawer>

      <Sonner />
      <HotToaster />
    </RTooltip.Provider>
  )
}
createRoot(document.getElementById('root')).render(<App />)
