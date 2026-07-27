# WeeklyWorkBoard（本周工作安排）

一个基于 Electron 的桌面周工作看板应用，支持 AI 自然语言操作任务。

## 功能

- **看板视图**：周一至周五 + 残留任务的六列看板
- **任务管理**：新建、编辑、删除、拖拽改列、点击状态循环切换
- **列内拖拽排序**：同列内拖拽调整任务顺序
- **搜索筛选**：按任务内容、人员关键词实时过滤 + 全高亮匹配文字
- **周导航**：切换上周/本周/下周，自动标识周类型
- **进入下周**：未完成任务自动滚入下周残留列
- **AI 对话**：右侧面板自然语言增删改任务（支持流式打字机输出）
- **任务提醒**：可选设置提醒时间（可选），到点弹系统通知
- **设置**：可配置 AI 接口 Base/Key/Model + 开机自启动
- **导入导出**：JSON 格式备份与恢复（带字段校验）
- **撤销删除**：Ctrl+Z 撤销最近 10 次删除操作
- **对话持久化**：刷新页面后恢复最近 AI 对话历史（Markdown 正确渲染）
- **安全加固**：渲染进程沙箱 + 内容安全策略（CSP）

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+N` | 新建任务 |
| `Ctrl+F` | 聚焦搜索框 |
| `Ctrl+Z` | 撤销删除 |
| `Escape` | 关闭弹窗 / 清空搜索框 |
| `Enter` | 发送 AI 消息 |
| `Shift+Enter` | AI 输入框内换行 |

## 快速开始

### 开发运行

```bash
# 安装依赖（Windows 建议设国内镜像加速）
set ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://registry.npmmirror.com/-/binary/electron-builder-binaries/
npm install

# 启动
npm start
```

### 打包安装包

```bash
npm run dist
```

产出在 `dist/WeeklyWorkBoard Setup 1.0.0.exe`（NSIS 安装包）。

### 直接运行

已打包的绿色版在 `dist/win-unpacked/WeeklyWorkBoard.exe`，无需安装即可使用。

## AI 配置

默认使用 [opencode.ai](https://opencode.ai) 接口：

- **API Base URL**：`https://opencode.ai/zen/v1`
- **模型**：`deepseek-v4-flash-free`
- **API Key**：留空（opencode.ai 无需 Key）

支持流式输出（打字机效果）。每条消息自动附加当前日期，方便 AI 理解"今天/明天/周三"等相对日期。

点击右上角 ⚙ 齿轮按钮可修改接口地址、Key 和模型。支持任何 OpenAI 兼容接口。

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面壳 | Electron 31 |
| 前端 | 原生 HTML/CSS/JS（外部脚本，支持 CSP） |
| 存储 | localStorage |
| AI 协议 | OpenAI Chat Completions API（流式 SSE） |
| 通知 | Electron Notification API |
| 打包 | electron-builder + NSIS |

## 项目结构

```
├── main.js          # Electron 主进程（窗口、AI 代理、自启动、通知）
├── preload.js       # contextBridge 安全暴露 API（含通知）
├── app.js           # 前端应用逻辑（外部脚本，支持 CSP）
├── index.html       # 单页前端（看板 + AI 对话 + CSS）
├── package.json     # 依赖与构建配置
├── assets/
│   ├── icon.ico     # 应用图标
│   └── gen_icon.py  # 图标生成脚本
└── dist/            # 构建产物
```

## 常见问题

**Q: AI 无法对话？**
A: 默认使用 opencode.ai 接口，无需 API Key。检查 ⚙ 设置中的 Base URL 和模型是否正确，或网络是否能正常访问该接口。AI 回复为流式输出，如有错误会在对话栏提示。

**Q: 任务提醒不工作？**
A: 在任务弹窗中设置提醒时间（可选），到点会弹出 Windows 系统通知。应用需要保持在后台运行。

**Q: 打包时报 rcedit 图标错误？**
A: ICO 文件需为标准多尺寸格式。用 `assets/gen_icon.py`（需 Pillow）重新生成。也可在 `package.json` 中暂时去掉 `icon` 配置后打包。
