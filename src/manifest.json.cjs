// 商店公钥只用于发布构建（保持 Chrome 商店 ID 稳定）。
// 本地开发（build.mjs 不带 CHROME_EXTENSION_KEY 时）不带 key ——
// Chrome 会为 unpacked 扩展生成独立开发 ID，避免与商店版同 ID 冲突被屏蔽
// （ERR_BLOCKED_BY_CLIENT）。
const CHROME_EXTENSION_KEY = process.env.CHROME_EXTENSION_KEY || '';

const ReleaseFor = {
  chrome: {
    ...(CHROME_EXTENSION_KEY ? { key: CHROME_EXTENSION_KEY } : {}),
    background: {
      service_worker: 'background.js',
    },
  },
  edge: {
    background: {
      service_worker: 'background.js',
    },
  },
  firefox: {
    background: {
      scripts: ['background.js'],
    },
    browser_specific_settings: {
      gecko: {
        id: '{dbe73d0a-f6b8-474a-ad39-0d46a07e4525}',
      },
    },
  },
};

const build = (releaseFor) => {
  return {
    manifest_version: 3,
    version: process.env.VERSION?.replace('v', '') ?? '0.0.0',
    author: 'eindex.lee@gmail.com',
    name: 'Logseq Copilot',
    description:
      'Logseq Copilot, Connect with you logseq API server, bring your information when you browsing.',
    chrome_url_overrides: {},
    icons: {
      192: 'assets/img/logo-192.png',
    },
    content_scripts: [
      {
        matches: ['http://*/*', 'https://*/*', '<all_urls>'],
        js: ['content-script.js'],
        css: ['content-script.css'],
      },
    ],
    action: {
      default_popup: 'popup.html',
      default_title: 'Logseq Copilot',
    },
    options_ui: {
      page: 'options.html',
      browser_style: false,
      open_in_tab: true,
    },
    commands: {
      clip: {
        suggested_key: {
          default: 'Ctrl+Shift+U',
        },
        description: 'Make Clip note',
      },
    },
    web_accessible_resources: [
      {
        // viewer.html 必须声明：网页（如 Google 搜索页）上的链接点击/右键导航到
        // 未声明资源会被 Chrome 拦截（ERR_BLOCKED_BY_CLIENT）
        resources: ['content-script.css', 'assets/img/logo.png', 'viewer.html'],
        matches: ['http://*/*', 'https://*/*', '<all_urls>'],
      },
    ],
    permissions: ['storage', 'activeTab', 'contextMenus'],
    host_permissions: ['<all_urls>'],
    ...ReleaseFor[releaseFor],
  };
};

module.exports = build;
