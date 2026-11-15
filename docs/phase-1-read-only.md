# Phase 1 boundary — read-only

This fork of Logseq Copilot serves one goal: **render my Logseq graph inside the
browser, using only the HTTP API of [`logseq-graph`](https://github.com/xiaolutech/logseq-graph),
with no Logseq desktop app involved.**

Phase 1 is deliberately narrow. The point of writing it down is that every future
change is judged against this line: if a change needs a write, it is not phase 1.

## In scope

- Search from the extension UI (popup and the in-page search card) and read hits
  back through the API.
- A page viewer (`viewer.html`) that renders a whole page from the API: title,
  journal badge, page properties, block outline by `depth`, `[[page]]`,
  `[[page|display]]`, `#[[page]]`, `((block-ref))` and `#tag` rendering.
- Clicking any page/block link opens the viewer in a new extension tab
  (`browser.tabs.create`). No `logseq://` protocol link, no desktop jump.
- Configuration: host / port / Authorization token, targeting `logseq-graph serve`
  (default `http://127.0.0.1:8765`, Bearer token required).

## Out of scope (phase 1)

- **Every write.** Insert / append / update / remove / move blocks, create or
  delete pages and journals, upsert or remove properties, set collapsed state,
  `commitPage`. No clip capture, no quick capture, no task-marker toggle.
- The Logseq DB edition (SQLite) and org-mode graphs.
- Graph assets/images (the API does not serve graph files today).
- Multi-graph, remote access, user system.

The code enforces this: the client/service layer exposes read methods only. If a
write is ever needed again it gets added explicitly in phase 2, not kept dormant.

## API contract used (logseq-graph `POST /api`)

Request: `{"method": "...", "args": [...]}` with `Authorization: Bearer <token>`.
Reads accept an optional trailing options object (`{"freshness": ...}`); this
fork does not send one, so reads answer under the server's default policy.

| Method | Used for | Shape the client relies on |
| --- | --- | --- |
| `logseq.App.checkCurrentIsDBGraph` | edition probe (cached) | boolean; `false` → file graph |
| `logseq.App.getAppInfo` | version in the options page | `{version, supportDb}` |
| `logseq.App.getUserConfigs` | journal date format | `preferredDateFormat` |
| `logseq.Editor.getCurrentGraph` | graph name | `{name, path, url, pages, blocks}` |
| `logseq.Editor.getPage` | page metadata | `{name (folded), originalName, uuid, id, journal?, journalDay, properties}`; 404 when missing |
| `logseq.Editor.getPageBlocksTree` | fallback block tree | flat preorder: `{blocks:[{page, preorder, depth, marker, text, selector}]}` |
| `logseq.Graph.getPageSnapshot` | primary viewer read | `{exists, version, properties, blocks}` (same flat preorder shape, no `id::` line in text) |
| `logseq.Editor.getBlock` | read one hit / block ref | `{uuid, content, page:{name,uuid,id}, marker, format, block:{preorder, selector}}` |
| `logseq.App.search` | search UI + alias resolution | `{blocks:[{block/uuid, block/content, block/page}], pages: string[], page_candidates:[{name, via, alias}], has-more?}` |
| `logseq.DB.q` | URL search from the current tab | array of `{uuid, content, page:{name, uuid, id}, ...}` |
| `logseq.showMsg` | connection check | `"notification"` (silently accepted) |
| `logseq.Editor.getCurrentPage` | *not used* (always `null` in a headless server) | — |

Implementation notes pinned by this contract:

- `getPageBlocksTree` / `getPageSnapshot` answer **flat preorder with `depth`**, not
  a nested tree. `marker` is the bullet/heading marker (`-` / `###`), *not* a task
  state; the viewer derives a task state from the text prefix when present.
- `getPage` answers both the folded `name` (lowercase identity) and the
  `originalName` (file spelling); the viewer shows `originalName`.
- Alias names are spellings, not pages. `getPageView` retries through
  `App.search`'s `page_candidates` (`via: "alias"`) to land on the declaring page.
- Blocks without `id::` only have an **ephemeral** identity minted by the index; a
  page reprojection invalidates it. The viewer falls back to a block's `preorder`
  when an anchor's ephemeral id has gone stale.

## Acceptance

```bash
pnpm exec tsc --noEmit          # no new errors over the pre-change baseline
pnpm test                        # jest
VERSION=1.6.0 pnpm build         # esbuild + bundles for chrome/edge/firefox
grep -rn "logseq://" src         # must be empty
```

The extension is loaded unpacked from `build/chrome` (or `build/firefox`).
