// 模型网关中间层：运行时配置（可经 /api/config 热更新并持久化），代理任意 OpenAI 兼容供应商。
import http from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { TOOLS, findSkill, listSkills } from './skills.mjs';

function loadEnv() {
  if (!existsSync('.env')) return;
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const PORT = Number(process.env.PORT) || 8787;
const OVERLAP = 3;
const CONFIG_FILE = '.runtime-config.json';

// 运行时配置：默认来自 env，可被 /api/config 覆盖并落盘
const cfg = {
  baseUrl: process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1',
  key: process.env.LLM_API_KEY || '',
  model: process.env.LLM_MODEL || 'llama-3.3-70b-versatile',
  visionModel: process.env.LLM_VISION_MODEL || 'glm-4v-flash',
  imageModel: process.env.LLM_IMAGE_MODEL || 'cogview-3-flash',
  imageSearchKey: process.env.IMAGE_SEARCH_KEY || '',
  searchKey: process.env.SEARCH_API_KEY || '',
  disabledSkills: [],
};
try { if (existsSync(CONFIG_FILE)) Object.assign(cfg, JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))); } catch { /* ignore */ }
function persistConfig() {
  try { writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2)); } catch { /* ignore */ }
}

const SYSTEM = process.env.LLM_SYSTEM || '你是一个乐于助人的中文 AI 助手。需要实时信息（时间/价格/天气）或精确计算时请调用工具。当用户想看某地/某物的图片时，默认调用 search_image 找真实照片；只有用户明确说“画/生成/想象”时才用 generate_image。不要凭空编造。';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sessions = new Map();
const hasUpstream = () => Boolean(cfg.key) || cfg.baseUrl.includes('localhost');
const authHeaders = () => ({ 'Content-Type': 'application/json', ...(cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {}) });

function nowContext() {
  const s = new Date().toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric',
    weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  return `当前北京时间：${s}。`;
}

const SETUP_HELP = '⚠️ 还没接入大模型。点右上角 ⚙️ 配置供应商与 key，或在 `.env` 里填写。';

async function fetchT(url, ms = 6000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { signal: c.signal }); } finally { clearTimeout(t); }
}

async function streamCompletion(session, messages, opts = {}) {
  const useTools = opts.useTools !== false;
  const model = opts.model || cfg.model;
  const tools = TOOLS.filter((tl) => !cfg.disabledSkills.includes(tl.function.name));
  const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ model, stream: true, messages, ...(useTools && tools.length ? { tools, tool_choice: 'auto' } : {}) }),
  });
  if (!resp.ok || !resp.body) { const d = await resp.text().catch(() => ''); throw new Error(`上游错误 ${resp.status} ${d.slice(0, 200)}`); }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '', content = '';
  const toolMap = new Map();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const l = line.trim();
      if (!l.startsWith('data:')) continue;
      const p = l.slice(5).trim();
      if (p === '[DONE]') continue;
      let j; try { j = JSON.parse(p); } catch { continue; }
      const delta = j.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.content) { content += delta.content; session.tokens.push({ token: delta.content }); }
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          const cur = toolMap.get(idx) || { id: '', name: '', args: '' };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name = tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          toolMap.set(idx, cur);
        }
      }
    }
  }
  return { content, toolCalls: [...toolMap.values()] };
}

