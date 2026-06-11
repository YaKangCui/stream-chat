import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useChatStream, type StreamStatus } from './useChatStream';
import { Markdown } from './Markdown';
import { useTheme } from './useTheme';
import { confirm } from './confirm';
import { Login } from './Login';
import { KnowledgeModal } from './KnowledgeModal';
import { SettingsModal } from './SettingsModal';
import { SkillsModal } from './SkillsModal';
import { useVoice } from './useVoice';
import { retrieve, type Retrieved } from './lib/rag';
import { subscribeAuth, getToken, getUser, clearAuth } from './lib/auth';
import { apiGet, apiPost } from './lib/request';
import {
  loadConversations, saveConversation, deleteConversation as dbDeleteConversation,
  loadMessages, persistMessages,
  type Conversation, type StoredMessage,
} from './db';
import './styles.css';

let idCounter = 0;
const genId = () => `${Date.now()}_${idCounter++}`;
const newConversation = (): Conversation => {
  const now = Date.now();
  return { id: genId(), title: '', createdAt: now, updatedAt: now };
};

type ChatMsg = { role: 'user' | 'assistant'; content: string };
type Ctx = { text: string; docName?: string };
const stripImg = (s: string) => s.replace(/!\[[^\]]*\]\(data:[^)]+\)/g, '').trim();
// 朗读前清掉 markdown 标记，读起来更顺
const speakClean = (s: string) => s
  .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  .replace(/```[\s\S]*?```/g, '，代码块，')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/[#>*_~|]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const toHistory = (msgs: StoredMessage[]): ChatMsg[] =>
  msgs.filter((m) => m.content.trim()).map((m) => ({ role: m.role, content: stripImg(m.content) || '[图片]' }));

export default function App() {
  const { t, i18n } = useTranslation();
  const { theme, toggle } = useTheme();
  const token = useSyncExternalStore(subscribeAuth, getToken);
  const user = useSyncExternalStore(subscribeAuth, getUser);

  const [input, setInput] = useState('');
  const [simulateDrop, setSimulateDrop] = useState(true);
  const [lastPrompt, setLastPrompt] = useState('');
  const [loaded, setLoaded] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);

  // RAG 知识库
  const [kbOpen, setKbOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [kbEnabled, setKbEnabled] = useState(() => localStorage.getItem('kb_enabled') === '1');
  const [retrieved, setRetrieved] = useState<Retrieved[]>([]);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [convQuery, setConvQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const voice = useVoice();

  const {
    status, isStreaming, canResume, attempts, dupSkipped, error, activeTool, toolSteps,
    send, stop, resume, reset,
  } = useChatStream();

  const turnRef = useRef<{ userId: string; assistantId: string } | null>(null);

  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    void (async () => {
      let convs = await loadConversations();
      if (convs.length === 0) {
        const c = newConversation();
        await saveConversation(c);
        convs = [c];
        setCurrentId(c.id);
        setMessages([]);
      } else {
        setCurrentId(convs[0].id);
        setMessages(await loadMessages(convs[0].id));
      }
      setConversations(convs);
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded || !currentId) return;
    const id = currentId;
    const timer = setTimeout(() => void persistMessages(id, messages), 400);
    return () => clearTimeout(timer);
  }, [messages, currentId, loaded]);

  const listRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 90,
    overscan: 6,
  });

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTo({ top: el.scrollHeight });
  });

  const prevStatus = useRef<StreamStatus>(status);
  useEffect(() => {
    if (status === 'paused' && prevStatus.current !== 'paused') setInput(lastPrompt);
    prevStatus.current = status;
  }, [status, lastPrompt]);

  const touchConversation = () => {
    if (!currentId) return;
    setConversations((prev) => {
      const updated = prev.map((c) => (c.id === currentId ? { ...c, updatedAt: Date.now() } : c));
      const cur = updated.find((c) => c.id === currentId);
      const rest = updated.filter((c) => c.id !== currentId);
      const sorted = cur ? [cur, ...rest] : updated;
      if (cur) void saveConversation(cur);
      return sorted;
    });
  };

  const updateConvTitle = (convId: string, title: string) => {
    setConversations((prev) => {
      const updated = prev.map((c) => (c.id === convId ? { ...c, title } : c));
      const target = updated.find((c) => c.id === convId);
      if (target) void saveConversation(target);
      return updated;
    });
  };

  const generateTitle = async (convId: string, history: ChatMsg[], answer: string) => {
    try {
      const data = await apiPost<{ title?: string }>('/title', {
        messages: [...history, { role: 'assistant', content: answer }],
      });
      const title = (data.title || '').trim();
      if (title) updateConvTitle(convId, title);
    } catch { /* ignore */ }
  };

  // 启用知识库时检索 top-K 片段作为上下文
  const buildContext = async (query: string): Promise<Ctx[] | undefined> => {
    if (!kbEnabled) { setRetrieved([]); return undefined; }
    const hits = await retrieve(query, 4);
    setRetrieved(hits);
    return hits.length ? hits.map((h) => ({ text: h.text, docName: h.docName })) : undefined;
  };

  const generateInto = (
    text: string, assistantId: string, history: ChatMsg[],
    meta: { isFirst: boolean; convId: string }, context?: Ctx[], image?: string,
  ) => {
    send(text, {
      simulateDrop,
      history,
      context,
      image,
      onToken: (token) =>
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + token } : m))),
      onDone: meta.isFirst ? (full) => void generateTitle(meta.convId, history, full) : undefined,
    });
  };

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) { alert(t('imgTooBig')); return; }
    const reader = new FileReader();
    reader.onload = () => setPendingImage(String(reader.result));
    reader.readAsDataURL(f);
  };

  const handleSend = async () => {
    const text = input.trim();
    const img = pendingImage;
    if ((!text && !img) || isStreaming || !currentId) return;
    const histText = text || '请描述这张图片';
    setLastPrompt(text);
    const convId = currentId;
    const userId = genId();
    const assistantId = genId();
    turnRef.current = { userId, assistantId };
    const displayContent = img ? `![](${img})${text ? '\n\n' + text : ''}` : text;
    const history: ChatMsg[] = [...toHistory(messages), { role: 'user', content: histText }];
    const isFirst = toHistory(messages).length === 0;
    setMessages((prev) => [
      ...prev,
      { id: userId, conversationId: convId, role: 'user', content: displayContent },
      { id: assistantId, conversationId: convId, role: 'assistant', content: '' },
    ]);
    setInput('');
    setPendingImage(null);
    touchConversation();
    const context = await buildContext(histText);
    generateInto(histText, assistantId, history, { isFirst, convId }, context, img || undefined);
  };

  const handleResend = async () => {
    const text = input.trim();
    const turn = turnRef.current;
    if (!text || !turn || !currentId) return;
    setLastPrompt(text);
    const convId = currentId;
    const priorIdx = messages.findIndex((m) => m.id === turn.userId);
    const prior = priorIdx === -1 ? [] : messages.slice(0, priorIdx);
    const history: ChatMsg[] = [...toHistory(prior), { role: 'user', content: text }];
    const isFirst = toHistory(prior).length === 0;
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === turn.assistantId);
      const kept = idx === -1 ? prev : prev.slice(0, idx + 1);
      return kept.map((m) => {
        if (m.id === turn.userId) return { ...m, content: text };
        if (m.id === turn.assistantId) return { ...m, content: '' };
        return m;
      });
    });
    setInput('');
    touchConversation();
    const context = await buildContext(text);
    generateInto(text, turn.assistantId, history, { isFirst, convId }, context);
  };

  const handleRegenerate = async () => {
    if (isStreaming || !currentId) return;
    const aIdx = messages.length - 1;
    const last = messages[aIdx];
    const userMsg = messages[aIdx - 1];
    if (!last || last.role !== 'assistant' || !userMsg || userMsg.role !== 'user') return;
    const text = userMsg.content;
    turnRef.current = { userId: userMsg.id, assistantId: last.id };
    const prior = messages.slice(0, aIdx - 1);
    const history: ChatMsg[] = [...toHistory(prior), { role: 'user', content: text }];
    setMessages((prev) => prev.map((m) => (m.id === last.id ? { ...m, content: '' } : m)));
    const context = await buildContext(text);
    generateInto(text, last.id, history, { isFirst: toHistory(prior).length === 0, convId: currentId }, context);
  };

  const handleExport = () => {
    if (messages.length === 0) return;
    const conv = conversations.find((c) => c.id === currentId);
    const title = conv?.title || t('untitled');
    const body = messages
      .map((m) => `## ${m.role === 'user' ? '🧑 我' : '🤖 助手'}\n\n${m.content}`)
      .join('\n\n---\n\n');
    const blob = new Blob([`# ${title}\n\n${body}\n`], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleResume = () => { setInput(''); resume(); };

  const switchConversation = async (id: string) => {
    if (id === currentId) return;
    reset();
    turnRef.current = null;
    setInput('');
    setRetrieved([]);
    const msgs = await loadMessages(id);
    setCurrentId(id);
    setMessages(msgs);
  };

  const handleNewChat = async () => {
    reset();
    turnRef.current = null;
    setInput('');
    setRetrieved([]);
    const c = newConversation();
    await saveConversation(c);
    setConversations((prev) => [c, ...prev]);
    setCurrentId(c.id);
    setMessages([]);
  };

  const handleDeleteConv = async (id: string) => {
    const ok = await confirm({ title: t('deleteTitle'), message: t('deleteMsg'), okText: t('ok'), cancelText: t('cancel') });
    if (!ok) return;
    await dbDeleteConversation(id);
    const remaining = conversations.filter((c) => c.id !== id);
    if (id === currentId) {
      reset();
      turnRef.current = null;
      setInput('');
      if (remaining.length) {
        setCurrentId(remaining[0].id);
        setMessages(await loadMessages(remaining[0].id));
      } else {
        const c = newConversation();
        await saveConversation(c);
        remaining.push(c);
        setCurrentId(c.id);
        setMessages([]);
      }
    }
    setConversations(remaining);
  };

  const toggleLang = () => {
    const next = i18n.language === 'zh' ? 'en' : 'zh';
    void i18n.changeLanguage(next);
    localStorage.setItem('lang', next);
  };

  const toggleKb = () => {
    setKbEnabled((v) => {
      const next = !v;
      localStorage.setItem('kb_enabled', next ? '1' : '0');
      return next;
    });
  };

  const handleLogout = () => {
    reset();
    clearAuth();
    void Promise.allSettled([0, 1, 2].map(() => apiGet('/me')));
  };

  const handleEnter = () => { if (canResume) void handleResend(); else void handleSend(); };

  // 复制消息
  const copyText = async (id: string, text: string) => {
    try { await navigator.clipboard.writeText(stripImg(text)); setCopiedId(id); setTimeout(() => setCopiedId(null), 1500); } catch { /* ignore */ }
  };

  // 朗读消息
  const speakMessage = (id: string, text: string) => {
    if (speakingId === id) { voice.stopSpeak(); setSpeakingId(null); return; }
    setSpeakingId(id);
    voice.speak(speakClean(text), () => setSpeakingId(null));
  };

  // 重命名会话
  const startRename = (c: Conversation) => { setEditingId(c.id); setEditingValue(c.title || ''); };
  const commitRename = () => {
    if (editingId) { const v = editingValue.trim(); if (v) updateConvTitle(editingId, v); }
    setEditingId(null);
  };

  // 粘贴/拖拽图片
  const readImageFile = (f: File | undefined | null) => {
    if (!f || !f.type.startsWith('image/')) return;
    if (f.size > 4 * 1024 * 1024) { alert(t('imgTooBig')); return; }
    const reader = new FileReader();
    reader.onload = () => setPendingImage(String(reader.result));
    reader.readAsDataURL(f);
  };
  const onPaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
    if (item) readImageFile(item.getAsFile());
  };
  const onDropImage = (e: React.DragEvent) => { e.preventDefault(); readImageFile(e.dataTransfer.files?.[0]); };

  // 回到底部
  const onMessagesScroll = () => {
    const el = listRef.current; if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 200);
  };
  const scrollToBottom = () => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });

  const filteredConversations = convQuery.trim()
    ? conversations.filter((c) => (c.title || t('untitled')).toLowerCase().includes(convQuery.trim().toLowerCase()))
    : conversations;

  if (!token) return <Login />;

  const lastMsg = messages[messages.length - 1];
  const canRegenerate =
    !isStreaming && status !== 'paused' && !!lastMsg &&
    lastMsg.role === 'assistant' && lastMsg.content.trim().length > 0;

  return (
    <div className="layout">
      <aside className="sidebar">
        <button className="new-chat" onClick={() => void handleNewChat()}>{t('newChat')}</button>
        <input className="conv-search" placeholder={t('searchConv')} value={convQuery} onChange={(e) => setConvQuery(e.target.value)} />
        <div className="conv-list">
          {filteredConversations.map((c) => (
            <div
              key={c.id}
              className={`conv-item ${c.id === currentId ? 'active' : ''}`}
              onClick={() => void switchConversation(c.id)}
              onDoubleClick={() => startRename(c)}
            >
              {editingId === c.id ? (
                <input
                  className="conv-rename"
                  autoFocus
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={commitRename}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null); }}
                />
              ) : (
                <span className="conv-title" title="双击重命名">{c.title || t('untitled')}</span>
              )}
              <button className="conv-del" onClick={(e) => { e.stopPropagation(); void handleDeleteConv(c.id); }}>×</button>
            </div>
          ))}
        </div>
        <div className="sidebar-footer">
          <div className="sidebar-tools">
            <button className="icon-btn" onClick={() => setSkillsOpen(true)} title={t('skillsTitle')}>🧩</button>
            <button className={`icon-btn ${kbEnabled ? 'on' : ''}`} onClick={() => setKbOpen(true)} title={t('kbTitle')}>📚</button>
            <button className="icon-btn" onClick={() => setSettingsOpen(true)} title={t('settings')}>⚙️</button>
          </div>
          <div className="sidebar-bottom">
            {user && <span className="uid">uid {user}</span>}
            <div className="spacer" />
            <button className="icon-btn" onClick={toggleLang}>{t('langBtn')}</button>
            <button className="icon-btn" onClick={toggle}>{theme === 'light' ? '🌙' : '☀️'}</button>
            <button className="icon-btn" onClick={handleLogout} title={t('expireDemo')}>🔒</button>
          </div>
        </div>
      </aside>

      <div className="app">
        <header className="header">
          <h1>{t('title')}</h1>
          <span className="subtitle">{t('subtitle')}</span>
          <div className="spacer" />
          <span className={`status status-${status}`}>
            {t(`status.${status}`)}
            {attempts > 0 && status !== 'done' ? t('reconnectSuffix', { n: attempts }) : ''}
          </span>
          <button className="icon-btn" onClick={handleExport} title={t('export')}>📥</button>
        </header>

        <div className="messages" ref={listRef} onScroll={onMessagesScroll} onDrop={onDropImage} onDragOver={(e) => e.preventDefault()}>
          {messages.length === 0 ? (
            <div className="empty">{t('empty')}</div>
          ) : (
            <div className="vlist" style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map((vi) => {
                const m = messages[vi.index];
                return (
                  <div
                    key={m.id}
                    data-index={vi.index}
                    ref={rowVirtualizer.measureElement}
                    className="vrow"
                    style={{
                      position: 'absolute', top: 0, left: 0, width: '100%',
                      transform: `translateY(${vi.start}px)`,
                      justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div className="bubble-wrap">
                      <div className={`bubble ${m.role}`}>
                        {m.role === 'assistant' ? (
                          m.content ? <Markdown>{m.content}</Markdown> : isStreaming ? <span className="caret">▍</span> : ''
                        ) : m.content.includes('![') ? (
                          <Markdown>{m.content}</Markdown>
                        ) : (
                          m.content
                        )}
                      </div>
                      {m.content.trim() && (
                        <button className="msg-copy" title="复制" onClick={() => void copyText(m.id, m.content)}>
                          {copiedId === m.id ? '✓' : '⧉'}
                        </button>
                      )}
                      {m.role === 'assistant' && m.content.trim() && voice.ttsSupported && (
                        <button className="msg-speak" title={t('speakTitle')} onClick={() => speakMessage(m.id, m.content)}>
                          {speakingId === m.id ? '⏹' : '🔊'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {showScrollBtn && (
          <button className="scroll-bottom" onClick={scrollToBottom} title="回到底部">↓</button>
        )}

        {canRegenerate && (
          <div className="regen-row">
            <button className="regen-btn" onClick={() => void handleRegenerate()}>🔄 {t('regenerate')}</button>
          </div>
        )}
        {kbEnabled && retrieved.length > 0 && (
          <details className="cite">
            <summary>📚 {t('citedN', { n: retrieved.length })}</summary>
            {retrieved.map((r, i) => (
              <div key={i} className="cite-item"><b>[{i + 1}] {r.docName}</b> {r.text}</div>
            ))}
          </details>
        )}
        {(attempts > 0 || dupSkipped > 0) && (
          <div className="metrics">{t('metrics', { a: attempts, d: dupSkipped })}</div>
        )}
        {toolSteps.length > 0 && (
          <details className="tooltl" open={isStreaming}>
            <summary>🔧 {t('toolStepsN', { n: toolSteps.length })}</summary>
            {toolSteps.map((s2, i) => (
              <div key={i} className="tl-item">{s2.running ? '⏳' : '✓'} {s2.label}{s2.ms != null ? ` · ${s2.ms}ms` : ''}</div>
            ))}
          </details>
        )}
        {activeTool && <div className="tool-banner">{t('toolCalling', { name: activeTool })}</div>}
        {canResume && <div className="hint">{t('pausedHint')}</div>}
        {error && <div className="error">{t('errorPrefix')}{error}</div>}

        {pendingImage && (
          <div className="img-preview">
            <img src={pendingImage} alt="preview" />
            <button onClick={() => setPendingImage(null)}>✕ {t('cancel')}</button>
          </div>
        )}
        <div className="composer">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={onPickImage}
          />
          {!isStreaming && !canResume && (
            <button className="img-btn" title={t('attachImage')} onClick={() => imageInputRef.current?.click()}>🖼️</button>
          )}
          {voice.sttSupported && !isStreaming && !canResume && (
            <button
              className={`img-btn ${voice.listening ? 'rec' : ''}`}
              title={t('micTitle')}
              onClick={() => (voice.listening ? voice.stopListen() : voice.startListen((tx) => setInput(tx)))}
            >🎤</button>
          )}
          <input
            value={input}
            placeholder={t('placeholder')}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleEnter(); }}
            onPaste={onPaste}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button className="stop" onClick={stop}>{t('stop')}</button>
          ) : canResume ? (
            <>
              <button className="resume" onClick={handleResume}>{t('resume')}</button>
              <button className="send" onClick={() => void handleResend()} disabled={!input.trim()}>{t('resend')}</button>
            </>
          ) : (
            <button className="send" onClick={() => void handleSend()} disabled={!input.trim()}>{t('send')}</button>
          )}
        </div>

        <label className="drop-toggle">
          <input type="checkbox" checked={simulateDrop} onChange={(e) => setSimulateDrop(e.target.checked)} />
          {t('simulateDrop')}
          <span style={{ width: 16 }} />
          <input type="checkbox" checked={kbEnabled} onChange={toggleKb} />
          {t('kbEnable')}
        </label>
      </div>

      {kbOpen && <KnowledgeModal onClose={() => setKbOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {skillsOpen && <SkillsModal onClose={() => setSkillsOpen(false)} />}
    </div>
  );
}
