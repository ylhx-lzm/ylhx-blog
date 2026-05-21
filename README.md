<div align="center">

# ylhx / 雨泪痕心

> **Code, Life, Thinking** — 专注于 AI Agent、LLM 与全栈开发的技术博客

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

我是 **ylhx**（雨泪痕心），一名热爱技术的开发者。热衷于探索 **AI Agent**、**大语言模型（LLM）** 和 **全栈开发** 领域的前沿技术。

这个博客是我记录技术学习、分享实践经验的自留地。内容涵盖：

- **AI Agent** — 从概念到实践，构建智能助手
- **AIGC / LLM** — 大模型应用开发、RAG 架构、Prompt Engineering
- **MCP 协议** — AI 工具调用与协议解析
- **前后端开发** — 实战经验与技术沉淀
- **开发工作流** — Claude Code、AI 驱动开发等效率工具

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
| [AIGC 实战：LLM 应用开发指南](./src/content/posts/aigc-llm-app-guide.md) | AIGC |
| [用 Claude Code 打造 AI 驱动的开发工作流](./src/content/posts/claude-code-agent-workflow.md) | 开发效率 |
| [MCP 协议：从 Agent 工具调用到协议解析](./src/content/posts/mcp-protocol-agent-tools.md) | MCP 协议 |

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