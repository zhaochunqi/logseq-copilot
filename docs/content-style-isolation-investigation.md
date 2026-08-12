# Content Script 样式污染调查与修复记录

本文记录一次针对 Logseq Copilot Chrome 插件样式污染问题的完整排查。写作目标不是只给结论，而是把排查时每一步为什么做、用了什么工具、看到了什么证据、如何排除干扰、最终为什么选择某个修复方案讲清楚。

适合读者：对 Tailwind、CSS Modules、浏览器插件 content script 样式隔离还不熟悉，但希望知道问题是怎样被一步步定位出来的维护者。

## 1. 问题背景

这个项目是一个浏览器插件。插件会在用户浏览网页时向页面注入 content script，用来在搜索结果页旁边显示 Logseq 内容，以及提供 Quick Capture 浮动按钮。

用户反馈的风险是：

- 插件可能因为 Tailwind 或 CSS 的原因，导致正常网站显示异常。
- 需要查清楚到底是哪类样式影响了宿主网站。
- 修复前需要有一份可复盘文档，说明调查和修复思路。

这里的“宿主网站”指用户正在访问的普通网页，例如 Google、DuckDuckGo、Bing、任意文章页等。浏览器插件的 content script 与这些网页共处同一个页面环境时，如果样式没有隔离，就可能互相影响。

## 2. 初始假设

排查一开始有三个主要假设：

1. Tailwind 的 preflight reset 被注入到了所有网页，重置了网页自己的 `button`、`input`、`img`、`html`、`body` 等样式。
2. CSS Modules 只局部化了 class 名，但没有局部化某些全局选择器，比如 `:root`、`*`、`body`、`@font-face`。
3. 除 Tailwind 外，项目里可能还有直接修改宿主 DOM 样式的代码，例如 `document.body.style...`。

这三个假设都需要用代码和构建产物验证，不能只凭经验下结论。

## 3. 使用的工具

本次主要使用这些工具：

- `rg --files`：快速列出项目文件，找到 manifest、Tailwind 配置、content script 入口。
- `rg -n`：在源码中搜索关键字，例如 `@tailwind`、`:root`、`document.body.style`、`@import`。
- `sed -n` / `nl -ba`：按行阅读源码，并记录可引用的行号。
- `git status --short`：确认工作区是否已有用户改动，避免误删或覆盖。
- `git log` / `git show`：查看最近是否有样式相关历史修改。
- `pnpm run build`：尝试生成真实构建产物。
- Node + Sass + PostCSS + Tailwind 的局部编译脚本：在完整构建被 pnpm 策略拦住时，复现 content SCSS 经 PostCSS/Tailwind 处理后的 CSS 输出。

## 4. 第一层：确认插件会把 CSS 注入到哪些页面

先看 `src/manifest.json.cjs`：

```js
content_scripts: [
  {
    matches: ['http://*/*', 'https://*/*', '<all_urls>'],
    js: ['content-script.js'],
    css: ['content-script.css'],
  },
],
```

这说明：

- `content-script.js` 会进入几乎所有网页。
- `content-script.css` 也会进入几乎所有网页。
- 只要 `content-script.css` 里有全局样式，就不是“只影响插件 UI”，而是可能影响整个页面。

这是第一个关键节点。很多人以为 CSS Modules 会自动隔离所有样式，但 manifest 注入的 CSS 本质上仍然是普通页面 CSS。它参与宿主网页的正常 CSS cascade。

## 5. 第二层：找到 content CSS 的源码入口

content script 的入口是 `src/pages/content/index.tsx`。它会渲染两个东西：

- 搜索结果页里的 Logseq Copilot 卡片。
- 全站可选的 Quick Capture 浮动按钮。

这个入口使用的样式在 `src/pages/content/index.module.scss`：

```scss
@import url(../../icon.css);
@tailwind base;

.copilot {
  @apply flex flex-col w-full max-w-sm gap-2 pb-4;
}
```

这里出现了第一个强信号：

- 这是一个 `.module.scss` 文件，所以普通 `.copilot` class 会被 CSS Modules 改名。
- 但 `@tailwind base` 不是 class，它会展开成 Tailwind 的基础层 CSS。
- 如果基础层里有全局选择器，这些全局选择器不会被 CSS Modules 变成本地 class。

