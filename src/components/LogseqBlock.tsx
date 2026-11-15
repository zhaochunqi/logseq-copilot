import { LogseqBlockType } from '@/types/logseqBlock';
import LogseqPageLink from './LogseqPage';
import styles from './logseq.module.scss';

type LogseqBlockProps = {
  graph: string;
  blocks: LogseqBlockType[];
  isPopUp?: boolean;
};

export const LogseqBlock = ({ graph, blocks }: LogseqBlockProps) => {
  if (blocks.length === 0) {
    return <></>;
  }

  const block = blocks[0]; // TODO: randomyl picking first item - need to change later

  const toBlock = (block) => {
    if (!block.uuid) {
      return <></>;
    }
    return (
      <a
        className={styles.toBlock}
        href="#"
        data-logseq-block={block.uuid}
        onClick={(e) => e.preventDefault()}
      >
        <span className={'tie tie-block'}></span>
        To Block
      </a>
    );
  };

  if (block.html) {
    return (
      <div className={styles.block}>
        <div className={styles.blockHeader}>
          <LogseqPageLink graph={graph} page={block.page}></LogseqPageLink>
        </div>
        <div className={styles.blockBody}>
          <ul className={styles.blockContentList}>
            {blocks.map((block) => (
              <li key={block.uuid} className={styles.blockContentListItem}>
                <div className={styles.blockContentRoot}>
                  <div
                    className={styles.blockContent}
                    dangerouslySetInnerHTML={{ __html: block.html }}
                  />
                  {toBlock(block)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }
  return <></>;
};
