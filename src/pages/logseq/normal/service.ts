import { LogseqBlockType, PageView } from '../../../types/logseqBlock';
import LogseqClient from './client';
import { renderBlock } from '../tool';
import { LogseqServiceInterface } from '../interfaces';

export default class LogseqService implements LogseqServiceInterface {
  public client: LogseqClient = new LogseqClient();

  public async getGraph() {
    return (await this.client.getGraph()).name;
  }

  public async getPageView(name: string): Promise<PageView | null> {
    const seen = new Set<string>();
    let lookupName = name;
    let meta: any;
    while (true) {
      seen.add(lookupName.toLowerCase());
      try {
        meta = await this.client.getPage({ name: lookupName });
        break;
      } catch (error: any) {
        const is404 = (error instanceof Response && error.status === 404) || error?.status === 404;
        if (!is404) throw error;
        const searchResult: any = await this.client.search(lookupName).catch(() => null);
        const candidate = searchResult?.page_candidates?.find(
          (item: any) => item?.via === 'alias' &&
            typeof item.alias === 'string' &&
            item.alias.toLowerCase() === lookupName.toLowerCase() &&
            typeof item.name === 'string' && !seen.has(item.name.toLowerCase()),
        );
        if (!candidate) return null;
        lookupName = candidate.name;
      }
    }

    const snapshot = await this.client.getPageSnapshot(lookupName);
    let blocks;
    let properties = meta.properties ?? [];
    if (snapshot?.exists) {
      blocks = snapshot.blocks;
      properties = snapshot.properties ?? properties;
    } else {
      try {
        const tree = await this.client.getPageBlocksTree(lookupName);
        blocks = tree.blocks;
      } catch (error: any) {
        if ((error instanceof Response && error.status === 404) || error?.status === 404) {
          return null;
        }
        throw error;
      }
    }
    return {
      name: meta.name,
      originalName: meta.originalName ?? meta.name,
      journal: !!meta['journal?'],
      properties,
      blocks,
    };
  }

  public async showMsg(message: string) {
    return await this.client.showMsg(message);
  }

  public async getVersion() {
    return (await this.client.getVersion()).version;
  }

  private async searchGraph(graphName: string, query: string) {
    const result = await this.client.search(query);
    result.blocks = await Promise.all(
      result.blocks.map(async (block) => {
        return await this.getBlock(block['block/uuid'], graphName, query);
      }),
    );
    result.pages = await Promise.all(
      result.pages.map(async (page: string) => {
        return await this.client.getPage({
          name: page,
        });
      }),
    );

    result.count = result.blocks.length + result.pages.length;
    result.graph = graphName;
    return result;
  }

  public async search(query: string) {
    const graph = await this.getGraph();
    console.debug(`Normal Graph Name: ${graph}`);
    const resp = {
      msg: 'success',
      status: 200,
      response: await this.searchGraph(graph, query),
    };
    return resp;
  }

  public async getBlock(
    blockUuid: string,
    graph: string,
    query?: string,
    includeChildren: boolean = false,
  ) {
    const block = await this.client.getBlockViaUuid(blockUuid, {
      includeChildren,
    });
    block.page = await this.client.getPage(block.page);
    return renderBlock(block, graph, query);
  }

  public async urlSearch(url: URL, opt: { fuzzy: boolean } = { fuzzy: false }) {
    const graph = await this.getGraph();
    const blockUuidSet = new Set();
    const blocks: LogseqBlockType[] = [];

    const blockAdd = (block: LogseqBlockType) => {
      if (blockUuidSet.has(block.uuid)) {
        return;
      }
      blockUuidSet.add(block.uuid);
      blocks.push(block);
    };

    const find = async (url: string) => {
      const results = await this.client.find(url);
      results.forEach(blockAdd);
    };

    if (url.hash) {
      await find(url.host + url.pathname + url.search + url.hash);
    }
    if (url.search) {
      await find(url.host + url.pathname + url.search);
    }

    if (url.pathname) {
      await find(url.host + url.pathname);
    }

    const count = blocks.length;

    if (url.host && opt.fuzzy) {
      await find(url.host);
    }

    return {
      status: 200,
      msg: 'success',
      response: {
        blocks: blocks.map((block) => {
          return renderBlock(block, graph, url.href);
        }),
        graph: graph,
      },
      count: count,
    };
  }

}