因此下一步必须看 Tailwind 配置和实际编译结果。

## 6. 第三层：检查 Tailwind 配置

`tailwind.config.cjs` 中有：

```js
module.exports = {
  corePlugins: {
    preflight: false,
  },
  content: ['./src/**/*.tsx'],
  theme: rem2px(defaultTheme),
  plugins: [require('@tailwindcss/typography')],
};
```

这里容易产生一个误解：“既然 `preflight: false`，那 `@tailwind base` 应该安全。”

实际不是这样。

`preflight: false` 只是关闭 Tailwind 的 normalize/reset 风格基础样式，例如常见的元素重置。但 Tailwind 仍然可能输出它自己的全局 CSS 变量初始化。也就是说，没有传统 reset，并不代表没有全局 CSS。

这一步把假设缩小了：

- 大概率不是 `button { ... }`、`img { display: block }` 这类 preflight reset。
- 但仍然可能是 Tailwind 生成的 `*`、`::before`、`::after`、`::backdrop` 全局变量污染。

## 7. 第四层：尝试完整构建

执行：

```bash
pnpm run build
```

结果没有进入正常项目构建，而是被 pnpm 11 的 build approval 策略拦住：

```text
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: core-js@3.29.0, dtrace-provider@0.8.8, esbuild@0.17.19, esbuild@0.21.5, spawn-sync@1.0.15, vue-demi@0.14.10
```

这表示完整构建暂时不可用。为了不在这里停住，需要换一个更小的验证方式：只编译 content SCSS，走同样的 Sass、PostCSS、Tailwind、CSS Modules 处理链路，观察最终 CSS。

## 8. 第五层：局部编译 content SCSS

使用 Node 脚本做局部编译。核心处理顺序与 `build.mjs` 一致：

1. Sass 读取 `src/pages/content/index.module.scss`。
2. PostCSS Modules 模拟 CSS Modules 映射。
3. Tailwind 展开 `@tailwind` 和 `@apply`。
4. 观察输出 CSS。

简化后的验证脚本逻辑如下：

```js
const sass = require('sass');
const postcss = require('./node_modules/.pnpm/postcss@8.4.47/node_modules/postcss');
const modules = require('./node_modules/.pnpm/postcss-modules@6.0.0_postcss@8.4.47/node_modules/postcss-modules');
const tailwind = require('tailwindcss');

const file = 'src/pages/content/index.module.scss';
let mapping = {};
const css = sass.renderSync({ file }).css.toString();

postcss([
  modules({ getJSON: (_, json) => { mapping = json; } }),
  tailwind,
]).process(css, { from: file }).then(result => {
  console.log(mapping);
  console.log(result.css);
});
```

这个脚本的价值是：

- 它不依赖完整 esbuild 构建。
- 它能直接回答“CSS Modules 后，Tailwind 到底输出了什么”。
- 它能证明问题不是猜测，而是最终 CSS 中真实存在的选择器。

## 9. 关键证据：Tailwind base 仍然输出全局选择器

局部编译后，CSS 开头出现：

```css
*, ::before, ::after {
  --tw-border-spacing-x: 0;
  --tw-border-spacing-y: 0;
  --tw-translate-x: 0;
  --tw-translate-y: 0;
  --tw-rotate: 0;
  --tw-skew-x: 0;
  --tw-skew-y: 0;
  --tw-scale-x: 1;
  --tw-scale-y: 1;
  --tw-ring-offset-width: 0px;
  --tw-ring-offset-color: #fff;
  --tw-ring-color: rgb(59 130 246 / 0.5);
  --tw-ring-offset-shadow: 0 0 #0000;
  --tw-ring-shadow: 0 0 #0000;
  --tw-shadow: 0 0 #0000;
}

::backdrop {
  --tw-border-spacing-x: 0;
  --tw-border-spacing-y: 0;
  ...
}
```

这就是本次调查的核心证据。

这些选择器是全局的：

- `*` 匹配宿主页面的所有元素。
- `::before`、`::after` 匹配宿主页面的伪元素。
- `::backdrop` 匹配浏览器 backdrop 伪元素。

