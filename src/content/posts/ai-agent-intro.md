---
title: AI Agent 入门：从概念到实践
published: 2026-05-21
description: 深入浅出讲解 AI Agent 的核心概念、架构设计，并通过实际代码示例带你构建第一个智能助手
image: api
tags: [AI Agent, LLM, 人工智能, 教程]
category: AI 工具
draft: false
---

## 什么是 AI Agent？

AI Agent（智能体）是能够 **自主感知环境、做出决策并执行行动** 的 AI 系统。与传统的 LLM 对话不同，Agent 具备：

1. **自主性** — 无需人类每一步干预
2. **工具使用** — 调用 API、搜索网页、操作文件
3. **记忆能力** — 短期和长期记忆
4. **规划能力** — 分解复杂任务并逐步执行

### Agent 与普通 LLM 的区别

| 特性 | 普通 LLM | AI Agent |
|------|----------|----------|
| 交互方式 | 一问一答 | 多轮自主推理 |
| 工具调用 | 不支持 | 原生支持 |
| 记忆管理 | 无 | 有记忆系统 |
| 任务执行 | 单次生成 | 多步规划执行 |

## Agent 的核心架构

一个标准的 AI Agent 系统由以下组件构成：

```
┌─────────────────────────────────┐
│          用户输入                  │
└────────────┬────────────────────┘
             ▼
┌─────────────────────────────────┐
│        感知模块 (Perception)       │
│  解析意图 / 提取关键信息            │
└────────────┬────────────────────┘
             ▼
┌─────────────────────────────────┐
│         推理引擎 (Brain)           │
│  LLM + Prompt + 上下文管理         │
└────────────┬────────────────────┘
             ▼
┌─────────────────────────────────┐
│        规划模块 (Planning)         │
│  任务分解 / 路径规划               │
└────────────┬────────────────────┘
             ▼
┌─────────────────────────────────┐
│        工具层 (Tools)             │
│  代码执行 / 网络搜索 / 文件操作     │
└────────────┬────────────────────┘
             ▼
┌─────────────────────────────────┐
│          记忆系统                  │
│  短期记忆 / 长期记忆 / 向量数据库    │
└─────────────────────────────────┘
```

## 实战：构建一个简单的 AI Agent

下面我们用 Python 和 Anthropic SDK 构建一个具备工具调用能力的 Agent：

### 1. 环境准备

```bash
pip install anthropic httpx
```

### 2. 定义工具

```python
import json
import httpx
from anthropic import Anthropic

client = Anthropic()

# 定义工具：获取天气
def get_weather(location: str) -> str:
    """获取指定地点的天气信息"""
    weather_data = {
        "北京": "晴天，25°C，空气质量良好",
        "上海": "多云，28°C，湿度较高",
        "广州": "阵雨，30°C",
    }
    return weather_data.get(location, f"未找到 {location} 的天气数据")

# 定义工具：计算器
def calculator(expression: str) -> str:
    """执行数学计算"""
    try:
        result = eval(expression)
        return f"计算结果: {result}"
    except Exception as e:
        return f"计算错误: {e}"

# 工具注册表
tools = [
    {
        "name": "get_weather",
        "description": "获取指定城市的天气信息",
        "input_schema": {
            "type": "object",
            "properties": {
                "location": {"type": "string", "description": "城市名称"}
            },
            "required": ["location"]
        }
    },
    {
        "name": "calculator",
        "description": "执行数学表达式计算",
        "input_schema": {
            "type": "object",
            "properties": {
                "expression": {"type": "string", "description": "数学表达式"}
            },
            "required": ["expression"]
        }
    }
]
```

### 3. 实现 Agent 循环

```python
def agent_loop(user_message: str, max_turns: int = 5):
    """Agent 主循环：推理 → 调用工具 → 继续推理"""
    messages = [{"role": "user", "content": user_message}]
    
    for turn in range(max_turns):
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            messages=messages,
            tools=tools,
        )
        
        # 检查是否有工具调用
        if response.stop_reason == "tool_use":
            for block in response.content:
                if block.type == "tool_use":
                    # 执行工具
                    if block.name == "get_weather":
                        result = get_weather(block.input["location"])
                    elif block.name == "calculator":
                        result = calculator(block.input["expression"])
                    
                    # 将工具结果加入对话
                    messages.append({
                        "role": "user",
                        "content": [{
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": result
                        }]
                    })
        else:
            # 没有工具调用，返回最终结果
            return response.content[0].text
    
    return "Agent 达到最大推理轮次"
```

### 4. 运行测试

```python
# 测试 1：多工具协作
result = agent_loop("北京天气怎么样？顺便算一下 25 * 4 + 10 等于多少？")
print(result)

# 测试 2：复杂推理
result = agent_loop("我今天要去上海和广州出差，分别需要带什么衣服？")
print(result)
```

## 高级模式：ReAct 框架

ReAct（Reasoning + Acting）是目前最主流的 Agent 范式。它在每轮推理中交替进行：

```
思考 (Thought) → 行动 (Action) → 观察 (Observation) → 重复
```

```python
def react_agent(task: str):
    """ReAct 模式 Agent"""
    system_prompt = """你是一个智能助手，请按以下格式思考和执行：
    
思考：分析当前情况，决定下一步做什么
行动：选择要调用的工具和参数
观察：工具返回的结果
...（重复思考-行动-观察）...
思考：我已获得足够信息，可以给出最终答案
最终答案：输出结果
"""
    return agent_loop(task)
```

## 实际应用场景

AI Agent 已经在多个领域展现出强大能力：

- **代码开发 Agent** — GitHub Copilot、Cursor、Claude Code 等 AI 编程助手
- **数据处理 Agent** — 自动爬取、清洗、分析数据
- **自动化运维 Agent** — 日志分析、故障排查、配置管理

> [!TIP]
> 构建 AI Agent 时需要注意：
> - 始终限制工具权限，避免 Agent 执行危险操作
> - 设置合理的最大推理轮次，防止无限循环
> - 对敏感操作增加人工审批环节
> - 记录 Agent 的完整执行日志以便审计

## 总结

AI Agent 正在从实验走向生产。掌握 Agent 的架构设计和实现方式，将是 AI 时代开发者的核心技能之一。本文从零构建了一个简易 Agent，理解了核心的 ReAct 模式和工具调用机制，接下来可以尝试接入更多工具，构建更强大的智能体系统。