/* Every small thing in real table libraries' cells, hovered with the real mouse. widget/dev/tables/. */
import { test, expect } from '@playwright/test'
import { inspeckOn, probe } from './helpers.mjs'

const PAGES = [
  ['plain HTML and Bootstrap', 'tables/native.html', 'tbody td'],
  ['AG Grid', 'tables/aggrid.html', '.ag-cell'],
  ['Tabulator', 'tables/tabulator.html', '.tabulator-cell'],
  ['DataTables', 'tables/datatables.html', 'tbody td'],
  ['Grid.js', 'tables/gridjs.html', '.gridjs-td'],
  ['Element Plus (Vue)', 'tables/elementplus.html', '.el-table__cell'],
  ['Vaadin Grid (web component)', 'tables/vaadin.html', '.nm'],
  ['Ant Design, MUI DataGrid, TanStack (React)', 'tables/react.html', '.MuiDataGrid-cell'],
]

for (const [name, url, ready] of PAGES) {
  test(name, async ({ page }) => {
    await page.goto(url)
    await page.waitForSelector(ready, { timeout: 30_000 })
    await inspeckOn(page)
    const r = await probe(page, page.mainFrame(), { limit: 150 })
    expect(r.tested, 'something was tested').toBeGreaterThan(5)
    expect(r.bad).toEqual([])
  })
}