它们会给整页元素写入大量 `--tw-*` 变量。

## 10. 为什么这些变量可能导致网站显示异常

Tailwind 的很多工具类不是直接写死所有样式，而是通过 CSS 变量组合出最终效果。

例如阴影、ring、transform、filter 相关工具经常依赖：

- `--tw-shadow`
- `--tw-ring-shadow`
- `--tw-translate-x`
- `--tw-translate-y`
- `--tw-rotate`
- `--tw-scale-x`
- `--tw-scale-y`
- `--tw-blur`
- `--tw-brightness`

如果宿主网站本身也使用 Tailwind，它自己的某些 class 可能假设这些变量由自己的 Tailwind base 初始化。插件又额外注入一份全局初始化，就可能改变变量来源、覆盖顺序或默认值。

即使宿主网站不用 Tailwind，只要它恰好使用了同名 CSS custom properties，也可能被影响。

这类问题通常表现为：

- 阴影丢失或变成默认值。
- transform 效果异常。
- ring/focus 样式异常。
- backdrop 或弹窗效果异常。
- 某些伪元素显示不符合原站设计。

## 11. CSS Modules 为什么没有救到这里

局部编译同时证明，普通 class 确实被 CSS Modules 局部化了。例如：

```json
{
  "copilot": "_copilot_ahtbk_3",
  "copilotBody": "_copilotBody_ahtbk_15",
  "configIt": "_configIt_ahtbk_19"
}
```

对应 CSS 会变成：

```css
._copilot_ahtbk_3 {
  display: flex;
  width: 100%;
  max-width: 384px;
}
```

这说明 CSS Modules 正常工作。

但 CSS Modules 的职责是局部化 class selector。它不会自动把下面这些东西包进插件根节点：

- `*`
- `:root`
- `body`
- `html`
- `@font-face`
- `::backdrop`
- `::highlight(...)`

所以，`.module.scss` 不等于“所有 CSS 都安全隔离”。

## 12. 第二个污染点：组件样式里的 `:root`

继续搜索 `:root`，发现 `src/components/logseq.module.scss` 中有：

```scss
:root {
  --cardShadow: color-mix(in srgb, black 30%, transparent) 0 1px 2px 0,
    color-mix(in srgb, black 15%, transparent) 0 1px 3px 1px;

  --cardBG: rgba(210, 210, 210, 0.2);
  --markerStatusHoverColor: black;
  --markerCheckerBGColor: rgba(175, 175, 175, 0.799);
}
```

这也是全局选择器。

它不会像 Tailwind base 那样影响所有元素的 `--tw-*`，但它会把这些变量写到宿主网页的根节点上。如果宿主页面刚好用了同名变量，或者插件样式变量未来继续增加，就会扩大污染面。

变量名也比较通用：

- `--cardShadow`
- `--cardBG`

这类名字不带插件前缀，不适合写到宿主 `:root` 上。

## 13. 第三个污染点：直接修改宿主 `body`

搜索 `document.body.style`，发现：

```ts
export const fixDuckDuckGoDark = () => {
  if (document.querySelector('.dark-bg')) {
    document.body.style.color = 'var(--theme-col-txt-snippet)';
  }
}
```

这个函数在 content 入口中针对 DuckDuckGo 调用：

```ts
if (searchEngine instanceof DuckDuckGo) {
  fixDuckDuckGoDark()
}
```

这不是 Tailwind 问题，但它同样是页面污染：插件为了修复自己的显示，直接修改了宿主页面 `body` 的文字颜色。

这种做法风险很高：

- 影响范围是整个 DuckDuckGo 页面。
- 如果 DuckDuckGo 改了主题变量或 DOM 结构，这个修复可能反过来破坏页面。
- 插件 UI 的颜色问题应该尽量由插件容器内部样式解决。

## 14. 结论：真正的根因

根因不是单纯的“Tailwind 有问题”，而是：

> 插件把未隔离的 content CSS 注入到了所有网页，而这个 CSS 中包含 Tailwind base 生成的全局选择器、组件级 `:root` 变量，以及少量直接修改宿主 DOM 样式的逻辑。

