import { describe, expect, it, vi } from 'vitest';
import { coalesceAsync, explicitRejection,newRequestID } from './workflow';
describe('mutation retry boundaries',()=>{
  it('creates UUIDv4 with getRandomValues alone on HTTP origins',()=>{const source={getRandomValues<T extends ArrayBufferView | null>(array:T):T{if(array instanceof Uint8Array)array.fill(255);return array;}};expect(newRequestID(source)).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');});
  it('separates explicit rejection from ambiguous transport/server outcomes',()=>{for(const status of [400,401,403,404,409,429])expect(explicitRejection(status)).toBe(true);for(const status of [undefined,500,502,503,504])expect(explicitRejection(status)).toBe(false);});
  it('coalesces event bursts without overlapping detail requests and stops on disposal',async()=>{vi.useFakeTimers();let release=()=>{};let calls=0;const refresh=coalesceAsync(async()=>{calls++;await new Promise<void>(resolve=>{release=resolve;});});for(let i=0;i<100;i++)refresh.trigger();await vi.advanceTimersByTimeAsync(250);expect(calls).toBe(1);for(let i=0;i<100;i++)refresh.trigger();await vi.advanceTimersByTimeAsync(1000);expect(calls).toBe(1);release();await vi.advanceTimersByTimeAsync(250);expect(calls).toBe(2);refresh.stop();release();refresh.trigger();await vi.advanceTimersByTimeAsync(1000);expect(calls).toBe(2);vi.useRealTimers();});
});
