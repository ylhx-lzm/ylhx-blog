---
title: AIGC 实战：LLM 应用开发指南
published: 2026-05-21
description: 从 Prompt 工程到 RAG 架构，系统学习如何构建生产级的 AIGC 应用
image: api
tags: [AIGC, RAG, LLM, Prompt Engineering]
category: AI 工具
draft: false
---

## 从 Prompt 到产品

2025 年是 AIGC 应用全面落地的一年。仅靠调用 API 远远不够，生产级的 LLM 应用需要系统化的架构设计。

### AIGC 应用的技术栈

```
┌─────────────────────────────┐
│        应用层                 │
│  Chat UI / API / 自动化流程    │
├─────────────────────────────┤
│        编排层                 │
│  LangChain / 自定义 Pipeline  │
├─────────────────────────────┤
│        增强层                 │
│  RAG / 工具调用 / 记忆系统      │
├─────────────────────────────┤
│        模型层                 │
│  Claude / GPT / 开源模型       │
├─────────────────────────────┤
│        基础设施                │
│  向量数据库 / Embedding / 缓存  │
└─────────────────────────────┘
```

## Prompt Engineering 核心技巧

### 结构化 Prompt

```markdown
# 角色
你是一位资深 Python 技术专家

# 任务
审查以下代码，找出潜在的性能问题和安全漏洞

# 约束
- 只指出关键问题（最多 5 个）
- 每个问题附带修复建议
- 使用中文输出

# 输出格式
## 问题 [编号]
- 严重程度：高/中/低
- 位置：第 X 行
- 说明：...
- 修复：...

# 待审查代码
{code}
```

### Few-Shot 示例

```python
def summarize_with_examples(text: str) -> str:
    """使用 Few-Shot 示例提升总结质量"""
    examples = """
    原文：苹果今天发布了新一代 M4 芯片，性能提升 50%
    总结：苹果发布 M4 芯片
    
    原文：OpenAI 宣布 GPT-5 将在下季度发布，支持多模态实时交互
    总结：OpenAI 预告 GPT-5
    
    原文：{input}
    总结：
    """
    
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        messages=[{"role": "user", "content": examples.format(input=text)}],
        max_tokens=200
    )
    return response.content[0].text
```

## RAG 架构实战

RAG（Retrieval-Augmented Generation）是解决 LLM 知识局限性的核心技术。

### 完整 RAG 流程

```python
import chromadb
from sentence_transformers import SentenceTransformer
import hashlib

class RAGSystem:
    """简易 RAG 系统实现"""
    
    def __init__(self, collection_name: str = "docs"):
        self.embedder = SentenceTransformer('BAAI/bge-small-zh-v1.5')
        self.client = chromadb.Client()
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"}
        )
    
    def add_documents(self, documents: list[dict]):
        """添加文档到向量库"""
        texts = [doc["content"] for doc in documents]
        metadatas = [{"source": doc.get("source", ""), "title": doc.get("title", "")} for doc in documents]
        ids = [hashlib.md5(text.encode()).hexdigest() for text in texts]
        embeddings = self.embedder.encode(texts).tolist()
        
        self.collection.add(
            documents=texts,
            embeddings=embeddings,
            metadatas=metadatas,
            ids=ids
        )
    
    def query(self, question: str, top_k: int = 3) -> list[str]:
        """检索相关文档"""
        query_embedding = self.embedder.encode([question]).tolist()
        results = self.collection.query(
            query_embeddings=query_embedding,
            n_results=top_k
        )
        return results["documents"][0]
    
    def generate(self, question: str, context_docs: list[str]) -> str:
        """基于检索结果生成答案"""
        context = "\n\n".join(context_docs)
        
        prompt = f"""基于以下参考信息回答问题。

参考信息：
{context}

问题：{question}

请基于参考信息给出准确、简洁的回答。如果参考信息不足以回答问题，请明确说明。"""
        
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1024
        )
        return response.content[0].text
    
    def ask(self, question: str) -> str:
        """RAG 完整流程：检索 + 生成"""
        docs = self.query(question)
        return self.generate(question, docs)
```

### 使用示例

```python
# 初始化 RAG 系统
rag = RAGSystem()

# 添加知识文档
rag.add_documents([
    {
        "content": "Astro 是一个现代化的静态站点生成器，采用岛屿架构",
        "source": "astro-docs",
        "title": "Astro 介绍"
    },
    {
        "content": "Cloudflare Pages 提供免费静态站点托管，全球 CDN 加速",
        "source": "cloudflare-docs",
        "title": "Cloudflare Pages"
    }
])

# 智能问答
answer = rag.ask("Astro 和 Cloudflare Pages 如何搭配使用？")
print(answer)
```

> [!TIP]
> RAG 的效果关键取决于三个因素：
> 1. **分块策略** — 文档切分的大小和重叠度
> 2. **Embedding 模型** — 选择适合中文的模型
> 3. **检索精度** — 结合关键词和向量检索混合策略

## 高级技巧：Function Calling

```python
def build_function_calling_app():
    """构建支持 Function Calling 的应用"""
    functions = [
        {
            "name": "search_database",
            "description": "搜索内部知识库",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索关键词"},
                    "limit": {"type": "integer", "default": 5}
                },
                "required": ["query"]
            }
        },
        {
            "name": "send_email",
            "description": "发送邮件",
            "parameters": {
                "type": "object",
                "properties": {
                    "to": {"type": "string", "description": "收件人邮箱"},
                    "subject": {"type": "string"},
                    "body": {"type": "string"}
                },
                "required": ["to", "subject", "body"]
            }
        }
    ]
    return functions
```

## 性能优化

| 策略 | 效果 | 实现难度 |
|------|------|----------|
| Prompt 缓存 | 减少 50-70% API 调用成本 | 低 |
| 语义缓存 | 命中时完全免调用 | 中 |
| 流式输出 | 改善用户体验 | 低 |
| 批处理 | 降低并发成本 | 中 |
| 模型路由 | 简单任务用小模型 | 高 |

### 语义缓存实现

```python
import hashlib
from sentence_transformers import SentenceTransformer
import numpy as np

class SemanticCache:
    """语义缓存：相似问题复用答案"""
    
    def __init__(self, threshold: float = 0.85):
        self.embedder = SentenceTransformer('BAAI/bge-small-zh-v1.5')
        self.cache = {}
        self.threshold = threshold
    
    def get(self, query: str) -> str | None:
        query_emb = self.embedder.encode([query])[0]
        for cached_emb, response in self.cache.items():
            similarity = np.dot(query_emb, cached_emb) / (
                np.linalg.norm(query_emb) * np.linalg.norm(cached_emb)
            )
            if similarity > self.threshold:
                return response
        return None
    
    def set(self, query: str, response: str):
        emb = self.embedder.encode([query])[0]
        key = tuple(emb.tolist())
        self.cache[key] = response
```

## 总结

构建生产级 AIGC 应用需要关注：

- [x] 结构化 Prompt 设计
- [x] RAG 架构实现检索增强
- [x] 工具调用扩展能力边界
- [ ] 完善的监控和评估体系
- [ ] 成本优化和缓存策略

AIGC 应用开发的本质是 **「模型能力 + 工程架构」** 的结合，掌握这些核心模式，你就能构建出真正的 AI 产品。