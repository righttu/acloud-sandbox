// 手册 4.3：MCP 密钥只用于 Worker 出站请求，不进入容器。
// https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
export async function loadMcp(url: string, token?: string): Promise<Record<string, unknown>[]> {
  if (new URL(url).protocol !== 'https:' || !token) throw new Error('MCP 需要 HTTPS 与令牌');
  const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}` });
  let id = 0;
  async function rpc(method: string, params: object, notify = false): Promise<any> {
    const current = ++id;
    const res = await fetch(url, { method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(20_000), body: JSON.stringify({ jsonrpc: '2.0', ...(notify ? {} : { id: current }), method, params }) });
    if (!res.ok) throw new Error('MCP HTTP ' + res.status);
    const session = res.headers.get('mcp-session-id');
    if (session) headers.set('Mcp-Session-Id', session);
    if (notify) { await res.body?.cancel(); return; }
    let message: any;
    if (res.headers.get('content-type')?.includes('text/event-stream')) {
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      try {
        outer: while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += chunk.value.replace(/\r\n/g, '\n');
          if (buffer.length > 4_000_000) throw new Error('MCP 结果过大');
          let split: number;
          while ((split = buffer.indexOf('\n\n')) >= 0) {
            const event = buffer.slice(0, split); buffer = buffer.slice(split + 2);
            const text = event.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
            if (!text) continue;
            const parsed = JSON.parse(text);
            if (parsed.id === current) { message = parsed; break outer; }
          }
        }
      } finally { await reader.cancel(); }
    } else message = await res.json();
    if (!message || message.error) throw new Error('MCP 返回错误');
    return message.result;
  }
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'acloud-sandbox', version: '1.0.0' } });
  headers.set('MCP-Protocol-Version', init.protocolVersion);
  await rpc('notifications/initialized', {}, true);
  try {
    // 与远帆 MCP 的 list_tickets 契约对齐；不自动猜测其他写工具。
    const tickets: Record<string, unknown>[] = [];
    let offset = 0;
    for (let page = 0; page < 10; page++) {
      const result = await rpc('tools/call', { name: 'list_tickets', arguments: { week: 45, limit: 200, offset } });
      if (result.isError) throw new Error('工单读取失败');
      const data = result.structuredContent ?? JSON.parse(result.content.find((c: any) => c.type === 'text').text);
      if (!Array.isArray(data.tickets)) throw new Error('工单格式不正确');
      tickets.push(...data.tickets);
      if (tickets.length > 1000) throw new Error('工单过多');
      if (data.next_offset === null) {
        if (data.total !== tickets.length) throw new Error('工单总数不符');
        return tickets;
      }
      if (!Number.isInteger(data.next_offset) || data.next_offset <= offset) throw new Error('分页偏移不正确');
      offset = data.next_offset;
    }
    throw new Error('分页过多');
  } finally {
    if (headers.has('Mcp-Session-Id')) await fetch(url, { method: 'DELETE', headers, redirect: 'error', signal: AbortSignal.timeout(5000) }).then(r => r.body?.cancel()).catch(() => {});
  }
}
export const samples: Record<string, unknown>[] = Array.from({ length: 12 }, (_, i) => ({
  id: i === 3 ? 1024 : 1100 + i,
  created_at: `2026-11-${i < 2 ? '02' : '04'}T10:00:00+08:00`,
  customer: i < 4 ? '星河物流' : `示例客户${i}`,
  level: i < 3 ? 'VIP' : '普通', channel: '邮件', category: i < 2 ? '账单疑问' : '登录失败',
  title: '模拟工单', body: '仅用于演示', status: i < 3 ? '未回复' : '已解决',
  first_reply_at: i < 3 ? null : '2026-11-04T11:00:00+08:00', sla_hours: 4
}));
