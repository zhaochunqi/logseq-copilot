// 扩展内置渲染页 URL（真实可访问：链接悬停可见、中键可开新标签页）。
import Browser from 'webextension-polyfill';

export const viewerUrl = (page: string) =>
  Browser.runtime.getURL(`viewer.html?page=${encodeURIComponent(page)}`);
