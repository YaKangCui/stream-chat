import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 构建时生成版本号（时间戳 + git 短哈希），写进 dist/version.json，
// 同时用 define 注入到代码里的 __APP_VERSION__，运行时拿来比对。
function versionPlugin() {
  let gitHash = 'nogit';
  try { gitHash = execSync('git rev-parse --short HEAD').toString().trim(); } catch { /* 非 git 环境 */ }
  const version = `${Date.now()}-${gitHash}`;
  return {
    name: 'version-gen',
    config() {
      return { define: { __APP_VERSION__: JSON.stringify(version) } };
    },
    writeBundle(options: { dir?: string }) {
      writeFileSync(resolve(options.dir || 'dist', 'version.json'), JSON.stringify({ version }, null, 2));
    },
  };
}

export default defineConfig({
  plugins: [
    // React 19 编译器：编译期自动记忆化，减少手写 useMemo/useCallback 与重渲染
    react({ babel: { plugins: [['babel-plugin-react-compiler', {}]] } }),
    versionPlugin(),
  ],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: true } },
  },
});
