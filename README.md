# Imagine Chat

AI 智能对话助手，支持流式响应、Markdown 渲染、工具调用。

## 技术栈

- **前端**: Vue 3 + Vite + Element Plus + TypeScript
- **后端**: Express + TypeScript
- **LLM**: 默认接入 DeepSeek API，支持自定义 API 地址和模型

## 快速开始

```bash
# 安装依赖
npm install
cd client && npm install && cd ..

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入 API Key 等信息

# 启动开发服务
npm run dev:server   # 后端 http://localhost:3000
npm run dev:client   # 前端 http://localhost:5173
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 后端端口 | `3000` |
| `API_BASE_URL` | LLM API 地址 | `https://api.deepseek.com` |
| `API_KEY` | LLM API 密钥 | - |
| `LLM_MODEL` | 默认模型 | `deepseek-v4-flash` |
| `JWT_SECRET` | JWT 密钥 | 内置默认值 |

API 配置也可在前端界面中动态修改，会持久化到 `server/data/api-config.json`。

## 项目结构

```
├── client/             # 前端 Vue 3 项目
│   └── src/
│       ├── components/ # 组件
│       ├── composables/ # 组合式函数
│       ├── pages/      # 页面
│       └── api/        # API 请求
├── server/             # 后端 Express 服务
│   ├── index.ts        # 入口 & 路由
│   ├── auth.ts         # JWT 认证
│   ├── tools.ts        # LLM 工具定义
│   ├── config.ts       # 配置管理
│   ├── utils.ts        # 工具函数
│   ├── types.ts        # 类型定义
│   └── context.md      # 系统提示词
└── package.json        # 根级脚本
```

## 功能

- 流式对话响应 (SSE)
- **工具卡片交互**：外卖点餐、服饰搜索等工具调用以可视化卡片呈现，支持直接操作
- **Function Calling**：天气查询、联网搜索（普通工具，LLM 总结）；卡片工具（前端渲染交互卡片，跳过 LLM 总结）
- 多会话管理
- Markdown 代码高亮
- 系统提示词自定义
- 用户注册/登录 (JWT)
- API 配置可视化
- 移动端适配
- 暗色/亮色主题

## 工具系统

项目支持两种工具类型：

| 类型 | 示例 | 行为 |
|------|------|------|
| **普通工具** | `get_weather`, `web_search` | 后端执行 → LLM 总结 → 返回自然语言 |
| **卡片工具** | `order_food`, `search_clothes` | 后端执行 → 跳过 LLM 总结 → 前端渲染交互卡片 |

卡片工具返回结构化数据（如商家列表、商品信息），前端通过 `OrderFoodCard` / `SearchClothesCard` 组件渲染，用户可直接在卡片上选择并确认下单。
