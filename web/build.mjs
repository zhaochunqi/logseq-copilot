// 独立 Web 构建：复用现有 esbuild / postcss 依赖，输出 web/dist/。
import esbuild from 'esbuild';
import postcssPlugin from 'esbuild-style-plugin';
import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';

await esbuild.build({
  entryPoints: ['web/main.tsx'],
  bundle: true,
  outdir: 'web/dist',
  format: 'iife',
  minify: true,
  define: {
    'process.env.NODE_ENV': '"production"',
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
        plugins: [tailwindcss, autoprefixer],
      },
    }),
  ],
  logLevel: 'info',
});
