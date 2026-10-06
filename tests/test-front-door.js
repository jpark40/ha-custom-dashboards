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
test('tab badges show all-history category totals returned by the timeline API', () => {
  const c = card();
  const tabs = ['person', 'package'].map(category => ({
    dataset: {category},
    setAttribute(name, value) { this[name] = value; },
    querySelector() { return this.badge; },
    badge: {textContent: ''},
  }));
  c.shadowRoot = {querySelectorAll: () => tabs};
  c._category = 'package';
  c._payload = {counts: {person: 12, package: 7}};
  c._syncTabs();
  assert.deepEqual(tabs.map(tab => tab.badge.textContent), [12, 7]);
  assert.deepEqual(tabs.map(tab => tab.tabIndex), [-1, 0]);
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
