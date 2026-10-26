import { describe, expect, it } from 'vitest';
import { newer, parseSSE } from './sse';
describe('SSE transport boundaries', () => {
  it('accepts fragmented CRLF frames, comments and multiline data', () => {
    const events: unknown[] = []; const parser = parseSSE((event) => events.push(event));
    for (const chunk of [': heart','beat\r\n\r\nid: 9\r','\nevent: job\r\ndata: {"message":\r\ndata: "完成"}\r\n','\r\n']) parser.push(chunk);
    expect(events).toEqual([{ id: '9', event: 'job', data: '{"message":\n"完成"}' }]);
  });
  it('decodes UTF-8 split at every byte without losing an event', () => {
    const events: {data:string}[]=[];const parser=parseSSE((e)=>events.push(e));const decoder=new TextDecoder();
    for(const byte of new TextEncoder().encode('id: 1\nevent: job\ndata: 中文状态\n\n')) parser.push(decoder.decode(new Uint8Array([byte]),{stream:true}));
    parser.push(decoder.decode());expect(events[0]?.data).toBe('中文状态');
  });
  it('handles multiple events in a chunk and leaves incomplete frames pending',()=>{const ids:string[]=[];const p=parseSSE(e=>ids.push(e.id));p.push('id: 1\ndata: a\n\nid: 2\ndata: b\n\nid: 3\ndata: c');expect(ids).toEqual(['1','2']);p.push('\n\n');expect(ids).toEqual(['1','2','3']);});
  it('does not lose precision when dropping duplicate or old events',()=>{expect(newer('9007199254740993','9007199254740992')).toBe(true);expect(newer('9007199254740993','9007199254740993')).toBe(false);expect(newer('3','10')).toBe(false);});
});