更具体地说：

1. `manifest.json.cjs` 让 `content-script.css` 进入几乎所有网页。
2. `index.module.scss` 中的 `@tailwind base` 生成了全局 `*, ::before, ::after` 和 `::backdrop`。
3. CSS Modules 只保护普通 class，不保护 Tailwind base 输出的全局选择器。
4. `logseq.module.scss` 的 `:root` 把插件变量写到了宿主页面根节点。
5. `fixDuckDuckGoDark()` 直接改了宿主 `body.style.color`。

## 15. 修复方案比较

### 方案 A：最小修复，移除 content CSS 的全局泄漏

做法：

- 删除 content 样式里的 `@tailwind base`。
- 保留 `@apply`，因为 Tailwind 仍会处理这些局部 class。
- 把 `:root` 变量改成插件组件根 class 下的变量。
- 删除或收窄 `fixDuckDuckGoDark()` 对 `document.body` 的修改。

优点：

- 改动小。
- 风险低。
- 能直接消除已确认的全局污染源。
- 不需要重构 React 挂载方式。

缺点：

- 仍然不是完全隔离。比如 `icon.css` 中的 `.tie` class 仍然是全局 class。
- `::highlight(copilot-highlight)` 仍然是全局 highlight 名称，不过它只在插件主动创建同名 highlight 时生效。

### 方案 B：Shadow DOM 隔离插件 UI

做法：

- content script 创建 shadow root。
- React 渲染到 shadow root 内部。
- 把插件 CSS 注入 shadow root，而不是 manifest 全局 CSS。

优点：

- 隔离效果最好。
- 宿主页面和插件 UI 的 CSS 互相影响最少。

缺点：

- 改动面大。
- 需要重做 CSS 加载方式。
- 搜索结果页插入位置、Quick Capture、字体、图标、highlight 等都要重新验证。
- 有些站点布局和 shadow root 交互可能需要额外处理。

### 方案 C：限制 content script 匹配范围

做法：

- 不再对 `<all_urls>` 注入 CSS。
- 只在搜索引擎页面注入 Copilot 卡片。
- Quick Capture 另走用户点击或配置开关。

优点：

- 从源头减少注入范围。

缺点：

- 会改变现有“Recall your note on every page”和 Quick Capture 行为。
- 属于产品行为变化，不只是样式修复。

## 16. 本次选择的修复方案

本次选择方案 A。

原因：

- 已确认的问题主要来自少数全局 CSS 和 DOM 修改。
- 用户当前目标是修复正常网站显示异常，不是重构插件架构。
- 最小修复能快速降低风险，并保持现有功能行为。
- Shadow DOM 可以作为后续增强，但不适合作为第一刀。

具体计划：

1. 从 `src/pages/content/index.module.scss` 删除 `@tailwind base`。
2. 将 `src/components/logseq.module.scss` 中的 `:root` 改为组件根作用域，例如 `.copilotSurface`。
3. 在 `LogseqCopilot` 组件根部增加这个根 class，让变量只作用于插件 UI。
4. 移除 `fixDuckDuckGoDark()` 对 `document.body.style.color` 的写入，并删除 content 入口中的调用。
5. 用局部编译脚本验证 content CSS 不再输出 `*, ::before, ::after` 和 `::backdrop`。
6. 尽量运行项目现有测试；如果完整构建仍被 pnpm approval 阻塞，明确记录阻塞原因。

## 17. 修复后应如何验证

### 17.1 静态搜索

检查 content 相关源码中是否仍有高风险全局写法：

```bash
rg -n "@tailwind base|:root|document\\.body\\.style|\\*, ::before|::backdrop" src
```

注意：popup/options 页面中的 `@tailwind base` 不一定有同样风险，因为它们运行在插件自己的页面中，不是宿主网页 content CSS。

### 17.2 局部 CSS 编译

再次编译 `src/pages/content/index.module.scss`，确认输出不再包含：

```css
*, ::before, ::after { ... }
::backdrop { ... }
```

如果输出只剩 `.module.scss` 生成的哈希 class，例如：

```css
._copilot_xxx { ... }
._content_xxx * { ... }
```

