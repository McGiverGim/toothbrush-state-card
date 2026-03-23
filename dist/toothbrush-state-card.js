const TRANSLATIONS_CACHE = {};
const TRANSLATION_LOADS = new Map();

function getLanguage(hass) {
  return hass?.locale?.language?.split("-")[0] ?? "en";
}

function getTranslations(lang) {
  return TRANSLATIONS_CACHE[lang] ?? TRANSLATIONS_CACHE["en"] ?? {};
}

async function ensureTranslations(lang) {
  if (!lang || TRANSLATIONS_CACHE[lang]) {
    return;
  }

  if (TRANSLATION_LOADS.has(lang)) {
    return TRANSLATION_LOADS.get(lang);
  }

  const loadPromise = (async () => {
    try {
      if (lang !== "en" && !TRANSLATIONS_CACHE["en"]) {
        await ensureTranslations("en");
      }
      const url = new URL(`./translations/${lang}.json`, import.meta.url);
      const response = await fetch(url);
      if (response.ok) {
        const loaded = await response.json();
        TRANSLATIONS_CACHE[lang] = {
          ...(TRANSLATIONS_CACHE["en"] ?? {}),
          ...loaded
        };
      }
    } catch (_error) {
    } finally {
      TRANSLATION_LOADS.delete(lang);
    }
  })();

  TRANSLATION_LOADS.set(lang, loadPromise);
  return loadPromise;
}

function fireEvent(node, type, detail) {
  node.dispatchEvent(
    new CustomEvent(type, {
      detail,
      bubbles: true,
      composed: true
    })
  );
}

class ToothbrushStateCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("toothbrush-state-card-editor");
  }

  static getStubConfig() {
    return {
      show_values: true
    };
  }

  setConfig(config) {
    this._config = {
      title: null,
      show_values: true,
      score: null,
      last_brush_time: null,
      ...config
    };

    this._zones = [
      {
        key: "upper_right_out",
        d: "M180,38 Q280,38 280,96 L260,96 Q260,50 180,50 Z",
        valuePos: { x: 248, y: 36 }
      },
      {
        key: "upper_right_in",
        d: "M180,50 Q260,50 260,96 L240,96 Q240,62 180,62 Z",
        valuePos: { x: 220, y: 80 }
      },
      {
        key: "upper_left_in",
        d: "M120,96 Q120,62 180,62 L180,50 Q100,50 100,96 Z",
        valuePos: { x: 140, y: 80 }
      },
      {
        key: "upper_left_out",
        d: "M80,96 Q80,38 180,38 L180,50 Q100,50 100,96 Z",
        valuePos: { x: 112, y: 36 }
      },
      {
        key: "lower_right_out",
        d: "M180,182 Q280,182 280,124 L260,124 Q260,170 180,170 Z",
        valuePos: { x: 248, y: 184 }
      },
      {
        key: "lower_right_in",
        d: "M180,170 Q260,170 260,124 L240,124 Q240,158 180,158 Z",
        valuePos: { x: 220, y: 140 }
      },
      {
        key: "lower_left_in",
        d: "M120,124 Q120,158 180,158 L180,170 Q100,170 100,124 Z",
        valuePos: { x: 140, y: 140 }
      },
      {
        key: "lower_left_out",
        d: "M80,124 Q80,182 180,182 L180,170 Q100,170 100,124 Z",
        valuePos: { x: 112, y: 184 }
      }
    ];

    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }

    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 3;
  }

  _getZoneValue(entityId) {
    if (!entityId || !this._hass?.states?.[entityId]) {
      return null;
    }

    const raw = Number(this._hass.states[entityId].state);
    if (!Number.isFinite(raw)) {
      return null;
    }

    return Math.max(0, Math.min(100, raw));
  }

  _getEntityIdForZone(zoneKey) {
    return this._config?.[zoneKey] ?? null;
  }

  _interpolateColor(value) {
    const ratio = value / 100;
    const red = 211 + (255 - 211) * ratio;
    const green = 47 + (255 - 47) * ratio;
    const blue = 47 + (255 - 47) * ratio;
    return `rgb(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)})`;
  }

  _render() {
    if (!this.shadowRoot || !this._config) {
      return;
    }

    const lang = getLanguage(this._hass);
    if (!TRANSLATIONS_CACHE[lang]) {
      void ensureTranslations(lang).then(() => this._render());
    }
    const langTable = getTranslations(lang);
    const t = (key) => langTable[key] ?? key;

    const title = this._config.title ?? "";
    const renderZone = (zone) => {
      const entityId = this._getEntityIdForZone(zone.key);
      const value = this._getZoneValue(entityId);
      const color =
        value === null
          ? "var(--disabled-text-color, #9e9e9e)"
          : this._interpolateColor(value);
      const displayValue = value === null ? "-" : `${Math.round(value)}`;
      return `
        <g>
          <title>${t(zone.key)}${entityId ? ` (${entityId})` : ""}: ${displayValue}</title>
          <path d="${zone.d}" fill="${color}" stroke="none" />
          ${
            this._config.show_values
              ? `<text x="${zone.valuePos.x}" y="${zone.valuePos.y}" text-anchor="middle" dominant-baseline="middle">${displayValue}</text>`
              : ""
          }
        </g>
      `;
    };

    const upperKeys = ["upper_left_out", "upper_left_in", "upper_right_in", "upper_right_out"];
    const lowerKeys = ["lower_left_out", "lower_left_in", "lower_right_in", "lower_right_out"];
    const upperZonesSvg = this._zones.filter(z => upperKeys.includes(z.key)).map(renderZone).join("");
    const lowerZonesSvg = this._zones.filter(z => lowerKeys.includes(z.key)).map(renderZone).join("");
    const lastBrushTimeState = this._config.last_brush_time
      ? (this._hass?.states?.[this._config.last_brush_time]?.state ?? null)
      : null;
    const lastBrushTimeFormatted = (() => {
      if (lastBrushTimeState === null) return null;
      const date = new Date(lastBrushTimeState);
      if (isNaN(date.getTime())) return lastBrushTimeState;
      return date.toLocaleString(lang || "en", { dateStyle: "medium", timeStyle: "short" });
    })();
    const scoreValue = this._getZoneValue(this._config.score);
    const scoreDisplay = scoreValue === null ? "" : `${Math.round(scoreValue)}%`;
    const scoreSvg = scoreDisplay
      ? `<text x="180" y="110" text-anchor="middle" dominant-baseline="middle" class="score-label">${scoreDisplay}</text>`
      : "";

    const labelsSvg = this._zones.map((zone) => {
      if (!this._config.show_values) return "";
      const entityId = this._getEntityIdForZone(zone.key);
      const value = this._getZoneValue(entityId);
      const displayValue = value === null ? "-" : `${Math.round(value)}`;
      return `<text x="${zone.valuePos.x}" y="${zone.valuePos.y}" text-anchor="middle" dominant-baseline="middle">${displayValue}</text>`;
    }).join("");

    this.shadowRoot.innerHTML = `
      <style>
        ha-card {
          padding: 12px;
        }

        .title {
          font-size: var(--ha-card-header-font-size, 24px);
          font-weight: var(--ha-card-header-font-weight, normal);
          color: var(--ha-card-header-color, var(--primary-text-color));
          line-height: 1.4;
          margin-bottom: 4px;
          padding: 4px 4px 0;
        }

        svg {
          width: 100%;
          height: auto;
          display: block;
        }

        text {
          font-size: 11px;
          font-weight: 600;
          fill: var(--primary-text-color);
          pointer-events: none;
        }

        .score-label {
          font-size: 22px;
          font-weight: 700;
          fill: var(--primary-text-color);
        }

        .last-brush-time {
          text-align: center;
          font-size: 1rem;
          font-weight: 400;
          color: var(--primary-text-color);
          padding: 4px 0 8px;
        }

        @media (max-width: 420px) {
          ha-card {
            padding: 8px;
          }

          .title {
            font-size: calc(var(--ha-card-header-font-size, 24px) * 0.85);
            margin-bottom: 6px;
          }

          text {
            font-size: 9px;
          }

          .score-label {
            font-size: 16px;
          }
        }
      </style>

      <ha-card>
        ${title ? `<div class="title">${title}</div>` : ""}

        <svg viewBox="65 22 225 182" role="img" aria-label="${t('aria_label')}">
          <defs>
            <filter id="zone-blur" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" />
            </filter>
            <clipPath id="upper-clip">
              <path d="M80,96 Q80,38 180,38 Q280,38 280,96 L240,96 Q240,62 180,62 Q120,62 120,96 Z" />
            </clipPath>
            <clipPath id="lower-clip">
              <path d="M80,124 Q80,182 180,182 Q280,182 280,124 L240,124 Q240,158 180,158 Q120,158 120,124 Z" />
            </clipPath>
          </defs>
          <g filter="url(#zone-blur)" clip-path="url(#upper-clip)">${upperZonesSvg}</g>
          <g filter="url(#zone-blur)" clip-path="url(#lower-clip)">${lowerZonesSvg}</g>
          ${labelsSvg}
          ${scoreSvg}
          <path d="M80,96 Q80,38 180,38 Q280,38 280,96 L240,96 Q240,62 180,62 Q120,62 120,96 Z" fill="none" stroke="var(--divider-color, #666)" stroke-width="2" stroke-linejoin="round" />
          <path d="M80,124 Q80,182 180,182 Q280,182 280,124 L240,124 Q240,158 180,158 Q120,158 120,124 Z" fill="none" stroke="var(--divider-color, #666)" stroke-width="2" stroke-linejoin="round" />
        </svg>

        ${lastBrushTimeFormatted !== null ? `<div class="last-brush-time">${lastBrushTimeFormatted}</div>` : ""}
      </ha-card>
    `;
  }
}

class ToothbrushStateCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._boundGeneralChanged = (event) => this._handleFormChanged(event);
    this._boundZonesChanged = (event) => this._handleFormChanged(event);
  }

  setConfig(config) {
    this._config = {
      show_values: true,
      ...config
    };

    if (!this.shadowRoot?.innerHTML) {
      this._render();
    } else {
      this._updateForms();
    }
  }

  set hass(hass) {
    const previousLang = getLanguage(this._hass);
    this._hass = hass;
    const currentLang = getLanguage(hass);

    if (!this.shadowRoot?.innerHTML) {
      this._render();
      return;
    }

    if (!TRANSLATIONS_CACHE[currentLang]) {
      void ensureTranslations(currentLang).then(() => this._render());
      return;
    }

    if (previousLang !== currentLang) {
      this._render();
      return;
    }

    this._updateForms();
  }

  _t(key) {
    const lang = getLanguage(this._hass);
    return getTranslations(lang)[key] ?? key;
  }

  _normalizeConfigValue(key, value) {
    if (key === "show_values") {
      return Boolean(value);
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed === "" ? undefined : trimmed;
    }

    return value == null || value === "" ? undefined : value;
  }

  _emitConfig(config) {
    this._config = config;
    fireEvent(this, "config-changed", { config });
  }

  _handleFormChanged(event) {
    const partial = event.detail?.value ?? {};
    const nextConfig = { ...this._config };

    Object.entries(partial).forEach(([key, value]) => {
      const normalized = this._normalizeConfigValue(key, value);
      if (normalized === undefined) {
        delete nextConfig[key];
      } else {
        nextConfig[key] = normalized;
      }
    });

    if (!("show_values" in nextConfig)) {
      nextConfig.show_values = true;
    }

    this._emitConfig(nextConfig);
  }

  _computeLabel(schema) {
    const editorKey = `editor_${schema.name}`;
    const lang = getLanguage(this._hass);
    const table = getTranslations(lang);
    const withPrefix = table[editorKey];
    if (withPrefix) return withPrefix;
    return table[schema.name] ?? schema.name;
  }

  _getGeneralSchema() {
    return [
      {
        name: "show_values",
        selector: {
          boolean: {}
        }
      },
      {
        name: "score",
        selector: {
          entity: {
            filter: [
              { domain: "sensor" },
              { domain: "number" },
              { domain: "input_number" }
            ]
          }
        }
      },
      {
        name: "last_brush_time",
        selector: {
          entity: {
            filter: [
              { domain: "sensor" },
              { domain: "input_datetime" }
            ]
          }
        }
      }
    ];
  }

  _getZoneSchema(keys) {
    return keys.map((name) => ({
      name,
      selector: {
        entity: {
          filter: [
            { domain: "sensor" },
            { domain: "number" },
            { domain: "input_number" }
          ]
        }
      }
    }));
  }

  _updateForms() {
    const titleField = this.shadowRoot?.getElementById("title");
    const generalForm = this.shadowRoot?.getElementById("general-form");
    const upperZonesForm = this.shadowRoot?.getElementById("upper-zones-form");
    const lowerZonesForm = this.shadowRoot?.getElementById("lower-zones-form");

    if (titleField) {
      titleField.label = this._t("editor_title");
      if (titleField.value !== (this._config.title ?? "")) {
        titleField.value = this._config.title ?? "";
      }
    }

    if (generalForm) {
      generalForm.hass = this._hass;
      generalForm.schema = this._getGeneralSchema();
      generalForm.computeLabel = (schema) => this._computeLabel(schema);
      generalForm.data = {
        show_values: this._config.show_values ?? true,
        score: this._config.score ?? "",
        last_brush_time: this._config.last_brush_time ?? ""
      };
    }

    if (upperZonesForm) {
      upperZonesForm.hass = this._hass;
      upperZonesForm.schema = this._getZoneSchema([
        "upper_right_out",
        "upper_right_in",
        "upper_left_in",
        "upper_left_out"
      ]);
      upperZonesForm.computeLabel = (schema) => this._computeLabel(schema);
      upperZonesForm.data = {
        upper_right_out: this._config.upper_right_out ?? "",
        upper_right_in: this._config.upper_right_in ?? "",
        upper_left_in: this._config.upper_left_in ?? "",
        upper_left_out: this._config.upper_left_out ?? ""
      };
    }

    if (lowerZonesForm) {
      lowerZonesForm.hass = this._hass;
      lowerZonesForm.schema = this._getZoneSchema([
        "lower_right_out",
        "lower_right_in",
        "lower_left_in",
        "lower_left_out"
      ]);
      lowerZonesForm.computeLabel = (schema) => this._computeLabel(schema);
      lowerZonesForm.data = {
        lower_right_out: this._config.lower_right_out ?? "",
        lower_right_in: this._config.lower_right_in ?? "",
        lower_left_in: this._config.lower_left_in ?? "",
        lower_left_out: this._config.lower_left_out ?? ""
      };
    }
  }

  _render() {
    if (!this.shadowRoot || !this._config) {
      return;
    }

    const lang = getLanguage(this._hass);
    if (!TRANSLATIONS_CACHE[lang]) {
      void ensureTranslations(lang).then(() => this._render());
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }

        .form {
          display: grid;
          gap: 12px;
        }

        .title-field {
          display: grid;
          gap: 6px;
        }

        .field,
        .checkbox {
          display: grid;
          gap: 6px;
        }

        ha-form {
          display: block;
        }

        ha-textfield {
          width: 100%;
        }

        .section-title {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--primary-text-color);
          margin-top: 4px;
        }

        .subsection-title {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--secondary-text-color);
          margin-top: 4px;
        }

        label {
          font-size: 0.9rem;
          color: var(--primary-text-color);
        }
      </style>

      <div class="form">
        <div class="title-field">
          <ha-textfield id="title"></ha-textfield>
        </div>

        <ha-form id="general-form"></ha-form>

        <div class="section-title">${this._t("editor_zones")}</div>
        <div class="subsection-title">${this._t("editor_upper_zones")}</div>
        <ha-form id="upper-zones-form"></ha-form>

        <div class="subsection-title">${this._t("editor_lower_zones")}</div>
        <ha-form id="lower-zones-form"></ha-form>
      </div>
    `;

    const stopShortcutPropagation = (event) => {
      event.stopPropagation();
    };

    const syncTitle = (event) => {
      event.stopPropagation();
      this._handleFormChanged({
        detail: { value: { title: event.target.value } }
      });
    };

    const titleField = this.shadowRoot.getElementById("title");
    titleField?.addEventListener("keydown", stopShortcutPropagation);
    titleField?.addEventListener("keyup", stopShortcutPropagation);
    titleField?.addEventListener("keypress", stopShortcutPropagation);
    titleField?.addEventListener("input", syncTitle);
    titleField?.addEventListener("change", syncTitle);

    this.shadowRoot.getElementById("general-form")?.addEventListener("value-changed", this._boundGeneralChanged);
    this.shadowRoot.getElementById("upper-zones-form")?.addEventListener("value-changed", this._boundZonesChanged);
    this.shadowRoot.getElementById("lower-zones-form")?.addEventListener("value-changed", this._boundZonesChanged);
    this._updateForms();
  }
}

if (!customElements.get("toothbrush-state-card")) {
  customElements.define("toothbrush-state-card", ToothbrushStateCard);
}

if (!customElements.get("toothbrush-state-card-editor")) {
  customElements.define("toothbrush-state-card-editor", ToothbrushStateCardEditor);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "toothbrush-state-card",
  name: "Toothbrush State Card",
  description: "Custom card with an 8-zone teeth SVG map colored according to 0-100 sensors."
});
