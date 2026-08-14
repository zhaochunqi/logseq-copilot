# web/ — 独立 Web 渲染版（不依赖 Logseq 桌面端与浏览器扩展）

对接 logseq-graph-api（或官方 Logseq HTTP API），浏览器直接搜索/浏览 graph。

## 构建与运行

\`\`\`bash
node web/build.mjs          # 产物 web/dist/main.js
python3 -m http.server 8877 -d web
# 浏览器打开 http://localhost:8877
\`\`\`

页面里填 API URL（如 http://localhost:12315 或 https://logseq-api.mac.zhaochunqi.com）与 token 后即可搜索。

## 范围与技术取舍（依据 AGENTS.md）

- 不做剪藏（扩展场景能力，依赖 Browser.runtime / CSS.highlights）
- 不做 logseq:// 跳转：[[页面]]/块链接为纯文本展示（共享 renderBlock 已不生成 logseq:// 链接）
- TODO 切换直接调 HTTP API（service.changeBlockMarker），无 background 消息通道
- 复用共享数据层（normal/service、client、renderBlock）与 storage 适配器（src/storage.ts）
- 配置存 localStorage（扩展环境仍用 chrome.storage，由 src/storage.ts 自动选择）
