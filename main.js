const { app, BrowserWindow, ipcMain, screen, Notification } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  // 根据屏幕大小自适应窗口尺寸
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const winW = Math.min(Math.round(sw * 0.85), 1440);
  const winH = Math.min(Math.round(sh * 0.85), 900);
  const minW = Math.min(680, sw);
  const minH = Math.min(500, sh);

  mainWindow = new BrowserWindow({
    width: winW,
    height: winH,
    minWidth: minW,
    minHeight: minH,
    title: '本周工作安排',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// AI 调用：在 Node 主进程发起 HTTP 请求，彻底规避浏览器 file:// 的跨域(CORS)限制
ipcMain.handle('call-ai', async (event, payload) => {
  const base = (payload.base || 'https://opencode.ai/zen/v1').replace(/\/$/, '');
  const url = base + '/chat/completions';
  // opencode.ai 等接口无需 API Key；仅当 key 非空时才带 Authorization 头
  const headers = { 'Content-Type': 'application/json' };
  if (payload.key && String(payload.key).trim()) {
    headers['Authorization'] = 'Bearer ' + String(payload.key).trim();
  }
  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: payload.model || 'deepseek-v4-flash-free',
      messages: payload.messages,
      temperature: 0.2,
      thinking: {type: 'disabled'},
      ...(payload.tools ? { tools: payload.tools } : {})
    })
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error((data.error && data.error.message) ? data.error.message : 'API 请求失败');
  }
  return data;
});

// AI 流式调用：SSE 逐块推送
ipcMain.handle('call-ai-stream', async (event, payload) => {
  try {
    const base = (payload.base || 'https://opencode.ai/zen/v1').replace(/\/$/, '');
    const url = base + '/chat/completions';
    const headers = { 'Content-Type': 'application/json' };
    if (payload.key && String(payload.key).trim()) {
      headers['Authorization'] = 'Bearer ' + String(payload.key).trim();
    }
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: payload.model || 'deepseek-v4-flash-free',
        messages: payload.messages,
        temperature: 0.2,
        stream: true,
        thinking: {type: 'disabled'},
        ...(payload.tools ? { tools: payload.tools } : {})
      })
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error((data.error && data.error.message) ? data.error.message : 'API 请求失败');
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let finishReason = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const sse = line.trim();
        if (!sse.startsWith('data: ')) continue;
        const data = sse.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) {
            event.sender.send('ai-stream-chunk', delta.content);
            fullContent += delta.content;
          }
          if (parsed.choices?.[0]?.finish_reason) {
            finishReason = parsed.choices[0].finish_reason;
          }
          // 处理工具调用（流式 delta 中的 tool_calls）
          if (delta?.tool_calls) {
            event.sender.send('ai-stream-chunk', null); // 标记工具调用
          }
        } catch (e) {}
      }
    }
    event.sender.send('ai-stream-end', { finishReason, fullContent });
  } catch (err) {
    event.sender.send('ai-stream-error', err && err.message ? err.message : '流式请求失败');
  }
});

// 开机自启动：读写系统登录启动项（Windows 写注册表，macOS 写 Login Items）
ipcMain.handle('get-autostart', () => {
  return app.getLoginItemSettings().openAtLogin === true;
});

ipcMain.handle('set-autostart', (event, on) => {
  app.setLoginItemSettings({ openAtLogin: !!on });
});

// 系统通知：任务提醒到点弹出 Windows 通知
ipcMain.handle('show-notification', (event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title: title || '任务提醒', body: body || '' }).show();
    return true;
  }
  return false;
});

// 检查更新：从 GitHub Releases 拉取最新安装包
ipcMain.handle('check-update', async () => {
  try {
    const resp = await fetch('https://api.github.com/repos/smwyylc/weekly-work-board/releases/latest', {
      headers: { 'Accept': 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10000)
    });
    if (!resp.ok) return { ok: false, error: '无法获取版本信息' };
    const data = await resp.json();
    const tag = data.tag_name || '';
    const asset = (data.assets || []).find(a => a.name.endsWith('.exe') && a.name.includes('Setup'));
    if (!asset) return { ok: false, error: '未找到安装包' };
    return {
      ok: true, version: tag,
      downloadUrl: asset.browser_download_url,
      size: asset.size,
      body: (data.body || '').slice(0, 200)
    };
  } catch (e) {
    return { ok: false, error: e.message || '网络错误' };
  }
});

ipcMain.handle('download-update', async (event, url) => {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('下载失败');
    const buffer = Buffer.from(await resp.arrayBuffer());
    const tmpPath = require('path').join(require('os').tmpdir(), 'WeeklyWorkBoard_Setup.exe');
    require('fs').writeFileSync(tmpPath, buffer);
    event.sender.send('update-downloaded', tmpPath);
    return { ok: true, path: tmpPath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('install-update', (event, path) => {
  try {
    require('child_process').exec('start "" "' + path + '"');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
