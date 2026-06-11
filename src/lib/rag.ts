import { openDB, type DBSchema } from 'idb';
import { chunkText, tokenize, score } from './ragCore';

// 简化版 RAG：粘贴文档→切块存库→提问时按关键词打分检索 top-K 片段。
// 说明：真实 RAG 用向量嵌入做语义检索；这里用轻量关键词检索（CJK 二元组 + 词），
// 无需嵌入服务、国内可直接跑，原理与流程是一致的。

export interface KbDoc { id: string; name: string; chunks: number; createdAt: number }
export interface KbChunk { id: string; docId: string; docName: string; text: string }
export interface Retrieved { text: string; docName: string; score: number }

interface KbDB extends DBSchema {
  docs: { key: string; value: KbDoc };
  chunks: { key: string; value: KbChunk; indexes: { byDoc: string } };
}

const dbPromise = openDB<KbDB>('stream-chat-kb', 1, {
  upgrade(db) {
    db.createObjectStore('docs', { keyPath: 'id' });
    const c = db.createObjectStore('chunks', { keyPath: 'id' });
    c.createIndex('byDoc', 'docId');
  },
});

let n = 0;
const genId = () => `${Date.now()}_${n++}`;

export async function addDocument(name: string, text: string): Promise<number> {
  const parts = chunkText(text);
  if (!parts.length) return 0;
  const id = genId();
  const db = await dbPromise;
  const tx = db.transaction(['docs', 'chunks'], 'readwrite');
  for (let i = 0; i < parts.length; i++) {
    await tx.objectStore('chunks').put({ id: `${id}_${i}`, docId: id, docName: name, text: parts[i] });
  }
  await tx.objectStore('docs').put({ id, name, chunks: parts.length, createdAt: Date.now() });
  await tx.done;
  return parts.length;
}

export async function listDocuments(): Promise<KbDoc[]> {
  const db = await dbPromise;
  return (await db.getAll('docs')).sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await dbPromise;
  await db.delete('docs', id);
  const tx = db.transaction('chunks', 'readwrite');
  let cur = await tx.store.index('byDoc').openCursor(id);
  while (cur) { await cur.delete(); cur = await cur.continue(); }
  await tx.done;
}

export async function retrieve(query: string, k = 4): Promise<Retrieved[]> {
  const db = await dbPromise;
  const all = await db.getAll('chunks');
  const terms = tokenize(query);
  return all
    .map((c) => ({ text: c.text, docName: c.docName, score: score(c.text, terms) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
