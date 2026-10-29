const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/front-door-timeline-card.js'), 'utf8');
function card(extras = {}) {
  let Card;
  vm.runInNewContext(source, {
    HTMLElement: class { attachShadow() {} },
    customElements: { get() {}, define(name, type) { Card = type; } },
    console: { info() {} },
    ...extras,
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
  assert.equal(requests.at(-1), 'front_door_timeline?category=person');
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

test('Latest requests the selected category, while a chosen date stays explicit', async () => {
  const c = card();
  c.setConfig({});
  c._els = {overlay:{classList:{contains:()=>false}}, refresh:{}};
  c._setMessage = c._syncDateControls = c._renderTimeline = c._releaseBlobs = () => {};
  const requests = [];
  c._hass = {callApi: async (method, path) => {
    requests.push(path);
    return {selected_date:'2026-10-19', latest_date:'2026-10-19', images:[{label:'Stranger'}]};
  }};
  await c._refresh();
  assert.equal(requests.at(-1), 'front_door_timeline?category=person');
  c._category = 'package';
  await c._refresh();
  assert.equal(requests.at(-1), 'front_door_timeline?category=package');
  await c._chooseDate('2026-10-23');
  assert.equal(requests.at(-1), 'front_door_timeline?category=package&date=2026-10-23');
  assert.equal(c._followLatestDate, false);
});

test('switching tabs follows that category history, while a chosen date stays pinned', async () => {
  const c = card();
  let refreshed = 0, rendered = 0;
  c._refresh = async () => { refreshed++; };
  c._closeOverlay = c._syncDateControls = () => {};
  c._renderTimeline = () => { rendered++; };
  await c._chooseCategory('package');
  assert.equal(refreshed, 1);
  assert.equal(c._category, 'package');
  c._followLatestDate = false;
  c._selectedDate = '2026-10-19';
  await c._chooseCategory('person');
  assert.equal(refreshed, 1);
  assert.equal(rendered, 1);
  assert.equal(c._selectedDate, '2026-10-19');
});

test('date arrows skip days that only have other labels or the other category', async () => {
  const c = card();
  c._payload = {dates:[
    {date:'2026-10-18', counts:{person:1, package:0}},
    {date:'2026-10-19', counts:{person:0, package:1}},
    {date:'2026-10-20', counts:{person:0, package:0}},
    {date:'2026-10-21', counts:{person:1, package:0}},
  ]};
  c._selectedDate = '2026-10-21';
  const chosen = [];
  c._chooseDate = date => chosen.push(date);
  c._moveDate(-1);
  assert.equal(chosen.at(-1), '2026-10-18');
  c._category = 'package';
  c._moveDate(-1);
  assert.equal(chosen.at(-1), '2026-10-19');
});

test('an empty folder is distinguished from snapshots hidden by category labels', () => {
  const c = card();
  c._payload = {total_count:0};
  assert.match(c._emptyMessage('today'), /No saved snapshot files/);
  c._payload = {total_count:3, counts:{person:0, package:0}, hidden_count:3};
  assert.match(c._emptyMessage('today'), /No person snapshots are classified in saved history/);
  assert.match(c._emptyMessage('today'), /3 saved snapshots have other labels/);
  c._followLatestDate = false;
  c._payload = {total_count:4, counts:{person:1}, images:[{label:'Image Update'}]};
  assert.match(c._emptyMessage('Oct 23'), /No person snapshots saved for Oct 23/);
  assert.match(c._emptyMessage('Oct 23'), /Select Latest/);
});

test('legacy waiting status refers to the requested Last event image', () => {
  const c = card();
  c._payload = {source_status: {
    event_type:'person', detection_updated:'2026-10-26T04:37:21Z',
    image_updated:'2026-10-26T05:22:08Z',
    capture:{state:'waiting_for_image', label:'person', event_timestamp:'2026-10-26T04:37:21Z'},
  }};
  const messages = [];
  c._setMessage = (message, error) => messages.push({message, error});
  c._showSourceWarning();
  assert.match(messages[0].message, /Waiting for the Last event image to become available/);
  c._followLatestDate = false;
  c._showSourceWarning();
  assert.equal(messages.length, 1);
});

test('automatic capture write errors and restored metadata are shown without hiding history', () => {
  const c = card();
  const messages = [];
  c._setMessage = (message, error) => messages.push({message, error});
  c._payload = {source_status:{capture:{state:'capture_error',message:'storage unavailable'}}};
  c._showSourceWarning();
  assert.match(messages[0].message, /storage unavailable/);
  assert.equal(messages[0].error, true);
  c._payload.source_status.capture = {state:'restored_detection',message:'Waiting for a new live detection.'};
  c._showSourceWarning();
  assert.match(messages[1].message, /new live detection/);
  assert.equal(messages[1].error, false);
});

test('saved Last event image is not declared failed because its SDK timestamp is old', () => {
  const c = card();
  const messages = [];
  c._setMessage = message => messages.push(message);
  c._payload = {source_status:{event_type:'person',
    detection_updated:'2026-10-27T22:58:26.769Z', image_updated:'2026-10-27T16:43:23.852Z',
    capture:{state:'saved', image_source:'event_image', label:'person',
      event_timestamp:'2026-10-27T22:58:26.769000+00:00'}}};
  for (const state of ['saved', 'updated', 'unchanged']) {
    c._payload.source_status.capture.state = state;
    c._showSourceWarning();
  }
  assert.equal(messages.length, 0);
  c._payload.source_status.detection_updated = '2026-10-27T22:59:26.769Z';
  c._showSourceWarning();
  assert.equal(messages.length, 1);
  assert.match(messages[0], /newer detection/);
});

test('a late event image is fetched again under the same timeline event ID', async () => {
  let blobs = 0;
  const c = card({URL:{createObjectURL:() => `blob:${++blobs}`}});
  const requests = [];
  c._hass = {callApiRaw:async (method, path) => {
    requests.push(path);
    return {ok:true, blob:async () => ({})};
  }};
  const item = {id:'same-event', url:'/api/front_door_timeline/image/event.jpg?v=1'};
  assert.equal(await c._loadBlob(item), 'blob:1');
  assert.equal(await c._loadBlob(item), 'blob:1');
  item.url = '/api/front_door_timeline/image/event.jpg?v=2';
  assert.equal(await c._loadBlob(item), 'blob:2');
  assert.equal(requests.length, 2);
  assert.match(requests[1], /v=2$/);
});

test('late response from an earlier revision cannot replace the updated event image', async () => {
  const c = card();
  const item = {id:'same-event', url:'/api/image/event.jpg?v=1', date:'2026-10-29',time:'12:00:00',label:'Person'};
  c._images = [item];
  let resolve;
  c._loadBlob = () => new Promise(r => {resolve = r;});
  const classes = {remove() {}, add() {}};
  c._els = {timeline:{querySelectorAll:()=>[]},mainImage:{classList:classes},
    viewerStatus:{classList:classes},stamp:{},overlay:{classList:{contains:()=>false}}};
  const pending = c._selectIndex(0);
  c._images = [{...item, url:'/api/image/event.jpg?v=2'}];
  resolve('blob:old-revision');
  await pending;
  assert.equal(c._els.mainImage.src, undefined);
});

test('polling releases cached blobs when a snapshot image is revised', async () => {
  const c = card();
  c.setConfig({});
  c._selectedDate = '2026-10-29';
  c._payload = {images:[{id:'event',url:'/api/image/event.jpg?v=1'}]};
  c._els = {overlay:{classList:{contains:()=>false}},refresh:{}};
  c._setMessage = c._syncDateControls = c._renderTimeline = () => {};
  let releases = 0;
  c._releaseBlobs = () => { releases++; };
  c._hass = {callApi:async () => ({selected_date:'2026-10-29',images:[{id:'event',url:'/api/image/event.jpg?v=2'}]})};
  await c._refresh();
  assert.equal(releases, 1);
});
