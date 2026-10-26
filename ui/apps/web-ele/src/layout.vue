<script setup lang="ts">
import { BasicLayout } from '@vben/layouts';
import { useRouter } from 'vue-router';
import { session, clearSession } from './session';
const router = useRouter();
function logout() { clearSession(); void router.push('/login'); }
</script>
<template><BasicLayout @clear-preferences-and-logout="logout"><template #user-dropdown><div class="session-bar"><span class="status-dot"></span><span>{{ session.role === 'admin' ? '管理员' : '只读用户' }}</span><el-button text @click="logout">断开连接</el-button></div></template></BasicLayout></template>
