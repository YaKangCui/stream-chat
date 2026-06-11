import { useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';

// react-markdown 默认会过滤 data: 协议的 URL（防 XSS），导致用户上传的 base64 图片不显示。
// 放行 http(s) 与 data:image，让自家内容的图片能正常渲染。
function urlTransform(url: string): string {
  if (/^(https?:|data:image\/)/i.test(url)) return url;
  if (/^[./#?]/.test(url)) return url; // 相对路径/锚点
  return '';
}

// 从 React children 递归取纯文本（用于代码块复制）
function nodeText(node: ReactNode): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (typeof node === 'object' && 'props' in node) {
    return nodeText((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return '';
}

// 自定义代码块：右上角加复制按钮
function Pre({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const text = nodeText(children);
  return (
    <div className="codeblock">
      <button
        className="code-copy"
        onClick={async () => {
          try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
        }}
      >
        {copied ? '✓ 已复制' : '复制'}
      </button>
      <pre>{children}</pre>
    </div>
  );
}

export default function MarkdownRenderer({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        urlTransform={urlTransform}
        components={{ pre: Pre }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
