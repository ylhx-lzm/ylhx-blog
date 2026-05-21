<div align="center">

# ylhx 

> **Code, Life, Thinking**

[![Blog](https://img.shields.io/badge/Blog-ylhx.site-8B5CF6?style=for-the-badge)](https://ylhx.site)
[![GitHub](https://img.shields.io/badge/GitHub-ylhx--lzm-181717?style=for-the-badge&logo=github)](https://github.com/ylhx-lzm)
[![RSS](https://img.shields.io/badge/RSS-订阅博客-FFA500?style=for-the-badge&logo=rss)](/rss/)

![Astro](https://img.shields.io/badge/Astro_6.3.3-BC52EE?logo=astro&logoColor=fff)
![TypeScript](https://img.shields.io/badge/TypeScript_5.9-3178C6?logo=typescript&logoColor=fff)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?logo=tailwindcss&logoColor=fff)
![Svelte](https://img.shields.io/badge/Svelte_5-FF3E00?logo=svelte&logoColor=fff)
[![Firefly Theme](https://img.shields.io/badge/Theme-Firefly-FF69B4)](https://github.com/CuteLeaf/Firefly)

</div>

---

## 关于我 / About Me

这个博客是我的技术笔记本与成长记录，内容涵盖：

- **秋招经验** — 笔试真题、面试复盘、算法准备、面经汇总
- **大模型八股** — Transformer 架构、Attention 机制、RLHF、MoE、KV Cache 等核心考点
- **大模型原理** — 从预训练到推理加速，从 Prompt 到 Agent 的底层原理解析
- **AIGC 模型** — 文生文、文生图、多模态模型的应用开发与原理探析
- **AI Agent / MCP** — Agent 架构、工具调用、MCP 协议解析与实战
- **前后端开发** — 全栈实战与技术沉淀

## 博客特色 / Features

- 基于 [Firefly](https://github.com/CuteLeaf/Firefly) 主题（[Fuwari](https://github.com/saicaca/fuwari) 改良版），搭载 **Astro** 静态站点引擎
- 支持全文搜索、多语言 UI、亮暗色主题切换
- 丰富的文章布局（列表/网格/瀑布流）与双侧边栏组件
- 文章加密、KaTeX 数学公式、Mermaid/PlantUML 图表、代码高亮
- 集成 Bangumi 番组、音乐播放器、看板娘等趣味功能

## 文章精选 / Featured Posts

| 文章 | 分类 |
|------|------|
| [AI Agent 入门：从概念到实践](./src/content/posts/ai-agent-intro.md) | AI Agent |
| [AIGC 实战：LLM 应用开发指南](./src/content/posts/aigc-llm-app-guide.md) | AIGC 模型 |
| [用 Claude Code 打造 AI 驱动的开发工作流](./src/content/posts/claude-code-agent-workflow.md) | 开发工具 |
| [MCP 协议：从 Agent 工具调用到协议解析](./src/content/posts/mcp-protocol-agent-tools.md) | MCP 协议 |

> **更多内容持续更新中** — 秋招笔试面试经验、大模型八股、Transformer 原理等即将上线。

## 快速开始 / Quick Start

### 本地开发

```bash
# 克隆项目
git clone https://github.com/ylhx-lzm/ylhx-blog.git
cd ylhx-blog

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev          # 访问 http://localhost:4321

# 构建生产版本
pnpm build        # 输出至 ./dist/
pnpm preview      # 本地预览构建结果
```

> 环境要求：Node.js ≥ 22，pnpm ≥ 9

### 平台部署

支持 **Vercel**、**Netlify**、**Cloudflare Pages** 等平台一键部署：

- 框架预设：`Astro`
- 构建命令：`pnpm run build`
- 输出目录：`dist`

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ylhx-lzm/ylhx-blog&project-name=ylhx-blog&repository-name=ylhx-blog)
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/ylhx-lzm/ylhx-blog)

## 项目结构 / Project Structure

```
src/
├── config/          # 站点配置文件（可自定义）
├── content/
│   └── posts/       # 博客文章（Markdown + MDX）
├── components/      # UI 组件
├── layouts/         # 页面布局
├── pages/           # 路由页面
└── types/           # TypeScript 类型定义
```

## 联系我 / Contact

- **博客**: [ylhx.site](https://ylhx.site)
- **GitHub**: [@ylhx-lzm](https://github.com/ylhx-lzm)
- **QQ**: [加入交流](https://qm.qq.com/q/c5MdaVFtvy)

## 致谢 / Credits

- 主题 [Firefly](https://github.com/CuteLeaf/Firefly) by [CuteLeaf](https://github.com/CuteLeaf)
- 主题 [Fuwari](https://github.com/saicaca/fuwari) by [saicaca](https://github.com/saicaca)

## 许可 / License

本项目基于 [MIT](./LICENSE) 协议开源。

---

<div align="center">

**飞萤之火，自无梦的长夜亮起，绽放在终竟的明天。**

</div>
