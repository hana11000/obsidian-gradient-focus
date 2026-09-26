# Changelog

## 1.1.0

- Enable iOS and Android; add an iPhone-oriented bottom panel, 44px touch targets, safe-area padding and compact/landscape scrolling.
- Add wider, gentler mobile defaults and separate mobile/desktop settings profiles with legacy desktop migration.
- Keep a live preview above the open panel, reveal the original note with one tap, and pause the effect while editing by default.
- Use eight blur layers on mobile and retain fourteen on desktop; support prefixed WebKit backdrop filters and masks.
- Preserve existing note content and desktop settings.

Validation: four settings/profile tests and responsive Chromium UI checks. Physical iPhone/Android behavior remains unverified. Intermittent flicker is still a known issue.

## 1.0.1

- Rename the manifest display name to Gradient Focus to comply with community directory naming requirements. The plugin ID and Chinese controls remain unchanged.

## 1.0.0

First public release.

- Fixed clear reading area with progressive upper and lower blur and fading.
- Six controls, three presets, temporary original-text reveal, and toggle commands.
- Automatically saved settings without modifying notes.
- Rendering optimizations that crop fully transparent blur regions and isolate the overlay's compositing layer.

Known issue: intermittent flicker may still occur while scrolling or idle. Desktop only; checked on macOS with Obsidian 1.13.7.
