# 游戏数据通

> 多游戏竞技数据 AI 助手 — 基于 DeepSeek API 的桌面应用

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows-blue?logo=windows" alt="platform">
  <img src="https://img.shields.io/badge/electron-36.x-47848f?logo=electron" alt="electron">
  <img src="https://img.shields.io/badge/react-19.x-61dafb?logo=react" alt="react">
  <img src="https://img.shields.io/badge/typescript-5.8-3178c6?logo=typescript" alt="ts">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license">
</p>

---

## 📖 简介

**游戏数据通**是一款基于 DeepSeek API 的桌面 AI 助手，集成四大竞技游戏数据源，通过聊天方式查询实时赛事、版本更新、选手数据。

-   🎮 **CS 电竞** — 5EPlay 实时选手/赛事/排名数据
-   🏆 **LOL 电竞** — Riot 官方 API + Leaguepedia，LPL/LCK/世界赛全覆盖
-   ⚡ **瓦洛兰特** — Liquipedia 数据，VCT/Champions 战队/选手
-   📋 **LOL 更新速览** — 国服官网版本公告，英雄/装备改动一键速览

---

## 🚀 快速开始

### 前提条件

-   [Node.js](https://nodejs.org/) >= 18
-   [DeepSeek API Key](https://platform.deepseek.com/api_keys)（免费注册）

### 安装 & 运行

#### 桌面版（Electron）

```bash
git clone https://github.com/likecc7963524-dev/game-data-hub.git
cd game-data-hub
npm install
npm run start
```

#### Web 版（浏览器直接打开）

```bash
# 1. 构建前端
npm run web:build

# 2. 启动服务（同时提供 API + 前端页面）
npm run web:server

# 3. 浏览器打开
#    http://localhost:3001
```

开发模式（前端热更新 + 后端代理）：
```bash
npm run web:dev
# 打开 http://localhost:5173
```

启动后在设置中填入 DeepSeek API Key，开启联网搜索即可使用。

---

## 🏗️ 项目架构

```
游戏数据通/
├── electron/                # Electron 主进程（Node.js）
│   ├── main.ts              # 窗口管理 + IPC 通信
│   ├── preload.ts           # contextBridge 安全 API 暴露
│   ├── ai-service.ts        # AI 调用核心：路由、搜索、流式对话
│   ├── 5eplay.ts            # 5EPlay CS 数据抓取
│   ├── lol-api.ts           # Riot Esports API
│   ├── lol-player.ts        # Leaguepedia 选手数据
│   ├── val-api.ts           # Liquipedia Valorant 数据
│   └── lol-update.ts        # LOL 国服版本公告抓取
├── src/                     # 渲染进程（React UI）
│   ├── App.tsx              # 主界面 + 聊天 + 设置
│   ├── main.tsx             # React 入口
│   ├── index.html           # HTML 模板
│   ├── env.d.ts             # 类型声明
│   └── assets/              # 背景图片资源
├── package.json
├── electron.vite.config.ts  # Vite 构建配置
└── tsconfig.json
```

### 数据流

```
用户输入消息
    │
    ▼
React UI (App.tsx) ──IPC──▶ Electron 主进程 (main.ts)
                                  │
                                  ▼
                          ai-service.ts（路由）
                         /    |    |    \
                       CS    LOL  VAL  Update
                        │     │    │     │
                        ▼     ▼    ▼     ▼
                     5EPlay  Riot  Liqui  LOL官
                     API     API   pedia  网
                        │     │    │     │
                        ▼     ▼    ▼     ▼
                     格式化为 Markdown 上下文
                        │
                        ▼
                   注入 DeepSeek API 请求
                        │
                        ▼
                     流式返回 AI 回答
                        │
                        ▼
                     React UI 展示
```

---

## 🎮 功能特性

| 功能 | 说明 |
|------|------|
| **联网搜索** | Bing + 5EPlay + LOL 官方公告 三方搜索 |
| **数据源路由** | 根据选中板块自动路由到对应数据源 |
| **查询改写** | LLM 将自然语言自动改写为搜索关键词 |
| **流式对话** | SSE 实时打字机效果回复 |
| **多会话管理** | 四个板块独立会话，切换不丢失上下文 |
| **API Key 管理** | 本地加密配置，支持连接测试 |
| **科学风 UI** | 暗色赛博主题，每个板块独立配色 |

---

## 🛠️ 技术栈

| 层 | 技术 |
|----|------|
| **框架** | Electron 36 |
| **前端** | React 19 + TypeScript 5.8 + Vite 6 |
| **后端逻辑** | Node.js（主进程） |
| **数据抓取** | `https.get` + GBK 解码 + HTML 正则解析 |
| **AI 接口** | DeepSeek Chat API（流式 SSE） |
| **构建工具** | electron-vite |

---

## 📦 构建安装包

```bash
# 安装构建工具
npm install --save-dev electron-builder

# 打包为 Windows .exe 安装包
npx electron-builder --win
```

输出目录：`dist/游戏数据通 Setup 1.0.0.exe`

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request。

---

## 📄 许可证

MIT License

---

<p align="center">
  Made with ❤️ by Wenhao
</p>
