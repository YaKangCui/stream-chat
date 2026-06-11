import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDocument, listDocuments, deleteDocument, type KbDoc } from './lib/rag';

export function KnowledgeModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [docs, setDocs] = useState<KbDoc[]>([]);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () => void listDocuments().then(setDocs);
  useEffect(() => { refresh(); }, []);

  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    await addDocument(name.trim() || `文档${docs.length + 1}`, text);
    setName(''); setText('');
    refresh();
    setBusy(false);
  };

  const del = async (id: string) => { await deleteDocument(id); refresh(); };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal kb-modal" onClick={(e) => e.stopPropagation()}>
        <h3>📚 {t('kbTitle')}</h3>
        <p className="kb-hint">{t('kbHint')}</p>
        <input className="kb-name" placeholder={t('kbDocName')} value={name} onChange={(e) => setName(e.target.value)} />
        <textarea className="kb-text" placeholder={t('kbPaste')} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="kb-actions-top">
          <button className="kb-add" onClick={() => void add()} disabled={busy || !text.trim()}>{t('kbAdd')}</button>
        </div>
        <div className="kb-list">
          {docs.length === 0 && <div className="kb-empty">{t('kbEmpty')}</div>}
          {docs.map((d) => (
            <div key={d.id} className="kb-item">
              <span>📄 {d.name}（{d.chunks} 块）</span>
              <button onClick={() => void del(d.id)}>×</button>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="modal-cancel" onClick={onClose}>{t('kbClose')}</button>
        </div>
      </div>
    </div>
  );
}
