# logseq-graph 只读集成 — 基于最新 main 的开发计划

> 状态：**计划待确认（D1–D4 需拍板）**。本文只定设计与任务，不含实现。
> 基线：`main` = `8dc0dc5`（WXT 2.0 架构）。工作分支：`feat/logseq-graph-readonly`（从最新 main 切出）。
> 旧分支 `feat/logseq-graph-readonly-viewer` 基于旧基点（esbuild 时代），仅作参考，不再在其上开发。

## 1. 目标与非目标

**目标（本 fork 的差异点）**
1. 面向 `logseq-graph`（file-first、`POST /api`、默认 `127.0.0.1:8765`、必须 Bearer token），而不是必须拉起 Logseq 桌面端。
2. 能**通过 API 渲染完整页面**：页内就地渲染 + 一个独立的「Graph 浏览器」扩展页。
3. 点击页面/块不再依赖 `logseq://` 拉起桌面端，改为在扩展内打开只读页面视图。
4. 保持只读（是否全仓只读见 D1）。

**非目标**
- 不做 Logseq DB 版 / org-mode（`logseq-graph` 也不支持）。
- 不改 `logseq-graph` 服务端（另一个仓库）；本仓库只消费它。
- 不重写 main 已有能力（搜索卡片、召回、高亮、剪藏、sidepanel、options）。

## 2. 最新 main 现状盘点（可直接复用）

| 能力 | 现状 | 位置 |
| --- | --- | --- |
| 构建/入口 | WXT 2.0，MV3，`background`/`content`/`options`/`sidepanel` entrypoints | `wxt.config.ts`, `src/entrypoints/*` |
| API 客户端 | 基类已按 `logseqHostName:logseqPort` 组 origin、Bearer、官方 `checkCurrentIsDBGraph` 探测 | `src/entrypoints/background/logseq/client.ts` |
| 文件版服务 | search / urlSearch / getBlock / recall / changeBlockMarker；分页补块 | `.../logseq/markdown/{client,service}.ts` |
| DB 版服务 | 完整一套 | `.../logseq/db/*` |
| 渲染 | `renderBlock` + `resolveBlockRefs`（`[[page]]`/`((ref))`/`#tag`）、`sanitizeHtml`(DOMPurify) | `.../logseq/tool.ts`, `src/utils/sanitize-html.ts` |
| 内容脚本 UI | WXT `createShadowRootUi` + `SidebarPanel`（召回/高亮/搜索/剪藏）、`InPageSidebar` | `src/entrypoints/content/*`, `src/components/SidebarPanel.tsx` |
| 浏览器侧栏 | `sidepanel` entrypoint，复用 `SidebarPanel` | `src/entrypoints/sidepanel/*` |
| 设置页 | react-router + shadcn/radix，页面可选 | `src/entrypoints/options/App.tsx`, `pages/*` |
| 消息协议 | `@webext-core/messaging` 强类型 | `src/types/messaging.ts` |
| 连接配置 | `logseqHostName`/`logseqPort`/`logseqAuthToken`（默认 `localhost:12315`） | `src/utils/storage.ts`, `utils/connection.ts` |
| 测试 | vitest 单测；integration/e2e 会**拉起真实 Logseq 桌面端** | `tests/**`, `vitest*.config.ts` |

**关键缺口：main 没有「整页渲染」**——没有任何 `getPageBlocksTree` / `getPageSnapshot` / 完整页面视图；也没有 `logseq-graph` 相关代码/端口/夹具。

## 3. 差距分析

| # | 需求 | main 现状 | 需要做的事 |
| --- | --- | --- | --- |
| G1 | 连 `logseq-graph` | 默认 `localhost:12315`；无 8765/token 引导 | 默认改 `127.0.0.1:8765`；连接页提示 token 必填（D4） |
| G2 | 文件版探测 | 基类用官方 `checkCurrentIsDBGraph`（logseq-graph 返回 false ✅）；`markdown/client.ts` 里另有旧的 `check_current_is_db_graph`（logseq-graph 上 404） | 去掉/统一旧探测；`getLogseqService` 走基类探测并缓存 |
| G3 | 整页读取 | 无 | 新增 `getPage` + `getPageBlocksTree` + `getPageSnapshot`（回退 tree）、`getPageView(name)`（含 `page_candidates` 别名解析，`logseq-graph` 有、官方无→做可选守卫） |
| G4 | 页内整页渲染 | 只有 SidebarPanel（召回/搜索列表），无整页大纲 | 新增页内 PageViewer（WXT shadow UI），渲染标题/属性/depth 大纲/链接/锚点（D2） |
| G5 | 独立 Graph 浏览器 | 无 | 新增 entrypoint/路由：页面列表+搜索+标签+整页渲染+URL 同步（D3） |
| G6 | 去 `logseq://` | 渲染器输出 `logseq://`，由 background 拉起桌面端 | 页面/块链接改为扩展内导航（打开 PageViewer / Graph 页），不再拉起桌面端 |
| G7 | 只读边界 | main 含剪藏/改标记/DB 写入 | D1 决定：保留（仅新增功能只读）或整仓移除写 |
| G8 | 测试 | e2e 依赖真实桌面端 | 增加「假 logseq-graph HTTP 夹具」（node 本地 server）跑集成；单测 mock fetch |