async function runLLM(session) {
  if (session.started) return;
  session.started = true;
  if (!hasUpstream()) { session.tokens.push({ token: SETUP_HELP }); session.done = true; return; }

  const history = Array.isArray(session.history) && session.history.length ? session.history : [{ role: 'user', content: session.message }];
  const messages = [{ role: 'system', content: `${SYSTEM}\n${nowContext()}` }, ...history];
  if (Array.isArray(session.context) && session.context.length) {
    const refs = session.context.map((c, i) => `[${i + 1}] ${typeof c === 'string' ? c : c.text}`).join('\n\n');
    messages.splice(1, 0, { role: 'system', content: `以下是知识库参考资料，请优先依据它们回答并标注[1]等。\n\n${refs}` });
  }
  const useVision = Boolean(session.image);
  if (useVision) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        const txt = typeof messages[i].content === 'string' ? messages[i].content : '';
        messages[i] = { role: 'user', content: [{ type: 'text', text: txt || '请描述这张图片。' }, { type: 'image_url', image_url: { url: session.image } }] };
        break;
      }
    }
  }

  try {
    for (let hop = 0; hop < 4; hop++) {
      const { content, toolCalls } = await streamCompletion(session, messages, { model: useVision ? cfg.visionModel : cfg.model, useTools: !useVision });
      if (!toolCalls.length) { session.done = true; return; }
      messages.push({ role: 'assistant', content: content || null, tool_calls: toolCalls.map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.args || '{}' } })) });
      const ctx = { cfg, fetchT, authHeaders, nowContext };
      for (const tc of toolCalls) {
        const skill = findSkill(tc.name);
        const label = skill?.label || tc.name;
        session.tokens.push({ tool: { name: tc.name, label, phase: 'start' } });
        let args = {}; try { args = JSON.parse(tc.args || '{}'); } catch { /* ignore */ }
        const t0 = Date.now();
        let result;
        try { result = skill ? await skill.run(args, ctx) : { text: `未知工具：${tc.name}` }; }
        catch (e) { result = { text: `工具执行失败：${String(e)}` }; }
        session.tokens.push({ tool: { name: tc.name, label, phase: 'done', ms: Date.now() - t0 } });
        if (result.image) {
          session.tokens.push({ token: `\n\n![${String(args.query || args.prompt || 'image').slice(0, 40)}](${result.image})\n\n` });
          messages.push({ role: 'tool', tool_call_id: tc.id, content: result.note || '图片已展示给用户。' });
        } else {
          messages.push({ role: 'tool', tool_call_id: tc.id, content: result.text ?? '' });
        }
      }
    }
    session.done = true;
  } catch (e) { session.tokens.push({ token: `\n\n[请求失败] ${String(e)}` }); session.done = true; }
}

async function callLLMOnce(messages) {
  if (!hasUpstream()) return '';
  try {
    const resp = await fetch(`${cfg.baseUrl}/chat/completions`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ model: cfg.model, stream: false, messages, temperature: 0.3 }) });
    if (!resp.ok) return '';
    return (await resp.json()).choices?.[0]?.message?.content ?? '';
  } catch { return ''; }
}

