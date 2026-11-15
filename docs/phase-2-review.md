# Phase 2 独立代码评审

评审对象：feat/logseq-graph-readonly-viewer 工作区改动。结论基于实现与设计对照、只读扫描、构建/测试/类型检查。

## Blocker
无。

## Major

### M1. 原始 HTML 未净化，存在注入执行风险
**证据：** src/pages/content/inlineViewer/InlinePanel.tsx:202-218；共享渲染器 src/pages/logseq/tool.ts:165-185；Graph Browser 同样注入 src/pages/graph/GraphBrowser.tsx:296-300。
**问题/影响：** 两处 dangerouslySetInnerHTML 均只接收 renderBlock 结果，满足来源限制；但 marked.parse 未禁用或净化原始 HTML（tool.ts:172-182）。Logseq block 可包含事件属性或危险协议链接；用户在任意宿主页打开抽屉时，这些内容会进入 DOM。自定义 data-logseq-page/block renderer 对属性值有 HTML 转义（tool.ts:59-60,89-90,114-116），但不能净化原始 HTML。
**建议：** 对渲染 HTML 应用严格 allowlist sanitizer，删除事件属性及危险协议，或禁用原始 HTML；补充恶意 HTML、javascript: 链接测试。

### M2. Shadow DOM 内联样式在严格 style-src CSP 页面可能失效
**证据：** src/pages/content/inlineViewer/index.tsx:7 使用内联 style 元素；host 布局也通过 host.style.cssText 设置。设计文档 docs/phase-2-in-page-render.md:23-32 将 Shadow DOM 描述为无 CSP 依赖。
**问题/影响：** Shadow DOM 并非绕过宿主页样式策略的保证。严格 CSP 可限制内联样式，导致抽屉无布局或 host 定位失效，破坏核心页面内打开功能。
**建议：** 在严格 CSP 站点做验证；评估 CSSStyleSheet/adoptedStyleSheets，并验证目标浏览器和 CSP 行为；不可用时明确回退 tab viewer。修正文档中无 CSP 依赖的绝对表述。

### M3. Content script 注入全局 Tailwind Preflight，污染宿主页
**证据：** src/pages/content/index.module.scss:1-2 显式引入 @tailwind base；构建产物 build/chrome/content-script.css 在约第 119 行含 `*, ::before, ::after` 的全局 Tailwind preflight。
**问题/影响：** 该 CSS 作为 content-script.css 注入所有宿主页，通用 reset 会修改宿主页所有元素的 CSS 变量、box-sizing、border 样式等；这正违反设计文档 docs/phase-2-in-page-render.md:25-27、81-82 的隔离要求。此前只检查 html/body 选择器会漏掉 `*`。**归属说明：** 这条规则在 HEAD 基线的 src/pages/content/index.module.scss:2 已存在，本次 diff 没有引入它；但指定的当前构建产物仍含全局 preflight，故样式隔离门禁仍失败。
**建议：** 不要把 Tailwind base 放在 content-script 入口；移除该入口的 base 或把所有规则严格限制在扩展根容器下，并重新扫描生成产物中的 `*`、`::before`、`::after` 等选择器。

### M4. 全量页面列表和整页 blocks 同步渲染会卡顿
**证据：** src/pages/graph/GraphBrowser.tsx:63-69 无参数拉取并保留所有页面；:164-167 每次筛选遍历全集；:264-272 将全部页面映射为按钮。整页同步渲染见 :296-300；抽屉同步渲染见 src/pages/content/inlineViewer/InlinePanel.tsx:201-219。
**问题/影响：** 约 14,000 页图会创建大量 React 节点和 DOM，产生明显长任务及内存压力；单页数千 blocks 会同步解析 Markdown 并挂载全部内容，可能冻结 UI。抽屉也没有大页提示，违反设计文档 docs/phase-2-in-page-render.md:90-92 的明确要求。
**建议：** 页面列表实现搜索优先、结果上限并提示，或虚拟化；大页至少展示块数与性能提示，并考虑分批渲染，避免默默同步渲染整页。

## Minor

