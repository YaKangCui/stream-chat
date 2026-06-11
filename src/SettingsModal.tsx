import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiGet, apiPost } from './lib/request';

// 供应商预设：选了自动填充地址/模型，再填 key 即可
const PRESETS = [
  { id: 'zhipu', name: '智谱 GLM（免费）', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', visionModel: 'glm-4v-flash', imageModel: 'cogview-3-flash' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', visionModel: '', imageModel: '' },
  { id: 'qwen', name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo', visionModel: 'qwen-vl-plus', imageModel: '' },
  { id: 'ollama', name: 'Ollama（本地免key）', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b', visionModel: '', imageModel: '' },
  { id: 'groq', name: 'Groq（需梯子）', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', visionModel: '', imageModel: '' },
  { id: 'custom', name: '自定义', baseUrl: '', model: '', visionModel: '', imageModel: '' },
];

type Cfg = { baseUrl: string; model: string; visionModel: string; imageModel: string; hasKey: boolean; keyMask: string };

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [visionModel, setVisionModel] = useState('');
  const [imageModel, setImageModel] = useState('');
  const [key, setKey] = useState('');
  const [keyMask, setKeyMask] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; detail: string } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const c = await apiGet<Cfg>('/config');
        setBaseUrl(c.baseUrl); setModel(c.model); setVisionModel(c.visionModel);
        setImageModel(c.imageModel); setHasKey(c.hasKey); setKeyMask(c.keyMask);
      } catch { /* ignore */ }
    })();
  }, []);

  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p || id === 'custom') return;
    setBaseUrl(p.baseUrl); setModel(p.model); setVisionModel(p.visionModel); setImageModel(p.imageModel);
  };

  const save = async () => {
    setSaving(true); setTest(null);
    try {
      const c = await apiPost<Cfg>('/config', { baseUrl, model, visionModel, imageModel, key });
      setHasKey(c.hasKey); setKeyMask(c.keyMask); setKey('');
    } finally { setSaving(false); }
  };

  const doTest = async () => {
    setTesting(true);
    try {
      await save();
      const r = await apiPost<{ ok: boolean; detail: string }>('/config/test');
      setTest(r);
    } finally { setTesting(false); }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <h3>⚙️ {t('settings')}</h3>
        <label className="field">
          <span>{t('provider')}</span>
          <select defaultValue="" onChange={(e) => applyPreset(e.target.value)}>
            <option value="" disabled>{t('choosePreset')}</option>
            {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="field"><span>{t('baseUrl')}</span>
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://..." /></label>
        <label className="field"><span>{t('apiKey')}</span>
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)}
            placeholder={hasKey ? `${t('keyKeep')}（${keyMask}）` : 'sk-...'} /></label>
        <label className="field"><span>{t('modelName')}</span>
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="glm-4-flash" /></label>
        <label className="field"><span>{t('visionModel')}</span>
          <input value={visionModel} onChange={(e) => setVisionModel(e.target.value)} placeholder="glm-4v-flash" /></label>
        <label className="field"><span>{t('imageModel')}</span>
          <input value={imageModel} onChange={(e) => setImageModel(e.target.value)} placeholder="cogview-3-flash" /></label>
        {test && <div className={`test-result ${test.ok ? 'ok' : 'bad'}`}>{test.ok ? '✅ ' : '❌ '}{test.detail}</div>}
        <div className="modal-actions">
          <button className="modal-cancel" onClick={onClose}>{t('kbClose')}</button>
          <button className="btn-ghost" onClick={() => void doTest()} disabled={testing || saving}>{testing ? '测试中…' : t('testConn')}</button>
          <button className="btn-primary" onClick={() => void save()} disabled={saving}>{saving ? '…' : t('save')}</button>
        </div>
      </div>
    </div>
  );
}
