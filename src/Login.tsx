import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiPost } from './lib/request';
import { setAuth, getAuthMessage } from './lib/auth';

export function Login() {
  const { t } = useTranslation();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState(getAuthMessage());
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!u.trim() || !p.trim()) { setErr(t('inputRequired')); return; }
    setLoading(true); setErr('');
    try {
      const data = await apiPost<{ token: string; userId: unknown; username: string }>(
        '/login', { username: u, password: p },
      );
      // userId 是 lossless-json 的 LosslessNumber，String() 得到完整数字（不丢精度）
      setAuth(String(data.token), String(data.userId));
    } catch {
      setErr(t('loginFail'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login">
      <div className="login-card">
        <h2>{t('loginTitle')}</h2>
        {err && <div className="login-err">{err}</div>}
        <input placeholder={t('username')} value={u} onChange={(e) => setU(e.target.value)} />
        <input placeholder={t('password')} type="password" value={p}
          onChange={(e) => setP(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }} />
        <button onClick={() => void submit()} disabled={loading}>
          {loading ? '…' : t('loginBtn')}
        </button>
        <p className="login-tip">演示用：随便填账号密码即可登录</p>
      </div>
    </div>
  );
}
