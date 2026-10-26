<script setup lang="ts">
import { ElConfigProvider } from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import { useElementPlusDesignTokens } from '@vben/hooks';
useElementPlusDesignTokens();
</script>
<template><ElConfigProvider :locale="zhCn"><RouterView /></ElConfigProvider></template>
