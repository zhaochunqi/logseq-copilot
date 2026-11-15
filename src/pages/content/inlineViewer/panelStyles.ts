export const panelStyles = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.6;
  color: #111;
}
.overlay { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.5); }
.panel {
  position: absolute;
  right: 0;
  top: 0;
  height: 100%;
  width: min(640px, 100vw);
  box-sizing: border-box;
  background: #fff;
  color: #111;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.25);
  overflow: auto;
  outline: none;
}
.header { padding: 16px; border-bottom: 1px solid #ddd; }
.header h2 { margin: 8px 0 2px; font-size: 20px; font-weight: 600; overflow-wrap: anywhere; }
.header small { color: #888; font-size: 12px; }
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.button {
  border: 1px solid #bbb;
  background: #fff;
  color: #111;
  border-radius: 4px;
  padding: 5px 9px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.button:hover { background: #f3f4f6; }
.button:disabled { opacity: 0.5; cursor: default; }
.content { padding: 16px; }
.state { text-align: center; padding: 48px 16px; color: #666; }
.state small { display: inline-block; margin-top: 8px; color: #888; }
.notice {
  margin: 0 0 12px;
  padding: 8px 12px;
  border: 1px solid #fcd34d;
  background: #fef3c7;
  color: #92400e;
  border-radius: 4px;
  font-size: 12px;
}
.notice .button { margin-left: 6px; padding: 2px 8px; }
.block { display: flex; gap: 8px; padding: 4px 0; border-radius: 4px; }
.block > span { flex: 0 0 1rem; text-align: center; color: #999; }
.block.highlight { background: #fef3c7; box-shadow: 0 0 0 2px #fcd34d; }
.body {
  min-width: 0;
  overflow-wrap: anywhere;
}
.body > :first-child { margin-top: 0; }
.body > :last-child { margin-bottom: 0; }
.body p { margin: 4px 0; }
.body h1, .body h2, .body h3, .body h4, .body h5, .body h6 {
  margin: 8px 0 4px;
  line-height: 1.3;
  font-weight: 600;
}
.body h1 { font-size: 1.5em; }
.body h2 { font-size: 1.35em; }
.body h3 { font-size: 1.2em; }
.body h4 { font-size: 1.1em; }
.body h5 { font-size: 1em; }
.body h6 { font-size: 0.9em; color: #555; }
.body ul, .body ol { margin: 4px 0; padding-left: 1.4em; }
.body ul { list-style: disc; }
.body ol { list-style: decimal; }
.body li { margin: 2px 0; }
.body blockquote {
  margin: 8px 0;
  padding: 4px 12px;
  border-left: 3px solid #d1d5db;
  color: #555;
}
.body a { color: #2563eb; text-decoration: underline; }
.body code {
  background: #f3f4f6;
  padding: 1px 4px;
  border-radius: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9em;
}
.body pre {
  background: #f3f4f6;
  padding: 10px;
  border-radius: 4px;
  overflow: auto;
}
.body pre code { padding: 0; background: none; }
.body table { border-collapse: collapse; margin: 8px 0; }
.body td, .body th { border: 1px solid #ccc; padding: 4px 8px; }
.body th { background: #f3f4f6; }
.body img { max-width: 100%; height: auto; }
.body hr { border: none; border-top: 1px solid #ddd; margin: 12px 0; }
@media (prefers-color-scheme: dark) {
  .panel { background: #18181b; color: #e5e5e5; }
  .header { border-color: #3f3f46; }
  .header small, .state, .state small { color: #a1a1aa; }
  .button { background: #27272a; color: #e5e5e5; border-color: #52525b; }
  .button:hover { background: #3f3f46; }
  .notice { background: #422006; border-color: #a16207; color: #fde68a; }
  .block.highlight { background: #422006; box-shadow: 0 0 0 2px #a16207; }
  .body code, .body pre { background: #27272a; }
  .body a { color: #93c5fd; }
  .body blockquote { border-color: #52525b; color: #a1a1aa; }
  .body td, .body th { border-color: #52525b; }
  .body th { background: #27272a; }
}
`;
