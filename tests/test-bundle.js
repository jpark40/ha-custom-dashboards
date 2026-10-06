const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const version = fs.readFileSync(path.join(__dirname, '../VERSION'), 'utf8').trim();
const source = fs.readFileSync(path.join(__dirname, '../dist/ha-custom-dashboards.js'), 'utf8')
  .replaceAll('import.meta.url', JSON.stringify('https://ha.example/hacsfiles/ha-custom-dashboards/ha-custom-dashboards.js'));

function registry() {
  const types = new Map();
  function element() {
    return {style: {}, children: [], append(...children) {this.children.push(...children);},
      appendChild(child) {this.children.push(child);}, setAttribute() {}};
  }
  const context = {
    HTMLElement: class {attachShadow() {return this.shadowRoot = element();}},
    customElements: {get: name => types.get(name), define(name, type) {
      assert(!types.has(name), `duplicate ${name}`); types.set(name, type);
    }},
    document: {createElement: element}, URL, console: {info() {}},
  };
  return {types, context: vm.createContext(context)};
}

test('single bundle registers each existing card and supports repeated loads', () => {
  const {types, context} = registry();
  vm.runInContext(source, context);
  assert.deepEqual([...types.keys()], ['blue-iris-timeline', 'purobot-timeline', 'front-door-timeline', 'jp-vehicle-status-card']);
  vm.runInContext(source, context);
  assert.equal(types.size, 4);
});

test('bundle does not claim the upstream vehicle-status-card custom element', () => {
  const {types, context} = registry();
  class UpstreamVehicleStatusCard {}
  context.customElements.define('vehicle-status-card', UpstreamVehicleStatusCard);
  vm.runInContext(source, context);
  assert.equal(types.get('vehicle-status-card'), UpstreamVehicleStatusCard);
  assert(types.has('jp-vehicle-status-card'));
});

test('vehicle card resolves installed HTML and does not reload on HA state updates', () => {
  const {types, context} = registry(); vm.runInContext(source, context);
  const Card = types.get('jp-vehicle-status-card'), card = new Card();
  card.setConfig({vehicle: 'mousie'});
  assert.equal(card._iframe.src, `https://ha.example/local/community/ha-custom-dashboards/mousie-status.html?v=${version}`);
  const frame = card._iframe;
  card.hass = {states: {}}; card.setConfig({vehicle: 'mousie'});
  assert.equal(card._iframe, frame);
  card.setConfig({vehicle: 'moomoo', height: 900});
  assert.equal(card._iframe.src, `https://ha.example/local/community/ha-custom-dashboards/moomoo-status.html?v=${version}`);
  assert.equal(card._iframe.style.height, '900px');
  assert.throws(() => card.setConfig({vehicle: '../other'}));
  assert.throws(() => card.setConfig({vehicle: 'mousie', height: 'bad'}));
});

test('vehicle OAuth sessions are isolated at the new paths and no secrets are embedded', () => {
  const base = path.join(__dirname, '../dist');
  const mousie = fs.readFileSync(path.join(base, 'mousie-status.html'), 'utf8');
  const moomoo = fs.readFileSync(path.join(base, 'moomoo-status.html'), 'utf8');
  assert(mousie.includes('hacsMousieStatusHaAuth'));
  assert(moomoo.includes('hacsMoomooStatusHaAuth'));
  assert(moomoo.includes('/local/community/ha-custom-dashboards/mousie-status.html'));
  for (const html of [mousie, moomoo]) {
    assert(!/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(html));
    assert(!/\b(?:ghp_|github_pat_|sk-proj-)/.test(html));
  }
});
