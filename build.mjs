import archiver from 'archiver';
import autoprefixer from 'autoprefixer';
import * as dotenv from 'dotenv';
// 本地开发构建（npm run build:local）：不注入商店公钥，Chrome 生成独立开发 ID，
// 避免与商店版同 ID 冲突导致 chrome-extension:// 页面被屏蔽（ERR_BLOCKED_BY_CLIENT）。
const isLocalBuild = process.argv.includes('--local') || process.env.LOCAL_BUILD === '1';
if (isLocalBuild) {
  delete process.env.CHROME_EXTENSION_KEY;
}
import esbuild from 'esbuild';
import postcssPlugin from 'esbuild-style-plugin';
import fs from 'fs-extra';
import process from 'node:process';
import tailwindcss from 'tailwindcss';
import getManifest from './src/manifest.json.cjs';
import remToPx from 'postcss-rem-to-pixel';

dotenv.config();

// 本地构建输出到独立目录 build-local/（发布构建用 build/）。
// 关键：本地构建绝不整目录删除 —— Chrome 加载的 unpacked 扩展目录一旦被删，
// 扩展即失效，其 chrome-extension:// 页面会报 ERR_BLOCKED_BY_CLIENT。
const outdir = isLocalBuild ? 'build-local' : 'build';

const nodeEnv = JSON.stringify(process.env.NODE_ENV || 'production');
const VERSION = `${process.env.VERSION}` || '0.0.0';

async function deleteOldDir() {
  // 发布构建：干净输出；本地构建：保留目录（esbuild/copy 覆盖写，避免扩展失效）
  if (!isLocalBuild) {
    await fs.remove(outdir);
  }
}

async function runEsbuild() {
  await esbuild.build({
    entryPoints: [
      'src/pages/content/index.tsx',
      'src/pages/background/index.ts',
      'src/pages/options/index.tsx',
      'src/pages/popup/index.tsx',
      'src/pages/viewer/index.tsx',
    ],
    bundle: true,
    outdir: outdir,
    treeShaking: true,
    minify: nodeEnv === 'production' ? true : false,
    legalComments: 'none',
    define: {
      'process.env.NODE_ENV': nodeEnv,
      'process.env.VERSION': JSON.stringify(VERSION),
    },
    jsxFragment: 'Fragment',
    jsx: 'automatic',
    loader: {
      '.png': 'dataurl',
      '.woff2': 'dataurl',
    },
    plugins: [
      postcssPlugin({
        postcss: {
          plugins: [tailwindcss, autoprefixer, remToPx],
        },
      }),
    ],
    globalName: 'browser',
  });
}

async function zipFolder(dir, version) {
  const output = fs.createWriteStream(`${dir}-${version}.zip`);
  const archive = archiver('zip', {
    zlib: { level: 9 },
  });
  archive.pipe(output);
  archive.directory(dir, false);
  await archive.finalize();
}

async function copyFiles(entryPoints, targetDir) {
  await fs.ensureDir(targetDir);
  await Promise.all(
    entryPoints.map(async (entryPoint) => {
      await fs.copy(entryPoint.src, `${targetDir}/${entryPoint.dst}`);
    }),
  );
}

async function build() {
  await deleteOldDir();
  await runEsbuild();

  const commonFiles = [
    { src: `${outdir}/content/index.js`, dst: 'content-script.js' },
    { src: `${outdir}/content/index.css`, dst: 'content-script.css' },
    { src: `${outdir}/background/index.js`, dst: 'background.js' },
    { src: `${outdir}/options/index.js`, dst: 'options.js' },
    { src: `${outdir}/options/index.css`, dst: 'options.css' },
    { src: `${outdir}/popup/index.js`, dst: 'popup.js' },
    { src: `${outdir}/popup/index.css`, dst: 'popup.css' },
    { src: 'src/pages/options/index.html', dst: 'options.html' },
    { src: 'src/pages/popup/index.html', dst: 'popup.html' },
    { src: 'src/pages/viewer/index.html', dst: 'viewer.html' },
    { src: `${outdir}/viewer/index.js`, dst: 'viewer.js' },
    { src: 'src/assets', dst: 'assets' },
  ];

  // chromium
  await copyFiles([...commonFiles], `./${outdir}/chrome`);
  await fs.writeFile(
    `./${outdir}/chrome/manifest.json`,
    JSON.stringify(getManifest('chrome')),
  );
  await zipFolder(`./${outdir}/chrome`, VERSION);

  // edge
  await copyFiles([...commonFiles], `./${outdir}/edge`);
  await fs.writeFile(
    `./${outdir}/edge/manifest.json`,
    JSON.stringify(getManifest('edge')),
  );
  await zipFolder(`./${outdir}/edge`, VERSION);

  // firefox
  await copyFiles([...commonFiles], `./${outdir}/firefox`);
  await fs.writeFile(
    `./${outdir}/firefox/manifest.json`,
    JSON.stringify(getManifest('firefox')),
  );
  await zipFolder(`./${outdir}/firefox`, VERSION);

  console.log('Build success.');
}

build();