### m1. 模态抽屉缺少焦点循环和关闭后焦点恢复
**证据：** src/pages/content/inlineViewer/InlinePanel.tsx:28-35 仅聚焦一次并监听/清理 Escape；:121-135 设置 dialog、aria-modal、aria-label。
**影响：** Tab 可移出 aria-modal 对话框至宿主页；关闭时焦点没有回到打开前的元素。
**建议：** 保存并恢复原活动元素，并实现焦点循环或使用可靠的 dialog 管理方案。

### m2. 抽屉的 Open full page 丢失当前 block 锚点
**证据：** src/pages/content/inlineViewer/InlinePanel.tsx:158-162 仅发送 page。
**影响：** 从 block 链接进入或跳转后打开完整页，会落到页面顶部。
**建议：** 若 viewer 接受当前 anchor 格式，则同时传递 block；否则明确控件只打开页面顶部。

## Nit
无。

## 按项核查
1. **只读不变量：通过。** 指定写 RPC 与 logseq:// 对 src 和 build 扫描均无匹配。
2. **样式隔离：部分通过，有两项 Major。** Node 选择器断言解析 panelStyles 的 52 条规则，无未以 :host 或 class 作用域开头的选择器。但 build/chrome/content-script.css（35,695 bytes）含 Tailwind 全局 Preflight `*, ::before, ::after`，详见 M3；Shadow DOM 内联样式仍有 CSP 风险，详见 M2。
3. **Shadow DOM：通过，见 Minor。** 抽屉的块定位使用 ref.current?.querySelector（InlinePanel.tsx:75-77,108-110）；初始锚点滚动并高亮 3 秒（:69-83）；重复 open 先 close，卸载 root 并移除 host（index.tsx:7-8）；Escape listener 随 effect cleanup 移除（InlinePanel.tsx:28-35）。
4. **XSS：需修复，见 M1。** dangerouslySetInnerHTML 仅用于 renderBlock 产物，data-* 自定义链接属性转义，但原始 HTML 未净化。
5. **接线：通过。** 默认 drawer：src/config.ts:14-30；tab 分支发送 open-viewer：src/components/LogseqCopilot.tsx:56-70；options 读取/保存设置：src/pages/options/components/OpenMode.tsx:24-35；Popup 与 Options 使用 runtime.getURL(graph.html)：src/pages/popup/Popup.tsx:40-45、src/pages/options/components/OpenMode.tsx:38-40；build 新增 graph entry 和 graph.html/JS/CSS：build.mjs:23-32,82-98；viewer 由既有 background handler 生成：src/pages/background/index.ts:26-36。drawer 的 page?/block? 调用契约一致。
6. **性能：不通过，见 M4。** Graph Browser 全列表与两处长页均同步渲染。
7. **门禁：** VERSION=1.6.0 pnpm build 成功；pnpm test 通过，2 suites、11 tests；pnpm exec tsc --noEmit 失败，共 33 条诊断。用 git archive HEAD 基线副本运行同一检查，文件与错误类型/数量相同；LogseqCopilot 行号变化为本次 diff 的行移位，未发现新增 TS 错误。基线运行期间 pnpm 报 ignored-build 安装警告，但仍输出相同 33 条诊断。
8. **设计一致性：** 只读、抽屉内部导航、Popup tab 行为、Graph 独立入口和共享数据/渲染路径大体符合。M2 与无 CSP 依赖描述冲突；M3 违反样式隔离要求；M4 缺少设计要求的大页提示；m1/m2 分别是不完整模态焦点管理和丢失 block 锚点。

## 总评：CONDITIONAL PASS
合并前必须解决四个 Major：M1 净化或禁用不可信原始 HTML；M2 验证严格 CSP 下可用的样式注入路径并有回退；M3 移除注入宿主页的全局 Tailwind Preflight；M4 防止全量页面列表及长页同步渲染造成明显卡顿，至少提供列表限制/搜索优先和大页提示。只读扫描、构建和测试通过；TypeScript 与 33 条既有基线错误一致。

---

## 复验（第二轮）

复验对象：修复后的工作区（新增 `src/pages/logseq/sanitize.ts`、`sanitize.test.ts` 等）。方法：逐文件阅读 + 用 marked 4.3.0 复现同一 renderer 做运行时对抗测试 + 全量门禁。仍然只读、不代改源码。

### 逐项复验结论

