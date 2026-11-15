import {
  Heading,
  Text,
  Grid,
  RadioGroup,
  Stack,
  Radio,
  Button,
} from '@chakra-ui/react';
import React, { useEffect } from 'react';
import Browser from 'webextension-polyfill';

import {
  getLogseqCopliotConfig,
  saveLogseqCopliotConfig,
} from '@/config';

type PageOpenMode = 'drawer' | 'tab';

export const OpenModeOptions = () => {
  const [init, setInit] = React.useState(false);
  const [openMode, setOpenMode] = React.useState<PageOpenMode>('drawer');

  useEffect(() => {
    if (init) return;
    getLogseqCopliotConfig().then((config) => {
      setOpenMode(config.pageOpenMode ?? 'drawer');
      setInit(true);
    });
  }, [init]);

  const onOpenModeChange = (value: string) => {
    const next: PageOpenMode = value === 'tab' ? 'tab' : 'drawer';
    setOpenMode(next);
    saveLogseqCopliotConfig({ pageOpenMode: next });
  };

  const openGraphBrowser = () => {
    Browser.tabs.create({ url: Browser.runtime.getURL('graph.html') });
  };

  return (
    <>
      <Heading size={'lg'}>Open Mode</Heading>
      <Grid
        width={'full'}
        gridTemplateColumns={'200px 1fr'}
        alignItems={'center'}
        justifyItems={'left'}
        rowGap={2}
        columnGap={2}
      >
        <Text fontSize="md" mb="0">
          Open page / block
        </Text>
        <RadioGroup
          name="pageOpenMode"
          value={openMode}
          onChange={onOpenModeChange}
        >
          <Stack spacing={5} direction="row">
            <Radio value="drawer">In-page drawer</Radio>
            <Radio value="tab">New tab</Radio>
          </Stack>
        </RadioGroup>
        <Text fontSize="md" mb="0">
          Graph browser
        </Text>
        <Button
          width={'fit-content'}
          variant="outline"
          onClick={openGraphBrowser}
        >
          Open Graph browser
        </Button>
      </Grid>
    </>
  );
};
