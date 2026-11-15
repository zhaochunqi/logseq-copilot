import Browser from 'webextension-polyfill';
import { useEffect, useState } from 'react';
import React from 'react';
import { LogseqSearchResult } from '@/types/logseqBlock';
import { IconSettings } from '@tabler/icons-react';

import { LogseqBlock } from '@components/LogseqBlock';

import styles from './index.module.scss';
import { getLogseqService } from '@pages/logseq/tool';

export default function Popup() {
  const [isLoading, setIsLoading] = useState(false);
  const [logseqSearchResult, setLogseqSearchResult] =
    React.useState<LogseqSearchResult>();

  useEffect(() => {
    if (isLoading) return;

    new Promise(async () => {
      let queryOptions = { active: true, lastFocusedWindow: true };
      let [tab] = await Browser.tabs.query(queryOptions);
      setIsLoading(true);
      if (!tab || !tab.url) return;

      const tabURL = new URL(tab.url);
      const service = await getLogseqService();
      const result = await service.urlSearch(tabURL, { fuzzy: true });

      if (result.status !== 200) return;

      setLogseqSearchResult(result.response!);
    });
  }, []);

  const openSettingsPage = () => {
    Browser.runtime.sendMessage({ type: 'open-options' });
  };

  const openViewer = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest('[data-logseq-page], [data-logseq-block]');
    if (!target) return;
    event.preventDefault();
    const page = target.getAttribute('data-logseq-page');
    const block = target.getAttribute('data-logseq-block');
    Browser.runtime.sendMessage({ type: 'open-viewer', ...(page ? { page } : { block }) }).then(() => window.close());
  };

  return (
    <div className="copilot" onClick={openViewer}>
      <div className={styles.content}>
        <div className={styles.copilotCardHeader}>
          <span>Graph: {logseqSearchResult?.graph}</span>
          <IconSettings size={16} onClick={openSettingsPage} />
        </div>
        {logseqSearchResult?.blocks.slice(0, 20).map((block) => (
          <LogseqBlock
            key={block.uuid}
            graph={logseqSearchResult?.graph}
            blocks={[block]}
            isPopUp={true}
          />
        ))}
      </div>
    </div>
  );
}
