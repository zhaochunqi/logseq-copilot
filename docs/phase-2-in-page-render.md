# Phase 2 — render a Logseq page inside the current web page (read-only)

Phase 1 gave the extension an API-only, read-only way to show a page in its own
tab (`viewer.html`). Phase 2 keeps that and adds the operation the user actually
wants while browsing: **click a page/block in the search card and render the whole
page right there, in a drawer over the current web page, still read-only.**

Phase 1's boundary still holds: no insert / append / update / delete, no clip
capture, no marker toggle. Phase 2 only adds a presentation surface.

## UX

- Trigger: clicking a `[[page]]` / block link in the in-page search card
  (`LogseqCopilot`, content script only). Popup keeps opening `viewer.html` in a tab.
- Presentation: a right-side drawer over the current page, with a dim overlay.
- Content: the full page — title (`originalName`), journal badge, graph name,
  collapsible page properties, the block outline by `depth`, `[[page]]`,
  `((block-ref))` and `#tag` rendering.
- Controls: close (X / Esc), back within the drawer's own page history, refresh,
  and “open full page in a new tab” (reuses the phase-1 `viewer.html`).
- Navigation inside the drawer does not touch the host page's URL or history.

## Architecture — why a Shadow DOM drawer, not an iframe

- **Style isolation**: a Shadow DOM host keeps panel CSS out of the host page and
  the host page's CSS out of the panel. No `@tailwind base` is injected into the
  host page (that reset would wreck arbitrary sites).
- **No iframe/CSP surface**: an `chrome-extension://` iframe can be blocked by a
  host page's `frame-src` CSP, so the panel is not an iframe. A Shadow DOM host
  keeps panel CSS out of the host page and the host page's CSS out of the panel.
  Inline `<style>` injection can still be limited by a strict `style-src` CSP, so
  the panel prefers constructable stylesheets (`CSSStyleSheet` +
  `adoptedStyleSheets`) and falls back to a `<style>` element; the host's own
  layout lives in a `:host` rule of that sheet rather than a `style` attribute.
- **Reuse, not rewrite**: the panel loads data with the same
  `getLogseqService().getPageView(name)` and renders block HTML with the same
  `renderBlock()` used by the tab viewer, so there is one rendering path.

### Module shape

`src/pages/content/inlineViewer/`

- `index.tsx` — the singleton controller. Exports
  `openInlineViewer(target: { page?: string; block?: string }): void` and
  `closeInlineViewer(): void`. Creates one shadow host on `document.documentElement`,
  mounts a React root inside it, and unmounts/removes on close. A second open
  replaces the current target rather than stacking hosts.
- `InlinePanel.tsx` — the React panel. Owns loading/error/not-found states, the
  internal page-history stack, toolbar, properties, outline and link handling.
- `panelStyles.ts` — a self-contained CSS string injected into the shadow root.
  No global selectors; everything scoped under `:host`.
- `model.ts` — pure, DOM-free helpers (`buildOutline(pageView)`,
  `findBlockAnchor(...)`) so they can be unit-tested in the node test environment.
- `model.test.ts` — jest tests for the pure helpers.

### Data flow

1. Click in the card → `openInlineViewer({ page })` (or `{ block }`).
2. Panel calls `getLogseqService().getPageView(page)`.
   - If only a `block` is given, resolve it with `client.getBlockViaUuid` to its
     page name + `preorder`, then load that page and anchor on the preorder.
   - `null` → “Page not found” state (aliases already resolve inside `getPageView`).
3. Panel renders `PageView.blocks` as a flat preorder outline (indent by `depth`),
   each block's markdown via `renderBlock(...).html`.
4. Links: `a[data-logseq-page]` navigates within the drawer (internal stack, no
   host `history.pushState`); `a[data-logseq-block]` scrolls/highlights, resolving
   cross-page block refs through `getBlockViaUuid`.
5. Close: unmount root, remove the host, drop listeners.

## Interface contract (frozen for the wiring task)

```ts
export function openInlineViewer(target: { page?: string; block?: string }): void;
export function closeInlineViewer(): void;
```

The content card (`src/components/LogseqCopilot.tsx`) calls `openInlineViewer`
instead of `Browser.runtime.sendMessage({ type: 'open-viewer' })`. The popup and
the background `open-viewer` handler are unchanged.

## Invariants / non-goals

- Read-only: no write RPC string anywhere; the panel never sends `open-viewer`
  for its own page navigation (only for “open in a new tab”).
- No `logseq://` anywhere.
- **No global CSS leakage**: every rule lives in the shadow `<style>`; the host
  element only carries layout (`position: fixed; z-index: 2147483647; …`).
- Cleanup: closing removes the root, the host and every listener; repeated
  open/close does not leak DOM nodes.
