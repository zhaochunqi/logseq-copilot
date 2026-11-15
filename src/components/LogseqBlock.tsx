import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { IconArrowUpRight } from '@tabler/icons-react';
import { LogseqBlockType } from '@/types/logseqBlock';
import LogseqPageLink from './LogseqPage';
import { blockUrl, pageUrl } from '@/utils/logseq-url';
import { sanitizeHtml } from '@/utils/sanitize-html';
import './logseq-results.css';

type LogseqBlockProps = {
  graph: string;
  blocks: LogseqBlockType[];
};

/**
 * Folds content taller than seven lines behind "Show more". The height is
 * measured, so short blocks get no toggle; images re-measure when they load.
 */
const Foldable = ({ children }: { children: React.ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      // Folded height is 140px (7 lines, or a line and an image); a few px
      // of slack avoids a toggle that reveals nothing.
      setOverflows(el.scrollHeight > 146);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.querySelectorAll('img').forEach((img) => img.addEventListener('load', measure));
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={ref} className="lc-clamp" data-folded={overflows && !open ? 'true' : 'false'}>
        {children}
      </div>
      {overflows && (
        <button
          type="button"
          className="lc-button lc-fold"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </>
  );
};

/**
 * One result block, drawn like a block in Logseq: a bullet and marker
 * in front of the text, the text folded when long.
 * `children` are nested result blocks (indented under this one).
 */
export const LogseqBlockRow = ({
  graph,
  block,
  children,
}: {
  graph: string;
  block: LogseqBlockType;
  children?: React.ReactNode;
}) => {
  const status = block.marker ?? '';
  const hasStatusLabel = !!status;
  // The block's Markdown may hold raw HTML (a clipped page, ...), and the
  // sidebar on pages draws this in the page's own document.
  const html = useMemo(() => sanitizeHtml(block.html), [block.html]);

  return (
    <li>
      <div className="lc-block-row" data-marker={status || undefined}>
        <Foldable>
          {hasStatusLabel && (
            <span className="lc-task">
              <span className="lc-status">{status}</span>
            </span>
          )}
          <div className="lc-content" dangerouslySetInnerHTML={{ __html: html }} />
          {block.tagNames && block.tagNames.length > 0 && (
            <div className="lc-block-tags">
              {block.tagNames.map((name) => (
                <a key={name} className="lc-block-tag" href={pageUrl(graph, name)}>
                  #{name}
                </a>
              ))}
            </div>
          )}
        </Foldable>
        <div className="lc-actions">
          {block.uuid && (
            <a
              className="lc-button lc-icon-button"
              href={blockUrl(graph, block.uuid)}
              title="Open block in Logseq"
              aria-label="Open block in Logseq"
            >
              <IconArrowUpRight />
            </a>
          )}
        </div>
      </div>
      {children}
    </li>
  );
};

/**
 * A page title and its result blocks. Used where the blocks of one page are
 * shown on their own; the result lists group and nest through
 * LogseqResultList.
 */
export const LogseqBlock = ({ graph, blocks }: LogseqBlockProps) => {
  const shown = blocks.filter((block) => block.html);
  if (shown.length === 0) {
    return null;
  }

  return (
    <div className="lc-results lc-group">
      <LogseqPageLink graph={graph} page={shown[0].page} />
      <ul className="lc-blocks">
        {shown.map((block) => (
          <LogseqBlockRow key={block.uuid} graph={graph} block={block} />
        ))}
      </ul>
    </div>
  );
};
