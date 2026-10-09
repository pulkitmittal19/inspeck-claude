/* The browser's own frame and network calls, taken before Freeze holds the
 * page's. Inspeck's own motion and requests use these, so the outline keeps
 * gliding and a note still sends while the page is frozen. */

const { requestAnimationFrame: request, cancelAnimationFrame: cancel, fetch: get } = window

export const nextFrame: typeof requestAnimationFrame = cb => request.call(window, cb)
export const cancelFrame: typeof cancelAnimationFrame = id => cancel.call(window, id)
export const nativeFetch: typeof fetch = (input, init) => get.call(window, input, init)
