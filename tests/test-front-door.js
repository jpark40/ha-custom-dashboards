const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/front-door-timeline-card.js'), 'utf8');
function card() {
  let Card;
  vm.runInNewContext(source, {
    HTMLElement: class { attachShadow() {} },
    customElements: { get() {}, define(name, type) { Card = type; } },
    console: { info() {} },
  });
  return new Card();
}
test('Person is the default and Person and Package separate detections by event type', () => {
  const c = card();
  const images = ['Image Update', 'Motion', 'Person', 'Stranger', 'Package Delivered', 'Package Taken', 'Package Stranded']
    .map((label, id) => ({label, id}));
  assert.equal(c._category, 'person');
  assert.deepEqual(Array.from(c._filterImages(images), i => i.id), [2, 3]);
  c.setConfig({initial_category: 'all'});
  assert.equal(c._category, 'person');
  c._category = 'person';
  assert.deepEqual(Array.from(c._filterImages(images), i => i.id), [2, 3]);
  c._category = 'package';
  assert.deepEqual(Array.from(c._filterImages(images), i => i.id), [4, 5, 6]);
  assert.equal(c._filterImages([{label:'package_delivered'}]).length, 1);
  assert.equal(c._filterImages([{label:'image_update'}]).length, 0);
  assert.equal(c._filterImages([{label:'motion'}]).length, 0);
  assert.match(source, /data-category="person">Person/);
  assert.match(source, /data-category="package">Package/);
  assert.match(source, /<span class="badge">0<\/span>/);
  assert.doesNotMatch(source, /data-category="all"|>All</);
});
test('tab badges count the selected date snapshots and update when the date changes', () => {
  const c = card();
  const tabs = ['person', 'package'].map(category => ({
    dataset: {category},
    setAttribute(name, value) { this[name] = value; },
    querySelector() { return this.badge; },
    badge: {textContent: ''},
  }));
  c.shadowRoot = {querySelectorAll: () => tabs};
  c._category = 'package';
  c._payload = {
    counts: {person: 12, package: 7},
    images: ['Person', 'stranger', 'package_delivered', 'Package Taken', 'package-stranded', 'Motion', 'image_update']
      .map(label => ({label})),
  };
  c._syncTabs();
  assert.deepEqual(tabs.map(tab => tab.badge.textContent), [2, 3]);
  assert.deepEqual(tabs.map(tab => tab.tabIndex), [-1, 0]);
  assert.equal(c._category, 'package');
  assert.equal(tabs[1].badge.textContent, c._filterImages(c._payload.images).length);
  c._payload = {images: [{label: 'Person'}]};
  c._syncTabs();
  assert.deepEqual(tabs.map(tab => tab.badge.textContent), [1, 0]);
  c._payload = {images: []};
  c._syncTabs();
  assert.deepEqual(tabs.map(tab => tab.badge.textContent), [0, 0]);
});
test('late full-image response cannot replace an image after category switch', async () => {
  const c = card();
  const image = {id: 'person', date:'2026-10-04', time:'12:00:00', label:'Person'};
  c._images = [image];
  let resolve;
  c._loadBlob = () => new Promise(r => {resolve = r;});
  const classes = {remove() {}, add() {}};
  c._els = {timeline:{querySelectorAll:()=>[]},mainImage:{classList:classes},viewerStatus:{classList:classes},stamp:{},overlay:{classList:{contains:()=>false}}};
  const pending = c._selectIndex(0);
  c._images = [{id:'package'}];
  resolve('blob:old-person'); await pending;
  assert.equal(c._els.mainImage.src, undefined);
});

test('automatic refresh follows the newest date across midnight; chosen history stays pinned', async () => {
  const c = card();
  const calls = [];
  c._load = async (date, preserve) => calls.push({date, preserve});
  c._selectedDate = '2026-10-18';
  await c._refresh();
  assert.equal(calls.at(-1).date, undefined);
  await c._chooseDate('2026-10-17');
  c._selectedDate = '2026-10-17';
  await c._refresh();
  assert.equal(calls.at(-1).date, '2026-10-17');
  await c._chooseDate(undefined);
  await c._refresh();
  assert.equal(calls.at(-1).date, undefined);
});

test('polling follows a new frame but preserves a deliberately selected older frame', async () => {
  const c = card();
  c.setConfig({});
  const images = [{id:'older'}, {id:'latest'}];
  c._images = images;
  c._els = {overlay:{classList:{contains:()=>false}}, refresh:{}};
  c._setMessage = () => {};
  c._syncDateControls = () => {};
  c._releaseBlobs = () => {};
  const selections = [];
  c._renderTimeline = previousId => selections.push(previousId);
  const requests = [];
  c._hass = {callApi:async (method, path) => {
    requests.push(path);
    return {selected_date:'2026-10-19',images:[...images,{id:'new'}]};
  }};
  c._selectedDate = '2026-10-18';
  c._selectedIndex = 1;
  await c._refresh();
  assert.equal(requests.at(-1), 'front_door_timeline');
  assert.equal(c._selectedDate, '2026-10-19');
  assert.equal(selections.at(-1), undefined, 'the renderer selects the newest frame');
  c._selectedIndex = 0;
  await c._refresh();
  assert.equal(selections.at(-1), 'older');
});

test('a stalled Eufy source is shown clearly without warning while browsing history', () => {
  const c = card();
  c._payload = {source_status: {event_type:'person',
    detection_updated:'2026-10-19T12:10:00Z', image_updated:'2026-10-18T23:00:00Z'}};
  const messages = [];
  c._setMessage = value => messages.push(value);
  c._showSourceWarning();
  assert.match(messages[0], /Eufy reported a newer detection/);
  c._followLatestDate = false;
  c._showSourceWarning();
  assert.equal(messages.length, 1);
  c._followLatestDate = true;
  c._payload.source_status.image_updated = '2026-10-19T12:09:59Z';
  c._showSourceWarning();
  assert.equal(messages.length, 1);
});
