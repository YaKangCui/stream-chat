// 统一技能注册表（Skill Registry）。
// 加新功能：在 SKILLS 里加一个对象即可——后端会自动把它注册成工具、自动分发执行。
//
// 每个技能：
//   name        给模型看的函数名（唯一）
//   label       UI 上显示的中文名（"正在调用…"）
//   description 给模型看的用途说明（模型据此决定要不要调）
//   parameters  JSON-Schema 参数定义
//   run(args, ctx) 真正执行；返回 { text } 文本结果，或 { image, note } 图片结果
//
// ctx 提供共享依赖：{ cfg(运行时配置), fetchT(带超时fetch), authHeaders, nowContext }

export const SKILLS = [
  {
    name: 'get_current_time',
    label: '查询当前时间',
    description: '获取当前日期时间（北京时间）。问几号/星期几/几点时调用。',
    parameters: { type: 'object', properties: {}, required: [] },
    run: async (_args, ctx) => ({ text: ctx.nowContext() }),
  },
  {
    name: 'get_gold_price',
    label: '查询黄金价格',
    description: '获取国际黄金现货价（美元/盎司）。问金价时调用。',
    parameters: { type: 'object', properties: {}, required: [] },
    run: async (_args, ctx) => {
      try {
        const r = await ctx.fetchT('https://api.gold-api.com/price/XAU');
        if (!r.ok) return { text: `查询失败（HTTP ${r.status}）` };
        const j = await r.json();
        return { text: `当前国际黄金现货价：${j.price ?? '未知'} 美元/盎司。` };
      } catch (e) { return { text: `金价获取失败：${String(e)}` }; }
    },
  },
  {
    name: 'get_weather',
    label: '查询天气',
    description: '查询某城市实时天气。',
    parameters: { type: 'object', properties: { city: { type: 'string', description: '城市名' } }, required: ['city'] },
    run: async (args, ctx) => {
      const city = String(args?.city || '北京');
      try {
        const r = await ctx.fetchT(`https://wttr.in/${encodeURIComponent(city)}?format=3&lang=zh`);
        if (!r.ok) return { text: `天气查询失败（HTTP ${r.status}）` };
        return { text: (await r.text()).trim() };
      } catch (e) { return { text: `天气查询失败：${String(e)}` }; }
    },
  },
  {
    name: 'calculator',
    label: '计算',
    description: '精确数学计算。',
    parameters: { type: 'object', properties: { expression: { type: 'string', description: '数学表达式，如 (3+5)*2' } }, required: ['expression'] },
    run: async (args) => {
      const expr = String(args?.expression || '');
      if (!/^[-+*/().%\d\s]+$/.test(expr)) return { text: '表达式含不支持的字符（仅允许数字与 + - * / ( ) %）。' };
      try { return { text: `计算结果：${expr} = ${Function('"use strict";return (' + expr + ')')()}` }; }
      catch { return { text: '无法计算该表达式。' }; }
    },
  },
  {
    name: 'search_image',
    label: '搜索图片',
    description: '在网上搜索并返回一张真实照片。用户想看某地/某物的真实照片、实景图时调用（真实照片，非AI绘画）。',
    parameters: { type: 'object', properties: { query: { type: 'string', description: '搜索关键词，建议英文' } }, required: ['query'] },
    run: async (args, ctx) => {
      const q = String(args?.query || args?.prompt || '');
      let url = '';
      if (ctx.cfg.imageSearchKey) {
        try {
          const r = await ctx.fetchT(`https://pixabay.com/api/?key=${ctx.cfg.imageSearchKey}&q=${encodeURIComponent(q)}&per_page=3&safesearch=true`);
          if (r.ok) { const j = await r.json(); url = j.hits?.[0]?.webformatURL || j.hits?.[0]?.largeImageURL || ''; }
        } catch { /* fallback */ }
      }
      if (!url) url = `https://loremflickr.com/640/480/${encodeURIComponent(q.trim().replace(/\s+/g, ','))}`;
      return { image: url, note: '真实照片已展示给用户，请用一句话简短说明。' };
    },
  },
  {
    name: 'generate_image',
    label: '生成图片',
    description: '用 AI 生成/绘制图片。仅当用户明确要“画/生成/想象”原创图片时调用；想看真实照片请用 search_image。',
    parameters: { type: 'object', properties: { prompt: { type: 'string', description: '图片内容描述' } }, required: ['prompt'] },
    run: async (args, ctx) => {
      let url = '';
      try {
        const r = await fetch(`${ctx.cfg.baseUrl}/images/generations`, {
          method: 'POST', headers: ctx.authHeaders(),
          body: JSON.stringify({ model: ctx.cfg.imageModel, prompt: String(args?.prompt || '') }),
        });
        if (r.ok) url = (await r.json()).data?.[0]?.url || '';
      } catch { /* ignore */ }
      return { image: url, note: 'AI 生成的图片已展示给用户，请用一句话简短说明。' };
    },
  },
  {
    name: 'web_search',
    label: '联网搜索',
    description: '联网搜索资料以回答时事/最新信息类问题。当用户问最近发生的事、最新数据、或你不确定的事实时调用。',
    parameters: { type: 'object', properties: { query: { type: 'string', description: '搜索关键词' } }, required: ['query'] },
    run: async (args, ctx) => {
      const q = String(args?.query || '');
      // 优先 Serper（需 key，质量高）；否则 DuckDuckGo 即时答案（免 key，结果较有限）
      if (ctx.cfg.searchKey) {
        try {
          const r = await fetch('https://google.serper.dev/search', {
            method: 'POST',
            headers: { 'X-API-KEY': ctx.cfg.searchKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ q, gl: 'cn', hl: 'zh-cn' }),
          });
          if (r.ok) {
            const j = await r.json();
            const items = (j.organic || []).slice(0, 5).map((o, i) => `[${i + 1}] ${o.title}：${o.snippet || ''}（${o.link}）`);
            if (items.length) return { text: items.join('\n') };
          }
        } catch { /* fallback */ }
      }
      try {
        const r = await ctx.fetchT(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`, 8000);
        if (!r.ok) return { text: `搜索失败（HTTP ${r.status}）` };
        const j = await r.json();
        const parts = [];
        if (j.AbstractText) parts.push(j.AbstractText);
        for (const tp of (j.RelatedTopics || []).slice(0, 6)) { if (tp.Text) parts.push('- ' + tp.Text); }
        const text = parts.join('\n').slice(0, 1500);
        return { text: text || `没找到「${q}」的直接结果（可配置 SEARCH_API_KEY 用更强的搜索）。` };
      } catch (e) { return { text: `联网搜索失败（可能网络受限）：${String(e)}` }; }
    },
  },
];

// 由注册表自动派生：工具表 / 标签 / 查找
export const TOOLS = SKILLS.map((s) => ({ type: 'function', function: { name: s.name, description: s.description, parameters: s.parameters } }));
export const TOOL_LABEL = Object.fromEntries(SKILLS.map((s) => [s.name, s.label]));
export const findSkill = (name) => SKILLS.find((s) => s.name === name);
export const listSkills = () => SKILLS.map((s) => ({ name: s.name, label: s.label, description: s.description }));
