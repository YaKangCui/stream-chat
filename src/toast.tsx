import { useSyncExternalStore } from 'react';

type ToastItem = { id: number; text: string };
let toasts: ToastItem[] = [];
let nid = 0;
const recent = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function toast(text: string) {
  if (recent.has(text)) return; // 短时间内相同内容只弹一次
  recent.add(text);
  setTimeout(() => recent.delete(text), 2000);
  const id = ++nid;
  toasts = [...toasts, { id, text }];
  emit();
  setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); emit(); }, 3000);
}

export function ToastHost() {
  const list = useSyncExternalStore(subscribe, () => toasts);
  if (!list.length) return null;
  return (
    <div className="toast-host">
      {list.map((t) => <div key={t.id} className="toast">{t.text}</div>)}
    </div>
  );
}
