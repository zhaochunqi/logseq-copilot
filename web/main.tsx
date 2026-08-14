// 独立 Web 入口：不依赖浏览器扩展与 Logseq 桌面端，直接对接 logseq-graph-api。
// 范围：搜索 + 结果渲染 + 页面内容浏览 + TODO 切换（剪藏不在此形态）。
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  getLogseqCopliotConfig,
  saveLogseqCopliotConfig,
} from '../src/config';
import LogseqService from '../src/pages/logseq/normal/service';
import LogseqClient from '../src/pages/logseq/normal/client';
import { LogseqSearchResult } from '../src/types/logseqBlock';
import { BlockTree } from '../src/components/BlockView';

const App = () => {
  const [host, setHost] = useState('');
  const [token, setToken] = useState('');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<LogseqSearchResult | null>(null);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  // 展开的页面（块树浏览）
  const [pageBlocks, setPageBlocks] = useState<{ page: string; blocks: any[] } | null>(null);

  useEffect(() => {
    getLogseqCopliotConfig().then((c) => {
      setHost(c.logseqHost);
      setToken(c.logseqAuthToken);
    });
  }, []);

  const save = async () => {
    try {
      await saveLogseqCopliotConfig({ logseqHost: host, logseqAuthToken: token });
      setError('');
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  };

  const newService = () => new LogseqService();

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError('');
    setPageBlocks(null);
    try {
      const resp = await newService().search(query.trim());
      setResult(resp.response);
    } catch (e: any) {
      setError(String(e?.message || e));
      setResult(null);
    } finally {
      setSearching(false);
    }
  };

  const openPage = async (pageName: string) => {
    setError('');
    try {
      const client = new LogseqClient();
      const blocks = await client.getPageBlocksTree(pageName);
      setPageBlocks({ page: pageName, blocks });
    } catch (e: any) {
      setError(`打开页面失败: ${e?.message || e}`);
    }
  };

  const changeMarker = async (uuid: string, marker: string) => {
    await newService().changeBlockMarker(uuid, marker);
  };


  const grouped = (result?.blocks || []).reduce<Record<string, any[]>>((acc, b) => {
    const name = b.page?.name || 'unknown';
    (acc[name] = acc[name] || []).push(b);
    return acc;
  }, {});

  // 块内 [[页面]] 链接（renderBlock 产出 data-logseq-page）→ 页面内浏览
  const onRootClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    const a = el.closest?.('a[data-logseq-page]');
    if (!a) return;
    e.preventDefault();
    const page = a.getAttribute('data-logseq-page');
    if (page) openPage(page);
  };

  return (
    <div onClick={onRootClick}>
      <div className="card">
        <label>Logseq API URL</label>
        <div className="row">
          <input
            className="grow"
            type="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="http://localhost:12315 或 https://logseq-api.mac.zhaochunqi.com"
          />
          <button onClick={save}>保存</button>
        </div>
        <label>Authorization Token</label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Bearer token（可选）"
        />
      </div>

      <div className="card">
        <div className="row">
          <input
            className="grow"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="搜索 graph…"
          />
          <button onClick={search} disabled={searching}>
            {searching ? '搜索中…' : '搜索'}
          </button>
        </div>
        {error && <div className="err">{error}</div>}
      </div>

      {pageBlocks && (
        <div className="card">
          <div className="group-title">
            📄 {pageBlocks.page}{' '}
            <button className="secondary" onClick={() => setPageBlocks(null)} style={{ marginLeft: 8 }}>
              关闭
            </button>
          </div>
          <BlockTree
            blocks={pageBlocks.blocks}
            graph={result?.graph || pageBlocks.page}
            onChangeMarker={changeMarker}
          />
        </div>
      )}

      {result && (
        <div>
          <div className="meta">
            Graph: {result.graph} · {result.blocks.length} blocks ·{' '}
            {result.pages.length} pages
          </div>
          {result.pages.length > 0 && (
            <div className="card">
              {result.pages.map((p) => (
                <div className="page" key={p.name}>
                  <a href={`#${encodeURIComponent(p.name)}`} onClick={(e) => { e.preventDefault(); openPage(p.name); }}>
                    {p.originalName || p.name}
                  </a>
                </div>
              ))}
            </div>
          )}
          {Object.entries(grouped).map(([pageName, blocks]) => (
            <div className="card group" key={pageName}>
              <div className="group-title">
                <a
                  href={`#${encodeURIComponent(pageName)}`}
                  onClick={(e) => { e.preventDefault(); openPage(pageName); }}
                >
                  {pageName}
                </a>
              </div>
              {blocks.map((b) => (
                <div className="block" key={b.uuid}>
                  <BlockTree blocks={[b]} graph={result.graph} onChangeMarker={changeMarker} />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<App />);
