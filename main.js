const { Plugin, PluginSettingTab, Setting, MarkdownView, Notice, setIcon } = require('obsidian');

const DEFAULTS = Object.freeze({
  enabled: true, position: 50, clearHeight: 26,
  topTransition: 100, bottomTransition: 100, blur: 24, frost: 78,
});
const CONTROLS = [
  ['position', '清晰区位置', 10, 90, '%', '0% 是顶部，100% 是底部'],
  ['clearHeight', '清晰区高度', 6, 70, '%', '占正文窗口高度的比例'],
  ['topTransition', '上方过渡', 10, 100, '%', '越大越柔和；100% 从清晰区一直过渡到顶部'],
  ['bottomTransition', '下方过渡', 10, 100, '%', '越大越柔和；100% 从清晰区一直过渡到底部'],
  ['blur', '模糊强度', 0, 48, 'px', '顶部和底部的最大模糊程度'],
  ['frost', '边缘遮盖', 0, 100, '%', '越大，边缘文字越接近看不见'],
];
const PRESETS = {
  gentle: { ...DEFAULTS, clearHeight: 38, blur: 10, frost: 35 },
  balanced: { ...DEFAULTS },
  strong: { ...DEFAULTS, clearHeight: 18, blur: 36, frost: 94 },
};
const LAYERS = 7;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function normalized(raw = {}) {
  if (!raw || typeof raw !== 'object') raw = {};
  const result = { ...DEFAULTS, enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULTS.enabled };
  for (const [key, , min, max] of CONTROLS) {
    const value = Number(raw[key] ?? DEFAULTS[key]);
    result[key] = Number.isFinite(value) ? clamp(value, min, max) : DEFAULTS[key];
  }
  return result;
}
function button(parent, text, label = text) {
  const el = parent.createEl('button', { text, attr: { type: 'button', 'aria-label': label } });
  return el;
}