## 4. 目标架构（基于 main 的落点）

- **API 层**（`src/entrypoints/background/logseq/`）
  - `markdown/client.ts`：+ `getPage(identity)`, `getPageBlocksTree(name)`, `getPageSnapshot(name)`（失败返回 null）。
  - `markdown/service.ts`：+ `getPageView(name): PageView | null`（先 `getPage`；404 用 `App.search.page_candidates` 解析 alias 重试；块用 snapshot（更干净）否则 tree）。
  - `interfaces.ts` / `src/types/logseqBlock.ts`：+ `PageBlock`/`PageProperty`/`PageView` 类型。
  - `tool.ts`：探针统一、缓存；渲染器链接改为 `data-logseq-page/block`（不再 `logseq://`）；复用 `renderBlock`/`resolveBlockRefs`。
- **消息层**（`src/types/messaging.ts`）：+ `'logseq:pageView'`（按 name/block 取 `PageView`）、`'logseq:allPages'`/`'logseq:searchPages'`（Graph 页用）、`'app:openGraph'`。
- **页内页面视图**（`src/entrypoints/content/`）：新增 `PageViewer.tsx` + `startPageViewer(ctx)`，用 `createShadowRootUi`（同 `InPageSidebar`），`ThemeProvider` + 复用 UI；由点击 `[data-logseq-page]`/`[data-logseq-block]` 触发（替换拉起桌面端）。
- **独立 Graph 浏览器**：`src/entrypoints/graph/`（WXT 新 HTML entrypoint）或 options `/graph` 路由（D3），复用 `sanitizeHtml`/`renderBlock`/UI 组件，`?page=&q=` 同步。
- **连接/设置**：`utils/connection.ts` 默认改 8765；options 连接页加 token 必填提示 + “打开 Graph 浏览器”入口。

## 5. 分阶段任务（含写作用域/依赖/验收）

| ID | 任务 | 写作用域 | 依赖 | 验收 |
| --- | --- | --- | --- | --- |
| P0 | 基线与脚本：`pnpm install`(WXT/lockfile)、跑通 `pnpm typecheck`/`test`/`build` 基线 | — | — | 基线命令结果记录 |
| P1 | 整页读取 API 层（G2/G3） | `background/logseq/{client,markdown/client,markdown/service,interfaces,tool}.ts`、`types/logseqBlock.ts`、新增 `markdown/*.test.ts` | P0 | 单测：getPageView/别名/404；tsc |
| P2 | 页内 PageViewer（G4/G6） | `entrypoints/content/PageViewer.tsx`、`content/index.tsx`、`components/*`(复用)、`types/messaging.ts` | P1 | 组件测试 + e2e(夹具)；无 `logseq://` 触发 |
| P3 | 独立 Graph 浏览器（G5） | `entrypoints/graph/**` 或 `options/pages/graph-page.tsx`、`wxt.config.ts`(若新入口)、`types/messaging.ts` | P1 | 构建产物含 graph；组件测试；列表/大页上限 |
| P4 | 连接默认值与入口（G1/D4） | `utils/storage.ts`、`utils/connection.ts`、`options/pages/connection-page.tsx`、入口按钮 | P0 | 默认 8765；连接页/冒烟 |
| P5 | 测试夹具与总验收（G8） | `tests/support/fake-logseq-graph.ts`、`tests/integration/*` | P1–P4 | typecheck/test/build/check:manifest 全绿 |
| PR | **整仓纯只读重构（D1）**：移除 clip/写入/changeBlockMarker/DB 写/contextMenus/clip command/QuickCapture + 更新受影响测试 | 多文件（见 §7 清单） | P0 | `grep` 写 RPC/clip = 0；vitest 全绿 |
| R | 独立 reviewer 对抗评审（多轮） | 只读 + `docs/review-*.md` | P1–P5,PR | Blocker=0，Major 修完 |

> 说明：任务可并行（P1 先定接口后，P2/P3 并行；P4 独立）。每个实现任务由 subagent 完成、独立 reviewer 审核、lead 集成把关——沿用上一轮流程。

## 6. 质量门禁（每个任务/合并前）

