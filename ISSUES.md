## Project Plan

### issues:

- [ ] send advisory after OBS scene sanity check on OBS startup

- [ ] camera tally light colour to be pushed to clients
- [ ] does client connection also get update [of tally light, focus mode, etc?]
- [ ] move camera status logic away from app.js to server.js/camera.js

- [2026-06-14] UI - tweak layout of X32 buttons - hard to find; consider colour coding them too...
- [ ] UI - are buttons big(tall) enough?

- [ ] help - include about overlays, login code

- [ ] deploy - set up as windows service; and decide whether client calls by IP (192.168.32.100:3000) or by name

- [ ] can we have a flexible format - for portrait phone?
- [ ] obs browser dock version (reduced version just camera, overlay, daily-code, and OBS sanity check)

- [ ] log - add timestamp; perhaps replace DEBUG_PREFIX with function DEBUG_PREFIX() that returns a timestamp?

### test:
- [ ] shutdown - camera shutdown [14/6/2026 camera shutdown occured on OBS stop - but request timed-out - so was it the other helper that shut it down???]
- [ ] camera - focus modes, [14/6/2026 UI seems OK, but need to test more]

### low priority:
- [ ] decide button response for FullScreen (hold-button, or normal click)
- [ ] check time cut off for code - supposed to be 2am!
- [ ] force OBS shutdown on node shutdown

### optional project wishlist:

- [ ] small camera preview window
- [ ] camera PTZ buttons

## Quick Reference

### websocket messaging

| server side               | client side |
| ------------              | ---------   |
| `wss.on("connection", async ws ==> {...})` | `socket = new WebSocket("ws://...")` |
| `ws.on("message", data => myHandler(data))` | `socket.onmessage = myHandler` |
| `myHandler(data) { msg = JSON.parse(data.toString); switch(msg.type) {...}}` | `socket.send(JSON.stringify({type: "the_message", ...}))` |
| `ws.send(JSON.stringify({ type: "the_message", ...}))` |  `myHandler(event) { msg = JSON.parse(event.data); switch (msg.type) {...} }` |

### emitter messaging

Emitter class (module)
* SEND: `this.emit("message", param1, param2, ...)`
* RECEIVE: owner to call defined method/function, e.g. `myEmitter.doThis()`

Emitter class (owner/server)
* `const X32 = new X32(starting_params_to_pass);`
* `X32.on("the_message", listener_function )`
* `x32.on("stateChanged", state => { do_something_with(state) });`
* `obs.on("setCameraTallyColor", (p1, p2, p3) => { do_something_with(p1, p2, p3) });`

###

```ps
npm version patch
git push --follow-tags
```




## done

- [2026-05-25] x32.js working, including
- [2026-05-26] ported obs client
- [x] test connection/disconnection logic, especially if multiple request
- [x] test sending methods (receiving from obs.js works)
- [x] Camera connection framework, and connectivity indicator
- [x] Merge camera and OBS stuff from other project
- [x] - OBS overlay scene - entry/exit methods
- [x] link overlay button
- [2026-05-29] link camera focus buttons
- [2026-05-30] focus mode methods
- [2026-05-30] autofocus / onetouch toggle methods
- [2026-05-30] include the above in the enable/disable buttons
- [x] confirm method --> holdButton
- [x] check for duplication of the highlighting/enabling camera preset buttons
- [2026-05-30] BUG: disabled button-hold (in OBS panel/X32 panel) still triggers
- [2026-06-06] make disabled style more consistent for set buttons in presetstable
- [2026-06-06] dim/highlight x32 snippet buttons
- [x] OBS scene - send to server to highlight on client
- [x] visual styles - hover, active state, highlight state
- [2026-06-03] read camera settings
- [2026-06-04] login code
- [2026-06-05] touch-hold issue on tablets https://chatgpt.com/c/6a036511-51b0-83eb-b48d-c0c76f5097b3
- [2026-05-31] daily login code on local client
- [2026-06-01] move stuff to frontend subfolders, and re-code authentication so that index.html requires authentication before being served
- [2026-06-06] fullscreen button to toggle
- [2026-06-06] button consistency - hold=0 buttons send immediately on touch, but other buttons if press-hold don't fire
- [2026-06-06] convert other OBS/X32 buttons to hold=0
- [2026-06-06] convert presetstable buttons to hold=0
- [2026-06-06] convert camera info and other small button to hold=0
- [--] consider wake lock - no wakeLock on my tablet/Surface
- [2026-06-05] touchscreen tweaks
- [2026-06-07] spaces between buttons, and update OBS scenes

- [2026-06-12] method for re-highlighting last-known activePreset
- [2026-06-08] how to disable Call Preset buttons as well?
- [2026-06-08] camera reset/restart to clear preset highlighted row
- [2026-06-08] set should also change highlight, if different preset
- [2026-06-10] OBS parent overlay
- [2026-06-12] custom overlay request text + overlay button
- [2026-06-12] reset these buttons when overlay scene is selected;

- [2026-06-13] why does resetOverlayButton get called on OBS disconnect?  (or can we do it such that it doesn't try to get info from obs (as disconnected))
- [2026-06-13] send advisory if scene not found, or overlay source not found
- [2026-06-13] verify - force hide overlay sources on startup