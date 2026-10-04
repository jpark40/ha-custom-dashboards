// Logic tests with small DOM stubs; these do not assert browser rendering.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/front-door-timeline-card.js'), 'utf8');

function element() {
  const classes = new Set(), attrs = new Map(), captured = new Set();
  return {
    style: {}, clientWidth: 1000, clientHeight: 600, naturalWidth: 1600, naturalHeight: 900,
    classList: {contains: x => classes.has(x), add: x => classes.add(x), remove: x => classes.delete(x),
      toggle: (x, yes) => yes ? classes.add(x) : classes.delete(x)},
    setAttribute: (k, v) => attrs.set(k, v), getAttribute: k => attrs.get(k), removeAttribute: k => attrs.delete(k),
    getBoundingClientRect: () => ({left: 0, top: 0, width: 1000, height: 600}),
    setPointerCapture: id => captured.add(id), hasPointerCapture: id => captured.has(id),
    releasePointerCapture: id => captured.delete(id),
    querySelectorAll: () => [], focus() { this.focused = true; },
  };
}
function card() {
  let Card;
  const revoked = [];
  const context = {
    HTMLElement: class { attachShadow() { this.shadowRoot = {}; } },
    customElements: {get: () => null, define: (_, type) => { Card = type; }},
    document: {hidden: false, removeEventListener() {}}, window: {},
    performance: {now: () => 100}, Intl, Date, URLSearchParams, clearInterval,
    URL: {revokeObjectURL: value => revoked.push(value)},
  };
  vm.runInNewContext(source, context);
  const c = new Card(); c.isConnected = true;
  c._els = {};
  for (const name of ['overlay', 'overlay-stage', 'overlay-image', 'overlay-status', 'overlay-caption',
    'overlay-reset', 'overlay-close', 'overlay-previous', 'overlay-next', 'main-image', 'timeline',
    'image-previous', 'image-next', 'position', 'memo', 'stamp', 'viewer-status']) c._els[name] = element();
  c._els.mainImage = c._els['main-image']; c._els.viewerStatus = c._els['viewer-status'];
  c._payload = {images: Array.from({length: 3}, (_, i) => ({id: String(i), camera_name: 'Front',
    date: '2026-10-01', time: '08:00:00', memo: 'ups:90%'})), has_more: false};
  c._images = c._payload.images;
  c._selectedIndex = 1; c._overlayReady = true; c._els.overlay.classList.add('open');
  c._revoked = revoked;
  return c;
}
function pointer(c, type, id, x, y = 300) {
  const event = {type, pointerId: id, clientX: x, clientY: y, pointerType: 'touch', preventDefault() {}};
  c[type === 'pointerdown' ? '_pointerDown' : type === 'pointermove' ? '_pointerMove' : '_pointerEnd'](event);
}
function pinch(c) {
  pointer(c, 'pointerdown', 1, 450); pointer(c, 'pointerdown', 2, 550);
  pointer(c, 'pointermove', 1, 400); pointer(c, 'pointermove', 2, 600);
}

test('swipe left/right requests next/previous; vertical and short drags do not', () => {
  const c = card(), directions = []; c._navigateOverlay = d => directions.push(d);
  for (const [start, end, y] of [[650, 400, 300], [400, 650, 300], [500, 530, 300], [500, 530, 600]]) {
    pointer(c, 'pointerdown', 1, start); pointer(c, 'pointerup', 1, end, y);
  }
  assert.deepEqual(directions, [1, -1]);
});

test('pinch enlarges the image; remaining finger pans without changing snapshot', () => {
  const c = card(), directions = []; c._navigateOverlay = d => directions.push(d);
  pinch(c); assert.equal(c._zoom.scale, 2);
  pointer(c, 'pointerup', 2, 600);
  pointer(c, 'pointermove', 1, 600);
  pointer(c, 'pointerup', 1, 650);
  assert.equal(c._zoom.x, 250);
  assert.deepEqual(directions, []);
  assert.equal(c._pointers.size, 0);
});

test('zoom is limited to 1–8 and image pan stays within the fitted image bounds', () => {
  const c = card(); c._zoom = {scale: 99, x: 1e6, y: -1e6}; c._applyZoom();
  assert.equal(c._zoom.scale, 8); assert.equal(c._zoom.x, 3500); assert.equal(c._zoom.y, -1950);
  c._zoom = {scale: .4, x: 200, y: -200}; c._applyZoom();
  assert.equal(c._zoom.scale, 1); assert.equal(Math.abs(c._zoom.x), 0); assert.equal(Math.abs(c._zoom.y), 0);
});

test('cancel and lost capture never change snapshots; reset clears touch state', () => {
  const c = card(), directions = []; c._navigateOverlay = d => directions.push(d);
  for (const ending of ['pointercancel', 'lostpointercapture']) {
    pointer(c, 'pointerdown', 1, 650); pointer(c, 'pointermove', 1, 200); pointer(c, ending, 1, 200);
  }
  pinch(c); c._resetZoom();
  assert.equal(c._zoom.scale, 1); assert.equal(c._pointers.size, 0); assert.deepEqual(directions, []);
});


test('keyboard arrows navigate, reset works, Escape closes and restores focus', () => {
  const c = card(), directions = []; c._navigateOverlay = d => directions.push(d);
  const key = key => c._overlayKeyDown({key, preventDefault() {}});
  key('ArrowLeft'); key('ArrowRight'); pinch(c); key('0');
  assert.equal(c._zoom.scale, 1); key('Escape');
  assert.deepEqual(directions, [-1, 1]); assert.equal(c._els.overlay.classList.contains('open'), false);
  assert.equal(c._els['main-image'].focused, true);
});
test('navigation stays within the current filtered snapshots and ignores busy repeats', async () => {
  const c = card(), calls = []; c._selectedIndex = 0;
  let resolve; c._selectIndex = i => {calls.push(i); return new Promise(r => {resolve = r;});};
  await c._navigateOverlay(-1); assert.equal(calls.length, 0);
  const pending = c._navigateOverlay(1); await c._navigateOverlay(1);
  assert.deepEqual(calls, [1]); resolve(); await pending;
  assert.equal(c._overlayBusy, false);
  c._selectedIndex = c._images.length - 1; await c._navigateOverlay(1);
  assert.deepEqual(calls, [1]);
});
test('switching snapshots updates the overlay and resets its zoom', async () => {
  const c = card(); c._zoom.scale = 3; c._loadBlob = async () => 'blob:new';
  await c._selectIndex(2);
  assert.equal(c._selectedIndex, 2); assert.equal(c._zoom.scale, 1);
  assert.equal(c._els['overlay-image'].src, 'blob:new');
});
test('late image response cannot replace the main viewer or overlay', async () => {
  const c = card(), pending = new Map();
  c._loadBlob = item => new Promise(resolve => pending.set(item.id, resolve));
  const first = c._selectIndex(0), second = c._selectIndex(2);
  pending.get('2')('blob:new'); await second; pending.get('0')('blob:old'); await first;
  assert.equal(c._els.mainImage.src, 'blob:new'); assert.equal(c._els['overlay-image'].src, 'blob:new');
});
test('wheel zoom respects limits and cannot run while loading', () => {
  const c = card();
  const event = {deltaY:-1000, deltaMode:0,clientX:500,clientY:300,preventDefault(){}};
  c._wheelZoom(event); assert(c._zoom.scale > 1); assert(c._zoom.scale <= 8);
  c._overlayBusy = true; const before = c._zoom.scale; c._wheelZoom(event); assert.equal(c._zoom.scale,before);
});
