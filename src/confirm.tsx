import { useSyncExternalStore } from 'react';

// 命令式弹窗：任意地方 await confirm({...}) 拿到用户选择，无需在组件里铺 state。
// 用一个极简的外部 store + useSyncExternalStore 驱动唯一的 <ConfirmHost/>。
type ConfirmState = {
  open: boolean; title: string; message: string;
  okText: string; cancelText: string; resolve?: (v: boolean) => void;
};
let state: ConfirmState = { open: false, title: '', message: '', okText: '确定', cancelText: '取消' };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
const getSnapshot = () => state;

export function confirm(opts: { title: string; message?: string; okText?: string; cancelText?: string }) {
  return new Promise<boolean>((resolve) => {
    state = {
      open: true, title: opts.title, message: opts.message || '',
      okText: opts.okText || '确定', cancelText: opts.cancelText || '取消', resolve,
    };
    emit();
  });
}
function answer(v: boolean) {
  state.resolve?.(v);
  state = { ...state, open: false, resolve: undefined };
  emit();
}

export function ConfirmHost() {
  const s = useSyncExternalStore(subscribe, getSnapshot);
  if (!s.open) return null;
  return (
    <div className="modal-mask" onClick={() => answer(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{s.title}</h3>
        {s.message && <p>{s.message}</p>}
        <div className="modal-actions">
          <button className="modal-cancel" onClick={() => answer(false)}>{s.cancelText}</button>
          <button className="modal-ok" onClick={() => answer(true)}>{s.okText}</button>
        </div>
      </div>
    </div>
  );
}