则说明 Tailwind base 的全局变量初始化已经从 content CSS 中移除。

### 17.3 功能验证

至少需要确认：

- Google 搜索结果页仍能显示 Logseq Copilot 卡片。
- Quick Capture 浮动按钮仍能显示和点击。
- Logseq block/page 图标仍能显示。
- DuckDuckGo 暗色页面不再因为插件修改 `body` 影响整页。

### 17.4 构建验证

理想命令：

```bash
pnpm run build
```

当前环境中 `pnpm run build` 会先触发 pnpm 11 的 ignored-builds 检查，因此被依赖脚本审批挡住。这个阻塞来自 pnpm 命令包装，不是 CSS 修复本身。

绕过 pnpm 包装后，直接执行项目构建脚本可以验证真实打包链路：

```bash
node build.mjs
```

本次修复后该命令已经成功执行，并生成 `build/chrome`、`build/edge`、`build/firefox` 下的产物。

## 18. 需要特别注意的后续风险

本次修复是最小修复，不是彻底的样式沙箱。

仍需注意：

- `src/icon.css` 中 `.tie` 和 `.tie-*` 是全局 class。当前插件确实使用了 `<span className="tie tie-page">` 和 `<span className="tie tie-block">`，所以不能简单删除。后续可以考虑给图标 class 加项目前缀或改成 CSS Modules class。
- `::highlight(logseq-copilot-highlight)` 仍然是全局 highlight 名称，但已经加上插件前缀，冲突概率低于原来的 `copilot-highlight`。
- 如果未来继续在 content CSS 中加入 `body`、`html`、`:root`、`*` 这类选择器，要先确认它们是否会进入宿主页面。
- 如果后续希望达到强隔离，应评估 Shadow DOM 方案。

## 19. 给 CSS/Tailwind 新手的简短心智模型

可以把这次问题想象成三层：

第一层，浏览器插件的 content CSS 是“倒进别人网页的一桶 CSS”。只要选择器够宽，它就会影响别人的网页。

第二层，CSS Modules 只是给你自己的 class 改名，避免 `.button`、`.card` 这类 class 冲突。它不是 CSS 沙箱。

第三层，Tailwind 的 `@apply` 可以生成局部 class 样式，但 `@tailwind base` 会生成基础层样式。基础层里只要有 `*`、`:root` 这类选择器，就会变成全局影响。

所以在浏览器插件 content script 中，一个安全原则是：

> content CSS 里尽量只写插件根节点下面的 class，不写 `body`、`html`、`:root`、`*`，也不要轻易使用会生成全局选择器的入口。

## 20. 本次实际修改

修复按方案 A 执行，实际修改如下。

### 20.1 移除 content CSS 中的 Tailwind base

修改文件：`src/pages/content/index.module.scss`

删除：

```scss
@tailwind base;
```

保留：

```scss
@import url(../../icon.css);
```

原因：

- `@apply` 仍然可以被 Tailwind/PostCSS 处理。
- 删除 `@tailwind base` 后，content CSS 不再生成 `*, ::before, ::after` 和 `::backdrop`。
- popup/options 自己页面里的 `@tailwind base` 暂时不动，因为它们不是注入到宿主网页的 content CSS。

### 20.2 将插件变量从 `:root` 收敛到插件组件根

修改文件：

- `src/components/logseq.module.scss`
- `src/components/LogseqCopilot.tsx`

原来变量写在：

```scss
:root {
  --cardShadow: ...;
  --cardBG: ...;
}
```

现在改为：

```scss
.copilotSurface {
  --cardShadow: ...;
  --cardBG: ...;
  display: contents;
}
```

并在 React 组件中包一层：

```tsx
<div className={styles.copilotSurface}>
  ...
</div>
```

为什么使用 `display: contents`：

- 需要一个真实 DOM 节点承载 CSS 变量。
- 不希望额外 wrapper 改变原来的 flex 布局。
- `display: contents` 让 wrapper 不生成自己的布局盒子，但 CSS 变量仍能被后代继承。

### 20.3 删除 DuckDuckGo 的宿主 `body` 改色逻辑

修改文件：

