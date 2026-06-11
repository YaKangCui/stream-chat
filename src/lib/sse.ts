// SSE 报文块解析（纯函数，可单测）：形如 "event: done\ndata: {...}"
export function parseSse(chunk: string): { event?: string; data?: Record<string, unknown> } | null {
  const lines = chunk.split('\n');
  let event: string | undefined;
  let dataRaw = '';
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataRaw += line.slice(5).trim();
  }
  if (!event && !dataRaw) return null;
  let data: Record<string, unknown> | undefined;
  try { data = dataRaw ? JSON.parse(dataRaw) : undefined; } catch { data = undefined; }
  return { event, data };
}
