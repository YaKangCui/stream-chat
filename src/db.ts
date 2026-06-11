import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/** 一个会话（对话）。 */
export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

/** 一条消息，归属于某个会话。 */
export interface StoredMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatDB extends DBSchema {
  conversations: { key: string; value: Conversation };
  messages: {
    key: string;
    value: StoredMessage;
    indexes: { byConversation: string };
  };
}

const DB_NAME = 'stream-chat-demo';

let dbPromise: Promise<IDBPDatabase<ChatDB>> | null = null;
function getDB() {
  if (!dbPromise) {
    // 版本 2：在原 messages 基础上新增 conversations 表 + 按会话的索引
    dbPromise = openDB<ChatDB>(DB_NAME, 2, {
      upgrade(db, oldVersion, _newVersion, tx) {
        if (!db.objectStoreNames.contains('messages')) {
          const store = db.createObjectStore('messages', { keyPath: 'id' });
          store.createIndex('byConversation', 'conversationId');
        } else if (oldVersion < 2) {
          const store = tx.objectStore('messages');
          if (!store.indexNames.contains('byConversation')) {
            store.createIndex('byConversation', 'conversationId');
          }
        }
        if (!db.objectStoreNames.contains('conversations')) {
          db.createObjectStore('conversations', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function loadConversations(): Promise<Conversation[]> {
  const db = await getDB();
  const all = await db.getAll('conversations');
  return all.sort((a, b) => b.updatedAt - a.updatedAt); // 最近更新的在前
}

export async function saveConversation(conv: Conversation): Promise<void> {
  const db = await getDB();
  await db.put('conversations', conv);
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('conversations', id);
  // 连带删除该会话的所有消息
  const tx = db.transaction('messages', 'readwrite');
  let cursor = await tx.store.index('byConversation').openCursor(id);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function loadMessages(conversationId: string): Promise<StoredMessage[]> {
  const db = await getDB();
  return db.getAllFromIndex('messages', 'byConversation', conversationId);
}

/** 整会话覆盖写入：先清掉该会话旧消息，再写入当前全部。配合防抖调用。 */
export async function persistMessages(
  conversationId: string,
  messages: StoredMessage[],
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('messages', 'readwrite');
  let cursor = await tx.store.index('byConversation').openCursor(conversationId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  for (const m of messages) await tx.store.put(m);
  await tx.done;
}
