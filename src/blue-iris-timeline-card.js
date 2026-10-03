/* Blue Iris AI Timeline 1.1.0. Layout adapted from Front Door Timeline v1.0.4. */
class BlueIrisTimelineCard extends HTMLElement {
  constructor() {
    super(); this.attachShadow({mode: "open"});
    this._category = "people"; this._camera = ""; this._cursor = null; this._pages = []; this._followLatestDate = true;
    this._selectedIndex = -1; this._loadGeneration = 0; this._mediaGeneration = 0;
    this._selectionGeneration = 0;
    this._blobUrls = new Map(); this._blobPromises = new Map();
    this._pointers = new Map(); this._zoom = {scale: 1, x: 0, y: 0};
    this._visibility = () => { if (!document.hidden && !this._els?.overlay.classList.contains("open")) this._load(true); };
  }
  setConfig(config) {
    const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
    this._config = {
      title: config.title || "Blue Iris AI Timeline",
      refresh_seconds: number(config.refresh_seconds ?? 15, 15, 0, 3600),
      thumbnail_width: number(config.thumbnail_width ?? 170, 170, 120, 320),
      page_size: number(config.page_size ?? 80, 80, 10, 200),
    };
    const category = config.initial_category || "people";
    if (!["people", "animals", "cars", "delivery"].includes(category)) throw new Error("initial_category must be people, animals, cars, or delivery");
    this._category = category; this._payload = null; this._resetPage(); this._renderShell();
    if (this.isConnected) this._start();
  }
  set hass(hass) {
    const first = !this._hass; this._hass = hass;
    if (first && this.isConnected && this._config) this._load();
  }
  getCardSize() { return 10; }
  getGridOptions() { return {columns: "full"}; }
  connectedCallback() { if (this._config) this._start(); }
  disconnectedCallback() {
    clearInterval(this._timer); this._timer = null;
    document.removeEventListener("visibilitychange", this._visibility);
    this._observer?.disconnect(); this._resizeObserver?.disconnect(); ++this._loadGeneration;
    this._releaseBlobs(); this._closeOverlay(false); this._payload = null; this._lastListKey = null;
  }
  _start() {
    clearInterval(this._timer);
    this._resizeObserver?.observe(this._els["overlay-stage"]);
    document.removeEventListener("visibilitychange", this._visibility);
    document.addEventListener("visibilitychange", this._visibility);
    if (this._config.refresh_seconds) this._timer = setInterval(() => {
      if (!document.hidden && !this._loading && !this._els?.overlay.classList.contains("open")) this._load(true);
    }, this._config.refresh_seconds * 1000);
    if (this._hass) this._load();
  }
  _resetPage() { this._cursor = null; this._pages = []; this._lastListKey = null; }
  _renderShell() {
    this._closeOverlay(false); this._releaseBlobs(); this._observer?.disconnect(); this._resizeObserver?.disconnect(); this._cameraKey = null;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          overflow: hidden;
          background: var(--ha-card-background, var(--card-background-color));
          color: var(--primary-text-color);
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 16px 16px 12px;
          flex-wrap: wrap;
        }
        .title-wrap { min-width: 0; }
        .title {
          font-size: 20px;
          font-weight: 500;
          line-height: 1.25;
        }
        .count {
          margin-top: 2px;
          color: var(--secondary-text-color);
          font-size: 12px;
        }
        .date-controls {
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .date-input {
          height: 36px;
          box-sizing: border-box;
          border: 1px solid var(--divider-color);
          border-radius: 9px;
          padding: 0 9px;
          color: var(--primary-text-color);
          background: var(--secondary-background-color);
          font: inherit;
          color-scheme: light dark;
        }
        .icon-button, .latest-button {
          height: 36px;
          min-width: 36px;
          border: 0;
          border-radius: 9px;
          padding: 0 9px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--primary-text-color);
          background: var(--secondary-background-color);
          cursor: pointer;
        }
        .icon-button:hover, .latest-button:hover {
          background: color-mix(in srgb, var(--primary-color) 12%, var(--secondary-background-color));
        }
        .icon-button:disabled {
          opacity: .35;
          cursor: default;
        }
        .latest-button { font-size: 12px; font-weight: 600; }
        .viewer {
          position: relative;
          margin: 0 16px;
          min-height: min(240px, 42vh);
          border-radius: 12px;
          overflow: hidden;
          background: #111;
          display: grid;
          place-items: center;
        }
        .viewer img {
          display: block;
          width: 100%;
          height: auto;
          max-height: 70vh;
          object-fit: contain;
          object-position: center;
          opacity: 0;
          transition: opacity .18s ease;
          cursor: zoom-in;
        }
        .viewer img.ready { opacity: 1; }
        .viewer-status {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          padding: 24px;
          text-align: center;
          color: rgba(255,255,255,.72);
          pointer-events: none;
        }
        .viewer-status.hidden { display: none; }
        .stamp {
          position: absolute;
          left: 12px;
          bottom: 12px;
          padding: 6px 9px;
          border-radius: 7px;
          color: #fff;
          background: rgba(0,0,0,.62);
          backdrop-filter: blur(7px);
          font-size: 13px;
          pointer-events: none;
        }
        .timeline-wrap {
          position: relative;
          padding: 14px 16px 17px;
        }
        .timeline {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          overscroll-behavior-x: contain;
          scroll-snap-type: x proximity;
          scrollbar-width: thin;
          padding: 2px 2px 10px;
          outline: none;
        }
        .timeline::-webkit-scrollbar { height: 7px; }
        .timeline::-webkit-scrollbar-thumb {
          border-radius: 8px;
          background: color-mix(in srgb, var(--secondary-text-color) 45%, transparent);
        }
        .shot {
          flex: 0 0 var(--shot-width);
          width: var(--shot-width);
          padding: 0;
          border: 2px solid transparent;
          border-radius: 10px;
          color: var(--primary-text-color);
          background: transparent;
          text-align: left;
          cursor: pointer;
          scroll-snap-align: center;
        }
        .shot.active {
          border-color: var(--primary-color);
          background: color-mix(in srgb, var(--primary-color) 8%, transparent);
        }
        .thumb {
          position: relative;
          aspect-ratio: 16 / 9;
          overflow: hidden;
          border-radius: 7px;
          background: var(--secondary-background-color);
        }
        .thumb img {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
          opacity: 0;
          transition: opacity .15s ease;
        }
        .thumb img.ready { opacity: 1; }
        .thumb::after {
          content: "";
          position: absolute;
          inset: 0;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: inherit;
          pointer-events: none;
        }
        .meta {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 6px;
          padding: 6px 6px 5px;
        }
        .time { font-size: 13px; font-weight: 600; white-space: nowrap; }
        .event {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--secondary-text-color);
          font-size: 11px;
        }
        .dot {
          width: 7px;
          height: 7px;
          margin: 0 auto -14px;
          border: 2px solid var(--ha-card-background, var(--card-background-color));
          border-radius: 50%;
          background: var(--secondary-text-color);
        }
        .shot.active .dot { background: var(--primary-color); }
        .rail-line {
          height: 2px;
          margin: -5px 2px 0;
          background: var(--divider-color);
        }
        .message {
          padding: 34px 20px 42px;
          color: var(--secondary-text-color);
          text-align: center;
        }
        .message.error { color: var(--error-color); }
        .overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: none;
          align-items: center;
          justify-content: center;
          padding: 20px;
          box-sizing: border-box;
          background: rgba(0,0,0,.9);
        }
        .overlay.open { display: flex; }
        .overlay-stage {
          position: absolute;
          inset: max(68px, calc(env(safe-area-inset-top) + 56px)) 0 max(42px, calc(env(safe-area-inset-bottom) + 30px));
          overflow: hidden;
          touch-action: none;
          user-select: none;
          -webkit-user-select: none;
          cursor: grab;
        }
        .overlay-stage:active { cursor: grabbing; }
        .overlay-image {
          width: 100%; height: 100%; display: block;
          object-fit: contain; transform-origin: center;
          pointer-events: none; -webkit-user-drag: none;
        }
        .overlay-toolbar {
          position: absolute;
          top: max(10px, env(safe-area-inset-top));
          left: 14px; right: 14px;
          display: flex; align-items: center; gap: 8px;
        }
        .overlay-caption { flex: 1; min-width: 0; color: #fff; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .overlay button {
          flex: 0 0 auto;
          width: 44px; height: 44px;
          border: 0; border-radius: 50%;
          color: #fff; background: rgba(60,60,60,.85); cursor: pointer;
          display: grid; place-items: center;
        }
        .overlay button:disabled { opacity: .3; cursor: default; }
        .overlay-previous, .overlay-next {
          position: absolute;
          top: calc(50% - 22px);
        }
        .overlay-previous { left: 10px; }
        .overlay-next { right: 10px; }
        .overlay-status { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px 62px; color: #fff; text-align: center; pointer-events: none; }
        .overlay-hint { position: absolute; bottom: max(10px, env(safe-area-inset-bottom)); left: 8px; right: 8px; text-align: center; color: #bbb; font-size: 12px; pointer-events: none; }
        @media (max-width: 600px) {
          .header { align-items: flex-start; }
          .date-controls { width: 100%; }
          .date-input { flex: 1; min-width: 0; }
          .latest-button { display: none; }
          .viewer { margin: 0 10px; border-radius: 9px; }
          .timeline-wrap { padding-left: 10px; padding-right: 10px; }
        }
      
        :host { min-width: 0; }
        [hidden] { display: none !important; }
        ha-card { max-width: 1450px; margin: 0 auto; }
        .tabs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin: 0 16px 14px; }
        .tab { min-height: 48px; display: flex; align-items: center; justify-content: center; gap: 9px; border: 0; border-bottom: 3px solid transparent; border-radius: 9px 9px 0 0; background: var(--secondary-background-color, #f5f5f5); color: var(--secondary-text-color, #666); font: inherit; font-weight: 600; cursor: pointer; }
        .tab[aria-selected="true"] { border-color: var(--primary-color, #03a9f4); color: var(--primary-color, #03a9f4); }
        .badge { padding: 2px 7px; border-radius: 12px; background: var(--divider-color, #ddd); font-size: 12px; color: var(--primary-text-color, #222); }
        .filter-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 0 16px 12px; }
        .camera { font: inherit; border: 1px solid var(--divider-color); border-radius: 9px; color: var(--primary-text-color); background: var(--secondary-background-color); padding: 8px; max-width: 100%; }
        .filter-row label { display: flex; align-items: center; gap: 8px; }
        .scope, .footer { color: var(--secondary-text-color); font-size: 12px; }
        .details { margin: 10px 16px 0; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; justify-content: space-between; }
        .memo { font-size: 13px; overflow-wrap: anywhere; }
        .event-nav { display: flex; align-items: center; gap: 7px; }
        .paging { padding: 0 16px 12px; display: flex; gap: 8px; align-items: center; }
        .footer { padding: 0 16px 14px; }
        .diagnostics { margin: 0 16px 12px; padding: 10px; border-radius: 8px; color: var(--error-color, #c62828); border: 1px solid currentColor; font-size: 13px; overflow-wrap: anywhere; }
        .viewer { height: clamp(220px, 48vh, 680px); min-height: 0; }
        .viewer img { height: 100%; max-height: 100%; }
        .stamp { right: 12px; width: fit-content; max-width: calc(100% - 42px); }
        .meta { flex-direction: column; align-items: flex-start; gap: 2px; }
        .event { max-width: 100%; }
        .thumb img { object-fit: contain; }
        .overlay-image-button { border: 0; padding: 0; background: none; cursor: zoom-in; color: inherit; }
        button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: 2px; }
        @media (max-width: 600px) {
          .tabs { margin: 0 10px 12px; }
          .tab { gap: 4px; font-size: 13px; padding: 4px; flex-wrap: wrap; }
          .tab ha-icon { display: none; }
          .viewer { height: 32vh; min-height: 190px; }
          .latest-button { display: inline-flex; }
          .header { padding: 12px 10px; }
          .date-controls { gap: 3px; }
          .date-input { padding: 0 4px; }
          .filter-row, .paging, .footer { padding-left: 10px; padding-right: 10px; }
          .details { margin-left: 10px; margin-right: 10px; }
        }
</style>
      <ha-card>
        <div class="header">
          <div class="title-wrap"><div class="title"></div><div class="count">Loading alerts…</div></div>
          <div class="date-controls">
            <button class="icon-button previous" aria-label="Previous date with alerts"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
            <input class="date-input" type="date" aria-label="Timeline date">
            <button class="icon-button next" aria-label="Next date with alerts"><ha-icon icon="mdi:chevron-right"></ha-icon></button>
            <button class="latest-button" title="Jump to newest saved alerts">Latest</button>
            <button class="icon-button refresh" aria-label="Refresh"><ha-icon icon="mdi:refresh"></ha-icon></button>
          </div>
        </div>
        <div class="tabs" role="tablist" aria-label="Alert categories">
          <button id="tab-people" class="tab" role="tab" data-category="people" aria-controls="alert-panel"><ha-icon icon="mdi:account"></ha-icon>People <span class="badge">0</span></button>
          <button id="tab-animals" class="tab" role="tab" data-category="animals" aria-controls="alert-panel"><ha-icon icon="mdi:paw"></ha-icon>Animals <span class="badge">0</span></button>
          <button id="tab-cars" class="tab" role="tab" data-category="cars" aria-controls="alert-panel"><ha-icon icon="mdi:car"></ha-icon>Cars <span class="badge">0</span></button>
          <button id="tab-delivery" class="tab" role="tab" data-category="delivery" aria-controls="alert-panel"><ha-icon icon="mdi:truck-delivery"></ha-icon>Delivery <span class="badge">0</span></button>
        </div>
        <div class="filter-row"><label>Camera <select class="camera" aria-label="Camera"><option value="">All cameras</option></select></label><span class="scope">AI-confirmed alerts</span></div>
        <div class="diagnostics" role="status" hidden></div>
        <section id="alert-panel" role="tabpanel">
          <div class="viewer" hidden><img class="main-image" tabindex="0" role="button" aria-label="Enlarge selected snapshot" alt="Selected alert snapshot"><div class="viewer-status">Loading image…</div><div class="stamp" hidden></div></div>
          <div class="details" hidden><span class="memo"></span><div class="event-nav"><button class="icon-button image-previous" aria-label="Previous snapshot"><ha-icon icon="mdi:chevron-left"></ha-icon></button><span class="position"></span><button class="icon-button image-next" aria-label="Next snapshot"><ha-icon icon="mdi:chevron-right"></ha-icon></button></div></div>
          <div class="timeline-wrap" hidden><div class="timeline" tabindex="0" aria-label="Snapshot timeline, oldest to newest"></div><div class="rail-line"></div></div>
          <div class="message" aria-live="polite">Waiting for timeline…</div>
          <div class="paging" hidden><button class="latest-button older">Older alerts</button><button class="latest-button newer">Newer alerts</button><span class="page-info scope"></span></div>
        </section>
        <div class="footer"></div>
      </ha-card>
      <div class="overlay" role="dialog" aria-modal="true" aria-label="Full-size alert snapshot" tabindex="-1">
        <div class="overlay-stage"><img class="overlay-image" draggable="false" alt="Full-size alert snapshot"><div class="overlay-status" role="status" hidden></div></div>
        <div class="overlay-toolbar"><span class="overlay-caption" aria-live="polite"></span><button class="overlay-reset" aria-label="Reset image zoom" title="Reset zoom"><ha-icon icon="mdi:magnify-minus-outline"></ha-icon></button><button class="overlay-close" aria-label="Close full-size image"><ha-icon icon="mdi:close"></ha-icon></button></div>
        <button class="overlay-previous" aria-label="Previous snapshot"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
        <button class="overlay-next" aria-label="Next snapshot"><ha-icon icon="mdi:chevron-right"></ha-icon></button>
        <div class="overlay-hint">Swipe left/right · Pinch to zoom · Drag while zoomed</div>
      </div>`;
    this._els = {};
    for (const name of ["title", "count", "date-input", "previous", "next", "latest-button", "refresh", "camera", "viewer", "main-image", "viewer-status", "stamp", "timeline-wrap", "timeline", "message", "details", "memo", "position", "image-previous", "image-next", "paging", "older", "newer", "page-info", "footer", "diagnostics", "overlay", "overlay-close"]) this._els[name] = this.shadowRoot.querySelector(`.${name}`);
    for (const name of ["overlay-stage", "overlay-image", "overlay-status", "overlay-caption", "overlay-reset", "overlay-previous", "overlay-next"]) this._els[name] = this.shadowRoot.querySelector(`.${name}`);
    this._els.title.textContent = this._config.title;
    this.shadowRoot.querySelectorAll(".tab").forEach((tab, index, tabs) => {
      tab.addEventListener("click", () => this._switchCategory(tab.dataset.category));
      tab.addEventListener("keydown", event => {
        let next;
        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
        if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = tabs.length - 1;
        if (next !== undefined) { event.preventDefault(); tabs[next].focus({preventScroll: true}); tabs[next].click(); }
      });
    });
    this._els["date-input"].onchange = () => { this._selectedDate = this._els["date-input"].value || undefined; this._followLatestDate = !this._selectedDate; this._resetPage(); this._load(); };
    this._els.previous.onclick = () => this._moveDate(-1); this._els.next.onclick = () => this._moveDate(1);
    this._els["latest-button"].onclick = () => { this._selectedDate = undefined; this._followLatestDate = true; this._resetPage(); this._load(); };
    this._els.refresh.onclick = () => this._load(true);
    this._els.camera.onchange = () => { this._camera = this._els.camera.value; this._resetPage(); this._load(); };
    this._els.older.onclick = () => { if (this._payload?.next_before) { this._followLatestDate = false; this._pages.push(this._cursor); this._cursor = this._payload.next_before; this._load(); } };
    this._els.newer.onclick = () => { if (this._pages.length) { this._cursor = this._pages.pop(); this._load(); } };
    this._els["image-previous"].onclick = () => this._selectIndex(this._selectedIndex - 1, true);
    this._els["image-next"].onclick = () => this._selectIndex(this._selectedIndex + 1, true);
    this._els.timeline.onkeydown = event => { if (["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); this._selectIndex(this._selectedIndex + (event.key === "ArrowLeft" ? -1 : 1), true); } };
    this._els["main-image"].onclick = () => this._openOverlay();
    this._els["main-image"].onkeydown = event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); this._openOverlay(); } };
    this._els["overlay-close"].onclick = () => this._closeOverlay();
    this._els["overlay-reset"].onclick = () => this._resetZoom();
    this._els["overlay-previous"].onclick = () => this._navigateOverlay(-1);
    this._els["overlay-next"].onclick = () => this._navigateOverlay(1);
    this._els.overlay.onclick = event => { if (event.target === this._els.overlay) this._closeOverlay(); };
    this._els.overlay.onkeydown = event => this._overlayKeyDown(event);
    const stage = this._els["overlay-stage"];
    stage.addEventListener("pointerdown", event => this._pointerDown(event));
    stage.addEventListener("pointermove", event => this._pointerMove(event));
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) stage.addEventListener(type, event => this._pointerEnd(event));
    stage.addEventListener("wheel", event => this._wheelZoom(event), {passive: false});
    stage.addEventListener("dragstart", event => event.preventDefault());
    this._els["overlay-image"].onload = () => { if (this._els["overlay-image"].getAttribute("src")) { this._overlayReady = true; this._applyZoom(); } };
    if (window.ResizeObserver) {
      this._resizeObserver = new ResizeObserver(() => this._applyZoom());
      this._resizeObserver.observe(stage);
    }
    this._syncTabs();
  }
  _switchCategory(category) { if (category !== this._category) { this._category = category; this._resetPage(); this._syncTabs(); this._load(); } }
  _syncTabs() {
    this.shadowRoot.querySelectorAll(".tab").forEach(tab => {
      const active = tab.dataset.category === this._category;
      tab.setAttribute("aria-selected", String(active)); tab.tabIndex = active ? 0 : -1;
      tab.querySelector(".badge").textContent = this._payload?.counts?.[tab.dataset.category] ?? 0;
    });
    this.shadowRoot.querySelector("#alert-panel").setAttribute("aria-labelledby", `tab-${this._category}`);
  }
  async _load(preserve = false, navigation = null) {
    if (!this._hass || !this._els || !this.isConnected) return false;
    const generation = ++this._loadGeneration;
    const followingNewest = this._followLatestDate && !this._cursor && this._selectedIndex === (this._payload?.images.length || 0) - 1;
    const oldId = preserve && !followingNewest ? this._payload?.images[this._selectedIndex]?.id : null;
    const query = new URLSearchParams({category: this._category, limit: String(Math.trunc(this._config.page_size))});
    if (this._selectedDate && !this._followLatestDate) query.set("date", this._selectedDate);
    if (this._camera) query.set("camera", this._camera);
    if (this._cursor) query.set("before", this._cursor);
    this._loading = true;
    for (const key of ["refresh", "older", "newer"]) this._els[key].disabled = true;
    if (!preserve && !navigation?.keepOverlay) this._clearView("Loading alerts…");
    try {
      const payload = await this._hass.callApi("GET", `blue_iris_timeline?${query}`);
      if (generation !== this._loadGeneration || !this.isConnected) return false;
      // A refresh already in flight must not interrupt a newly opened full-screen view.
      if (!navigation?.keepOverlay && this._els.overlay.classList.contains("open")) return false;
      this._payload = payload; this._selectedDate = payload.selected_date || this._selectedDate; this._syncControls();
      const key = JSON.stringify([this._category, this._camera, this._selectedDate, this._cursor, payload.images.map(x => x.id)]);
      if (key !== this._lastListKey || !preserve) { this._lastListKey = key; await this._renderTimeline(oldId, navigation); }
      return generation === this._loadGeneration;
    } catch (error) {
      if (generation !== this._loadGeneration) return false;
      this._lastListKey = null;
      const detail = error?.message || error?.body || `HTTP ${error?.status_code || error?.status || "request failed"}`;
      this._clearView(`Could not load alerts. ${detail}. Check blue_iris_timeline in configuration.yaml and restart HA after copying the integration.`, true);
      this._els.count.textContent = "Timeline unavailable";
      return false;
    } finally {
      if (generation === this._loadGeneration) { this._loading = false; this._els.refresh.disabled = false; this._els.older.disabled = !this._payload?.has_more; this._els.newer.disabled = !this._pages.length; }
    }
  }
  _syncControls() {
    this._syncTabs();
    const p = this._payload, dates = p.dates.map(d => d.date), current = this._selectedDate || "";
    this._els["date-input"].value = current; this._els["date-input"].min = dates[0] || ""; this._els["date-input"].max = dates[dates.length - 1] || "";
    this._els.previous.disabled = !dates.some(d => d < current); this._els.next.disabled = !dates.some(d => d > current);
    this._els.count.textContent = `${p.counts[this._category]} ${this._category} alert${p.counts[this._category] === 1 ? "" : "s"} · ${this._formatDate(current)}`;
    const cameraKey = JSON.stringify(p.cameras);
    if (this._cameraKey !== cameraKey) { this._cameraKey = cameraKey; this._els.camera.replaceChildren(new Option("All cameras", ""), ...p.cameras.map(c => new Option(c.name, c.id))); }
    this._els.camera.value = this._camera; this._els.paging.hidden = !(p.has_more || this._pages.length);
    this._els["page-info"].textContent = `Page ${this._pages.length + 1} · ${p.images.length} shown`;
    this._els.footer.textContent = `${p.total_count.toLocaleString()} saved alerts · ${(p.storage_bytes / 1048576).toFixed(1)} MB · ${p.retention_days}-day history · ${p.max_storage_mb} MB image limit`;
    const error = p.status?.queue_error || p.status?.last_error;
    this._els.diagnostics.hidden = !error; this._els.diagnostics.textContent = error ? `Receiver: ${error}` : "";
  }
  _moveDate(direction) {
    const dates = this._payload?.dates.map(d => d.date) || [], current = this._selectedDate || "";
    const choices = dates.filter(d => direction < 0 ? d < current : d > current);
    const target = direction < 0 ? choices[choices.length - 1] : choices[0];
    if (target) { this._selectedDate = target; this._followLatestDate = false; this._resetPage(); this._load(); }
  }
  _clearView(message, error = false) {
    this._closeOverlay(false);
    for (const key of ["viewer", "timeline-wrap", "details", "paging"]) this._els[key].hidden = true;
    this._els.message.hidden = false; this._els.message.textContent = message; this._els.message.classList.toggle("error", error);
  }
  _renderTimeline(previousId, navigation = null) {
    if (!navigation?.keepOverlay) this._closeOverlay(false);
    else this._prepareOverlayImage();
    this._observer?.disconnect(); this._releaseBlobs(); this._els.timeline.replaceChildren();
    const images = this._payload.images;
    if (!images.length) {
      this._selectedIndex = -1;
      const msg = this._payload.total_count ? `No ${this._category} alerts for ${this._formatDate(this._selectedDate)}${this._camera ? " on this camera" : ""}.` : "No alerts saved yet. The timeline fills when Blue Iris publishes a new AI-confirmed alert. Setup instructions are in README.md.";
      this._clearView(msg); return;
    }
    for (const key of ["viewer", "timeline-wrap", "details"]) this._els[key].hidden = false;
    this._els.message.hidden = true; this._els.paging.hidden = !(this._payload.has_more || this._pages.length);
    if (window.IntersectionObserver) this._observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { this._observer.unobserve(entry.target); this._loadThumbnail(entry.target, images[Number(entry.target.dataset.index)]); }
    }, {root: this._els.timeline, rootMargin: "250px"});
    images.forEach((item, index) => {
      const button = document.createElement("button"); button.className = "shot"; button.type = "button"; button.style.setProperty("--shot-width", `${this._config.thumbnail_width}px`);
      button.setAttribute("aria-label", `${item.camera_name}, ${this._formatTime(item.time)}, ${item.memo}`);
      const thumb = document.createElement("div"); thumb.className = "thumb";
      const img = document.createElement("img"); img.loading = "lazy"; img.alt = `${item.camera_name} alert`; img.dataset.index = index; thumb.append(img);
      const meta = document.createElement("div"); meta.className = "meta";
      const time = document.createElement("span"); time.className = "time"; time.textContent = this._formatTime(item.time);
      const name = document.createElement("span"); name.className = "event"; name.textContent = item.camera_name;
      const label = document.createElement("span"); label.className = "event"; label.textContent = item.memo; label.title = item.memo; meta.append(time, name, label);
      const dot = document.createElement("div"); dot.className = "dot"; button.append(thumb, meta, dot);
      button.onclick = () => this._selectIndex(index); this._els.timeline.append(button);
      if (this._observer) this._observer.observe(img); else this._loadThumbnail(img, item);
    });
    const preserved = previousId ? images.findIndex(i => i.id === previousId) : -1;
    return this._selectIndex(preserved >= 0 ? preserved : navigation?.select === "first" ? 0 : images.length - 1, true);
  }
  async _loadThumbnail(img, item) {
    try { const url = await this._loadBlob(item, true); if (img.isConnected) { img.src = url; img.classList.add("ready"); } }
    catch (_) { if (img.isConnected) img.alt = "Snapshot unavailable"; }
  }
  async _selectIndex(index, scroll = false) {
    const images = this._payload?.images || []; if (index < 0 || index >= images.length) return;
    const selection = ++this._selectionGeneration;
    this._selectedIndex = index;
    const item = images[index], generation = this._mediaGeneration;
    this._els.timeline.querySelectorAll(".shot").forEach((button, i) => {
      button.classList.toggle("active", i === index); button.setAttribute("aria-pressed", String(i === index));
      if (scroll && i === index) {
        // Scroll only the thumbnail container; never move the Home Assistant page.
        const rail = this._els.timeline;
        rail.scrollTo({left: Math.max(0, button.getBoundingClientRect().left - rail.getBoundingClientRect().left + rail.scrollLeft - (rail.clientWidth - button.clientWidth) / 2), behavior: "auto"});
      }
    });
    this._els["image-previous"].disabled = index === 0; this._els["image-next"].disabled = index === images.length - 1;
    this._els.position.textContent = `${index + 1} / ${images.length}`; this._els.memo.textContent = item.memo;
    this._els.stamp.hidden = false; this._els.stamp.textContent = `${item.camera_name} · ${this._formatDate(item.date)} · ${this._formatTime(item.time)}`;
    const img = this._els["main-image"], status = this._els["viewer-status"];
    img.classList.remove("ready"); img.removeAttribute("src"); status.textContent = "Loading image…"; status.classList.remove("hidden");
    if (this._els.overlay.classList.contains("open")) this._prepareOverlayImage();
    try {
      const url = await this._loadBlob(item, false);
      if (generation !== this._mediaGeneration || selection !== this._selectionGeneration || this._payload?.images[this._selectedIndex]?.id !== item.id) {
        const staleKey = `full:${item.id}`;
        if (this._payload?.images[this._selectedIndex]?.id !== item.id && this._blobUrls.get(staleKey) === url) { URL.revokeObjectURL(url); this._blobUrls.delete(staleKey); }
        return;
      }
      img.src = url; img.alt = `${item.camera_name}: ${item.memo}`; img.classList.add("ready"); status.classList.add("hidden");
      if (this._els.overlay.classList.contains("open")) this._showOverlayImage();
      for (const [key, blob] of this._blobUrls) if (key.startsWith("full:") && key !== `full:${item.id}`) { URL.revokeObjectURL(blob); this._blobUrls.delete(key); }
    } catch (error) {
      if (generation === this._mediaGeneration && selection === this._selectionGeneration) {
        status.textContent = `Image unavailable: ${error.message || error}`;
        if (this._els.overlay.classList.contains("open")) { this._els["overlay-status"].textContent = status.textContent; this._els["overlay-status"].hidden = false; }
      }
    }
  }
  async _loadBlob(item, small) {
    const key = `${small ? "thumb" : "full"}:${item.id}`;
    if (this._blobUrls.has(key)) return this._blobUrls.get(key);
    if (this._blobPromises.has(key)) return this._blobPromises.get(key);
    const generation = this._mediaGeneration;
    const promise = (async () => {
      const path = (small ? item.thumbnail_url : item.url).replace(/^\/api\//, "");
      const response = typeof this._hass.callApiRaw === "function" ? await this._hass.callApiRaw("GET", path) : await this._hass.fetchWithAuth(`/api/${path}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (generation !== this._mediaGeneration || !this.isConnected) throw new Error("View changed");
      const url = URL.createObjectURL(blob); this._blobUrls.set(key, url); return url;
    })();
    this._blobPromises.set(key, promise);
    try { return await promise; } finally { if (this._blobPromises.get(key) === promise) this._blobPromises.delete(key); }
  }
  _releaseBlobs() { ++this._mediaGeneration; for (const url of this._blobUrls.values()) URL.revokeObjectURL(url); this._blobUrls.clear(); this._blobPromises.clear(); }
  _openOverlay() {
    if (this._selectedIndex < 0 || !this._els["main-image"].classList.contains("ready")) return;
    this._els.overlay.classList.add("open"); this._showOverlayImage(); this._els["overlay-close"].focus({preventScroll: true});
  }
  _closeOverlay(focus = true) {
    if (!this._els?.overlay) return;
    const open = this._els.overlay.classList.contains("open"); this._els.overlay.classList.remove("open");
    this._els["overlay-image"].removeAttribute("src"); this._overlayReady = false; this._clearPointers();
    if (open && focus) this._els["main-image"].focus({preventScroll: true});
  }
  _prepareOverlayImage() {
    this._els["overlay-image"].removeAttribute("src"); this._overlayReady = false; this._resetZoom();
    this._els["overlay-status"].textContent = "Loading image…"; this._els["overlay-status"].hidden = false;
    this._syncOverlay();
  }
  _showOverlayImage() {
    this._resetZoom();
    const img = this._els["overlay-image"], main = this._els["main-image"];
    img.src = main.src; img.alt = main.alt; this._els["overlay-status"].hidden = true;
    this._overlayReady = img.complete && img.naturalWidth > 0;
    this._syncOverlay(); this._applyZoom();
  }
  _syncOverlay() {
    if (!this._els?.["overlay-caption"]) return;
    const images = this._payload?.images || [], item = images[this._selectedIndex];
    this._els["overlay-caption"].textContent = item ? `${item.camera_name} · ${this._formatDate(item.date)} · ${this._formatTime(item.time)} · ${this._selectedIndex + 1}/${images.length}${this._pages.length ? ` (page ${this._pages.length + 1})` : ""}` : "";
    this._els["overlay-previous"].disabled = this._overlayBusy || !images.length || (this._selectedIndex <= 0 && !this._payload?.has_more);
    this._els["overlay-next"].disabled = this._overlayBusy || !images.length || (this._selectedIndex >= images.length - 1 && !this._pages.length);
    this._els["overlay-reset"].disabled = this._overlayBusy || this._zoom.scale <= 1;
    this._els["overlay-reset"].title = `Reset zoom (${Math.round(this._zoom.scale * 100)}%)`;
  }
  async _navigateOverlay(direction) {
    if (!this._els.overlay.classList.contains("open") || this._overlayBusy || this._loading) return;
    const images = this._payload?.images || [], next = this._selectedIndex + direction;
    if (!images.length || (next < 0 && !this._payload.has_more) || (next >= images.length && !this._pages.length)) return;
    this._overlayBusy = true; this._syncOverlay();
    try {
      if (next >= 0 && next < images.length) await this._selectIndex(next, true);
      else {
        const saved = {cursor: this._cursor, pages: [...this._pages], follow: this._followLatestDate};
        this._followLatestDate = false;
        if (direction < 0) { this._pages.push(this._cursor); this._cursor = this._payload.next_before; }
        else this._cursor = this._pages.pop();
        this._prepareOverlayImage();
        if (!await this._load(false, {keepOverlay: true, select: direction < 0 ? "last" : "first"})) {
          this._cursor = saved.cursor; this._pages = saved.pages; this._followLatestDate = saved.follow;
        }
      }
    } finally { this._overlayBusy = false; this._syncOverlay(); }
  }
  _overlayKeyDown(event) {
    if (event.key === "Escape") { event.preventDefault(); this._closeOverlay(); }
    else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault(); this._navigateOverlay(event.key === "ArrowLeft" ? -1 : 1);
    } else if (event.key === "0") { event.preventDefault(); this._resetZoom(); }
    else if (event.key === "Tab") {
      const buttons = [...this._els.overlay.querySelectorAll("button:not([disabled])")];
      if (!buttons.length) return;
      event.preventDefault();
      const index = buttons.indexOf(this.shadowRoot.activeElement);
      buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus({preventScroll: true});
    }
  }
  _clearPointers() {
    const ids = [...this._pointers.keys()]; this._pointers.clear(); this._gesture = null; this._hadPinch = false;
    const stage = this._els?.["overlay-stage"];
    for (const id of ids) { try { if (stage?.hasPointerCapture(id)) stage.releasePointerCapture(id); } catch (_) {} }
  }
  _resetZoom() { this._clearPointers(); this._zoom = {scale: 1, x: 0, y: 0}; this._applyZoom(); }
  _applyZoom() {
    const stage = this._els?.["overlay-stage"], img = this._els?.["overlay-image"];
    if (!stage || !img) return;
    const width = stage.clientWidth, height = stage.clientHeight;
    if (!width || !height) return; // ResizeObserver also fires when the viewer is hidden.
    const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : width / (height || 1);
    const fittedWidth = Math.min(width, height * ratio), fittedHeight = Math.min(height, width / ratio);
    this._zoom.scale = Math.max(1, Math.min(8, this._zoom.scale));
    if (this._zoom.scale < 1.01) this._zoom.scale = 1;
    const boundX = Math.max(0, (fittedWidth * this._zoom.scale - width) / 2), boundY = Math.max(0, (fittedHeight * this._zoom.scale - height) / 2);
    this._zoom.x = Math.max(-boundX, Math.min(boundX, this._zoom.x));
    this._zoom.y = Math.max(-boundY, Math.min(boundY, this._zoom.y));
    img.style.transform = `translate(${this._zoom.x}px, ${this._zoom.y}px) scale(${this._zoom.scale})`;
    this._syncOverlay();
  }
  _stagePoint(x, y) {
    const rect = this._els["overlay-stage"].getBoundingClientRect();
    return {x: x - rect.left - rect.width / 2, y: y - rect.top - rect.height / 2};
  }
  _beginGesture() {
    const points = [...this._pointers.values()], first = points[0];
    if (!first) { this._gesture = null; return; }
    if (points.length >= 2) {
      this._hadPinch = true;
      const second = points[1], center = this._stagePoint((first.x + second.x) / 2, (first.y + second.y) / 2);
      this._gesture = {mode: "pinch", distance: Math.max(1, Math.hypot(first.x - second.x, first.y - second.y)),
        scale: this._zoom.scale, anchorX: (center.x - this._zoom.x) / this._zoom.scale, anchorY: (center.y - this._zoom.y) / this._zoom.scale};
    } else this._gesture = {mode: this._zoom.scale > 1 || this._hadPinch ? "pan" : "swipe",
      x: first.x, y: first.y, zoomX: this._zoom.x, zoomY: this._zoom.y, time: performance.now()};
  }
  _pointerDown(event) {
    if (!this._els.overlay.classList.contains("open") || !this._overlayReady || this._overlayBusy || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    if (!this._pointers.size) this._hadPinch = false;
    this._pointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
    try { this._els["overlay-stage"].setPointerCapture(event.pointerId); } catch (_) {}
    this._beginGesture();
  }
  _pointerMove(event) {
    if (!this._pointers.has(event.pointerId)) return;
    event.preventDefault(); this._pointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
    const points = [...this._pointers.values()], gesture = this._gesture;
    if (gesture?.mode === "pinch" && points.length >= 2) {
      const [a, b] = points, center = this._stagePoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      const scale = Math.max(1, Math.min(8, gesture.scale * Math.hypot(a.x - b.x, a.y - b.y) / gesture.distance));
      this._zoom = {scale, x: center.x - gesture.anchorX * scale, y: center.y - gesture.anchorY * scale};
      this._applyZoom();
    } else if (gesture?.mode === "pan") {
      this._zoom.x = gesture.zoomX + points[0].x - gesture.x; this._zoom.y = gesture.zoomY + points[0].y - gesture.y; this._applyZoom();
    }
  }
  _pointerEnd(event) {
    if (!this._pointers.has(event.pointerId)) return;
    if (event.type === "pointerup") this._pointerMove(event);
    const point = this._pointers.get(event.pointerId), gesture = this._gesture;
    const dx = (event.type === "pointerup" ? event.clientX : point.x) - (gesture?.x ?? point.x);
    const dy = (event.type === "pointerup" ? event.clientY : point.y) - (gesture?.y ?? point.y);
    const swipe = event.type === "pointerup" && this._pointers.size === 1 && !this._hadPinch && gesture?.mode === "swipe" &&
      performance.now() - gesture.time < 1200 && Math.abs(dx) >= Math.max(48, Math.min(100, this._els["overlay-stage"].clientWidth * .12)) && Math.abs(dx) > Math.abs(dy) * 1.3;
    if (event.type !== "pointerup") this._hadPinch = true; // A canceled touch must never turn into a swipe.
    this._pointers.delete(event.pointerId);
    if (this._pointers.size) this._beginGesture(); else this._clearPointers();
    if (swipe) this._navigateOverlay(dx < 0 ? 1 : -1);
  }
  _wheelZoom(event) {
    if (!this._overlayReady || this._overlayBusy || !this._els.overlay.classList.contains("open") || this._pointers.size) return;
    event.preventDefault();
    const center = this._stagePoint(event.clientX, event.clientY), old = this._zoom;
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this._els["overlay-stage"].clientHeight : 1);
    const scale = Math.max(1, Math.min(8, old.scale * Math.exp(-delta * .002)));
    this._zoom = {scale, x: center.x - (center.x - old.x) / old.scale * scale, y: center.y - (center.y - old.y) / old.scale * scale};
    this._applyZoom();
  }
  _formatDate(value) { if (!value) return "No saved dates"; return new Intl.DateTimeFormat(this._hass?.locale?.language || undefined, {weekday: "short", month: "short", day: "numeric", year: "numeric"}).format(new Date(`${value}T12:00:00`)); }
  _formatTime(value) { if (!value) return ""; return new Intl.DateTimeFormat(this._hass?.locale?.language || undefined, {hour: "numeric", minute: "2-digit", second: "2-digit"}).format(new Date(`2000-01-01T${value}`)); }
}
if (!customElements.get("blue-iris-timeline")) customElements.define("blue-iris-timeline", BlueIrisTimelineCard);
// Manual YAML registration matches Front Door Timeline v1.0.4.
