---
title: 用 MCP 协议构建 AI Agent 工具生态
published: 2026-05-21
description: 深入理解 MCP（Model Context Protocol），学习如何为 AI Agent 构建标准化的工具和服务
image: api
tags: [MCP, AI Agent, 工具链, 协议]
category: AI 工具
draft: false
---

## 什么是 MCP？

MCP（Model Context Protocol）是由 Anthropic 推出的 **开放协议**，旨在标准化 AI 模型与外部工具、数据源之间的交互方式。可以把 MCP 理解为 **AI 世界的 USB-C 接口** —— 统一的连接标准让任何兼容的客户端都能无缝使用各种工具。

### MCP 的核心价值

```
传统方式：                     MCP 方式：
┌──────────┐                 ┌──────────┐
│  Agent A │──自定义──▶ 工具1  │  Agent A │──┐
├──────────┤                 ├──────────┤  │
│  Agent B │──自定义──▶ 工具2  │  Agent B │──┼──▶ MCP Server ──▶ 工具1
├──────────┤                 ├──────────┤  │                ├──▶ 工具2
│  Agent C │──自定义──▶ 工具3  │  Agent C │──┘                └──▶ 工具3
└──────────┘                 └──────────┘
```

## MCP 架构

MCP 采用 **客户端-服务器** 架构：

```
┌───────────────────┐
│    MCP 客户端       │  (Claude Code、Claude Desktop 等)
│  ┌─────────────┐   │
│  │ Transport   │   │  (stdio / SSE)
│  └──────┬──────┘   │
└─────────┼──────────┘
          │
┌─────────┼──────────┐
│  ┌──────┴──────┐   │
│  │ Transport   │   │  (stdio / SSE)
│  └─────────────┘   │
│    MCP 服务器       │
│  ┌─────────────┐   │
│  │  工具 1      │   │
│  │  工具 2      │   │
│  │  资源 1      │   │
│  └─────────────┘   │
└───────────────────┘
```

### 传输协议

| 传输方式 | 适用场景 | 特点 |
|----------|----------|------|
| stdio | 本地工具 | 子进程通信，低延迟 |
| SSE | 远程服务 | HTTP 流式传输，远程访问 |
| WebSocket | 实时应用 | 双向通信（实验性） |

## 实战：构建 MCP Server

### 1. 安装 SDK

```bash
pip install mcp httpx
```

### 2. 创建基础 Server

```python
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent
import httpx
import json

# 创建 MCP 服务器实例
server = Server("my-tools-server")

# 定义工具
@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="fetch_webpage",
            description="获取网页内容",
            inputSchema={
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "网页 URL"}
                },
                "required": ["url"]
            }
        ),
        Tool(
            name="search_knowledge",
            description="搜索本地知识库",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "limit": {"type": "integer", "default": 5}
                },
                "required": ["query"]
            }
        ),
    ]

# 实现工具逻辑
@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    if name == "fetch_webpage":
        async with httpx.AsyncClient() as client:
            response = await client.get(arguments["url"])
            return [TextContent(
                type="text",
                text=response.text[:5000]
            )]
    
    elif name == "search_knowledge":
        knowledge_base = {
            "python": "Python 是一种高级编程语言，广泛应用于 AI、Web 开发等领域",
            "mcp": "Model Context Protocol 是 Anthropic 推出的 AI 工具协议",
            "rag": "RAG 是检索增强生成技术，用于提升 LLM 回答质量",
        }
        query = arguments["query"].lower()
        results = [v for k, v in knowledge_base.items() if query in k]
        return [TextContent(
            type="text",
            text=json.dumps(results, ensure_ascii=False)
        )]
    
    raise ValueError(f"未知工具: {name}")

# 启动服务
if __name__ == "__main__":
    import asyncio
    asyncio.run(stdio_server(server))
```

### 3. 运行 MCP Server

```bash
python my_mcp_server.py
```

## 配置 MCP 客户端

### Claude Code 配置

在 `~/.claude/settings.json` 中配置：

