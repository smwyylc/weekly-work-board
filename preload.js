const { contextBridge, ipcRenderer } = require('electron');

// 向渲染进程安全暴露 AI 调用接口（渲染进程不再直接发请求，避免跨域）
contextBridge.exposeInMainWorld('electronAPI', {
  callAI: (payload) => ipcRenderer.invoke('call-ai', payload),
  getAutoStart: () => ipcRenderer.invoke('get-autostart'),
  setAutoStart: (on) => ipcRenderer.invoke('set-autostart', on),
  // 系统通知
  showNotification: (args) => ipcRenderer.invoke('show-notification', args),
  // 检查更新
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  downloadUpdate: (url) => ipcRenderer.invoke('download-update', url),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (_, p) => cb(p)),
  installUpdate: (path) => ipcRenderer.invoke('install-update', path),
  // 退出应用
  quitApp: () => ipcRenderer.invoke('quit-app'),
  // 流式输出
  callAIStream: (payload) => ipcRenderer.invoke('call-ai-stream', payload),
  onAIChunk: (cb) => ipcRenderer.on('ai-stream-chunk', (_, c) => cb(c)),
  onAIEnd: (cb) => ipcRenderer.on('ai-stream-end', (_, r) => cb(r)),
  onAIError: (cb) => ipcRenderer.on('ai-stream-error', (_, e) => cb(e)),
  removeAIListeners: () => {
    ipcRenderer.removeAllListeners('ai-stream-chunk');
    ipcRenderer.removeAllListeners('ai-stream-end');
    ipcRenderer.removeAllListeners('ai-stream-error');
  }
});
