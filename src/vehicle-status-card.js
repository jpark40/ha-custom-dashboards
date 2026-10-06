// HACS package v1.0.0: existing vehicle pages hosted alongside the cards.
const PACKAGE_VERSION = "__PACKAGE_VERSION__";
class JpVehicleStatusCard extends HTMLElement {
  constructor() { super(); this.attachShadow({mode: "open"}); }
  setConfig(config) {
    if (!["mousie", "moomoo"].includes(config?.vehicle)) throw new Error('vehicle must be mousie or moomoo');
    const height = Number(config.height ?? 650);
    if (!Number.isFinite(height) || height < 200 || height > 4000) throw new Error('height must be between 200 and 4000');
    this._config = {...config, height};
    const url = new URL(`./${config.vehicle}-status.html`, import.meta.url);
    // /local serves HTML as normal static content. HACS still owns and updates it.
    url.pathname = url.pathname.replace(/^\/hacsfiles\//, '/local/community/');
    url.search = new URL(import.meta.url).search || `?v=${PACKAGE_VERSION}`;
    if (!this._iframe) {
      const style = document.createElement('style');
      style.textContent = ':host{display:block}ha-card{display:block;overflow:hidden}iframe{display:block;width:100%;border:0}';
      const card = document.createElement('ha-card');
      this._iframe = document.createElement('iframe');
      this._iframe.setAttribute('allow', 'fullscreen');
      card.appendChild(this._iframe); this.shadowRoot.append(style, card);
    }
    this._iframe.title = config.title || (config.vehicle === 'mousie' ? 'Mousie status' : 'Moo Moo status');
    this._iframe.style.height = `${height}px`;
    if (this._url !== url.href) { this._url = url.href; this._iframe.src = url.href; }
  }
  set hass(value) { this._hass = value; }
  getCardSize() { return Math.ceil((this._config?.height ?? 650) / 50); }
  static getStubConfig() { return {vehicle: 'mousie', height: 650}; }
}
if (!customElements.get('jp-vehicle-status-card')) customElements.define('jp-vehicle-status-card', JpVehicleStatusCard);
