# R2 全量最终评审

评审基线：`feat/logseq-graph-readonly`，HEAD `d2aa650`。本评审只写本报告，未修改源码、未提交 commit。

## Blocker

### B-1 搜索卡片仍可拉起 Logseq 桌面端

- **证据**：`src/entrypoints/content/index.tsx:140` 对搜索卡片 shadow root 调用 `openLogseqLinksFromBackground(searchEngineUi.shadow)`，未传入页内 viewer/Graph opener。默认 opener 定义于 `src/utils/logseq-links.ts:21-32`，发送 `logseq:openLink`；后台 `src/entrypoints/background/index.ts:142-150` 校验后执行 `browser.tabs.update(tabId, { url: data.url })`。搜索卡片的页面/块链接由 `src/components/recall/RecallCard.tsx:43-45,65-68,120-121` 生成 `logseq://` href。
- **问题/影响**：用户在 Google/Bing 等搜索结果页点击 recall/search card 的页面或块，会将当前标签导航到 `logseq://`，从而触发桌面端 Logseq。该路径绕过了已修复的 InPageSidebar (`src/entrypoints/content/InPageSidebar.tsx:123-129`) 和 sidepanel (`src/entrypoints/sidepanel/App.tsx:17-33,58-64`) opener，直接违反 D1/G6「不跟桌面端交互」和“页面/块点击改为扩展内只读视图”。这是主用户入口上的可复现硬违约。
- **建议**：为搜索卡片传入与 InPageSidebar 等价的自定义 opener，将 `page`/`block-id` 解析后调用 `openPageViewer`；同时移除或废弃 `logseq:openLink` 消息及后台 `tabs.update(logseq://)` 逃生路径，确保整仓没有可达桌面端导航。

## Major

无其它独立 Major。B-1 在合并前必须修复，未修复前不能合并。

## Minor

### m-1 非 404 API 错误被伪装成“页面不存在”

- **证据**：`src/entrypoints/background/logseq/markdown/service.ts:41-46` 对 `getPage` 的任何非 404 错误直接 `return null`；`src/entrypoints/background/index.ts:38-51` 又捕获所有错误并返回 `null`。`src/components/PageViewerPanel.tsx:102-105` 因此把网络、401、500 等连接/鉴权错误显示为 `Page not found.`。
- **影响**：用户无法区分页面确实不存在与 token/服务不可用，排错信息丢失。
- **建议**：仅将明确 404 转为 null；非 404 错误保留可读的 `LogseqError`，由消息层返回错误状态或让 viewer 展示连接/鉴权错误。

### m-2 只读清理后仍保留大量剪藏配置和用户可见剪藏文案

- **证据**：`src/utils/storage.ts:437-452,468-531` 保留 `clipNoteLocation`/`clipNoteCustomPage`/`clipNoteTemplate` 读写及更新；`src/entrypoints/options/pages/template-edit-page.tsx:20-137`、`src/entrypoints/options/pages/templates-index-page.tsx:25-33`、`src/entrypoints/options/components/templates-sidebar.tsx:137-138` 仍提供剪藏模板 UI；`src/entrypoints/background/upgrade.ts:58-103` 仍迁移旧剪藏配置；`src/utils/content-events.ts:20-21` 仍定义 `clipFailed`；`src/hooks/use-page-recall.ts:19` 和 `src/utils/utils.ts:64-76` 仍保留剪藏语义。
- **影响**：D1 要求的 `clip` 全仓清理未达到（源码中仍有 clip），并留下无剪藏执行器支撑的死配置/误导 UI。虽然当前未发现写 RPC，但不符合“整仓纯只读”的清理验收。
- **建议**：删除剪藏模板/迁移/事件/文案，或明确将其隔离为不再暴露且不含写入能力的兼容迁移代码，并补充 grep 门禁。

### m-3 `graph.html` 对所有网页开放的暴露面需要重新确认

- **证据**：`wxt.config.ts:52-57` 将 `graph.html` 以 `matches: ['<all_urls>']` 加入 `web_accessible_resources`；三种构建 manifest 均实际包含该规则。
- **影响**：任意网页都可以导航/嵌入扩展 Graph 页面，诱导扩展读取并渲染用户 Graph 数据（虽受跨源 DOM 隔离，网页不能直接读取 iframe DOM）。
- **建议**：确认 `window.open` fallback 是否确实需要 WAR；优先通过后台 `tabs.create` 打开扩展页并缩小 WAR 暴露范围，或在安全说明中明确接受该设计。

### m-4 PageViewer 有长期监听器/无界历史增长