**M1 渲染净化 — Resolved（残余 Nit）**
- 证据：`src/pages/logseq/sanitize.ts:11-17` escapeHtml；`:34-69` safeHref（控制字符剥离 :9,41；危险协议拒绝 :46-48；data 处理 :50-52；允许协议 :54-56；`#` 片段 :58-60；未知协议拒绝 :63-65）。`src/pages/logseq/tool.ts:9` 引入；`:179-200` 覆盖 `html/link/image` 三个 renderer（html 转义，link/image 走 safeHref）；`:203` marked.parse。测试 `src/pages/logseq/sanitize.test.ts`（79 行）覆盖拒绝/放行。
- 运行时实测（同等 renderer）：`<script>` → `&lt;script&gt;`；`<img onerror=…>` → 属性被转义为文本；`[x](javascript:…)`、`JaVaScRiPt:`、引用式 `[r]: javascript:…` 都只输出文本、无 href；`![a](data:text/html;base64,…)` 被拒；`data:image/png;base64,…` 放行；https/mailto/#/相对路径放行；`[[page]]`/`((block-ref))`/`#tag` 仍生成 `data-logseq-*` 且属性已转义。链接文本内嵌 `<img onerror>` 也被转义。结论：注入面已封堵。
- 取舍说明：`cleanBlock` 高亮从 `<em>` 改为 markdown `*…*`（`tool.ts:36`），是禁用原始 HTML 的合理代价；仅当高亮文本本身含 `*`/`_` 等 markdown 元字符时渲染可能不准（Nit）。`data:image/svg\+xml;base64` 允许，但经 `<img>` 加载时不执行脚本，可接受。

**M2 CSP 样式 — Resolved（残余风险已文档化）**
- 证据：`src/pages/content/inlineViewer/index.tsx:16-26` 用 `CSSStyleSheet`+`adoptedStyleSheets`，构造/赋值失败回退 `<style>`；`:28-39` open 不再设置 `host.style.cssText`；`:host{position:fixed;…}` 移入 `panelStyles.ts:2-11`；`docs/phase-2-in-page-render.md:28-34` 已改为“内联 `<style>` 可能受严格 `style-src` 限制→优先 constructable + 回退”，不再声称 Shadow DOM 无 CSP 依赖。
- 评估：constructable stylesheet 不经 inline-style 检查，是对 M2 的合理缓解；仅“严格 CSP 且不支持 adoptable”双重失败时退化为被拦截的 `<style>`，属可接受残余。

**M3 全局 Preflight — Resolved（1 项 Minor 残留）**
- 证据：`src/pages/content/index.module.scss:2` 已删 `@tailwind base`，`:6-16` 新增 `.copilot` 作用域 box-sizing reset。重建后 `build/chrome/content-script.css`（33,266 bytes）：脚本断言 `*`/`html`/`body` 选择器 `bad=[]`，无 `@tailwind base`。
- 残留：仍有 1 个 `:root{}` 含 4 个自定义属性 `--cardShadow`/`--cardBG`/`--markerStatusHoverColor`/`--markerCheckerBGColor`（来源 `src/components/logseq.module.scss:39-46`，HEAD 既有）——会写入宿主页 `:root` 自定义属性，名字较通用理论上可碰撞，但不直接改变宿主元素样式，判 **Minor/可接受**，建议改用组件选择器。另有 1 个 `::highlight(copilot-highlight)`，是扩展为自身页面命中注册的高亮命名，属预期，可接受。

**M4 性能 — Resolved（1 项 Minor 交互缺口）**
- 证据：graph `PAGE_LIST_LIMIT=300`（`GraphBrowser.tsx:13`）+ 提示（`:287`），`displayedPages` 截断（`:178`）；`BLOCK_RENDER_LIMIT=1500`（`:14`），`displayedBlocks` 截断（`:179-181`），大页提示+Show all（`:311-315`），深锚点超限自动展开（`:160-163`）。inlineViewer `BLOCK_LIMIT=1500` + truncated/Show all（`InlinePanel.tsx:156-158,245-252`），`.notice` 样式存在（`panelStyles.ts:45-54`）。两处不再一次性渲染全量，~14k 列表渲染卡顿已消除。
- **Minor 新发现**：inlineViewer 截断到 1500 后，若锚点/block-ref 目标在 1500 之后，滚动 effect（`InlinePanel.tsx:104-117`）找不到节点会静默不滚动且不自动展开；graph 已处理（`:160-163`）而抽屉未处理，建议对齐（非阻断）。

