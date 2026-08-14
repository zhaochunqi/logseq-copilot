// 扩展内置渲染页：点击搜索结果的页面/块链接后在此渲染页面块树。
// 不依赖 Logseq 桌面端，数据直接走 logseq-graph-api（或官方 HTTP API）。
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BlockTree } from '../../components/BlockView';
import LogseqClient from '../logseq/normal/client';
import LogseqService from '../logseq/normal/service';

const Viewer = () => {
  const page = new URLSearchParams(location.search).get('page') || '';
  const [graph, setGraph] = useState('');
  const [blocks, setBlocks] = useState<any[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const client = new LogseqClient();
        const service = new LogseqService();
        setGraph(await service.getGraph());
        setBlocks(await client.getPageBlocksTree(page));
      } catch (e: any) {
        setError(String(e?.message || e));
      }
    })();
  }, [page]);

  return (
    <div>
      <h1>📄 {page}</h1>
      {error && <div className="err">{error}</div>}
      {!error && !blocks && <div className="loading">加载中…</div>}
      {blocks && (
        <BlockTree
          blocks={blocks}
          graph={graph}
          onChangeMarker={async (uuid, marker) => {
            await new LogseqService().changeBlockMarker(uuid, marker);
          }}
        />
      )}
    </div>
  );
};

createRoot(document.getElementById('app-container')!).render(<Viewer />);
