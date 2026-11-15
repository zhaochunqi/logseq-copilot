import { Flex, Container, Heading, Text, Link, Divider } from '@chakra-ui/react';
import { LogseqConnectOptions } from './components/Connect';
import { OpenModeOptions } from './components/OpenMode';
import styles from './Options.module.scss';

const Options = () => {
  return (
    <Container className={styles.options} maxW={'56rem'} mt={'1rem'}>
      <Flex direction={'row'}>
        <Flex direction={'column'} w={'16rem'}>
          <Heading>Logseq Copilot</Heading>
          <Text>
            <Link
              href={`https://github.com/EINDEX/logseq-copilot/releases/tag/${process.env.VERSION}`}
            >
              {process.env.VERSION}
            </Link>
          </Text>
        </Flex>
        <Flex direction={'column'} w={'40rem'} gap={2}>
          <LogseqConnectOptions />

          <Divider />

          <OpenModeOptions />
        </Flex>
      </Flex>
    </Container>
  );
};

export default Options;
