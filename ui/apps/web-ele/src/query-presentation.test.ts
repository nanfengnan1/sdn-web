import { describe, expect, it } from 'vitest';
import { queryCell, queryColumns } from './query-presentation';

describe('VPP query presentation', () => {
  it('shows family and endpoint counts instead of an opaque remote JSON cell', () => {
    const row = { sw_if_index: 9, src_address: '2001:db8::1', remotes: [{ remote: '2001:db8::2', bum: true }], name: 'vx10', family: 'IPV6', local: '2001:db8::1', remoteCount: 1, bumCount: 1 };
    const cols = queryColumns('VXLAN_TUNNELS', true, [row]);
    expect(cols.map(c => c.key)).toEqual(['name', 'family', 'local', 'remoteCount', 'bumCount']);
    expect(cols.find(c => c.key === 'local')?.label).toBe('本地 VTEP');
  });
  it('preserves generic query fields for Linux and FRR', () => {
    expect(queryColumns('VXLAN_TUNNELS', false, [{ ifname: 'vx10', local: '192.0.2.1' }])).toEqual([{key:'ifname',label:'ifname'},{key:'local',label:'local'}]);
  });
  it('distinguishes link state from boolean membership', () => {
    expect(queryCell(false, 'linkUp')).toBe('DOWN');
    expect(queryCell(true, 'multipoint')).toBe('是');
  });
});