**m1 焦点 — Resolved（1 Nit 边界）**
- 证据：`index.tsx:9,30` open 记录 `document.activeElement`，`:46-49` close 恢复；`InlinePanel.tsx:29-68` Tab 循环：`focusables()` + `ShadowRoot.activeElement` + 首尾回绕。Nit：初始焦点落在 `.panel` 容器（`tabIndex=-1`）且容器不在 `items` 内时，Shift+Tab 的判定（`:55-60`）可能移出对话框；建议把容器纳入或初始聚焦首个可聚焦项。

**m2 Open full page 传 block — Resolved**
- 证据：`InlinePanel.tsx:197-209` 同发 `page` 与 `block: anchor || undefined`；background 已有 block 分支（`background/index.ts:29-36`）。

### 回归门禁
- **类型**：当前 `pnpm exec tsc --noEmit` 为 33 条 `error TS` 行；用 `git archive HEAD` 基线复算亦为 33 条。按（文件 + TS 错误码）归一化比对：新增 0、减少 0；唯一变化是 `tool.ts` 的行号位移与 TS2345 文案（新增 `renderer:{…}` 字段进入类型消息），属允许的“文案变化”。（任务描述称基线 44 条，实测唯一 `error TS` 行为 33 条、连同多行续行合计文本 131 行；无论口径如何，相对 HEAD 无新增。）
- **测试**：`pnpm test` 3 suites / 22 tests 全通过（含 `sanitize.test.ts` 17 例、`model.test.ts` 2、`background/utils.test.ts` 3）。
- **构建**：`VERSION=1.6.0 pnpm build` Build success；chrome/edge/firefox 三套 `viewer.{js,css,html}`、`graph.{js,css,html}`、`content-script.{js,css}` 齐全。
- **只读**：指定写 RPC 与 `logseq://` 在 `src`+`build` 均 0 命中。
- **git status**：仅预期文件（新增 sanitize.ts/sanitize.test.ts、inlineViewer/、graph/、OpenMode.tsx；改 config.ts、tool.ts、content/index.module.scss、build.mjs、popup、options 等），无越界改动。

### 第二轮新发现（均非阻断）
- **Minor**：inlineViewer 深锚点（>1500 块）不自动展开，与 graph 行为不一致。
- **Minor**：`:root` 4 个自定义属性泄漏到宿主页（HEAD 既有，建议作用域化）。
- **Minor**：移除 Tailwind base 后，卡片中依赖 preflight 默认样式的元素（标题/列表/段落边距等）可能有轻微视觉变化，建议人工视觉冒烟（本轮无浏览器，未做像素验证）。
- **Nit**：高亮改 markdown `*…*`，文本含 markdown 元字符时可能渲染不准。
- **Nit**：Shift+Tab 从 `.panel` 容器可能移出对话框。

### 最终结论：PASS
四个 Major 全部 **Resolved**，两个 Minor 全部 **Resolved**；第二轮新增仅 Minor/Nit，无 Blocker、无 Major，不构成合并阻断。建议合并后跟进三项 Minor（抽屉深锚点自动展开、`:root` 属性作用域化、卡片视觉冒烟）。

---

## 第三轮复验（残余 XSS 面）

第三轮聚焦 Lead 发现的前两轮遗漏的残余注入面：`logseqLinkExt` 的**显示文本**此前未转义就拼进 `<a>`，`[[Page|<img src=x onerror=…>]]` 会执行；以及 `highlightTokens` 用未转义 query 拼 `<mark>`、且 `new RegExp(query)` 未转义。已修复，逐项复验如下（仍只读、不代改源码）。

### 逐项结论

**R1. `logseqLinkExt` 显示文本注入 — Resolved**
- 证据：`src/pages/logseq/sanitize.ts:26-31` 新增 `highlightText(text, query?)`（先用 `escapeHtml(query)` 包 `<mark>`）；`src/pages/logseq/tool.ts:95` 改为 `highlightText(escapeHtml(text), query)`，`:96` target 仍 `escapeHtml(href)`，`:97` 仅拼接已转义的 `target` 与 `fillText`。
- 运行时复现（marked 4.3.0 + 真实 `sanitize.ts` + 逐字复制 `tool.ts` 的自定义 renderer/扩展）：
  - `[[Page|<img src=x onerror=alert(1)>]]` → `<a …>&lt;img src=x onerror=alert(1)&gt;</a>`，**无可执行标签**；
  - 同输入带 query `img` → `&lt;<mark>img</mark> src=x onerror=alert(1)&gt;`，`<mark>` 为唯一标记，其余被转义，**无可执行标签**；
  - `[[My Page]]` + query `Page` → `My <mark>Page</mark>`，高亮正常。
