# Gradient Focus · 渐变聚焦

Keep a fixed reading area clear while progressively blurring and fading the content above and below it. The clear area stays in place as you scroll.

在正文窗口中保留固定的清晰区域，上下逐渐模糊并遮盖；滚动正文时，清晰区位置不动。

## Features

- Adjust the clear area's position and height.
- Set the upper and lower transition lengths independently.
- Adjust maximum blur and edge opacity.
- Open a compact adjustment panel while reading, or use the plugin settings.
- Choose gentle, standard, or strong presets; hold a button to reveal the original text.
- Toggle the effect with a ribbon icon or command. Settings are saved automatically.

The interface is currently in Simplified Chinese. Version 1.1.0 enables desktop, iOS, and Android on Obsidian 1.13.7 or later. Reading view and Live Preview were checked on macOS with Obsidian 1.13.7. Source mode is targeted but has not been separately verified.

## Installation

If the plugin is not available in your community directory yet, install it manually from GitHub.

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/hana11000/obsidian-gradient-focus/releases/latest).
2. Put those files inside your vault's `.obsidian/plugins/gradient-focus/` folder.
3. Reload Obsidian and enable **Gradient Focus** under **Settings → Community plugins**.

Alternatively, extract `gradient-focus-1.1.0.zip` into `.obsidian/plugins/`; the archive already contains the `gradient-focus` folder.

中文：下载上述三个文件，放入知识库的 `.obsidian/plugins/gradient-focus/`，重新加载 Obsidian，然后在第三方插件中启用“Gradient Focus”。

## Mobile / 手机版

Version 1.1.0 removes the desktop-only restriction and adds an iPhone-oriented layout:

- A bottom control panel with touch targets of at least 44 CSS pixels, safe-area padding, and a scrollable layout for short or landscape screens.
- **看原文** reveals the note; **恢复聚焦** restores the effect. No press-and-hold is needed on mobile.
- **调节** opens the panel with presets, position and clear-area height. **更多调节** contains blur, edge opacity and the two transitions. The area above the panel remains a live preview.
- Wider and gentler mobile defaults: position 44%, clear height 38%, blur 12px, edge fade 62%. Very short viewports use a minimum readable band where space allows.
- Mobile uses eight blur layers; desktop keeps fourteen. This reduces layer count, but is not a measured frame-rate or battery-life claim.
- Focusing the note editor automatically pauses the effect and hides the floating controls. This can be turned off with **编辑时暂停** in settings.
- Phone/tablet and desktop settings use separate profiles within `data.json`. Updating does not reset your desktop settings. Devices of the same category share a profile when plugin settings are synced; simultaneous offline edits are subject to your sync provider's conflict handling.

中文：手机端点击正文底部“调节”。默认清晰区更宽、位置稍靠上；常用参数直接调整，其余参数展开“更多调节”。“看原文 / 恢复聚焦”一键切换，输入时默认暂停效果。手机和电脑参数分开保存。

**Updating an existing iPhone installation:** replace `main.js`, `manifest.json`, and `styles.css` together, preserve `data.json`, and restart Obsidian. If your vault/plugin files are synced from a computer, wait for those three files to finish syncing first. Obsidian Sync users must enable the installed-community-plugin sync option as appropriate. The desktop-only error remains if the phone still has the old manifest. Minimum app version: 1.13.7.

**Verification boundary:** responsive Chromium checks covered 320×568, 390×844, 430×932 and 844×390, plus dark mode, settings persistence and edit/reveal interactions using the actual plugin code with a mock Obsidian host. Physical iPhone/Android touch, keyboard, safe-area behavior and GPU performance have not been verified. This release is ready for mobile trial, not a claim of real-device acceptance.

## Controls

Click **调节** in the upper-right corner on desktop, or at the bottom on mobile, or open this plugin's settings. Search for **渐变聚焦** in the command palette to toggle the effect, open the panel, or restore defaults.

| Control | Meaning |
| --- | --- |
| 清晰区位置 | Vertical position of the clear area, as a percentage of the viewport |
| 清晰区高度 | Height of the clear area, as a percentage of the viewport |
| 上方过渡 | Upper transition length; 100% extends to the top edge |
| 下方过渡 | Lower transition length; 100% extends to the bottom edge |
| 模糊强度 | Maximum blur strength near the edges |
| 边缘遮盖 | How much content is faded out near the edges; set to 0 for blur alone |

Presets: **轻柔** (gentle), **标准** (standard), **强聚焦** (strong). Hold **按住看原文** to reveal the original text temporarily. **恢复默认** resets the settings.

中文：点击正文右上角“调节”，可以边滚动边调整。上方、下方过渡越大越柔和；边缘遮盖设为 0 可只保留模糊。按住“按住看原文”可临时看清全文，左侧图标可开关效果。

## Known limitations

- Intermittent flicker has been reported while scrolling and while idle. Rendering optimizations are included, but this issue is not conclusively resolved.
- No extra scrolling space is added at the beginning or end of a note. Use the reveal button or toggle the effect when edge content cannot reach the clear area.
- The effect applies to the active Markdown pane. PDF and Canvas are not supported.
- Windows, Linux, pop-out windows, multi-pane layouts, and other themes have not been comprehensively tested.
- This is a visual reading aid. Text remains selectable and is not securely redacted.

中文：偶发闪烁仍需继续观察，1.0.0 不代表该问题已彻底解决。文章首尾没有额外滚动留白，必要时临时关闭效果。

## Privacy

The plugin makes no network requests, collects no telemetry, and does not modify notes. It only saves its settings in the plugin's own `data.json` file.

## Development

`main.js` is the source and the distributable: plain CommonJS using the Obsidian API, with no build dependencies. Edit `main.js` and `styles.css`, copy them to a development vault's plugin folder, and reload the plugin.

Syntax check:

```sh
node --check main.js
```

Report problems through [GitHub Issues](https://github.com/hana11000/obsidian-gradient-focus/issues). Include your Obsidian version, operating system, theme, view mode, and reproduction steps. Please use a non-sensitive sample note for screenshots.

## License

[MIT](LICENSE) © 2026 Wang2.