- `src/pages/content/index.tsx`
- `src/utils.ts`

删除了：

```ts
fixDuckDuckGoDark()
```

以及函数本体：

```ts
export const fixDuckDuckGoDark = () => {
  if (document.querySelector('.dark-bg')) {
    document.body.style.color = 'var(--theme-col-txt-snippet)';
  }
}
```

原因：

- 插件不应该为了修复自己显示而修改宿主网页 `body`。
- 这类修改影响范围太大，和 Tailwind 泄漏一样属于页面污染。

### 20.4 给 highlight 名称加插件前缀

修改文件：

- `src/pages/content/index.module.scss`
- `src/pages/content/QuickCapture.tsx`

原名称：

```text
copilot-highlight
```

新名称：

```text
logseq-copilot-highlight
```

原因：

- `::highlight(...)` 的名字位于页面全局命名空间。
- 原名太通用，改成插件前缀能降低和宿主页面或其他插件冲突的概率。

## 21. 本次验证结果

### 21.1 局部 CSS 编译验证

对以下文件分别执行 Sass + PostCSS Modules + Tailwind 的局部编译：

- `src/pages/content/index.module.scss`
- `src/components/logseq.module.scss`

验证脚本检查这些高风险全局选择器：

```text
*, ::before
::backdrop
:root
body
html
```

结果：

```text
--- src/pages/content/index.module.scss ---
globalMatches: none
has logseq highlight: true

--- src/components/logseq.module.scss ---
globalMatches: none
has logseq highlight: false
```

这个结果说明：

- content 样式不再输出 Tailwind base 的全局初始化。
- Logseq 组件样式不再输出 `:root`。
- highlight 仍存在，但已经使用 `logseq-copilot-highlight` 前缀名。

### 21.2 打包产物验证

执行：

```bash
node build.mjs
```

结果：

```text
Build success.
```

随后检查三个浏览器产物：

```bash
rg -n "^\\*, ::before|^::backdrop|^:root\\b|^body\\b|^html\\b|copilot-highlight|logseq-copilot-highlight|--tw-border-spacing-x" \
  build/chrome/content-script.css \
  build/edge/content-script.css \
  build/firefox/content-script.css
```

结果只命中：

```text
build/firefox/content-script.css:424:::highlight(logseq-copilot-highlight) {
build/chrome/content-script.css:424:::highlight(logseq-copilot-highlight) {
build/edge/content-script.css:424:::highlight(logseq-copilot-highlight) {
```

没有命中：

- `*, ::before`
- `::backdrop`
- `:root`
- `body`
- `html`
- `--tw-border-spacing-x`
- 旧名称 `copilot-highlight`

这说明发布产物中的核心污染源已经移除。

### 21.3 Jest 验证

执行：

```bash
./node_modules/.bin/jest --runInBand
```

结果：

```text
Test Suites: 1 passed, 1 total
Tests: 9 passed, 9 total
```

### 21.4 TypeScript 验证

执行：

```bash
./node_modules/.bin/tsc --noEmit
```

结果：失败。

失败原因不是单一的本次改动错误，而是项目当前已有大量类型债务，例如：

- 组件 props 隐式 `any`。
- Logseq client interface 类型不匹配。
- `CSS.highlights` / `Highlight` 缺少 DOM 类型声明。
- png import 类型声明缺失。
- options 页面表单类型不匹配。

这次样式修复没有扩大这些类型问题，但当前仓库不能用 `tsc --noEmit` 作为通过门禁。

## 22. 修复后的判断

本次修复已经解决已确认的主要污染源：

- content CSS 不再输出 Tailwind base 的全局 `--tw-*` 初始化。
- 插件卡片变量不再写到宿主 `:root`。
- 插件不再修改 DuckDuckGo 的宿主 `body.style.color`。
- highlight 名称已加插件前缀。

剩余风险主要是 `src/icon.css` 仍以全局 `.tie` / `.tie-*` class 注入 content CSS。这是项目当前图标系统的真实依赖，不能在本次最小修复中直接删除。后续如要进一步收紧，可以把图标 class 也改成 CSS Modules 或更明确的 `logseq-copilot-icon-*` 前缀。
