import { createServer, type Server } from 'node:http';

interface FixturePage {
  name: string;
  id: number;
  uuid: string;
  journal?: boolean;
  journalDay?: number;
  properties: { key: string; value: string }[];
  blocks: {
    preorder: number;
    depth: number;
    marker: string;
    text: string;
    selector: { kind: 'durable'; id: string } | null;
  }[];
}

export interface FakeLogseqGraph {
  url: string;
  token: string;
  close(): Promise<void>;
}

export async function startFakeLogseqGraph(
  options: { token?: string } = {},
): Promise<FakeLogseqGraph> {
  const token = options.token ?? 'fake-logseq-token';
  const pages: FixturePage[] = [
    {
      name: 'Project Alpha',
      id: 1,
      uuid: 'page-alpha',
      properties: [
        { key: 'alias', value: 'nick' },
        { key: 'type', value: 'project' },
      ],
      blocks: [
        {
          preorder: 0,
          depth: 0,
          marker: '',
          text: 'Alpha **overview**',
          selector: null,
        },
        {
          preorder: 1,
          depth: 1,
          marker: 'TODO',
          text: 'Nested task',
          selector: { kind: 'durable', id: 'block-durable-alpha' },
        },
        {
          preorder: 2,
          depth: 2,
          marker: '',
          text: 'Deep child',
          selector: null,
        },
      ],
    },
    {
      name: 'Reference Page',
      id: 2,
      uuid: 'page-reference',
      properties: [],
      blocks: [
        {
          preorder: 0,
          depth: 0,
          marker: '',
          text: 'A reference note',
          selector: null,
        },
      ],
    },
    {
      name: '2024-01-02',
      id: 3,
      uuid: 'page-journal',
      journal: true,
      journalDay: 20240102,
      properties: [],
      blocks: [
        {
          preorder: 0,
          depth: 0,
          marker: '',
          text: 'Journal entry',
          selector: null,
        },
      ],
    },
  ];
  const pageIdentity = (page: FixturePage) => ({
    name: page.name.toLowerCase(),
    originalName: page.name,
    uuid: page.uuid,
    id: page.id,
    'journal?': !!page.journal,
    journalDay: page.journalDay,
    properties: page.properties,
  });
  const blocksFor = (page: FixturePage) =>
    page.blocks.map((block) => ({ page: page.name, ...block }));
  const blockUuid = (block: {
    preorder: number;
    page: string;
    selector?: { id: string } | null;
  }) => block.selector?.id ?? `block-${block.preorder}-${block.page}`;
  const allBlocks = pages.flatMap(blocksFor);
  const respond = (method: string, args: any[]) => {
    switch (method) {
      case 'logseq.App.checkCurrentIsDBGraph':
        return false;
      case 'logseq.App.getAppInfo':
        return { version: '0.0.0', supportDb: false };
      case 'logseq.App.getUserConfigs':
        return { preferredDateFormat: 'yyyy-MM-dd' };
      case 'logseq.Editor.getCurrentGraph':
      case 'logseq.getCurrentGraph':
        return {
          name: 'fixture',
          path: '/fixture',
          url: 'logseq_local_/fixture',
          pages: pages.length,
          blocks: allBlocks.length,
        };
      case 'logseq.Editor.getAllPages':
        return {
          pages: pages.map((page) => ({
            name: page.name,
            id: page.id,
            kind: page.journal ? 'journal' : 'page',
            journal_date: page.journalDay ?? null,
            block_count: page.blocks.length,
          })),
        };
      case 'logseq.Editor.getPage': {
        const identity = args[0];
        const page = pages.find((p) =>
          typeof identity === 'string'
            ? p.name.toLowerCase() === identity.toLowerCase()
            : identity?.id !== undefined
            ? p.id === identity.id
            : identity?.uuid
            ? p.uuid === identity.uuid
            : p.name.toLowerCase() ===
              String(identity?.name ?? '').toLowerCase(),
        );
        return page
          ? pageIdentity(page)
          : {
              __status: 404,
              statusCode: 404,
              error: 'PageNotFound',
              message: 'Page not found',
            };
      }
      case 'logseq.Editor.getPageBlocksTree': {
        const page = pages.find(
          (p) => p.name.toLowerCase() === String(args[0]).toLowerCase(),
        );
        return page
          ? { blocks: blocksFor(page) }
          : {
              __status: 404,
              statusCode: 404,
              error: 'PageNotFound',
              message: 'Page not found',
            };
      }
      case 'logseq.Graph.getPageSnapshot': {
        const page = pages.find(
          (p) => p.name.toLowerCase() === String(args[0]).toLowerCase(),
        );
        return page
          ? {
              exists: true,
              version: 1,
              properties: page.properties,
              blocks: blocksFor(page),
            }
          : {
              __status: 404,
              statusCode: 404,
              error: 'PageNotFound',
              message: 'Page not found',
            };
      }
      case 'logseq.Editor.getBlock': {
        const block = allBlocks.find((b) => blockUuid(b) === args[0]);
        if (!block) {
          return {
            __status: 404,
            statusCode: 404,
            error: 'BlockNotFound',
            message: 'Block not found',
          };
        }
        const page = pages.find((p) => p.name === block.page)!;
        return {
          id: allBlocks.indexOf(block) + 1,
          uuid: blockUuid(block),
          content: block.text,
          marker: block.marker,
          format: 'markdown',
          page: { name: page.name, uuid: page.uuid, id: page.id },
        };
      }
      case 'logseq.App.search': {
        const query = String(args[0] ?? '').toLowerCase();
        const matching = allBlocks.filter((block) =>
          block.text.toLowerCase().includes(query),
        );
        return {
          blocks: matching.map((b) => ({
            'block/uuid': blockUuid(b),
            'block/content': b.text,
            'block/page': pages.find((p) => p.name === b.page)?.id,
          })),
          pages: [],
          'pages-content': [],
          files: [],
          'has-more?': false,
          page_candidates:
            query === 'nick'
              ? [{ name: 'Project Alpha', via: 'alias', alias: 'nick' }]
              : [],
        };
      }
      case 'logseq.DB.q': {
        const query = String(args[0] ?? '')
          .replace(/^"|"$/g, '')
          .toLowerCase();
        return allBlocks
          .filter((b) => b.text.toLowerCase().includes(query))
          .map((b) => ({
            uuid: blockUuid(b),
            content: b.text,
            page: {
              name: b.page,
              uuid: pages.find((p) => p.name === b.page)?.uuid,
              id: pages.find((p) => p.name === b.page)?.id,
            },
          }));
      }
      case 'logseq.showMsg':
        return 'notification';
      default:
        return {
          __status: 400,
          statusCode: 400,
          error: `MethodNotExist: ${method}`,
          message: `MethodNotExist: ${method}`,
          code: -32601,
        };
    }
  };
  const server: Server = createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'POST' || req.url !== '/api')
      return send(404, { statusCode: 404, error: 'NotFound' });
    if (req.headers.authorization !== `Bearer ${token}`)
      return send(401, { statusCode: 401, error: 'Unauthorized' });
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        const { method, args = [] } = JSON.parse(raw);
        const result: any = respond(method, args);
        if (result?.__status) {
          const { __status, ...body } = result;
          return send(__status, body);
        }
        return send(200, result);
      } catch {
        return send(400, { statusCode: 400, error: 'InvalidRequest' });
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Failed to bind fixture server');
  return {
    url: `http://127.0.0.1:${address.port}`,
    token,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
