import { IconSettings } from '@tabler/icons-react';
import React from 'react';
import styles from './logseq.module.scss';
import Browser from 'webextension-polyfill';
import { getLogseqCopliotConfig } from '@/config';
import { openInlineViewer } from '@pages/content/inlineViewer';
import { LogseqBlock } from './LogseqBlock';
import LogseqPageLink from './LogseqPage';

const LogseqCopilot = ({ graph, pages, blocks }) => {
  const goOptionPage = () => {
    Browser.runtime.sendMessage({ type: 'open-options' });
  };

  const groupedBlocks = blocks.reduce((groups, item) => {
    const group = (groups[item.page.name] || []);
    group.push(item);
    groups[item.page.name] = group;
    return groups;
  }, {});

  const count = () => {
    return pages.length + blocks.length;
  };

  const blocksRender = () => {
    if (blocks.length === 0) {
      return <></>;
    }
    return (
      <div className={styles.blocks}>
        {Object.entries(groupedBlocks).map(([key, blocks], i) => {
          return <LogseqBlock key={key} blocks={blocks} graph={graph} />;
        })}
      </div>
    );
  };

  const pagesRender = () => {
    if (pages.length === 0) {
      return <></>;
    }
    return <div className={styles.pages}>
      {pages.slice(0, 9).map((page) => {
        if (!page) return <></>;
        return (
          <div key={page.name} className={styles.page}>
            <LogseqPageLink
              graph={graph}
              page={page}
            ></LogseqPageLink>
          </div>
        );
      })}
    </div>

  };

  const openViewer = async (event: React.MouseEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest('[data-logseq-page], [data-logseq-block]');
    if (!target) return;
    event.preventDefault();
    const page = target.getAttribute('data-logseq-page') || undefined;
    const block = target.getAttribute('data-logseq-block') || undefined;

    const config = await getLogseqCopliotConfig();
    if (config.pageOpenMode === 'tab') {
      Browser.runtime.sendMessage({ type: 'open-viewer', ...(page ? { page } : { block }) });
      return;
    }
    // Default: render the page in an in-page drawer (read-only).
    openInlineViewer({ page, block });
  };

  return (
    <div onClick={openViewer}>
      {count() === 0 ? (
        <span>Nothing here, Do some research with Logseq!</span>
      ) : (
        <>
          <div className={styles.copilotCardHeader}>
            <span>Graph: {graph}</span>
            <IconSettings onClick={goOptionPage} size={16} />
          </div>
          {pagesRender()}
          {blocksRender()}
        </>
      )}
    </div>
  );
};

export default LogseqCopilot;
