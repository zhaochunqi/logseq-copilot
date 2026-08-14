import { useEffect, useRef } from 'react';
import { IconSettings } from '@tabler/icons-react';
import styles from './logseq.module.scss';
import Browser from 'webextension-polyfill';
import { LogseqBlock } from './LogseqBlock';
import LogseqPageLink from './LogseqPage';
import { viewerUrl } from './viewerUrl';

const LogseqCopilot = ({ graph, pages, blocks }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const goOptionPage = () => {
    Browser.runtime.sendMessage({ type: 'open-options' });
  };

  // renderBlock 产出的 [[页面]] 链接没有 href；渲染后补上真实 viewer URL，
  // 让悬停显示可读链接、中键/长按默认行为直接可用。
  useEffect(() => {
    rootRef.current
      ?.querySelectorAll('a[data-logseq-page]')
      .forEach((a) => {
        const page = a.getAttribute('data-logseq-page');
        if (page) a.setAttribute('href', viewerUrl(page));
      });
  });

  // 点击 → 消息给 background，由 background 用 tabs.create 打开 viewer：
  // 网页直接导航到 chrome-extension:// 会被 Chrome 拦截（ERR_BLOCKED_BY_CLIENT），
  // 扩展上下文（background）发起的导航不受限制。
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
      const el = e.target as HTMLElement;
      const a = el.closest?.('a[data-logseq-page]');
      if (!a) return;
      const page = a.getAttribute('data-logseq-page');
      if (!page) return;
      e.preventDefault();
      Browser.runtime.sendMessage({ type: 'open-viewer', page });
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, []);

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

  if (count() === 0) {
    return (
      <span>
        Nothing here, Do some research with Logseq!{' '}
        <span>Go</span>
      </span>
    );
  }

  return (
    <div className={styles.copilotSurface} ref={rootRef}>
      <div className={styles.copilotCardHeader}>
        <span>Graph: {graph}</span>
        <IconSettings onClick={goOptionPage} size={16} />
      </div>
      {pagesRender()}
      {blocksRender()}
    </div>
  );
};

export default LogseqCopilot;