async function testConfig() {
  if (!hasUpstream()) return { ok: false, detail: '未配置 key' };
  try {
    const r = await fetch(`${cfg.baseUrl}/chat/completions`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: '你好' }], max_tokens: 8, stream: false }) });
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status} ${(await r.text()).slice(0, 120)}` };
    const j = await r.json();
    return { ok: true, detail: (j.choices?.[0]?.message?.content || '连接正常').slice(0, 40) };
  } catch (e) { return { ok: false, detail: String(e) }; }
}

function maskedConfig() {
  return {
    baseUrl: cfg.baseUrl, model: cfg.model, visionModel: cfg.visionModel, imageModel: cfg.imageModel,
    hasKey: Boolean(cfg.key), keyMask: cfg.key ? `****${cfg.key.slice(-4)}` : '',
    hasSearchKey: Boolean(cfg.imageSearchKey),
  };
}

function authed(req) { const h = req.headers['authorization'] || ''; return h.startsWith('Bearer ') && h.length > 12; }
function unauthorized(res) { res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' }); res.end('{"code":401,"message":"unauthorized"}'); }
function json(res, data) { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ code: 0, data })); }
async function readBody(req) { let b = ''; for await (const c of req) b += c; try { return JSON.parse(b || '{}'); } catch { return {}; } }

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/login') {
    const { username = '', password = '' } = await readBody(req);
    if (!username || !password) { res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' }); res.end('{"code":400,"message":"缺少账号或密码"}'); return; }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end('{"code":0,"data":{"token":"tok_' + Date.now() + '_' + Math.random().toString(36).slice(2) + '","userId":9007199254740993,"username":' + JSON.stringify(username) + '}}');
    return;
  }
  if (req.method === 'GET' && req.url === '/api/me') { if (!authed(req)) return unauthorized(res); json(res, { username: 'demo', userId: '9007199254740993' }); return; }
  if (req.url === '/api/skills') {
    if (!authed(req)) return unauthorized(res);
    const withState = () => listSkills().map((sk) => ({ ...sk, enabled: !cfg.disabledSkills.includes(sk.name) }));
    if (req.method === 'GET') { json(res, withState()); return; }
    if (req.method === 'POST') {
      const b = await readBody(req);
      if (Array.isArray(b.disabled)) { cfg.disabledSkills = b.disabled.filter((x) => typeof x === 'string'); persistConfig(); }
      json(res, withState());
      return;
    }
  }

  // —— 模型配置中间层 ——
  if (req.url === '/api/config') {
    if (!authed(req)) return unauthorized(res);
    if (req.method === 'GET') { json(res, maskedConfig()); return; }
    if (req.method === 'POST') {
      const b = await readBody(req);
      if (typeof b.baseUrl === 'string' && b.baseUrl) cfg.baseUrl = b.baseUrl.trim().replace(/\/$/, '');
      if (typeof b.model === 'string' && b.model) cfg.model = b.model.trim();
      if (typeof b.visionModel === 'string') cfg.visionModel = b.visionModel.trim();
      if (typeof b.imageModel === 'string') cfg.imageModel = b.imageModel.trim();
      if (typeof b.key === 'string' && b.key.trim() && !b.key.startsWith('****')) cfg.key = b.key.trim();
      if (typeof b.imageSearchKey === 'string' && !b.imageSearchKey.startsWith('****')) cfg.imageSearchKey = b.imageSearchKey.trim();
      persistConfig();
      json(res, maskedConfig());
      return;
    }
  }
  if (req.method === 'POST' && req.url === '/api/config/test') { if (!authed(req)) return unauthorized(res); json(res, await testConfig()); return; }

  if (req.method === 'POST' && req.url === '/api/title') {
    if (!authed(req)) return unauthorized(res);
    const { messages = [] } = await readBody(req);
    const convo = messages.map((m) => `${m.role === 'user' ? '用户' : '助手'}：${typeof m.content === 'string' ? m.content : '[图片]'}`).join('\n');
    let title = await callLLMOnce([{ role: 'system', content: '你会给对话起简短标题。' }, { role: 'user', content: `用不超过12个汉字概括主题，只输出标题：\n\n${convo}` }]);
    title = (title.split('\n')[0] || '').replace(/^["'《》\s]+/, '').replace(/["'《》。.!！，,、\s]+$/, '').slice(0, 20);
    json(res, { title });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    if (!authed(req)) return unauthorized(res);
    const { message = '', messages = null, context = null, image = null, sessionId = '', afterSeq = -1, flaky = false } = await readBody(req);
    let session = sessions.get(sessionId);
    if (!session) {
      session = { message, history: Array.isArray(messages) ? messages : null, context: Array.isArray(context) ? context : null, image: image || null, tokens: [], done: false, started: false, droppedOnce: false };
      sessions.set(sessionId, session);
      setTimeout(() => sessions.delete(sessionId), 5 * 60_000);
    }
    void runLLM(session);
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const dropTarget = 12;
    let seq = afterSeq < 0 ? 0 : Math.max(0, afterSeq + 1 - OVERLAP);
    while (!res.writableEnded) {
      if (flaky && !session.droppedOnce && seq >= dropTarget && !session.done) { session.droppedOnce = true; res.end(); return; }
      if (seq < session.tokens.length) { res.write(`data: ${JSON.stringify({ seq, id: `${sessionId}:${seq}`, ...session.tokens[seq] })}\n\n`); seq++; }
      else if (session.done) break;
      else await sleep(25);
    }
    if (!res.writableEnded) { res.write(`event: done\ndata: {}\n\n`); res.end(); sessions.delete(sessionId); }
    return;
  }

  // 生产环境：托管前端静态资源（dist），SPA 路由回退 index.html
  if (req.method === 'GET' && existsSync('dist')) {
    let p = (req.url || '/').split('?')[0];
    if (p.includes('..')) { res.writeHead(400); res.end('bad request'); return; }
    if (p === '/') p = '/index.html';
    let file = join('dist', p);
    if (!existsSync(file) || !extname(file)) file = join('dist', 'index.html');
    try {
      const buf = readFileSync(file);
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
      res.end(buf);
      return;
    } catch { /* 落到 404 */ }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`[llm-proxy] 服务已启动 → http://localhost:${PORT}`);
  console.log(`[llm-proxy] 当前模型: ${cfg.model}  上游: ${cfg.baseUrl}  ${cfg.key ? '(已配置 key)' : '(未配置 key)'}`);
});
