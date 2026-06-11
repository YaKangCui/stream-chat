import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

/** 明暗主题：写到 <html data-theme>，CSS 用变量响应；选择记忆到 localStorage。 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('theme') as Theme) || 'light',
  );
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')) };
}
