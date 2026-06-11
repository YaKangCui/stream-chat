import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiGet, apiPost } from './lib/request';

type Skill = { name: string; label: string; description: string; enabled: boolean };

export function SkillsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<Skill[]>([]);

  useEffect(() => {
    void (async () => {
      try { setSkills(await apiGet<Skill[]>('/skills')); } catch { /* ignore */ }
    })();
  }, []);

  const toggle = async (name: string) => {
    const next = skills.map((s) => (s.name === name ? { ...s, enabled: !s.enabled } : s));
    setSkills(next);
    const disabled = next.filter((s) => !s.enabled).map((s) => s.name);
    try { setSkills(await apiPost<Skill[]>('/skills', { disabled })); } catch { /* ignore */ }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal skills-modal" onClick={(e) => e.stopPropagation()}>
        <h3>🧩 {t('skillsTitle')}</h3>
        <p className="kb-hint">{t('skillsHint')}</p>
        <div className="skill-list">
          {skills.map((s) => (
            <div key={s.name} className="skill-item">
              <div className="skill-info">
                <b>{s.label}</b>
                <span>{s.description}</span>
              </div>
              <label className="switch">
                <input type="checkbox" checked={s.enabled} onChange={() => void toggle(s.name)} />
                <span className="slider" />
              </label>
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
