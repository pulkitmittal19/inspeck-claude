/* Holding the page's network answers while you freeze it (F), so a loading
 * state you caught stays on screen instead of turning into the loaded page.
 *
 * The answer to a request that was already on its way when you froze is held
 * too, so fetch and XMLHttpRequest are wrapped once, when Inspeck loads. Not
 * frozen, they pass straight through. Frozen, the request still goes out and
 * the answer still arrives; the page just isn't told until you release, then
 * everything lands in the order it came.
 *
 * Inspeck's own requests use the fetch it took before wrapping (native.ts).
 */

let held = false
let waiting: Array<() => void> = []

/** Hold answers (true) or let them, and everything held so far, through (false). */
export function holdNetwork(on: boolean): void {
  if (held === on) return
  held = on
  if (!on) for (const go of waiting.splice(0)) go()
}

const later = (go: () => void) => { waiting.push(go) }

/** The XMLHttpRequest events that tell the page a request is done. */
const DONE = ['readystatechange', 'load', 'error', 'abort', 'timeout', 'loadend']

const copyOf = (e: Event) => e instanceof ProgressEvent
  ? new ProgressEvent(e.type, { lengthComputable: e.lengthComputable, loaded: e.loaded, total: e.total })
  : new Event(e.type)

type Wrapped = { __inspeck?: true }

export function installNetworkHold(): void {
  const w = window as unknown as { fetch: typeof fetch & Wrapped; XMLHttpRequest: typeof XMLHttpRequest & Wrapped }

  if (typeof w.fetch === 'function' && !w.fetch.__inspeck) {
    const original = w.fetch
    const wrapped = function (this: unknown, ...args: Parameters<typeof fetch>) {
      return original.apply(this ?? window, args).then(
        res => held ? new Promise<Response>(ok => later(() => ok(res))) : res,
        err => held ? new Promise<never>((_, no) => later(() => no(err))) : Promise.reject(err),
      )
    } as typeof fetch & Wrapped
    wrapped.__inspeck = true
    w.fetch = wrapped
  }

  if (typeof w.XMLHttpRequest === 'function' && !w.XMLHttpRequest.__inspeck) {
    /* Our listeners go on in the constructor, before any of the page's, so a held
       request's "done" events stop with us; on release they're sent again. Only
       the ones at the end: readyState is already 4 by then, and a handler that
       ran once per state change would otherwise think it finished three times. */
    const Held = class extends w.XMLHttpRequest {
      constructor() {
        super()
        let queue: Event[] = []
        let replaying = false
        const hold = (e: Event) => {
          if (replaying || !held || (e.type === 'readystatechange' && this.readyState !== 4)) return
          e.stopImmediatePropagation()
          if (!queue.length) {
            later(() => {
              replaying = true
              const events = queue
              queue = []
              try { for (const ev of events) this.dispatchEvent(copyOf(ev)) } finally { replaying = false }
            })
          }
          queue.push(e)
        }
        for (const type of DONE) this.addEventListener(type, hold)
      }
    } as typeof XMLHttpRequest & Wrapped
    Held.__inspeck = true
    w.XMLHttpRequest = Held
  }
}