module.exports = class GradientFocusPlugin extends Plugin {
  async onload() {
    this.settings = normalized(await this.loadData());
    this.disposed = false;
    this.panelOpen = false;
    this.uiUpdaters = new Set();
    this.saveChain = Promise.resolve();
    this.addSettingTab(new FocusSettings(this.app, this));
    this.addRibbonIcon('scan-line', '渐变聚焦：开关', () => this.toggle());
    this.addCommand({ id: 'toggle', name: '开关渐变聚焦', callback: () => this.toggle() });
    this.addCommand({ id: 'controls', name: '打开 / 收起调节面板', callback: () => {
      this.panelOpen = !this.panelOpen;
      this.schedule();
    } });
    this.addCommand({ id: 'reset', name: '恢复默认效果', callback: () => this.applyPreset('balanced') });
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.schedule()));
    this.registerEvent(this.app.workspace.on('layout-change', () => this.schedule()));
    this.registerEvent(this.app.workspace.on('file-open', () => this.schedule()));
    this.app.workspace.onLayoutReady(() => this.schedule());
  }

  schedule() {
    if (this.disposed || this.frame != null) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = null;
      this.reconcile();
    });
  }

  reconcile() {
    if (this.disposed) return;
    let view = this.app.workspace.getActiveViewOfType(MarkdownView);
    // Keep the note available when focus moves into the sidebar/settings.
    if (!view && this.view?.contentEl.isShown()) view = this.view;
    if (!view || !view.contentEl.isShown()) { this.detach(); return; }
    if (view !== this.view || !this.overlay?.isConnected) {
      this.detach();
      this.attach(view);
    }
    this.paint();
  }

  attach(view) {
    this.view = view;
    const host = view.contentEl;
    host.classList.add('gf-host');
    this.overlay = host.createDiv({ cls: 'gf-overlay', attr: { 'aria-hidden': 'true' } });
    this.sides = ['top', 'bottom'].map(side => {
      const el = this.overlay.createDiv({ cls: `gf-side gf-${side}` });
      const layers = Array.from({ length: LAYERS }, () => el.createDiv({ cls: 'gf-blur-layer' }));
      const tint = el.createDiv({ cls: 'gf-tint' });
      return { side, el, layers, tint };
    });
    this.dock = host.createDiv({ cls: 'gf-dock' });
    this.toolbar = this.dock.createDiv({ cls: 'gf-toolbar' });
    this.toggleButton = button(this.toolbar, '', '渐变聚焦：开关');
    setIcon(this.toggleButton, 'scan-line');
    this.toggleButton.onclick = () => this.toggle();
    this.panelButton = button(this.toolbar, '调节', '打开渐变聚焦调节面板');
    this.panelButton.onclick = () => { this.panelOpen = !this.panelOpen; this.paint(); };
    this.panelButton.setAttribute('aria-expanded', String(this.panelOpen));
    this.panel = this.dock.createDiv({ cls: 'gf-panel' });
    const heading = this.panel.createDiv({ cls: 'gf-panel-heading' });
    heading.createEl('strong', { text: '渐变聚焦' });
    const close = button(heading, '', '收起调节面板');
    setIcon(close, 'x');
    close.onclick = () => { this.panelOpen = false; this.paint(); this.panelButton.focus(); };
    this.panel.createEl('p', { cls: 'gf-caption', text: '滚动正文，观察文字经过清晰区。' });
    this.panelControls = [];
    for (const [key, label, min, max, unit, description] of CONTROLS) {
      const row = this.panel.createEl('label', { cls: 'gf-control', attr: { title: description } });
      const text = row.createSpan({ cls: 'gf-control-label' });
      text.createSpan({ text: label });
      const value = text.createEl('output');
      const input = row.createEl('input', { attr: {
        type: 'range', min, max, step: 1, 'aria-label': label,
      } });
      input.oninput = () => this.updateSetting(key, Number(input.value));
      this.panelControls.push({ key, input, value, unit });
    }
    const presets = this.panel.createDiv({ cls: 'gf-presets' });
    for (const [id, label] of [['gentle', '轻柔'], ['balanced', '标准'], ['strong', '强聚焦']]) {
      button(presets, label).onclick = () => this.applyPreset(id);
    }
    const footer = this.panel.createDiv({ cls: 'gf-panel-footer' });
    button(footer, '恢复默认').onclick = () => this.applyPreset('balanced');
    const compare = button(footer, '按住看原文');
    const release = () => { this.comparing = false; this.paint(); };
    compare.onpointerdown = event => {
      if (event.button !== 0) return;
      compare.setPointerCapture(event.pointerId);
      this.comparing = true; this.paint();
    };
    compare.onpointerup = compare.onpointercancel = compare.onlostpointercapture = release;
    compare.onkeydown = event => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault(); this.comparing = true; this.paint();
      }
    };
    compare.onkeyup = event => { if (event.key === ' ' || event.key === 'Enter') release(); };
    compare.onblur = release;
    this.dock.onkeydown = event => {
      if (event.key === 'Escape') {
        event.stopPropagation(); this.panelOpen = false; this.paint(); this.panelButton.focus();
      }
    };
    // No scroll handler: the glass remains fixed and is composited over the note.
    const win = host.ownerDocument.defaultView;
    this.resizeObserver = new win.ResizeObserver(() => this.paint());
    this.resizeObserver.observe(host);
    this.windowBlur = release;
    this.attachedWindow = win;
    win.addEventListener('blur', release);
  }

  paint() {
    if (!this.overlay) return;
    const settings = this.settings;
    const enabled = settings.enabled && !this.comparing;
    this.overlay.hidden = !enabled;
    this.toggleButton.setAttribute('aria-pressed', String(settings.enabled));
    this.toggleButton.setAttribute('aria-label', settings.enabled ? '关闭渐变聚焦' : '开启渐变聚焦');
    this.panelButton.setAttribute('aria-expanded', String(this.panelOpen));
    this.panel.hidden = !this.panelOpen;
    this.dock.classList.toggle('gf-open', this.panelOpen);
    const topEnd = clamp(settings.position - settings.clearHeight / 2, 0, 100);
    const bottomStart = clamp(settings.position + settings.clearHeight / 2, 0, 100);
    for (const { side, el, layers, tint } of this.sides) {
      el.style.height = `${side === 'top' ? topEnd : 100 - bottomStart}%`;
      // Gradient coordinates run from the sharp area towards the window edge.
      const direction = side === 'top' ? 'to top' : 'to bottom';
      const transition = settings[side === 'top' ? 'topTransition' : 'bottomTransition'];
      layers.forEach((layer, i) => {
        // Cumulative, gently ramped blur levels approximate a varying blur radius.
        // Gaussian radii combine in quadrature; scale so the edge stays near the selected value.
        const radius = settings.blur * Math.pow(2, i - LAYERS + 1) * 0.866;
        const start = transition * i / LAYERS;
        const end = transition * (i + 1) / LAYERS;
        // Omit the fully transparent part of this layer. Map its mask stops
        // back to the same positions in the full side, preserving the gradient.
        // This cuts the combined filter surface by up to 43%, without dropping levels.
        layer.style[side === 'top' ? 'bottom' : 'top'] = `${start}%`;
        const rampEnd = (end - start) / (100 - start) * 100;
        layer.style.backdropFilter = layer.style.webkitBackdropFilter = `blur(${radius.toFixed(3)}px)`;
        const mask = `linear-gradient(${direction}, transparent 0%, rgba(0,0,0,.156) ${rampEnd * .25}%, rgba(0,0,0,.5) ${rampEnd * .5}%, rgba(0,0,0,.844) ${rampEnd * .75}%, black ${rampEnd}%)`;
        layer.style.maskImage = layer.style.webkitMaskImage = mask;
      });
      // Apply alpha to the color, never to a blur ancestor (which would block backdrop sampling).
      tint.style.backgroundColor = `color-mix(in srgb, var(--background-primary) ${settings.frost}%, transparent)`;
      const tintMask = `linear-gradient(${direction}, transparent 0%, rgba(0,0,0,.08) ${transition * .25}%, rgba(0,0,0,.35) ${transition * .5}%, rgba(0,0,0,.7) ${transition * .75}%, black ${transition}%)`;
      tint.style.maskImage = tint.style.webkitMaskImage = tintMask;
    }
    for (const { key, input, value, unit } of this.panelControls) {
      input.value = String(settings[key]); value.textContent = `${settings[key]}${unit}`;
      input.setAttribute('aria-valuetext', `${settings[key]}${unit}`);
    }
  }

  updateSetting(key, value) {
    this.settings = normalized({ ...this.settings, [key]: value });
    this.paint();
    for (const refresh of this.uiUpdaters) refresh();
    this.queueSave();
  }
  toggle() { this.updateSetting('enabled', !this.settings.enabled); }
  applyPreset(id) {
    this.settings = { ...(PRESETS[id] || DEFAULTS) };
    this.paint();
    for (const refresh of this.uiUpdaters) refresh();
    this.queueSave();
  }
  queueSave() {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => { this.saveTimer = null; this.persist(); }, 200);
  }
  persist() {
    const snapshot = { ...this.settings };
    this.saveChain = this.saveChain.then(() => this.saveData(snapshot)).catch(error => {
      console.error('[gradient-focus] Settings save failed', error);
      new Notice('渐变聚焦：设置保存失败，请检查插件目录是否可写。');
    });
    return this.saveChain;
  }
  detach() {
    this.resizeObserver?.disconnect();
    this.attachedWindow?.removeEventListener('blur', this.windowBlur);
    this.overlay?.remove(); this.dock?.remove();
    this.view?.contentEl.classList.remove('gf-host');
    this.overlay = this.dock = this.view = null;
    this.comparing = false;
  }
  onunload() {
    this.disposed = true;
    if (this.frame != null) window.cancelAnimationFrame(this.frame);
    if (this.saveTimer != null) { window.clearTimeout(this.saveTimer); void this.persist(); }
    this.detach(); this.uiUpdaters.clear();
  }
};