```json
{
  "mcpServers": {
    "my-tools": {
      "command": "python",
      "args": ["path/to/my_mcp_server.py"],
      "env": {
        "PYTHONUNBUFFERED": "1"
      }
    }
  }
}
```

## 高级：构建 SSE 远程 MCP Server

```python
from mcp.server import Server
from mcp.server.sse import SseServerTransport
from starlette.applications import Starlette
from starlette.routing import Route, Mount
import uvicorn

server = Server("remote-tools")

@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="get_system_status",
            description="获取服务器系统状态",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        )
    ]

@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    if name == "get_system_status":
        import psutil
        return [TextContent(
            type="text",
            text=json.dumps({
                "cpu": psutil.cpu_percent(),
                "memory": psutil.virtual_memory().percent,
                "disk": psutil.disk_usage('/').percent,
            }, ensure_ascii=False)
        )]

sse = SseServerTransport("/messages/")

async def handle_sse(request):
    async with sse.connect_sse(
        request.scope, request.receive, request._send
    ) as streams:
        await server.run(streams[0], streams[1], server.create_initialization_options())

app = Starlette(routes=[
    Route("/sse", endpoint=handle_sse),
    Mount("/messages/", app=sse.handle_post_message),
])

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

## MCP Server 最佳实践

### 工具设计原则

```
✅ 好的工具：                     ❌ 差的工具：
- 单一职责                        - 功能过多
- 输入参数明确                    - 参数模糊
- 错误处理完善                    - 静默失败
- 有合理的超时                    - 可能无限阻塞
```

### 安全考虑

```python
from mcp.server import Server
import re

@server.call_tool()
async def safe_tool(name: str, arguments: dict) -> list[TextContent]:
    if name == "fetch_webpage":
        url = arguments["url"]
        allowed_domains = ["example.com", "docs.python.org"]
        
        parsed = urllib.parse.urlparse(url)
        if not any(parsed.netloc.endswith(domain) for domain in allowed_domains):
            return [TextContent(
                type="text",
                text=f"错误：不允许访问 {parsed.netloc}"
            )]
```

## 实际应用场景

### 开发工具链 MCP

```
MCP Server: 开发者工具
├── 文件操作      (创建、编辑、搜索文件)
├── Git 操作      (提交、查看日志、分支管理)
├── 终端执行      (运行命令、查看输出)
└── 代码分析      (Lint、类型检查、测试)
```

### 数据管道 MCP

```
MCP Server: 数据处理
├── 数据库查询    (SQL 执行、结果格式化)
├── API 调用      (REST 请求封装)
├── 文件转换      (CSV ↔ JSON ↔ Excel)
└── 数据可视化    (生成图表 JSON)
```

### DevOps MCP

```
MCP Server: 运维工具
├── 服务器监控    (CPU、内存、磁盘)
├── 日志分析      (检索、聚合、告警)
├── 部署管理      (构建、发布、回滚)
└── 容器操作      (Docker/Podman 管理)
```

## MCP 生态现状

| 类别 | 代表项目 | 说明 |
|------|----------|------|
| 官方 SDK | Python SDK / TypeScript SDK | Anthropic 维护 |
| 浏览器 | Playwright MCP | 浏览器自动化 |
| 数据库 | PostgreSQL MCP | 数据库管理 |
| 版本控制 | GitHub MCP | GitHub 操作 |
| 文件系统 | Filesystem MCP | 文件操作 |
| 搜索 | Brave Search MCP | 网络搜索 |

> [!NOTE]
> MCP 正在成为 AI Agent 工具生态的事实标准。截至 2026 年，已有数百个开源 MCP Server，覆盖开发、数据、运维、设计等各个领域。

## 总结

MCP 协议的出现，让 AI Agent 的工具生态从「各自为战」走向「统一标准」。掌握 MCP 的开发，意味着：

- 一次开发，多处复用
- 类型安全，自动校验
- 远程调用，灵活部署
- 生态兼容，持续扩展

下一步可以尝试接入已有的开源 MCP Server，或者将自己的工具封装为 MCP 服务，构建属于你自己的 AI Agent 工具生态。