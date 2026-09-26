const { Plugin, PluginSettingTab, Setting, MarkdownView, Notice, Platform, setIcon } = require('obsidian');

const DEFAULTS = Object.freeze({
  enabled: true, position: 50, clearHeight: 26,
  topTransition: 100, bottomTransition: 100, blur: 24, frost: 78,
});
const MOBILE_DEFAULTS = Object.freeze({
  ...DEFAULTS, position: 44, clearHeight: 38, blur: 12, frost: 62,
  pauseWhileEditing: true,
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
const MOBILE_PRESETS = {
  gentle: { ...MOBILE_DEFAULTS, clearHeight: 48, blur: 6, frost: 30 },
  balanced: { ...MOBILE_DEFAULTS },
  strong: { ...MOBILE_DEFAULTS, clearHeight: 28, blur: 20, frost: 85 },
};
const LAYERS = 7;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function normalized(raw = {}, defaults = DEFAULTS) {
  if (!raw || typeof raw !== 'object') raw = {};
  const result = { ...defaults, enabled: typeof raw.enabled === 'boolean' ? raw.enabled : defaults.enabled };
  if ('pauseWhileEditing' in defaults) {
    result.pauseWhileEditing = typeof raw.pauseWhileEditing === 'boolean' ? raw.pauseWhileEditing : true;
  }
  for (const [key, , min, max] of CONTROLS) {
    const value = Number(raw[key] ?? defaults[key]);
    result[key] = Number.isFinite(value) ? clamp(value, min, max) : defaults[key];
  }
  return result;
}
function button(parent, text, label = text) {
  const el = parent.createEl('button', { text, attr: { type: 'button', 'aria-label': label } });
  return el;
}

module.exports = class GradientFocusPlugin extends Plugin {
  async onload() {
    this.mobile = Platform.isMobile;
    this.settings = this.readSettings(await this.loadData());
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

  readSettings(raw) {
    return normalized(this.mobile ? raw?.mobile : raw, this.mobile ? MOBILE_DEFAULTS : DEFAULTS);
  }

  async onExternalSettingsChange() {
    // Do not discard a slider change that has not reached disk yet.
    if (this.saveTimer != null || this.disposed) return;
    this.settings = this.readSettings(await this.loadData());
    if (this.disposed) return;
    this.paint();
    for (const refresh of this.uiUpdaters) refresh();
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
    host.classList.toggle('gf-mobile', this.mobile);
    this.overlay = host.createDiv({ cls: 'gf-overlay', attr: { 'aria-hidden': 'true' } });
    this.sides = ['top', 'bottom'].map(side => {
      const el = this.overlay.createDiv({ cls: `gf-side gf-${side}` });
      const layers = Array.from({ length: this.mobile ? 4 : LAYERS }, () => el.createDiv({ cls: 'gf-blur-layer' }));
      const tint = el.createDiv({ cls: 'gf-tint' });
      return { side, el, layers, tint };
    });
    this.dock = host.createDiv({ cls: 'gf-dock' });
    this.toolbar = this.dock.createDiv({ cls: 'gf-toolbar' });
    this.toggleButton = button(this.toolbar, '', '渐变聚焦：开关');
    if (!this.mobile) setIcon(this.toggleButton, 'scan-line');
    this.toggleButton.onclick = () => this.toggle();
    this.panelButton = button(this.toolbar, '调节', '打开渐变聚焦调节面板');
    this.panelButton.onclick = () => { this.panelOpen = !this.panelOpen; this.paint(); };
    this.panelButton.setAttribute('aria-expanded', String(this.panelOpen));
    this.panel = this.dock.createDiv({ cls: 'gf-panel' });
    this.panel.setAttribute('role', 'region');
    this.panel.setAttribute('aria-label', '渐变聚焦调节面板');
    if (this.mobile) this.panel.createDiv({ cls: 'gf-sheet-handle', attr: { 'aria-hidden': 'true' } });
    const heading = this.panel.createDiv({ cls: 'gf-panel-heading' });
    heading.createEl('strong', { text: '渐变聚焦' });
    const close = button(heading, '', '收起调节面板');
    setIcon(close, 'x');
    close.onclick = () => { this.panelOpen = false; this.paint(); this.panelButton.focus(); };
    this.panel.createEl('p', { cls: 'gf-caption', text: this.mobile
      ? '上方实时预览 · 收起后继续阅读'
      : '滚动正文，观察文字经过清晰区。' });
    const presets = this.mobile ? this.panel.createDiv({ cls: 'gf-presets' }) : null;
    this.panelControls = [];
    let controlsParent = this.panel;
    for (const [key, label, min, max, unit, description] of CONTROLS) {
      if (this.mobile && key === 'topTransition') {
        const details = this.panel.createEl('details', { cls: 'gf-advanced' });
        details.createEl('summary', { text: '更多调节' });
        details.ontoggle = () => this.schedule();
        controlsParent = details;
      }
      const row = controlsParent.createEl('label', { cls: 'gf-control', attr: { title: description } });
      const text = row.createSpan({ cls: 'gf-control-label' });
      text.createSpan({ text: label });
      const value = text.createEl('output');
      const input = row.createEl('input', { attr: {
        type: 'range', min, max, step: 1, 'aria-label': label,
      } });
      input.oninput = () => this.updateSetting(key, Number(input.value));
      this.panelControls.push({ key, input, value, unit });
    }
    const presetRow = presets || this.panel.createDiv({ cls: 'gf-presets' });
    for (const [id, label] of [['gentle', '轻柔'], ['balanced', '标准'], ['strong', '强聚焦']]) {
      button(presetRow, label).onclick = () => this.applyPreset(id);
    }
    const footer = this.panel.createDiv({ cls: 'gf-panel-footer' });
    button(footer, '恢复默认').onclick = () => this.applyPreset('balanced');
    const compare = button(footer, this.mobile ? '查看原文' : '按住看原文');
    this.compareButton = compare;
    const release = () => { this.comparing = false; this.paint(); };
    if (this.mobile) {
      compare.onclick = () => this.toggle();
    } else {
      compare.onpointerdown = event => {
        if (event.button !== 0) return;
        compare.setPointerCapture(event.pointerId);
        this.comparing = true; this.paint();
      };
      compare.onpointerup = compare.onpointercancel = compare.onlostpointercapture = release;
      compare.onkeydown = event => {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault(); this.comparing = true; this.paint();
      };
      compare.onkeyup = event => { if (event.key === ' ' || event.key === 'Enter') release(); };
      compare.onblur = release;
    }
    this.dock.onkeydown = event => {
      if (event.key === 'Escape') {
        event.stopPropagation(); this.panelOpen = false; this.paint(); this.panelButton.focus();
      }
    };
    // No scroll handler: the glass remains fixed and is composited over the note.
    const win = host.ownerDocument.defaultView;
    this.resizeObserver = new win.ResizeObserver(() => this.schedule());
    this.resizeObserver.observe(host);
    if (this.mobile) this.resizeObserver.observe(this.dock);
    this.windowBlur = release;
    this.attachedWindow = win;
    win.addEventListener('blur', release);
    this.viewportChanged = () => this.schedule();
    win.addEventListener('resize', this.viewportChanged);
    win.visualViewport?.addEventListener('resize', this.viewportChanged);
    win.visualViewport?.addEventListener('scroll', this.viewportChanged);
    this.focusChanged = () => this.schedule();
    host.addEventListener('focusin', this.focusChanged);
    host.addEventListener('focusout', this.focusChanged);
  }

  paint() {
    if (!this.overlay) return;
    const settings = this.settings;
    const host = this.view.contentEl;
    const active = host.ownerDocument.activeElement;
    const editing = this.mobile && settings.pauseWhileEditing && host.contains(active)
      && !this.dock.contains(active) && !!active?.closest('.cm-editor, textarea, [contenteditable="true"]');
    const enabled = settings.enabled && !this.comparing && !editing;
    this.overlay.hidden = !enabled;
    this.dock.hidden = !!editing && !this.panelOpen;
    this.toggleButton.setAttribute('aria-pressed', String(settings.enabled));
    this.toggleButton.setAttribute('aria-label', settings.enabled ? '关闭渐变聚焦' : '开启渐变聚焦');
    this.panelButton.setAttribute('aria-expanded', String(this.panelOpen));
    this.panel.hidden = !this.panelOpen;
    this.dock.classList.toggle('gf-open', this.panelOpen);
    let clearHeight = settings.clearHeight;
    let previewScale = 1;
    if (this.mobile) {
      this.toggleButton.textContent = settings.enabled ? '看原文' : '恢复聚焦';
      this.compareButton.textContent = settings.enabled ? '查看原文' : '恢复聚焦';
      const win = host.ownerDocument.defaultView;
      const rect = host.getBoundingClientRect();
      const viewport = win.visualViewport;
      const viewportTop = viewport?.offsetTop || 0;
      const viewportBottom = viewportTop + (viewport?.height || win.innerHeight);
      const visibleTop = clamp(viewportTop - rect.top, 0, rect.height);
      const visibleBottom = clamp(viewportBottom - rect.top, visibleTop, rect.height);
      const visibleHeight = visibleBottom - visibleTop;
      this.dock.style.bottom = `calc(${Math.max(0, rect.height - visibleBottom) + 8}px + env(safe-area-inset-bottom, 0px))`;
      this.panel.style.maxHeight = `${Math.max(80, Math.floor(Math.min(visibleHeight * 0.58, visibleHeight - 172)))}px`;
      const panelTop = this.panelOpen ? this.dock.getBoundingClientRect().top - rect.top - 8 : visibleBottom;
      const overlayBottom = clamp(panelTop, visibleTop, visibleBottom);
      const readingHeight = overlayBottom - visibleTop;
      this.overlay.style.top = `${visibleTop}px`;
      this.overlay.style.bottom = `${Math.max(0, rect.height - visibleBottom)}px`;
      previewScale = readingHeight / Math.max(1, visibleHeight);
      // Preserve a few readable lines on short/landscape screens without changing saved preferences.
      clearHeight = Math.max(clearHeight, Math.min(70, 96 / Math.max(1, readingHeight) * 100));
    }
    const position = this.mobile ? clamp(settings.position, clearHeight / 2, 100 - clearHeight / 2) : settings.position;
    const topEnd = clamp(position - clearHeight / 2, 0, 100) * previewScale;
    const bottomStart = clamp(position + clearHeight / 2, 0, 100) * previewScale;
    for (const { side, el, layers, tint } of this.sides) {
      el.style.height = `${side === 'top' ? topEnd : 100 - bottomStart}%`;
      // Gradient coordinates run from the sharp area towards the window edge.
      const direction = side === 'top' ? 'to top' : 'to bottom';
      let transition = settings[side === 'top' ? 'topTransition' : 'bottomTransition'];
      if (side === 'bottom' && previewScale < 1) {
        transition *= Math.max(0, (100 * previewScale - bottomStart) / Math.max(1, 100 - bottomStart));
      }
      layers.forEach((layer, i) => {
        // Cumulative, gently ramped blur levels approximate a varying blur radius.
        // Gaussian radii combine in quadrature; scale so the edge stays near the selected value.
        const radius = settings.blur * Math.pow(2, i - layers.length + 1) * 0.866;
        const start = transition * i / layers.length;
        const end = transition * (i + 1) / layers.length;
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
      // Opacity is safe on this sibling tint, and also works on older iOS WebViews.
      tint.style.backgroundColor = 'var(--background-primary)';
      tint.style.opacity = String(settings.frost / 100);
      const tintMask = `linear-gradient(${direction}, transparent 0%, rgba(0,0,0,.08) ${transition * .25}%, rgba(0,0,0,.35) ${transition * .5}%, rgba(0,0,0,.7) ${transition * .75}%, black ${transition}%)`;
      tint.style.maskImage = tint.style.webkitMaskImage = tintMask;
    }
    for (const { key, input, value, unit } of this.panelControls) {
      input.value = String(settings[key]); value.textContent = `${settings[key]}${unit}`;
      input.setAttribute('aria-valuetext', `${settings[key]}${unit}`);
    }
  }

  updateSetting(key, value) {
    this.settings = normalized({ ...this.settings, [key]: value }, this.mobile ? MOBILE_DEFAULTS : DEFAULTS);
    this.paint();
    for (const refresh of this.uiUpdaters) refresh();
    this.queueSave();
  }
  toggle() { this.updateSetting('enabled', !this.settings.enabled); }
  applyPreset(id) {
    const presets = this.mobile ? MOBILE_PRESETS : PRESETS;
    this.settings = { ...(presets[id] || presets.balanced) };
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
    this.saveChain = this.saveChain.then(async () => {
      // Merge the inactive profile from disk so sequential phone/desktop saves do not overwrite each other.
      const existing = await this.loadData();
      const desktop = normalized(this.mobile ? existing : snapshot);
      const mobile = normalized(this.mobile ? snapshot : existing?.mobile, MOBILE_DEFAULTS);
      await this.saveData({ ...desktop, mobile, schemaVersion: 2 });
    }).catch(error => {
      console.error('[gradient-focus] Settings save failed', error);
      new Notice('渐变聚焦：设置保存失败，请检查插件目录是否可写。');
    });
    return this.saveChain;
  }
  detach() {
    this.resizeObserver?.disconnect();
    this.attachedWindow?.removeEventListener('blur', this.windowBlur);
    this.attachedWindow?.removeEventListener('resize', this.viewportChanged);
    this.attachedWindow?.visualViewport?.removeEventListener('resize', this.viewportChanged);
    this.attachedWindow?.visualViewport?.removeEventListener('scroll', this.viewportChanged);
    this.view?.contentEl.removeEventListener('focusin', this.focusChanged);
    this.view?.contentEl.removeEventListener('focusout', this.focusChanged);
    this.overlay?.remove(); this.dock?.remove();
    this.view?.contentEl.classList.remove('gf-host', 'gf-mobile');
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
    el.createEl('p', { text: plugin.mobile
      ? '手机参数独立保存。点击正文底部「调节」可边阅读边调整，「看原文」可临时关闭效果。'
      : '正文窗口保留一条清晰区域，上下逐渐模糊。点击正文右上角「调节」即可调整。手机参数独立保存。' });
    const updaters = [];
    new Setting(el).setName('开启效果').addToggle(toggle => {
      toggle.setValue(plugin.settings.enabled).onChange(value => plugin.updateSetting('enabled', value));
      updaters.push(() => toggle.setValue(plugin.settings.enabled));
    });
    if (plugin.mobile) new Setting(el).setName('编辑时暂停').setDesc('输入文字时暂停模糊，离开编辑框后恢复。').addToggle(toggle => {
      toggle.setValue(plugin.settings.pauseWhileEditing).onChange(value => plugin.updateSetting('pauseWhileEditing', value));
      updaters.push(() => toggle.setValue(plugin.settings.pauseWhileEditing));
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
