import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  zh: {
    translation: {
      title: '流式 AI 对话 Demo',
      subtitle: '流式 · 断线重连 · 去重 · 暂停续传 / 改写重发',
      status: { idle: '空闲', streaming: '生成中…', reconnecting: '断线重连中…', paused: '已暂停', done: '已完成', error: '出错' },
      reconnectSuffix: '（第 {{n}} 次重连）',
      empty: '输入点什么，回车发送 👇\n生成中点「停止」可暂停：之后既能「继续」续传，也能改写问题「重新发送」',
      pausedHint: '已暂停：可直接「继续」从断点续传，或修改下方文字后「重新发送」',
      metrics: '🔁 重连 {{a}} 次　·　🧹 去重丢弃 {{d}} 条重复 token',
      placeholder: '问点什么…（试试「介绍一下流式」）',
      send: '发送', stop: '停止', resume: '继续', resend: '重新发送',
      simulateDrop: '模拟断线（演示自动重连 + 去重）',
      clear: '清空当前会话', errorPrefix: '出错了：', langBtn: 'EN',
      newChat: '＋ 新建对话', untitled: '新对话',
      toolCalling: '🔧 正在调用工具：{{name}}…',
      regenerate: '重新生成', export: '导出对话', deleteTitle: '删除该对话？', deleteMsg: '对话及其全部消息将被永久删除，无法恢复。', ok: '删除', cancel: '取消',
      loginTitle: '登录', username: '账号', password: '密码', loginBtn: '登录', inputRequired: '请输入账号和密码', loginFail: '登录失败，请重试', expireDemo: '退出登录（演示并发401）',
      kbTitle: '知识库（RAG）', kbHint: '粘贴文档，提问时会检索相关片段喂给模型回答。', kbDocName: '文档名（可选）', kbPaste: '在此粘贴文本内容…', kbAdd: '添加到知识库', kbEmpty: '还没有文档', kbClose: '关闭', kbEnable: '启用知识库', citedN: '本次引用了 {{n}} 段资料', attachImage: '上传图片', imgTooBig: '图片过大（请小于 4MB）',
      searchConv: '搜索对话…', toolStepsN: '调用了 {{n}} 个工具', micTitle: '语音输入', speakTitle: '朗读', listening: '聆听中…', skillsTitle: '技能（工具）', skillsHint: '关闭的技能不会提供给模型调用。', settings: '模型设置', provider: '供应商预设', choosePreset: '选择预设…', baseUrl: '接口地址', apiKey: 'API Key', keyKeep: '留空则不变', modelName: '文本模型', visionModel: '视觉模型', imageModel: '生图模型', testConn: '测试连接', save: '保存',
    },
  },
  en: {
    translation: {
      title: 'Streaming AI Chat Demo',
      subtitle: 'Streaming · Reconnect · Dedup · Pause-resume / Edit-resend',
      status: { idle: 'Idle', streaming: 'Generating…', reconnecting: 'Reconnecting…', paused: 'Paused', done: 'Done', error: 'Error' },
      reconnectSuffix: ' (retry #{{n}})',
      empty: 'Type something and press Enter 👇\nClick "Stop" while generating to pause: then "Resume" to continue, or edit and "Resend".',
      pausedHint: 'Paused: click "Resume" to continue from the breakpoint, or edit the text below and "Resend".',
      metrics: '🔁 reconnected {{a}}x　·　🧹 deduped {{d}} duplicate tokens',
      placeholder: 'Ask something… (try "streaming")',
      send: 'Send', stop: 'Stop', resume: 'Resume', resend: 'Resend',
      simulateDrop: 'Simulate drop (demo reconnect + dedup)',
      clear: 'Clear chat', errorPrefix: 'Error: ', langBtn: '中',
      newChat: '＋ New chat', untitled: 'New chat',
      toolCalling: '🔧 Calling tool: {{name}}…',
      regenerate: 'Regenerate', export: 'Export', deleteTitle: 'Delete this chat?', deleteMsg: 'The conversation and all its messages will be permanently deleted.', ok: 'Delete', cancel: 'Cancel',
      loginTitle: 'Sign in', username: 'Username', password: 'Password', loginBtn: 'Sign in', inputRequired: 'Enter username and password', loginFail: 'Login failed, try again', expireDemo: 'Logout (demo 401)',
      kbTitle: 'Knowledge (RAG)', kbHint: 'Paste docs; relevant chunks are retrieved into context.', kbDocName: 'Doc name (optional)', kbPaste: 'Paste text here…', kbAdd: 'Add to KB', kbEmpty: 'No documents yet', kbClose: 'Close', kbEnable: 'Use KB', citedN: 'Cited {{n}} snippets', attachImage: 'Attach image', imgTooBig: 'Image too large (< 4MB)',
      searchConv: 'Search chats…', toolStepsN: 'Used {{n}} tool(s)', micTitle: 'Voice input', speakTitle: 'Read aloud', listening: 'Listening…', skillsTitle: 'Skills (tools)', skillsHint: 'Disabled skills are not offered to the model.', settings: 'Model settings', provider: 'Provider preset', choosePreset: 'Choose preset…', baseUrl: 'Base URL', apiKey: 'API Key', keyKeep: 'leave blank to keep', modelName: 'Text model', visionModel: 'Vision model', imageModel: 'Image model', testConn: 'Test', save: 'Save',
    },
  },
};

void i18n.use(initReactI18next).init({
  resources,
  lng: localStorage.getItem('lang') || 'zh',
  fallbackLng: 'zh',
  interpolation: { escapeValue: false },
});

export default i18n;
