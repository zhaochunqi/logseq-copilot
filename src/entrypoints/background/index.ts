import { debounce } from '@/utils';
import {
  changeOptionsHostToHostNameAndPort,
  migrateGithubRecallRuleToRepoScope,
  migrateLegacyClipSettingsToTemplates,
  migrateRecallRuleDefaultsToEnglish,
} from './upgrade';
import { getLogseqService } from './logseq/tool';
import { SearchEngineConfigMigration } from '@/utils/migration';
import { inPageSidebarOpenItem } from '@/utils/storage';
import { onMessage } from '@/types/messaging';
import { RecallRuleProcessor } from '@/utils/recall-rule-processor';
import type { RecallResult } from '@/types/recall';
import log from '@/utils/logger';
import {
  recallRequestKey,
  recentRequests,
} from './logseq/recall/recent-requests';
import { startSidebarAction } from './sidebar-action';

// Long enough to cover a result page that reloads itself (Bing: ~1.5 s).
const RECALL_SHARE_MS = 5_000;

export default defineBackground({
  // Set manifest options
  // persistent: undefined | true | false,
  // type: undefined | 'module',

  // // Set include/exclude if the background should be removed from some builds
  // include: undefined | string[],
  // exclude: undefined | string[],

  main() {
    // Executed when background is loaded, CANNOT BE ASYNC

    // Register message handlers using @webext-core/messaging
    onMessage('logseq:allPages', async () => {
      try {
        const service = await getLogseqService();
        const raw = await service.client.getAllPages();
        let result: any = raw;
        if (typeof result === 'string') {
          try {
            result = JSON.parse(result);
          } catch {
            return [];
          }
        }
        const pages = Array.isArray(result?.pages)
          ? result.pages
          : Array.isArray(result?.response?.pages)
          ? result.response.pages
          : [];
        return pages.filter((page: any) => typeof page?.name === 'string');
      } catch (error) {
        log.warn('[background] Failed to read all pages:', error);
        return [];
      }
    });

    onMessage('logseq:search', async ({ data }) => {
      const logseqService = await getLogseqService();
      const searchRes = await logseqService.search(data);
      log.debug('search result', searchRes);
      return searchRes;
    });

    // Result pages that load twice in a row (Bing) ask the same recall twice.
    const sharedRecall = recentRequests<RecallResult>(RECALL_SHARE_MS);
    // The answer depends on the recall rules, the Logseq connection and other
    // settings. Any storage change may alter it, so share nothing older.
    browser.storage.onChanged.addListener(() => sharedRecall.clear());
    onMessage('logseq:recall', ({ data }) =>
      sharedRecall(recallRequestKey(data.query, data.url), async () => {
        const logseqService = await getLogseqService();
        const recallProcessor = RecallRuleProcessor.getInstance();
        const searchContext = await recallProcessor.processSearchContext(
          data.url,
        );
        return await logseqService.recall(
          data.query,
          recallProcessor.recallOptions(searchContext),
        );
      }),
    );

    onMessage('logseq:urlSearch', async ({ data }) => {
      const logseqService = await getLogseqService();

      // Apply recall rules processing
      const recallProcessor = RecallRuleProcessor.getInstance();
      const searchContext = await recallProcessor.processSearchContext(
        data.url,
      );

      // Use processed URL for search
      const searchRes = await logseqService.urlSearch(
        searchContext.processedUrl,
        { scopeDepth: searchContext.scopeDepth },
      );

      // Filter results based on recall rules
      if (searchRes.response?.blocks) {
        searchRes.response.blocks = recallProcessor.filterResults(
          searchRes.response.blocks,
          searchContext,
        );
      }
      return searchRes;
    });

    onMessage('app:openOptions', async () => {
      browser.runtime.openOptionsPage();
    });

    onMessage('app:openPage', async ({ data }) => {
      await openPage(data.url);
    });

    // A content script's request to open one of this extension's own pages (the
    // graph browser) in a new tab. Anything outside the extension is refused:
    // this must not become a way to send a tab to any address.
    onMessage('app:openTab', async ({ data }) => {
      const extensionRoot = browser.runtime.getURL('/');
      if (!data?.url?.startsWith(extensionRoot)) {
        throw new Error('Not an extension page.');
      }
      await browser.tabs.create({ url: data.url });
    });

    onMessage('logseq:pageView', async ({ data }) => {
      const service = await getLogseqService();
      let page = data.page;
      if (!page && data.block) {
        const block = await service.client.getBlockViaUuid(data.block, {});
        page = block?.page?.name;
      }
      if (!page || !service.getPageView) return null;
      return await service.getPageView(page);
    });

    const getCurrentTab = async () => {
      const tab = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      return tab[0];
    };

    const openPage = async (url: string) => {
      log.debug(url);
      const tab = await getCurrentTab();
      if (!tab) {
        browser.tabs.create({ url: url });
        return;
      }
      const activeTab = tab;
      if (activeTab.url !== url)
        await browser.tabs.update(activeTab.id!, { url: url });
    };

    browser.tabs.onActivated.addListener((activeInfo) => {
      const promise = new Promise(async () => {
        const tab = await browser.tabs.get(activeInfo.tabId);
        await debounceBadgeSearch(tab.url, activeInfo.tabId);
      });
      promise.catch((err) => log.error(err));
    });

    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (tab.active && changeInfo.status === 'complete') {
        const promise = new Promise(async () => {
          await debounceBadgeSearch(tab.url, tabId);
        });
        promise.catch((err) => log.error(err));
      }
    });

    const badgeSearch = async (url: string | undefined, tabId: number) => {
      if (!url) return;

      // Apply recall rules processing
      const recallProcessor = RecallRuleProcessor.getInstance();
      const searchContext = await recallProcessor.processSearchContext(url);

      // The badge counts notes about this page only, not its parent paths.
      const logseqService = await getLogseqService();
      const searchRes = await logseqService.urlSearch(
        searchContext.processedUrl,
      );

      // Count the results left after the recall rules filter
      let count: number = searchRes.count || 0;
      if (searchRes.response?.blocks) {
        count = recallProcessor.filterResults(
          searchRes.response.blocks,
          searchContext,
        ).length;
      }
      const resultCount = count ? count.toString() : '';
      await setExtensionBadge(resultCount, tabId);
    };

    const debounceBadgeSearch = debounce(badgeSearch, 1000);

    // Call sidebar.open / sidebar.toggle first in the handler of a click or
    // command: the browser opens its sidebar only while the user action is
    // still alive, so nothing may be awaited before it.
    const sidebar = startSidebarAction();

    // The toolbar button. Chrome opens its side panel itself, without this
    // event, unless the sidebar drawn on pages is in use (sidebar-action.ts).
    browser.action.onClicked.addListener((tab) => sidebar.toggle(tab));

    browser.runtime.onInstalled.addListener(async (event) => {
      // Run migration for both install and update events
      await migrateLegacyClipSettingsToTemplates().catch((err) =>
        log.error('Failed to migrate legacy clip settings:', err),
      );
      await SearchEngineConfigMigration.runMigrations();
      // Idempotent, so it is safe on every install/update (version gating via
      // versionCompare was unreliable).
      await changeOptionsHostToHostNameAndPort();
      await migrateRecallRuleDefaultsToEnglish().catch((err) =>
        log.error('Failed to migrate the recall rule defaults:', err),
      );
      // After the English copy: it matches the old English description.
      await migrateGithubRecallRuleToRepoScope().catch((err) =>
        log.error('Failed to migrate the GitHub recall rule:', err),
      );

      if (event.reason === 'install') {
        browser.runtime.openOptionsPage();
      }
    });

    // The sidebar drawn on pages starts closed with the browser, like the
    // browser's own.
    browser.runtime.onStartup.addListener(() => {
      inPageSidebarOpenItem
        .setValue(false)
        .catch((err) => log.error('Failed to close the in-page sidebar:', err));
    });

    browser.commands.onCommand.addListener((command, tab) => {
      if (command === 'open-sidebar') sidebar.open(tab);
    });

    async function setExtensionBadge(text: string, tabId: number) {
      await browser.action.setBadgeText({
        text: text,
        tabId: tabId,
      });
      await browser.action.setBadgeBackgroundColor({ color: '#4caf50', tabId });
      await browser.action.setBadgeTextColor({ color: '#ffffff', tabId });
    }
  },
});
