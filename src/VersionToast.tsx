import { useEffect, useState } from 'react';

/**
 * 版本自愈：每 30s 轮询 version.json（页面不可见时跳过），
 * 与构建时注入的 __APP_VERSION__ 比对，发现新版本提示刷新；
 * 另外监听动态导入失败（部署后旧 chunk 没了）自动刷新恢复。
 */
export function VersionToast() {
  const [update, setUpdate] = useState(false);

  useEffect(() => {
    const current = __APP_VERSION__;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok) return;
        const data = (await r.json()) as { version?: string };
        if (data.version && data.version !== current) setUpdate(true);
      } catch { /* 拿不到就忽略 */ }
    };
    const timer = setInterval(check, 30_000);
    const onPreloadError = () => location.reload(); // Vite 动态导入失败
    window.addEventListener('vite:preloadError', onPreloadError);
    return () => {
      clearInterval(timer);
      window.removeEventListener('vite:preloadError', onPreloadError);
    };
  }, []);

  if (!update) return null;
  return (
    <div className="version-toast">
      🚀 发现新版本
      <button onClick={() => location.reload()}>刷新</button>
    </div>
  );
}