- Safety: block HTML comes from `renderBlock`, which (a) HTML-escapes link
  `data-logseq-*` attributes, (b) escapes raw HTML tokens so markdown cannot
  smuggle `<script>`/event attributes, and (c) allowlists link/image protocols
  (`http(s)`, `mailto:`, `#`, relative; `data:image/*;base64` for images) through
  `safeHref`. `dangerouslySetInnerHTML` is limited to that rendered block HTML.
- Performance bounds: the Graph browser renders at most 300 page-list entries and
  both page renderers show the first 1500 blocks of a large page with an explicit
  “Show all” affordance — no silent full-graph or multi-thousand-block mount.
- Accessibility: the panel is `role="dialog"` with an `aria-label`, Esc closes,
  focus moves into the panel on open.
- Performance: large pages render synchronously; the panel should note (not
  silently drop) when a page has a very large block count. No virtualization in
  phase 2.

## Open-mode setting

A user preference decides how a click in the in-page search card opens a page:

- `pageOpenMode: 'drawer' | 'tab'` in `getLogseqCopliotConfig()`, default `'drawer'`.
- `'drawer'` → `openInlineViewer(...)` (the Shadow DOM drawer below).
- `'tab'` → the existing `open-viewer` message → `viewer.html` in a new tab.
- The options page exposes a radio for this; the popup always opens `viewer.html`
  in a tab (a popup cannot host the drawer) and also gets an “Open graph browser”
  button.
- The drawer's own “Open full page” control always opens `viewer.html` in a tab.

## Standalone Graph browser page

A second read-only surface: a full chrome-extension page (`graph.html`) for
browsing the whole graph through the API, not just one linked page.

- `src/pages/graph/`: `index.html`, `index.tsx`, `GraphBrowser.tsx`,
  `graph.module.scss`, plus a small pure `model.ts` if needed.
- Layout: left rail + right content.
  - Left: a search box (reads `logseq.App.search`, lists matching page names and
    block hits) and a page list (`logseq.Editor.getAllPages`, filterable, journals
    grouped/labelled). Optional tags from `logseq.Graph.getAllTags`.
  - Right: the selected page rendered with the same `getPageView()` +
    `renderBlock()` path as the tab viewer (title, properties, depth outline,
    links, anchors). A “open in a new tab” control reuses `viewer.html`.
- URL: `graph.html?page=<name>&q=<query>` so a selection is linkable; internal
  navigation stays inside the page (`history.pushState`).
- Read-only. No `logseq://`. No writes.
- `build.mjs`: add the `src/pages/graph/index.tsx` entry and copy
  `graph.js` / `graph.css` / `graph.html` into each browser bundle. No manifest
  change is required (the page is opened by the extension itself via
  `browser.tabs.create(browser.runtime.getURL('graph.html'))`).
- Entry points to it: a popup button and an options-page link/button.

## Task board

| Task | Owner | Depends on | Scope |
| --- | --- | --- | --- |
| T8 drawer panel module | viewer-page | — | `src/pages/content/inlineViewer/**` |
| T9 open-mode config field | api-client | — | `src/config.ts` (`pageOpenMode`) |
| T10 card wiring + options + popup | decouple-ui | contract frozen | `LogseqCopilot.tsx`, `options/…`, `popup/Popup.tsx` |
| T11 standalone Graph browser | graph-browser | — | `src/pages/graph/**`, `build.mjs` |
| T12 independent review | reviewer | T8, T9, T10, T11 | `docs/phase-2-review.md` |
| Integration + gates | lead | all | review diff, run every gate, commit/push branch |

## Quality gates (must all pass before merge)

| Gate | Command / check |
| --- | --- |
| Types | `pnpm exec tsc --noEmit` — no new errors vs the recorded baseline |
| Tests | `pnpm test` — existing 9 + new `model.test.ts` all pass |
| Build | `VERSION=1.6.0 pnpm build` — Build success, viewer + content-script bundles produced |
| Read-only | `grep` for every write RPC string in `src` and in `build/` = 0 |
| No desktop link | `grep -rn "logseq://" src build` = 0 |
| Isolation | panel CSS lives only in the shadow `<style>`; no new global `@tailwind`/`body`/`div` rules in content-script CSS |
| Review | independent reviewer signs off (findings fixed or accepted) |

## Task board

| Task | Owner | Depends on | Scope |
| --- | --- | --- | --- |
| T8 panel module | viewer-page | — | `src/pages/content/inlineViewer/**` |
| T9 card wiring | decouple-ui | — (contract above is frozen) | `src/components/LogseqCopilot.tsx` |
| T10 review | reviewer | T8, T9 | `docs/phase-2-review.md` (read-only over source) |
| Integration + gates | lead | T8, T9, T10 | review diff, run every gate, commit |
