import axios from 'axios';
import { parse, isLosslessNumber } from 'lossless-json';
import { getToken, handleUnauthorized } from './auth';

export const request = axios.create({
  baseURL: '/api',
  // 用 lossless-json 解析，保留后端雪花 ID 这类大整数（避免被 JS Number 截断精度）
  transformResponse: [(data) => {
    if (typeof data !== 'string' || !data) return data;
    try { return parse(data); } catch { return data; }
  }],
});

// 请求拦截：自动注入 token
request.interceptors.request.use((config) => {
  const t = getToken();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

// 响应拦截：解包 {code,message,data}；401 交给并发守卫
request.interceptors.response.use(
  (resp) => {
    const body = resp.data as { code?: unknown; message?: string; data?: unknown };
    if (body && typeof body === 'object' && 'code' in body) {
      const code = isLosslessNumber(body.code) ? Number(body.code) : body.code;
      if (code !== 0) throw new Error(body.message || '请求失败');
      return body.data as unknown as typeof resp;
    }
    return body as unknown as typeof resp;
  },
  (err) => {
    if (err?.response?.status === 401) handleUnauthorized();
    return Promise.reject(err);
  },
);

// 解包后 request.post/get 直接拿到 data，这里做类型转换的小封装
export async function apiPost<T>(url: string, data?: unknown): Promise<T> {
  return (await request.post(url, data)) as unknown as T;
}
export async function apiGet<T>(url: string): Promise<T> {
  return (await request.get(url)) as unknown as T;
}
