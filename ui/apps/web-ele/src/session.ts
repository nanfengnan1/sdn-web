import { reactive } from 'vue';
export const session = reactive({ role: '' as '' | 'admin' | 'viewer' });
let bearer = '';
export function token() { return bearer; }
export function setSession(value: string, role: 'admin' | 'viewer') { bearer = value; session.role = role; }
export function clearSession() { bearer = ''; session.role = ''; }
