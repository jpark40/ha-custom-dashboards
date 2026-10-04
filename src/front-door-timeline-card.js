const CARD_VERSION = "__PACKAGE_VERSION__";

class FrontDoorTimelineCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = undefined;
    this._config = undefined;
    this._payload = undefined;
    this._selectedDate = undefined;
    this._selectedIndex = -1;
    this._category = "all";
    this._images = [];
    this._blobUrls = new Map();
    this._blobPromises = new Map();
    this._loadGeneration = 0;
    this._rendered = false;
    this._timer = undefined;
    this._observer = undefined;
  }

  static getStubConfig() {
    return {
      title: "Front Door",
      refresh_seconds: 30,
      thumbnail_width: 170,
    };
  }

  setConfig(config) {
    if (!config) throw new Error("Card configuration is required");

    this._config = {
      title: config.title || "Front Door",
      api_path: (config.api_path || "front_door_timeline").replace(/^\/+/, ""),
      refresh_seconds: Math.max(0, Number(config.refresh_seconds ?? 30)),
      thumbnail_width: Math.max(120, Number(config.thumbnail_width ?? 170)),
      show_event_labels: config.show_event_labels !== false,
    };
    this._category = ["all", "person", "package"].includes(config.initial_category)
      ? config.initial_category : "all";

    if (this.isConnected) {
      this._renderShell();
      this._startTimer();
      if (this._hass) this._load(this._selectedDate);
    }
  }

  set hass(hass) {
    const firstHass = !this._hass;
    this._hass = hass;
    if (firstHass && this.isConnected && this._config) this._load();
  }

  connectedCallback() {
    if (!this._config) return;
    if (!this._rendered) this._renderShell();
    this._startTimer();
    if (this._hass && !this._payload) this._load();
  }

  disconnectedCallback() {
    if (this._timer) window.clearInterval(this._timer);
    this._timer = undefined;
    if (this._observer) this._observer.disconnect();
    this._observer = undefined;
    this._releaseBlobs();
  }

  getCardSize() {
    return 7;
  }

  _renderShell() {
    this._rendered = true;
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
          height: clamp(220px, 48vh, 680px);
          min-height: 0;
          border-radius: 12px;
          overflow: hidden;
          background: #111;
          display: grid;
          place-items: center;
        }
        .viewer img {
          display: block;
          width: 100%;
          height: 100%;
          max-height: 100%;
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
        .overlay img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }
        .overlay-close {
          position: absolute;
          top: max(14px, env(safe-area-inset-top));
          right: 14px;
          width: 44px;
          height: 44px;
          border: 0;
          border-radius: 50%;
          color: #fff;
          background: rgba(60,60,60,.8);
          cursor: pointer;
        }
        @media (max-width: 600px) {
          .header { align-items: flex-start; }
          .date-controls { width: 100%; }
          .date-input { flex: 1; min-width: 0; }
          .latest-button { display: none; }
          .viewer { margin: 0 10px; border-radius: 9px; height: 32vh; min-height: 190px; }
          .timeline-wrap { padding-left: 10px; padding-right: 10px; }
        }
        [hidden] { display: none !important; }
        .thumb img { object-fit: contain; }
        .tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin: 0 16px 14px; }
        .tab { min-height: 48px; border: 0; border-bottom: 3px solid transparent; border-radius: 9px 9px 0 0; background: var(--secondary-background-color); color: var(--secondary-text-color); font: inherit; font-weight: 600; cursor: pointer; }
        .tab[aria-selected="true"] { border-color: var(--primary-color); color: var(--primary-color); }
        button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
      </style>
      <ha-card>
        <div class="header">
          <div class="title-wrap">
            <div class="title"></div>
            <div class="count">Loading…</div>
          </div>
          <div class="date-controls">
            <button class="icon-button previous" aria-label="Previous date" title="Previous date"><ha-icon icon="mdi:chevron-left"></ha-icon></button>
            <input class="date-input" type="date" aria-label="Timeline date">
            <button class="icon-button next" aria-label="Next date" title="Next date"><ha-icon icon="mdi:chevron-right"></ha-icon></button>
            <button class="latest-button" title="Jump to latest date">Latest</button>
            <button class="icon-button refresh" aria-label="Refresh" title="Refresh"><ha-icon icon="mdi:refresh"></ha-icon></button>
          </div>
        </div>
        <div class="tabs" role="tablist" aria-label="Front door event categories">
          <button class="tab" role="tab" data-category="all">All</button>
          <button class="tab" role="tab" data-category="person">Person</button>
          <button class="tab" role="tab" data-category="package">Package</button>
        </div>
        <div class="viewer">
          <img class="main-image" alt="Selected front door snapshot">
          <div class="viewer-status">Loading snapshots…</div>
          <div class="stamp" hidden></div>
        </div>
        <div class="timeline-wrap">
          <div class="timeline" tabindex="0" aria-label="Snapshot timeline"></div>
          <div class="rail-line"></div>
        </div>
        <div class="message" hidden></div>
      </ha-card>
      <div class="overlay" role="dialog" aria-modal="true" aria-label="Full-size front door snapshot">
        <img alt="Full-size front door snapshot">
        <button class="overlay-close" aria-label="Close"><ha-icon icon="mdi:close"></ha-icon></button>
      </div>
    `;

    this._els = {
      title: this.shadowRoot.querySelector(".title"),
      count: this.shadowRoot.querySelector(".count"),
      date: this.shadowRoot.querySelector(".date-input"),
      previous: this.shadowRoot.querySelector(".previous"),
      next: this.shadowRoot.querySelector(".next"),
      latest: this.shadowRoot.querySelector(".latest-button"),
      refresh: this.shadowRoot.querySelector(".refresh"),
      viewer: this.shadowRoot.querySelector(".viewer"),
      mainImage: this.shadowRoot.querySelector(".main-image"),
      viewerStatus: this.shadowRoot.querySelector(".viewer-status"),
      stamp: this.shadowRoot.querySelector(".stamp"),
      timelineWrap: this.shadowRoot.querySelector(".timeline-wrap"),
      timeline: this.shadowRoot.querySelector(".timeline"),
      railLine: this.shadowRoot.querySelector(".rail-line"),
      message: this.shadowRoot.querySelector(".message"),
      overlay: this.shadowRoot.querySelector(".overlay"),
      overlayImage: this.shadowRoot.querySelector(".overlay img"),
      overlayClose: this.shadowRoot.querySelector(".overlay-close"),
    };

    this._els.title.textContent = this._config.title;
    this.shadowRoot.querySelectorAll(".tab").forEach((tab, index, tabs) => {
      tab.addEventListener("click", () => {
        const previousId = this._images[this._selectedIndex]?.id;
        this._category = tab.dataset.category;
        this._closeOverlay();
        this._renderTimeline(previousId);
      });
      tab.addEventListener("keydown", (event) => {
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
          : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
          : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : undefined;
        if (next !== undefined) { event.preventDefault(); tabs[next].focus(); tabs[next].click(); }
      });
    });
    this._els.date.addEventListener("change", () => {
      this._load(this._els.date.value || undefined);
    });
    this._els.previous.addEventListener("click", () => this._moveDate(-1));
    this._els.next.addEventListener("click", () => this._moveDate(1));
    this._els.latest.addEventListener("click", () => {
      if (this._payload?.latest_date) this._load(this._payload.latest_date);
    });
    this._els.refresh.addEventListener("click", () => this._load(this._selectedDate, true));
    this._els.timeline.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        this._selectIndex(Math.max(0, this._selectedIndex - 1), true);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        this._selectIndex(
          Math.min((this._images.length || 1) - 1, this._selectedIndex + 1),
          true
        );
      }
    });
    this._els.mainImage.addEventListener("click", () => this._openOverlay());
    this._els.overlayClose.addEventListener("click", () => this._closeOverlay());
    this._els.overlay.addEventListener("click", (event) => {
      if (event.target === this._els.overlay) this._closeOverlay();
    });
  }

  _startTimer() {
    if (this._timer) window.clearInterval(this._timer);
    this._timer = undefined;
    if (!this._config?.refresh_seconds) return;
    this._timer = window.setInterval(
      () => this._load(this._selectedDate, true),
      this._config.refresh_seconds * 1000
    );
  }

  async _load(date, preserveSelection = false) {
    if (!this._hass || !this._config || !this._els) return;
    const generation = ++this._loadGeneration;
    const previousId = preserveSelection
      ? this._images[this._selectedIndex]?.id
      : undefined;

    this._els.refresh.disabled = true;
    this._setMessage();

    try {
      const query = date ? `?date=${encodeURIComponent(date)}` : "";
      const payload = await this._hass.callApi(
        "GET",
        `${this._config.api_path}${query}`
      );
      if (generation !== this._loadGeneration) return;

      const dateChanged = this._selectedDate !== payload.selected_date;
      if (dateChanged) this._releaseBlobs();
      this._payload = payload;
      this._selectedDate = payload.selected_date || date;

      this._syncDateControls();
      this._renderTimeline(previousId);
    } catch (error) {
      if (generation !== this._loadGeneration) return;
      const detail = error?.message || String(error);
      this._showError(`Could not load the timeline. ${detail}`);
    } finally {
      if (generation === this._loadGeneration) this._els.refresh.disabled = false;
    }
  }

  _syncDateControls() {
    const dates = this._payload?.dates?.map((item) => item.date) || [];
    const current = this._selectedDate || "";
    this._els.date.value = current;
    this._els.date.min = dates[0] || "";
    this._els.date.max = dates[dates.length - 1] || "";
    this._els.date.disabled = dates.length === 0;
    this._els.latest.disabled = dates.length === 0 || current === this._payload.latest_date;

    this._els.previous.disabled = !dates.some((item) => item < current);
    this._els.next.disabled = !dates.some((item) => item > current);
  }

  _moveDate(direction) {
    const dates = this._payload?.dates?.map((item) => item.date) || [];
    const current = this._selectedDate || "";
    const candidates = dates.filter((item) =>
      direction < 0 ? item < current : item > current
    );
    const target = direction < 0 ? candidates.at(-1) : candidates[0];
    if (target) this._load(target);
  }

  _renderTimeline(previousId) {
    if (this._observer) this._observer.disconnect();
    this._observer = undefined;
    this._els.timeline.replaceChildren();

    const images = this._images = this._filterImages(this._payload?.images || []);
    this.shadowRoot.querySelectorAll(".tab").forEach((tab) => {
      const active = tab.dataset.category === this._category;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    const dateLabel = this._formatDate(this._selectedDate);
    this._els.count.textContent = `${images.length} snapshot${images.length === 1 ? "" : "s"} · ${dateLabel}`;

    if (!images.length) {
      this._selectedIndex = -1;
      this._els.viewer.hidden = true;
      this._els.timelineWrap.hidden = true;
      this._setMessage(`No ${this._category === "all" ? "" : this._category + " "}snapshots saved for ${dateLabel}.`);
      return;
    }

    this._els.viewer.hidden = false;
    this._els.timelineWrap.hidden = false;
    this._setMessage();

    this._observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          this._observer.unobserve(entry.target);
          const index = Number(entry.target.dataset.index);
          this._loadThumbnail(entry.target, images[index]);
        }
      },
      { root: this._els.timeline, rootMargin: "450px" }
    );

    images.forEach((item, index) => {
      const button = document.createElement("button");
      button.className = "shot";
      button.type = "button";
      button.style.setProperty("--shot-width", `${this._config.thumbnail_width}px`);
      button.dataset.index = String(index);
      button.setAttribute("aria-label", `${this._formatTime(item.time)} ${item.label}`);

      const thumb = document.createElement("div");
      thumb.className = "thumb";
      const img = document.createElement("img");
      img.alt = `${this._config.title} at ${this._formatTime(item.time)}`;
      img.loading = "lazy";
      img.dataset.index = String(index);
      thumb.append(img);

      const meta = document.createElement("div");
      meta.className = "meta";
      const time = document.createElement("span");
      time.className = "time";
      time.textContent = this._formatTime(item.time);
      meta.append(time);
      if (this._config.show_event_labels) {
        const event = document.createElement("span");
        event.className = "event";
        event.textContent = item.label;
        meta.append(event);
      }

      const dot = document.createElement("div");
      dot.className = "dot";
      button.append(thumb, meta, dot);
      button.addEventListener("click", () => this._selectIndex(index));
      this._els.timeline.append(button);
      this._observer.observe(img);
    });

    let index = images.length - 1;
    if (previousId) {
      const preserved = images.findIndex((item) => item.id === previousId);
      if (preserved >= 0) index = preserved;
    }
    this._selectIndex(index, true);

    if (!previousId) {
      requestAnimationFrame(() => {
        this._els.timeline.scrollLeft = this._els.timeline.scrollWidth;
      });
    }
  }

  async _loadThumbnail(img, item) {
    try {
      const url = await this._loadBlob(item);
      if (!img.isConnected) return;
      img.src = url;
      img.classList.add("ready");
    } catch (_error) {
      if (img.isConnected) img.alt = "Snapshot could not be loaded";
    }
  }

  async _selectIndex(index, scrollIntoView = false) {
    const images = this._images;
    if (index < 0 || index >= images.length) return;
    this._selectedIndex = index;

    const buttons = this._els.timeline.querySelectorAll(".shot");
    buttons.forEach((button, buttonIndex) => {
      const active = buttonIndex === index;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (scrollIntoView) {
      const button = buttons[index];
      if (button) {
        const left =
          button.offsetLeft -
          (this._els.timeline.clientWidth - button.clientWidth) / 2;
        this._els.timeline.scrollTo({
          left: Math.max(0, left),
          behavior: "smooth",
        });
      }
    }

    const item = images[index];
    this._els.mainImage.classList.remove("ready");
    this._els.viewerStatus.textContent = "Loading image…";
    this._els.viewerStatus.classList.remove("hidden");
    this._els.stamp.hidden = false;
    this._els.stamp.textContent = `${this._formatDate(item.date)} · ${this._formatTime(item.time)} · ${item.label}`;

    try {
      const url = await this._loadBlob(item);
      if (this._images[this._selectedIndex]?.id !== item.id) return;
      this._els.mainImage.src = url;
      this._els.mainImage.classList.add("ready");
      this._els.viewerStatus.classList.add("hidden");
    } catch (error) {
      if (this._images[this._selectedIndex]?.id !== item.id) return;
      this._els.viewerStatus.textContent = `Image could not be loaded: ${error?.message || error}`;
    }
  }

  _filterImages(images) {
    if (this._category === "all") return images;
    return images.filter((item) => {
      const label = String(item.label || "").toLowerCase().replace(/[_-]/g, " ");
      return this._category === "person"
        ? /^(person|stranger)( |$)/.test(label)
        : /^package( |$)/.test(label);
    });
  }

  async _loadBlob(item) {
    if (this._blobUrls.has(item.id)) return this._blobUrls.get(item.id);
    if (this._blobPromises.has(item.id)) return this._blobPromises.get(item.id);

    const promise = (async () => {
      const apiPath = item.url.replace(/^\/api\//, "");
      const response = await this._hass.callApiRaw("GET", apiPath);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      this._blobUrls.set(item.id, objectUrl);
      return objectUrl;
    })();

    this._blobPromises.set(item.id, promise);
    try {
      return await promise;
    } finally {
      this._blobPromises.delete(item.id);
    }
  }

  _releaseBlobs() {
    for (const url of this._blobUrls.values()) URL.revokeObjectURL(url);
    this._blobUrls.clear();
    this._blobPromises.clear();
  }

  _openOverlay() {
    if (this._selectedIndex < 0 || !this._els.mainImage.src) return;
    this._els.overlayImage.src = this._els.mainImage.src;
    this._els.overlay.classList.add("open");
    this._els.overlayClose.focus({ preventScroll: true });
  }

  _closeOverlay() {
    this._els.overlay.classList.remove("open");
    this._els.overlayImage.removeAttribute("src");
  }

  _setMessage(text, error = false) {
    if (!text) {
      this._els.message.hidden = true;
      this._els.message.textContent = "";
      this._els.message.classList.remove("error");
      return;
    }
    this._els.message.hidden = false;
    this._els.message.textContent = text;
    this._els.message.classList.toggle("error", error);
  }

  _showError(text) {
    this._els.viewer.hidden = true;
    this._els.timelineWrap.hidden = true;
    this._els.count.textContent = "Timeline unavailable";
    this._setMessage(text, true);
  }

  _formatDate(date) {
    if (!date) return "No saved dates";
    const value = new Date(`${date}T12:00:00`);
    return new Intl.DateTimeFormat(this._hass?.locale?.language || undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(value);
  }

  _formatTime(time) {
    if (!time) return "";
    const value = new Date(`2000-01-01T${time}`);
    return new Intl.DateTimeFormat(this._hass?.locale?.language || undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(value);
  }
}

if (!customElements.get("front-door-timeline")) {
  customElements.define("front-door-timeline", FrontDoorTimelineCard);
}

// Intentionally not registered in window.customCards.
// This keeps the card out of Home Assistant's "By card" picker.
// The card remains fully usable through Manual YAML:
// type: custom:front-door-timeline

console.info(`%c FRONT-DOOR-TIMELINE %c v${CARD_VERSION} `, "color:white;background:#03a9f4;font-weight:700", "color:#03a9f4;background:white");