- 结论：Resolved。

**R2. `highlightTokens` query 注入 / 正则炸裂 — Resolved**
- 证据：`src/pages/logseq/tool.ts:42-43` 新增 `escapeRegExp`；`:50` `safeQuery = escapeHtml(query)`、`:51` `new RegExp(…escapeRegExp(query)… )`；`:62` 替换为 `'<mark>' + safeQuery + '</mark>'`。
- 运行时复现：query = `"><img src=x onerror=1>`、`(`、`[`、`*`、`$&`、`\`，以及“恶意 query 真正出现在正文中”的用例，**均不抛异常、`RAW_EXEC_TAG=false`**；例如 query 命中时输出 `prefix &quot;&gt;&lt;img src=x onerror=1&gt; suffix`（全部转义）。
- 结论：Resolved。

**R3. 其它自定义 renderer 无未转义插值 — Resolved（逐行核对）**
- `tool.ts:97` logseqLink：`${target}`/`${fillText}` 均转义；`tool.ts:123` logseqBlockRef：`uuid = escapeHtml(token.text)` 用于属性与文本；`tool.ts:149` logseqTag：`escapeHtml(token.text)`；`tool.ts:199` 核心 link：`escapeHtml(safe)`、`title` 转义；`tool.ts:208` 核心 image：`escapeHtml(safe)`/`alt`/`title` 转义；`tool.ts:190-191` html renderer 整体 `escapeHtml`。未发现其它未转义 `${…}` 插值。

**R4. 既有面未回归 — Resolved**
- 运行时：`((abc-123))` 正常；恶意 `((<img src=x onerror=1>))` → 属性与文本均转义；`#mytag` 正常；`[x](javascript:alert(1))` → 仅剩 `x`；`<script>…`、`<img src=x onerror=…>`、`<svg onload=…>` 均转义为文本。`RAW_EXEC_TAG=false`。

**R5. 新增测试 — 覆盖到位**
- `src/pages/logseq/sanitize.test.ts:80-108` 新增 `highlightText` 4 例（普通匹配、空 query、恶意 query 转义、display+highlight 惰性）。`pnpm test` 26 tests 全通过（第二轮 22 → 现 26）。

### 回归门禁
- **类型**：`pnpm exec tsc --noEmit` = 33 条 `error TS`；`git archive HEAD` 基线亦 33 条；按（文件+TS 码）归一化 **only_current=∅、only_baseline=∅**，无新增。
- **测试**：`pnpm test` 3 suites / 26 tests 全通过。
- **构建**：`VERSION=1.6.0 pnpm build` Build success；chrome/edge/firefox 三套 `viewer.{js,css,html}`、`graph.{js,css,html}` 齐全。
- **只读**：指定写 RPC 与 `logseq://` 在 `src`+`build` 均 0 命中。
- **worktree**：仅预期文件改动，无越界（本轮仅写本 review 文档）。

### 第三轮新发现（均 Nit，非阻断）
- **Nit（功能/一致性）**：query 若含会被 marked 预转义或在词法阶段被消费的字符（如 `*`、`_`、`&`、`$&`、`<`/`>`），高亮往往不命中（例如 `*` 被当作强调符、`&` 已变 `&amp;`）。仅影响搜索高亮观感，不影响安全；属可接受。
- **Nit**：`html` 类型 token 的高亮会被 html renderer 整体转义，导致不显示 `<mark>`（安全优先下的有意取舍）。

### 最终结论：PASS
第三轮焦点（残余 XSS 面）**全部 Resolved**：显示文本与 query 两条注入路径均封堵，正则已转义防炸，其它自定义 renderer 无未转义插值；17 项对抗用例 0 执行、0 抛错；tsc 无新增、test/build/只读扫描/三浏览器产物全部通过。新增仅 2 项 Nit（高亮观感），无 Blocker、无 Major、无回归，判定 **PASS**。