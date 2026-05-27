# Imagine Chat

AI 智能对话助手，支持流式响应、Markdown 渲染、工具调用、知识库 RAG、长期记忆。

## 技术栈

- **前端**: Vue 3 + Vite + Element Plus + TypeScript
- **后端**: Express + TypeScript
- **LLM**: 默认接入 DeepSeek API，支持自定义 API 地址和模型
- **向量存储**: RuVector（本地嵌入式向量数据库）
- **文档解析**: pdfjs-dist / mammoth / xlsx

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
│       ├── types/      # 类型定义
│       └── api/        # API 请求
├── server/             # 后端 Express 服务
│   ├── index.ts        # 入口
│   ├── auth.ts         # JWT 认证
│   ├── config.ts       # 配置管理
│   ├── utils.ts        # 工具函数
│   ├── types.ts        # 类型定义
│   ├── tools.ts        # LLM 工具定义（联网搜索、天气等）
│   ├── embeddings.ts   # Embedding API 客户端
│   ├── knowledge.ts    # 知识库：文档分块、向量化、语义搜索
│   ├── memory.ts       # 长期记忆：自动记忆提取与检索
│   ├── routes/         # 路由模块
│   │   ├── auth.ts     # 登录/注册
│   │   ├── chat.ts     # 对话（含 RAG 召回）
│   │   ├── knowledge.ts # 知识库增删查
│   │   ├── memory.ts   # 记忆管理
│   │   └── settings.ts # API 配置 & 系统提示词
│   └── context.md      # 系统提示词
└── package.json        # 根级脚本
```

## 功能

- **流式对话**：SSE 流式响应，支持中途停止生成
- **模型切换**：输入框内置模型选择器，支持 DeepSeek V3 / R1 / V4 Flash / V4 Pro
- **深度思考**：可开关的 thinking/reasoning 模式
- **联网搜索**：多引擎并行搜索（Bing + Sogou），结果去重交错排列
- **天气查询**：支持当天 + 未来 3 天天气预报（wttr.in）
- **知识库 RAG**：上传 txt/md/pdf/docx/xlsx 文档，自动分块向量化，对话时语义检索注入上下文；支持重复检测、批量删除
- **长期记忆**：自动提取用户偏好和重要信息，跨会话持久化
- **工具卡片交互**：外卖点餐、服饰搜索等工具调用以可视化卡片呈现，支持直接操作
- **Markdown 渲染**：代码高亮、表格、LaTeX 公式
- **多会话管理**：新建/删除/重命名/置顶，支持批量操作
- **系统提示词自定义**：可视化编辑，实时生效
- **用户系统**：注册/登录 (JWT)，数据隔离
- **API 配置可视化**：LLM / Embedding 地址和密钥前端配置
- **移动端适配**：响应式布局，侧滑面板
- **暗色/亮色主题**

## 工具系统

项目支持两种工具类型：

| 类型 | 示例 | 行为 |
|------|------|------|
| **普通工具** | `get_weather`, `web_search` | 后端执行 → LLM 总结 → 返回自然语言 |
| **卡片工具** | `order_food`, `search_clothes` | 后端执行 → 跳过 LLM 总结 → 前端渲染交互卡片 |

卡片工具返回结构化数据（如商家列表、商品信息），前端通过 `OrderFoodCard` / `SearchClothesCard` 组件渲染，用户可直接在卡片上选择并确认下单。

### 联网搜索

多搜索引擎并行查询，提高结果覆盖率和可靠性：

| 引擎 | 状态 | 说明 |
|------|------|------|
| Bing | 启用 | cn.bing.com |
| Sogou | 启用 | sogou.com |
| DuckDuckGo | 待启用 | 被墙，预留 |

流水线：`并行搜索 → URL 去重 → 轮询交错 → Top 8 → 格式化`，单引擎 8 秒超时，任意引擎失败不影响其他。

### 知识库

| 操作 | 说明 |
|------|------|
| 上传 | 支持 txt/md/pdf/docx/xlsx（最大 10MB），自动提取文本 → 分块(500字/块, 50字重叠) → 向量化 → 写入 RuVector |
| 重复检测 | 同一文件名不可重复上传 |
| 删除 | 单文档删除 + 批量删除，同步清理向量库 + 磁盘文件 + 元数据 |
| 搜索 | 语义搜索（余弦相似度），top-K 召回，对话时自动注入 |

### 长期记忆

每次对话结束后，自动从最近消息中提取结构化记忆（偏好、事实、目标），存入独立向量库。后续对话时自动检索相关记忆注入上下文。