class FocusSettings extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    this.hide();
    const { containerEl: el, plugin } = this;
    el.empty();
    el.createEl('h2', { text: '渐变聚焦' });
    el.createEl('p', { text: '正文窗口保留一条清晰区域，上下逐渐模糊。也可以在正文右上角点击「调节」，边阅读边调整。' });
    const updaters = [];
    new Setting(el).setName('开启效果').addToggle(toggle => {
      toggle.setValue(plugin.settings.enabled).onChange(value => plugin.updateSetting('enabled', value));
      updaters.push(() => toggle.setValue(plugin.settings.enabled));
    });
    for (const [key, label, min, max, unit, description] of CONTROLS) {
      const row = new Setting(el).setName(label).setDesc(description);
      row.addSlider(slider => {
        slider.setLimits(min, max, 1).setValue(plugin.settings[key]).setDynamicTooltip()
          .onChange(value => plugin.updateSetting(key, value));
        updaters.push(() => { slider.setValue(plugin.settings[key]); row.setName(`${label} · ${plugin.settings[key]}${unit}`); });
      });
    }
    new Setting(el).setName('恢复默认效果').addButton(b => b.setButtonText('恢复默认').onClick(() => plugin.applyPreset('balanced')));
    this.refresh = () => updaters.forEach(update => update());
    plugin.uiUpdaters.add(this.refresh); this.refresh();
  }
  hide() { if (this.refresh) this.plugin.uiUpdaters.delete(this.refresh); }
}
