import { browser } from '@/browser';
import { versionCompare } from './utils';
import { debounce } from '@/utils';
import { changeOptionsHostToHostNameAndPort } from './upgrade';
import { getLogseqService } from '@pages/logseq/tool';

browser.runtime.onConnect.addListener((port) => {
  port.onMessage.addListener((msg) => {
    if (msg.type === 'query') {
      const promise = new Promise(async () => {
        const logseqService = await getLogseqService();
        const searchRes = await logseqService.search(msg.query);
        console.debug('search result', searchRes);
        port.postMessage(searchRes);
      });

      promise.catch((err) => console.error(err));
    } else if (msg.type === 'open-options') {
      browser.runtime.openOptionsPage();
    } else {
      console.debug(msg);
    }
  });
});

browser.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg.type === 'open-options') {
    browser.runtime.openOptionsPage();
  } else if (msg.type === 'open-viewer') {
    const url = browser.runtime.getURL(
      'viewer.html?page=' +
        encodeURIComponent(msg.page || '') +
        (msg.block ? '&block=' + encodeURIComponent(msg.block) : ''),
    );
    await browser.tabs.create({ url });
  } else {
    console.debug(msg);
  }
});

browser.tabs.onActivated.addListener((activeInfo) => {
  const promise = new Promise(async () => {
    const tab = await browser.tabs.get(activeInfo.tabId);
    await debounceBadgeSearch(tab.url, activeInfo.tabId);
  });
  promise.catch((err) => console.error(err));
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.status === 'complete') {
    const promise = new Promise(async () => {
      await debounceBadgeSearch(tab.url, tabId);
    });
    promise.catch((err) => console.error(err));
  }
});

const badgeSearch = async (url: string | undefined, tabId: number) => {
  if (!url) return;
  const searchURL = new URL(url);
  const logseqService = await getLogseqService();
  const searchRes = await logseqService.urlSearch(searchURL);
  const resultCount = searchRes.count ? searchRes.count!.toString() : '';
  await setExtensionBadge(resultCount, tabId);
};

const debounceBadgeSearch = debounce(badgeSearch, 1000);

browser.runtime.onInstalled.addListener((event) => {
  if (event.reason === 'install') {
    browser.runtime.openOptionsPage();
  } else if (event.reason === 'update') {
    if (versionCompare(event.previousVersion!, '1.10.19') < 0) {
      changeOptionsHostToHostNameAndPort();
    }
  }
});

async function setExtensionBadge(text: string, tabId: number) {
  await browser.action.setBadgeText({
    text: text,
    tabId: tabId,
  });
  await browser.action.setBadgeBackgroundColor({ color: '#4caf50', tabId });
  await browser.action.setBadgeTextColor({ color: '#ffffff', tabId });
}
