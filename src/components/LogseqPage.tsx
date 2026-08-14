import { LogseqPageIdenity } from '@/types/logseqBlock';

import styles from './logseq.module.scss';
import { viewerUrl } from './viewerUrl';

type LogseqPageLinkProps = {
  page: LogseqPageIdenity;
  graph: string;
  isPopUp?: boolean;
};

const LogseqPageLink = ({
  page,
  graph,
}: LogseqPageLinkProps) => {

  if (page === undefined || page?.name === undefined) {
    return <></>;
  }

  return (
    <>
      <a
        className={styles.logseqPageLink}
        href={viewerUrl(page?.name)}
        data-logseq-page={page?.name}
        target="_blank"
        rel="noreferrer"
      >
        <span className="tie tie-page"></span>
        {page?.originalName || page?.title}
      </a>
    </>
  );
};

export default LogseqPageLink;
