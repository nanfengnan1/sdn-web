// Network chunks need not align with UTF-8 characters or SSE event frames.
export function parseSSE(emit: (event: { event: string; id: string; data: string }) => void) {
  let buffer = ''; let current = { event: 'message', id: '', data: [] as string[] };
  function line(value: string) {
    if (value === '') { if (current.data.length) emit({ event: current.event, id: current.id, data: current.data.join('\n') }); current = { event: 'message', id: '', data: [] }; return; } if (value.startsWith(':')) return;
    const colon = value.indexOf(':'); const field = colon < 0 ? value : value.slice(0, colon); let data = colon < 0 ? '' : value.slice(colon + 1); if (data.startsWith(' ')) data = data.slice(1);
    if (field === 'event') current.event = data; if (field === 'id') current.id = data; if (field === 'data') current.data.push(data);
  }
  return { push(chunk: string) { buffer += chunk; if (buffer.length > 2 * 1024 * 1024) throw new Error('事件帧过大'); let index: number; while ((index = buffer.indexOf('\n')) >= 0) { line(buffer.slice(0,index).replace(/\r$/, '')); buffer = buffer.slice(index+1); } } };
}
export function newer(sequence: string, previous: string) { return BigInt(sequence || '0') > BigInt(previous || '0'); }
