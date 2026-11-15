import { LogseqBlockType } from '../../types/logseqBlock';

import { marked } from 'marked';
import LogseqClient from './client';
import LogseqDBService from './db/service';
import LogseqService from './normal/service';
import { LogseqServiceInterface } from './interfaces';
import { getLogseqCopliotConfig } from '../../config';
import { escapeHtml, highlightText, safeHref } from './sanitize';

const client = new LogseqClient();
const logseqServiceDB = new LogseqDBService();
const logseqService = new LogseqService();

export const cleanBlock = (block: LogseqBlockType): string => {
  let result = block.content;
  if (!result) {
    return '';
  }
  if (block.marker) {
    result = result.replace(block.marker, '');
  }

  if (block.priority) {
    result = result.replace(`[#${block.priority}]`, '');
  }

  return result
    .replaceAll(/!\[.*?\]\(\.\.\/assets.*?\)/gim, '')
    .replaceAll(/^[\w-]+::.*?$/gim, '') // clean properties
    .replaceAll(/{{renderer .*?}}/gim, '') // clean renderer
    .replaceAll(/^deadline: <.*?>$/gim, '') // clean deadline
    .replaceAll(/^scheduled: <.*?>$/gim, '') // clean schedule
    .replaceAll(/^:logbook:[\S\s]*?:end:$/gim, '') // clean logbook
    .replaceAll(/^:LOGBOOK:[\S\s]*?:END:$/gim, '') // clean logbook
    .replaceAll(/\$pfts_2lqh>\$(.*?)\$<pfts_2lqh\$/gim, '*$1*') // clean highlight (markdown emphasis; raw HTML is escaped)
    .replaceAll(/{{video .*?}}/gm, '')
    .replaceAll(/^\s*?-\s*?$/gim, '')
    .trim();
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const highlightTokens = (query: string) => {
  // `query` comes from the current tab URL and is untrusted: escape it both as
  // a regex (so it cannot throw / alter the pattern) and as HTML (so it cannot
  // inject markup into the `<mark>` it is wrapped in). `token.text` stays
  // unescaped to avoid double-escaping already-emitted entities.
  const safeQuery = escapeHtml(query);
  const re = new RegExp(`^(?!<mark>)${escapeRegExp(query)}(?!<\/mark>)`, 'g');
  return (token) => {
    if (
      token.type !== 'code' &&
      token.type !== 'codespan' &&
      token.type !== 'logseqLink' &&
      token.type !== 'logseqBlockRef' &&
      token.type !== 'logseqTag' &&
      token.text
    ) {
      token.text = query
        ? token.text.replaceAll(re, '<mark>' + safeQuery + '</mark>')
        : token.text;
    }
  };
};

const logseqLinkExt = (graph: string, query?: string) => {
  return {
    name: 'logseqLink',
    level: 'inline',
    start: function (src: string) {
      return src.search(/#?\[\[/);
    },
    tokenizer: function (src: string) {
      const match = src.match(/^#?\[\[([^\]]+?)\]\]/);
      if (match) {
        const [target, display] = match[1].split('|', 2);
        return {
          type: 'logseqLink',
          raw: match[0],
          text: display?.trim() || target.trim(),
          href: target.trim(),
          tokens: [],
        };
      }
      return false;
    },
    renderer: function (token) {
      const { text, href } = token;

      // Escape the display text first, then highlight (the query is escaped
      // inside highlightText). This closes the XSS hole where `[[page|<img…>]]`
      // display text was interpolated raw.
      const fillText = highlightText(escapeHtml(text), query);
      const target = escapeHtml(href);
      return `<a class="logseq-page-link" href="#" data-logseq-page="${target}" title="${target}">${fillText}</a>`;
    },
  };
};

const logseqBlockRefExt = () => {
  return {
    name: 'logseqBlockRef',
    level: 'inline',
    start: function (src: string) {
      return src.search(/\(\(/);
    },
    tokenizer: function (src: string) {
      const match = src.match(/^\(\(([^()]+)\)\)/);
      if (match) {
        return {
          type: 'logseqBlockRef',
          raw: match[0],
          text: match[1].trim(),
          tokens: [],
        };
      }
      return false;
    },
    renderer: function (token: any) {
      const uuid = escapeHtml(token.text);
      return `<a class="logseq-block-ref" href="#" data-logseq-block="${uuid}" title="((${uuid}))">((${uuid}))</a>`;
    },
  };
};

const logseqTagExt = () => {
  return {
    name: 'logseqTag',
    level: 'inline',
    start: function (src: string) {
      return src.search(/#[\p{L}\p{N}_/-]/u);
    },
    tokenizer: function (src: string) {
      // `#[[page]]` and `#[[page|display]]` stay page links, so only match plain hashtags.
      const match = src.match(/^#([\p{L}\p{N}_/-]+)/u);
      if (match) {
        return {
          type: 'logseqTag',
          raw: match[0],
          text: match[1],
          tokens: [],
        };
      }
      return false;
    },
    renderer: function (token: any) {
      return `<span class="logseq-tag">#${escapeHtml(token.text)}</span>`;
    },
  };
};

const TASK_MARKERS = ['TODO', 'DOING', 'NOW', 'LATER', 'WAITING', 'DONE', 'CANCELED'];

/**
 * logseq-graph's block `marker` is the bullet/heading marker (`-` / `###`), not a task
 * state. Derive the task marker from the text prefix instead, and clear it otherwise, so
 * the UI does not render an empty task checkbox on every ordinary block.
 */
export const normalizeBlockMarker = (block: LogseqBlockType) => {
  if (block.marker && TASK_MARKERS.includes(block.marker)) {
    return block;
  }
  const found = (block.content || '').match(
    /^\s*(TODO|DOING|NOW|LATER|WAITING|DONE|CANCELED)\b/,
  );
  block.marker = found ? found[1] : (undefined as unknown as string);
  return block;
};

export const renderBlock = (
  block: LogseqBlockType,
  graphName: string,
  query?: string,
) => {
  normalizeBlockMarker(block);
  const cleanContent = cleanBlock(block);
  marked.use({
    gfm: true,
    tables: true,
    walkTokens: query ? highlightTokens(query) : undefined,
    extensions: [
      logseqLinkExt(graphName, query),
      logseqBlockRefExt(),
      logseqTagExt(),
    ],
    renderer: {
      // Disable raw HTML: block/inline HTML from Logseq is shown as text, not executed.
      html(html: string) {
        return escapeHtml(html);
      },
      link(href: string | null, title: string | null, text: string) {
        const safe = safeHref(href, 'link');
        if (!safe) {
          return text;
        }
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
        return `<a href="${escapeHtml(safe)}"${titleAttr}>${text}</a>`;
      },
      image(href: string | null, title: string | null, text: string) {
        const safe = safeHref(href, 'image');
        const alt = escapeHtml(text || '');
        if (!safe) {
          return alt;
        }
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
        return `<img src="${escapeHtml(safe)}" alt="${alt}"${titleAttr}>`;
      },
    },
  });
  const html = marked.parse(cleanContent).trim();

  block.html = html;
  return block;
};

let cachedServiceKey: string | undefined;
let cachedServicePromise: Promise<LogseqServiceInterface> | undefined;

export const getLogseqService = async (): Promise<LogseqServiceInterface> => {
  const config = await getLogseqCopliotConfig();
  const key = `${config.logseqHost}|${config.logseqAuthToken}`;
  if (key === cachedServiceKey && cachedServicePromise) {
    return cachedServicePromise;
  }

  cachedServiceKey = key;
  const servicePromise: Promise<LogseqServiceInterface> = (async () => {
    try {
      if (await client.isDBGraph()) {
        return logseqServiceDB;
      }
    } catch (_error) {
      // The normal service is the fallback when DB graph detection is unavailable.
    }
    return logseqService;
  })();
  cachedServicePromise = servicePromise;
  return servicePromise;
};
