export type Block = { preorder:number; depth:number; marker:string; text:string; selector?:{id:string}|null };
export type Page = { blocks: Block[] };
export function buildOutline(page: Page) { return page.blocks.slice().sort((a,b)=>a.preorder-b.preorder).map(b=>({ block:b, indent:b.depth*16, anchor:b.selector?.id ?? String(b.preorder) })); }
export function findBlockAnchor(blocks: Block[], target?: string) { if (!target) return undefined; return blocks.find(b=>b.selector?.id===target || String(b.preorder)===target); }
