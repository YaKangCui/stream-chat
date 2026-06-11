import { useCallback, useRef, useState } from 'react';
import { getToken, handleUnauthorized } from './lib/auth';
import { parseSse } from './lib/sse';

export type StreamStatus =
  | 'idle' | 'streaming' | 'reconnecting' | 'paused' | 'done' | 'error';

const MAX_RECONNECT = 5;
const RECONNECT_DELAY = 800;

interface SendOptions {
  onToken?: (token: string) => void;
  onDone?: (fullText: string) => void;
  simulateDrop?: boolean;
  history?: { role: string; content: string }[];
  context?: { text: string; docName?: string }[];
  image?: string;
}

interface SessionState {
  id: string;
  message: string;
  lastSeq: number;
  seen: Set<string>;
  fullText: string;
  completed: boolean;
  paused: boolean;
  attempts: number;
  simulateDrop: boolean;
  history?: { role: string; content: string }[];
  context?: { text: string; docName?: string }[];
  image?: string;
  onToken?: (token: string) => void;
  onDone?: (fullText: string) => void;
}

export function useChatStream() {
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [streamingText, setStreamingText] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [dupSkipped, setDupSkipped] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null); // 正在调用的工具
  const [toolSteps, setToolSteps] = useState<{ label: string; running: boolean; ms: number | null }[]>([]);

  const controllerRef = useRef<AbortController | null>(null);
  const sessionRef = useRef<SessionState | null>(null);

  const isStreaming = status === 'streaming' || status === 'reconnecting';

  const connect = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;

    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus(session.attempts === 0 ? 'streaming' : 'reconnecting');

    try {
      const token = getToken();
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          message: session.message,
          messages: session.history,
          context: session.context,
          image: session.image,
          sessionId: session.id,
          afterSeq: session.lastSeq,
          flaky: session.simulateDrop,
        }),
        signal: controller.signal,
      });
      if (resp.status === 401) { handleUnauthorized(); return; }
      if (!resp.ok || !resp.body) throw new Error(`请求失败：${resp.status}`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const msg = parseSse(part);
          if (!msg) continue;
          if (msg.event === 'done') { session.completed = true; continue; }

          const data = (msg.data ?? {}) as {
            seq?: number; id?: string; token?: string;
            tool?: { name: string; label?: string; phase?: string; ms?: number };
          };
          const { seq, id } = data;
          if (typeof seq !== 'number' || !id) continue;
          // 去重 + 顺序守卫（token 和 tool 共用一套 seq）
          if (session.seen.has(id) || seq <= session.lastSeq) { setDupSkipped((n) => n + 1); continue; }
          session.seen.add(id);
          session.lastSeq = seq;

          if (data.tool) {
            const tl = data.tool;
            const name = tl.label || tl.name || '工具';
            if (tl.phase === 'done') {
              setActiveTool(null);
              setToolSteps((prev) => {
                const next = [...prev];
                for (let k = next.length - 1; k >= 0; k--) {
                  if (next[k].label === name && next[k].running) { next[k] = { ...next[k], running: false, ms: tl.ms ?? null }; break; }
                }
                return next;
              });
            } else {
              setActiveTool(name);
              setToolSteps((prev) => [...prev, { label: name, running: true, ms: null }]);
            }
            continue;
          }
          if (typeof data.token === 'string') {
            setActiveTool(null); // 正文开始 → 收起工具状态
            session.fullText += data.token;
            setStreamingText(session.fullText);
            session.onToken?.(data.token);
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }

    if (controller.signal.aborted || session.paused) return;

    const s = sessionRef.current;
    if (!s) return;

    if (s.completed) {
      setActiveTool(null);
      setStatus('done');
      s.onDone?.(s.fullText);
      controllerRef.current = null;
      return;
    }

    if (s.attempts < MAX_RECONNECT) {
      s.attempts += 1;
      setAttempts(s.attempts);
      setStatus('reconnecting');
      await sleep(RECONNECT_DELAY);
      if (sessionRef.current === s && !s.paused) await connect();
    } else {
      setError('多次重连失败，请重试');
      setStatus('error');
      controllerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setActiveTool(null);
    const s = sessionRef.current;
    if (s && !s.completed) { s.paused = true; setStatus('paused'); }
    else setStatus((cur) => (cur === 'done' ? cur : 'idle'));
  }, []);

  const resume = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.completed) return;
    s.paused = false;
    void connect();
  }, [connect]);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    sessionRef.current = null;
    setStatus('idle');
    setStreamingText('');
    setAttempts(0);
    setDupSkipped(0);
    setError(null);
    setActiveTool(null);
    setToolSteps([]);
  }, []);

  const send = useCallback(
    (message: string, opts: SendOptions = {}) => {
      controllerRef.current?.abort();
      controllerRef.current = null;
      setError(null);
      setAttempts(0);
      setDupSkipped(0);
      setStreamingText('');
      setActiveTool(null);
      setToolSteps([]);

      sessionRef.current = {
        id: `s_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
        message,
        lastSeq: -1,
        seen: new Set(),
        fullText: '',
        completed: false,
        paused: false,
        attempts: 0,
        simulateDrop: opts.simulateDrop ?? false,
        history: opts.history,
        context: opts.context,
        image: opts.image,
        onToken: opts.onToken,
        onDone: opts.onDone,
      };
      void connect();
    },
    [connect],
  );

  return {
    status, isStreaming, canResume: status === 'paused',
    streamingText, attempts, dupSkipped, error, activeTool, toolSteps,
    send, stop, resume, reset,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