```bash
pnpm install
pnpm typecheck          # tsc --noEmit
pnpm test               # vitest run
pnpm build              # wxt build
pnpm build:firefox
pnpm check:manifest     # 每个浏览器产物文件齐全
grep -rn "logseq://" src                # 视 D1/D6 目标为 0
grep -rE "logseq\.(Editor|Graph)\.(appendBlock|updateBlock|createPage|...)" src   # 视 D1
```
外加：独立 reviewer 报告（`docs/review-*.md`）Blocker=0；`git diff` 无越界。

## 7. 决策（已确认）

- **D1 = 整仓纯只读**：移除剪藏（`QuickCapture`/`use-clip-actions`/`clip*` 消息/contextMenus/clip command）、`changeBlockMarker`、DB 写方法，以及所有写 RPC 调用；`SidebarPanel` 去掉 Clip 区块。新增能力全部只读。
- **D2 = 保留 SidebarPanel + 新增独立 PageViewer 抽屉**：SidebarPanel 只做只读清理（保留 recall/高亮/搜索），整页渲染走一个新的独立抽屉（WXT `createShadowRootUi`，与 `InPageSidebar` 并存）。
- **D3 = 独立 entrypoint `graph`**：新增 WXT HTML entrypoint `src/entrypoints/graph/`，`graph.html` 新标签打开；页面列表 + 搜索 + 标签 + 整页渲染 + URL 同步。
- **D4 = 保留 `localhost:12315` 默认**：不改默认端口；连接页显式提示「logseq-graph 默认 `127.0.0.1:8765`，需填 token」。

### D1 只读移除清单（跨模块）
`QuickCapture.tsx`、`hooks/use-clip-actions.ts`、`background/clip*.ts`、`background/contextMenus*`、`commands.clip`、消息 `logseq:clipWithSelection`/`logseq:clipPage`/`content:quickCapture*`、`LogseqBlock` 的标记切换、`markdown|db` 的 `changeBlockMarker`/`appendBlock`/`updateBlock`（及 clients 写方法）、DB 写方法、相关测试。验收：`grep` 写 RPC/`clip` 全仓为 0（仅保留纯展示/只读）。

## 8. 风险

- **main 是 WXT 新架构**：需先 `pnpm install`（新依赖），旧分支代码不能直接 cherry-pick，需按新结构重写（本计划即为此）。
- **e2e 依赖真实桌面端**：本 fork 面向 logseq-graph，需要新增「假 logseq-graph HTTP 夹具」才能自动化验证；否则只能单测 mock + 手动冒烟。
- **别名/幽灵页**：logseq-graph 的 alias 只是拼写、非页面实体，需用 `page_candidates` 解析；tag/幽灵页不可打开。
- **图片资源**：logseq-graph 不提供 graph 附件静态服务，图片仍无法显示（沿用只读限制）。

## 9. 执行结果（已完成，第二轮独立评审 PASS）

基座：最新 `main`（`8dc0dc5`）→ 分支 `feat/logseq-graph-readonly`。

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| 基座/契约 | ✅ | pnpm12 配置迁移、PageView 类型、计划（`bdfa2d0`） |
| A1 整页读取 API | ✅ | `getPage`/`getPageBlocksTree`/`getPageSnapshot`/`getPageView`；404/别名/snapshot→tree/属性/renderBlock html |
| B 前端只读清理 | ✅ | 移除 clip/QuickCapture/contextMenus/命令/标记写 UI；SidebarPanel 保留搜索/高亮/召回 |
| A2 后端去写 | ✅ | 删除 appendBlock/updateBlock/changeBlockMarker/DB 写；写 RPC grep=0 |
| C 页内 PageViewer | ✅ | WXT shadow 单例抽屉、`logseq:pageView` 消息、Esc/Back/Refresh、站内导航、块锚点 |
| D Graph 浏览器 | ✅ | 独立 `graph.html` entrypoint、`logseq:allPages`、列表300/块1500上限、URL 同步、options 入口 |
| P5 假服务夹具 | ✅ | `tests/support/fake-logseq-graph.ts` + 真实 HTTP 测试（不依赖桌面端） |
| R2 终审 + 复验 | ✅ | 第一轮 FAIL(B-1) → 修复搜索卡片桌面逃生路径 → 第二轮 PASS（Blocker 0/Major 0） |

**门禁（最终）**：`pnpm typecheck` ✅；`pnpm test` 64 files / **820 tests** ✅；`pnpm build`、`build:firefox`、edge 构建 ✅；`pnpm check:manifest` 三产物 ✅；`src` 写 RPC/写方法 grep=0；三浏览器产物均含 `viewer` 相关能力与 `graph.html`；`logseq://` 仅保留为渲染 href（点击全部由扩展内 opener 拦截，拉桌面端路径已删除）。

**已知后续项（非阻断）**：m-2 clip 死配置/模板 UI 残留（无写 RPC）、n-2 `data-logseq-*` 死分支、app:openPage 的 URL 收紧、连接页对 logseq-graph(`127.0.0.1:8765` + token) 的提示文案。
