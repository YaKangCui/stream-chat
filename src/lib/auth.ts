const TOKEN_KEY = 'demo_token';
const USER_KEY = 'demo_user';

let token: string | null = localStorage.getItem(TOKEN_KEY);
let user: string | null = localStorage.getItem(USER_KEY);
let authMessage = '';

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export const subscribeAuth = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const getToken = () => token;
export const getUser = () => user;
export const getAuthMessage = () => authMessage;

export function setAuth(t: string, u: string) {
  token = t; user = u; authMessage = '';
  localStorage.setItem(TOKEN_KEY, t);
  localStorage.setItem(USER_KEY, u);
  emit();
}
export function clearAuth() {
  token = null; user = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  emit();
}

// —— 401 并发守卫：多个请求同时 401，只提示一次、只登出一次 ——
let redirectScheduled = false;
let toastShown = false;
export function handleUnauthorized() {
  if (!toastShown) {
    toastShown = true;
    void import('../toast').then(({ toast }) => toast('登录已失效，请重新登录'));
    setTimeout(() => { toastShown = false; }, 2000);
  }
  if (!redirectScheduled) {
    redirectScheduled = true;
    authMessage = '登录已失效，请重新登录';
    clearAuth(); // → App 自动切回登录页
    setTimeout(() => { redirectScheduled = false; }, 500);
  }
}
