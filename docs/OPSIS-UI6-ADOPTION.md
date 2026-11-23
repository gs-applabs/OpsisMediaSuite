# Optional Opsis.UI 6 design tokens

The renderer now imports `renderer/opsis-ui6.css`. **Existing Media Suite themes and layouts remain unchanged**: the imported file only defines `--opsis-*` variables and opt-in `.opsis-ui6-*` CSS classes. To use them in a new card:

```html
<section class="opsis-ui6-card">
  <button class="opsis-ui6-button opsis-ui6-button--primary">Open</button>
</section>
```

For an Opsis-specific theme preview, set `document.documentElement.dataset.opsisUiTheme = "midnight"` (or light, dark, forest, dawn, contrast) in that view only. Do not override the app's existing `data-theme` or its palette unless the user explicitly selects a unified theme.

**Source of truth:** `gs-applabs/Opsis.UI` branch Opsis.UI 6, `design/opsis-ui6.css`; copied here to support offline Electron builds. Refresh from the released upstream artifact after CI succeeds. These styles do not introduce runtime dependencies.