- **证据**：`src/entrypoints/content/PageViewer.tsx:64-65,119-123` 的 `history` 无上限；`src/entrypoints/content/PageViewer.tsx:205-209` 通过 `ctx.addEventListener(window, 'keydown', ...)` 注册 Escape 监听，但关闭 drawer 时 `close()` (`:67-73`) 不注销该监听。
- **影响**：长时间反复导航会积累 history；页面生命周期内保留监听器，造成轻微内存/行为残留。
- **建议**：限制 history 长度，并在 viewer 生命周期销毁时注销 window listener；补充重复打开/关闭测试。

## Nit

### n-1 文案仍声称支持剪藏

- **证据**：`wxt.config.ts:38` 和 `package.json:4` 的描述仍为 “Clip text and links into your graph.”。
- **影响**：商店/扩展元数据与已移除能力不一致。
- **建议**：改为只读搜索、侧栏和 Graph 浏览器描述。

### n-2 渲染器未输出 data 属性，组件保留死分支

- **证据**：`src/entrypoints/background/logseq/tool.ts:156-159,177-179,192-195` 仅输出 `logseq://` href；`src/components/PageViewerPanel.tsx:40-53` 和 `src/entrypoints/graph/GraphBrowser.tsx:246-251` 仍包含 `data-logseq-page`/`data-logseq-block` 分支，实际主要依赖 legacy `logseq:` href handler。
- **影响**：协议路径重复、维护者容易误判点击处理是否覆盖所有渲染结果。
- **建议**：统一输出并消费 `data-logseq-*`，或删除未使用分支并保留单一安全导航路径。

## 核对结果

### 只读不变量

- 未发现 `appendBlock`、`updateBlock`、`changeBlockMarker`、`upsert*`、`removeBlock` 或 `logseq.Editor/Graph` 写 RPC 调用。非测试源码中的 RPC 仅为读取方法。
- 未发现 `QuickCapture`、`contextMenus`、`commands.clip` 或旧 clip 消息；但仍有 m-2 所列剪藏配置/文案残留。
- messaging 中没有 Graph/块写消息；仍保留 `logseq:openLink`（它是桌面交互问题，不是 Graph 写消息）。

### A1 整页读取

`getPageView` 已实现 404 别名 `page_candidates` 解析、snapshot 优先/树回退、properties 合并及 `renderBlock` HTML；`page-view.test.ts` 和真实 HTTP fixture 测试覆盖这些路径。非 404 错误处理见 m-1。

### C PageViewer

WXT shadow 单例、block→page 消息解析、DOMPurify、属性/深度渲染、aria、Escape/Back/Refresh/Open full、站内 `logseq:` 导航均存在；监听器/历史问题见 m-4。所有生产 `dangerouslySetInnerHTML` 均经过 `sanitizeHtml`：`PageViewerPanel.tsx:140`、`LogseqBlock.tsx:87`、`LogseqPageContent.tsx:40`、`GraphBrowser.tsx:55-57`。

### D Graph 页

`graph.html` 已产出；`logseq:allPages`、300 页上限、1500 块上限、URL `pushState`/`popstate` 同步及 sanitize 均存在。Graph 页点击 `logseq:` 会 `preventDefault` 并站内导航 (`GraphBrowser.tsx:240-256`)，未发现写或桌面 opener。WAR 暴露面见 m-3。

### P5 fixture

`tests/support/fake-logseq-graph.ts:260-302` 确实启动本地 HTTP `POST /api`、校验 Bearer、实现 404/401/方法错误；`logseq-graph-http.test.ts:21-93` 通过真实 `fetch` 配置 ephemeral port/token，验证页面、别名、渲染、snapshot/tree。fixture 稳定且不是纯 mock；但仓库没有真实 logseq-graph schema 对照文档，`getAllPages` wire shape 仍依赖 fixture 假设。

## 门禁与范围

- `pnpm typecheck`：通过。
- `pnpm test`：通过，64 个 Test Files、830 个 Tests。
- `pnpm build`：通过，`.output/chrome-mv3/graph.html` 存在。
- `pnpm build:firefox`：通过，`.output/firefox-mv3/graph.html` 存在。
- Edge 构建：通过，`.output/edge-mv3/graph.html` 存在。
- `pnpm check:manifest`：通过，Chrome/Edge/Firefox 三个产物文件均存在。
- `git log --oneline -12`：HEAD 为 `d2aa650 feat(graph): standalone read-only graph browser page`，其后依次包含 PageViewer、A2、P5、B、A1 合并/提交；评审期间工作树无源码越界修改，仅新增本报告。

## 最终结论：FAIL

构建、类型和测试门禁全部通过，A1/C/D/P5 主体实现基本完整；但 **B-1 搜索卡片仍可通过 `logseq:openLink` 将用户带回桌面端**，直接违反本 fork 的核心“整页纯只读、无桌面端交互”目标。修复 B-1（并建议一并处理 m-1/m-2）后再重新评审，未修复前不得合并。

数量：Blocker 1，Major 0，Minor 4，Nit 2。
