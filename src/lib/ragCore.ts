// RAG 检索核心：切块 + 分词 + 打分（纯函数，无 IndexedDB 依赖，可单测）
export function chunkText(text: string): string[] {
  const clean = text.replace(/\r/g, '').trim();
  const sentences = clean.split(/(?<=[。！？.!?\n])/).map((s) => s.trim()).filter(Boolean);
  const chunks: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > 220 && cur) { chunks.push(cur); cur = s; }
    else cur += s;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}
export function tokenize(s: string): string[] {
  const lower = s.toLowerCase();
  const latin = lower.match(/[a-z0-9]+/g) || [];
  const cjk = lower.match(/[一-龥]/g) || [];
  const bigrams: string[] = [];
  for (let i = 0; i < cjk.length - 1; i++) bigrams.push(cjk[i] + cjk[i + 1]);
  return [...latin, ...bigrams, ...cjk];
}
export function score(text: string, terms: string[]): number {
  const t = text.toLowerCase();
  let sc = 0;
  for (const term of terms) {
    if (!term) continue;
    let idx = 0;
    while ((idx = t.indexOf(term, idx)) !== -1) { sc += term.length >= 2 ? 2 : 0.3; idx += term.length; }
  }
  return sc / Math.sqrt(text.length);
}
