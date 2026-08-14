import { LogseqBlockType } from '../../types/logseqBlock';

import { marked } from 'marked';
import LogseqClient from './client';
import LogseqDBService from './db/service';
import LogseqService from './normal/service';
import { LogseqServiceInterface } from './interfaces';

// 懒初始化单例：tool.ts ↔ normal/service.ts 存在循环依赖（service 用 renderBlock，
// tool 用 LogseqService），模块顶层直接 new 会让先执行的一方拿到未定义的类而崩溃
// （独立 Web 入口从 normal/service 进入时必现；扩展入口从 tool 进入恰好幸免）。
// 实例化推迟到首次调用，保证类已定义。
let client: LogseqClient | undefined;
let logseqServiceDB: LogseqDBService | undefined;
let logseqService: LogseqService | undefined;

const getInstances = () => {
  if (!client) {
    client = new LogseqClient();
    logseqServiceDB = new LogseqDBService();
    logseqService = new LogseqService();
  }
  return { client, logseqServiceDB, logseqService };
};

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
    .replaceAll(/\$pfts_2lqh>\$(.*?)\$<pfts_2lqh\$/gim, '<em>$1</em>') // clean highlight
    .replaceAll(/{{video .*?}}/gm, '')
    .replaceAll(/^\s*?-\s*?$/gim, '')
    .trim();
};

const highlightTokens = (query: string) => {
  const re = new RegExp(`^(?!<mark>)${query}(?!<\/mark>)`, 'g');
  return (token) => {
    if (
      token.type !== 'code' &&
      token.type !== 'codespan' &&
      token.type !== 'logseqLink' &&
      token.text
    ) {
      token.text = query
        ? token.text.replaceAll(re, '<mark>' + query + '</mark>')
        : token.text;
    }
  };
};

const logseqLinkExt = (graph: string, query?: string) => {
  return {
    name: 'logseqLink',
    level: 'inline',
    tokenizer: function (src: string) {
      const match = src.match(/^#?\[\[(.*?)\]\]/);
      if (match) {
        return {
          type: 'logseqLink',
          raw: match[0],
          text: match[1],
          href: match[1].trim(),
          tokens: [],
        };
      }
      return false;
    },
    renderer: function (token) {
      const { text, href } = token;

      const fillText = query
        ? text.replaceAll(query, '<mark>' + query + '</mark>')
        : text;
      // 不依赖 Logseq 桌面端：[[页面]] 链接带 data-logseq-page 标记，点击行为由宿主决定
      // （扩展 → 打开 viewer 渲染页；web 版 → 页面内浏览），不再生成 logseq:// 协议链接。
      const safeHref = href.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
      // 不带 href：悬停/复制链接不会显示成宿主页 URL（如 google 搜索页），
      // 点击行为由宿主对 [data-logseq-page] 的事件委托处理。
      return `<a class="logseq-page-link" data-logseq-page="${safeHref}" target="_blank" rel="noreferrer"><span class="tie tie-page"></span>${fillText}</a>`;
    },
  };
};

export const renderBlock = (
  block: LogseqBlockType,
  graphName: string,
  query?: string,
) => {
  const cleanContent = cleanBlock(block);
  marked.use({
    gfm: true,
    tables: true,
    walkTokens: query ? highlightTokens(query) : undefined,
    extensions: [logseqLinkExt(graphName, query)],
  });
  const html = marked.parse(cleanContent).trim();

  block.html = html;
  return block;
};

export const getLogseqService = async (): Promise<LogseqServiceInterface> => {
  const { client, logseqServiceDB, logseqService } = getInstances();
  try {
    const resp = await client.isDBGraph()
    if (resp === "true" || resp === true || resp === false){
      return logseqServiceDB;
    }
  } catch (error) {
    
  }
  return logseqService;
};
