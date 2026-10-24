/* Test pages only: a page in a hidden browser pane gets no animation frames, and Inspeck draws on them.
   Frames from a message channel, which a hidden page still runs. Must load before /inspeck.js. Not under
   real browser automation (Playwright, see test/browsers), which renders, so frames come as they do for people. */
if (!navigator.webdriver) {
  let n = 0
  const dead = new Set()
  window.requestAnimationFrame = cb => { const id = ++n; const ch = new MessageChannel(); ch.port1.onmessage = () => { if (!dead.delete(id)) cb(performance.now()) }; ch.port2.postMessage(0); return id }
  window.cancelAnimationFrame = id => { dead.add(id) }
}
