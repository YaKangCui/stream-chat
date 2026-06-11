import { Suspense, lazy } from 'react';

// 动态 import 会被打包器自动拆成独立 chunk，首屏主包不再包含 markdown/高亮库。
const MarkdownRenderer = lazy(() => import('./MarkdownRenderer'));

export function Markdown({ children }: { children: string }) {
  return (
    <Suspense fallback={<div className="md md-fallback">{children}</div>}>
      <MarkdownRenderer>{children}</MarkdownRenderer>
    </Suspense>
  );
}
