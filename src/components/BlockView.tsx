// web 独立版的块渲染组件：不依赖浏览器扩展与 Logseq 桌面端。
// 渲染复用共享的 renderBlock（tool.ts，纯 marked 渲染）；TODO 切换直接调 HTTP API。
import React, { useState } from 'react';
import { renderBlock } from '../pages/logseq/tool';

type BlockLike = {
  uuid: string;
  content: string;
  marker?: string;
  children?: BlockLike[];
  page?: any;
};

const toBlock = (b: BlockLike): any => ({
  uuid: b.uuid,
  content: b.content,
  html: '',
  page: b.page || { name: '' },
  format: 'markdown',
  marker: b.marker || '',
  priority: '',
});

/** TODO/DONE 切换（直接调 service.changeBlockMarker，无 background 消息通道）。 */
export const MarkerToggle = ({
  block,
  onChange,
}: {
  block: BlockLike;
  onChange: (uuid: string, marker: string) => Promise<void>;
}) => {
  const [marker, setMarker] = useState(block.marker || '');
  if (!marker) return <></>;
  const done = marker === 'DONE' || marker === 'CANCELED';
  const toggle = async () => {
    const next = done ? 'TODO' : 'DONE';
    setMarker(next);
    try {
      await onChange(block.uuid, next);
    } catch (e: any) {
      setMarker(marker); // 失败回滚
      console.error(e);
    }
  };
  return (
    <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center', marginRight: 8 }}>
      <input type="checkbox" checked={done} onChange={toggle} />
      <span style={{ fontSize: 12, color: done ? '#718096' : '#d97706' }}>{marker}</span>
    </label>
  );
};

/** 递归块树（页面浏览）。 */
export const BlockTree = ({
  blocks,
  graph,
  onChangeMarker,
  depth = 0,
}: {
  blocks: BlockLike[];
  graph: string;
  onChangeMarker: (uuid: string, marker: string) => Promise<void>;
  depth?: number;
}) => {
  if (!blocks || blocks.length === 0) return <></>;
  return (
    <ul style={{ listStyle: 'none', margin: 0, paddingLeft: depth === 0 ? 0 : 16 }}>
      {blocks.map((b) => (
        <li key={b.uuid} style={{ margin: '6px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
            <MarkerToggle block={b} onChange={onChangeMarker} />
            <div
              style={{ flex: 1, fontSize: 14, lineHeight: 1.6 }}
              dangerouslySetInnerHTML={{
                __html: renderBlock(toBlock(b), graph).html,
              }}
            />
          </div>
          {b.children && b.children.length > 0 && (
            <BlockTree
              blocks={b.children}
              graph={graph}
              onChangeMarker={onChangeMarker}
              depth={depth + 1}
            />
          )}
        </li>
      ))}
    </ul>
  );
};
