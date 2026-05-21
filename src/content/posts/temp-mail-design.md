---
title: "TempMail 临时邮箱服务设计文档"
published: 2026-05-21
draft: true
category: "Cloudflare"
tags:
  - Cloudflare
  - D1
---

# TempMail — 临时邮箱服务设计文档

## 概述

基于 Cloudflare 全家桶（Email Routing + Workers + D1 + R2 + Pages）构建的零服务器临时邮箱服务。任何发往 `*@ylhx.site` 的邮件都会被抓取并展示在 Web 页面中。

## 系统架构

```
发件人 ──→ abc@ylhx.site
                │
                ▼
      Cloudflare Email Routing
         catch-all: *@ylhx.site
                │
                ▼
        ┌────────────────┐
        │   Email Worker  │  ← 接收邮件
        │  (receive)      │
        └────┬───────────┘
             │
      ┌──────┴──────────┐
      │ 解析 MIME        │
      │ 提取: 主题/正文/附件│
      └──────┬──────────┘
             │
      ┌──────┴──────┬──────────┐
      ▼             ▼          ▼
    D1 Database   R2 Storage  Workers KV
  (邮件元数据)    (原始邮件+附件) (地址会话)
      │
      │  ┌──────────────────────┐
      ├──│   API Worker          │  ← REST API
      │  │  (前端数据接口)        │
      │  └─────────┬────────────┘
      │            │
      │  ┌─────────┴────────────┐
      └──│   Frontend (Pages)    │  ← Web 界面
         │   Astro SPA           │
         └──────────────────────┘

      ┌──────────────────────┐
      │   Cron Trigger        │  ← 每 15 分钟清理过期
      │   清理 D1 + R2        │
      └──────────────────────┘
```

## 数据模型

### D1: emails 表

```sql
CREATE TABLE emails (
  id          TEXT PRIMARY KEY,           -- UUID
  address     TEXT NOT NULL,              -- 收件地址 abc@ylhx.site
  sender      TEXT NOT NULL,              -- 发件人
  subject     TEXT NOT NULL DEFAULT '',   -- 主题
  body_text   TEXT,                       -- 纯文本正文
  body_html   TEXT,                       -- HTML 正文
  raw_key     TEXT,                       -- R2 中原始邮件 key
  received_at INTEGER NOT NULL,           -- 接收时间戳
  expires_at  INTEGER NOT NULL,           -- 过期时间戳
  has_attach  INTEGER DEFAULT 0           -- 是否有附件
);
CREATE INDEX idx_emails_address ON emails(address);
CREATE INDEX idx_emails_expires ON emails(expires_at);
```

### D1: attachments 表

```sql
CREATE TABLE attachments (
  id           TEXT PRIMARY KEY,          -- UUID
  email_id     TEXT NOT NULL,             -- 所属邮件 ID
  filename     TEXT NOT NULL,             -- 文件名
  content_type TEXT NOT NULL DEFAULT '',  -- MIME 类型
  size         INTEGER NOT NULL DEFAULT 0,-- 文件大小
  r2_key       TEXT NOT NULL,             -- R2 存储 key
  FOREIGN KEY (email_id) REFERENCES emails(id)
);
CREATE INDEX idx_attachments_email ON attachments(email_id);
```

## 项目目录结构

```
temp-mail/
├── wrangler.jsonc              # Cloudflare Workers 配置
├── package.json
├── src/
│   ├── email-worker/           # 邮件接收 Worker
│   │   └── index.ts
│   ├── api-worker/             # API Worker
│   │   ├── index.ts
│   │   ├── routes/             # 路由处理
│   │   │   ├── inbox.ts        # GET /api/inbox?address=
│   │   │   ├── email.ts        # GET /api/email/:id
│   │   │   ├── attachment.ts   # GET /api/attachment/:id
│   │   │   ├── address.ts      # POST /api/address
│   │   │   └── cleanup.ts      # DELETE /api/address/:address
│   │   └── lib/
│   │       └── db.ts           # D1 查询封装
│   ├── frontend/               # Astro 前端
│   │   ├── pages/
│   │   │   ├── index.astro     # 主页面
│   │   │   └── email/[id].astro # 邮件详情页
│   │   └── components/
│   └── cron/                   # 定时清理 Worker
│       └── index.ts
├── migrations/
│   └── 001_init.sql            # D1 建表
└── .github/workflows/
    └── deploy.yml              # CI/CD
```

## 功能设计

### 核心功能

| 功能 | 说明 |
|------|------|
| 自动生成地址 | 打开页面即分配随机临时地址 `xxxx@ylhx.site` |
| 实时收件 | 每 5 秒轮询 API，新邮件即时显示 |
| 邮件查看 | 支持 HTML 渲染/纯文本切换 |
| 附件预览 | 图片直接预览，其他文件提供下载 |
| 复制地址 | 一键复制邮箱地址到剪贴板 |
| 自动过期 | 地址和邮件 1 小时后自动销毁 |
| 手动刷新 | 用户可延长有效期 |

### 界面布局

```
┌─────────────────────────────────────────────┐
│  🔷 TempMail · ylhx.site                     │
├─────────────────────────────────────────────┤
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │  xyz123@ylhx.site    [复制] [刷新] [×]  │ │
│  │  还剩 45 分钟过期                        │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  ┌───────────┐  ┌──────────────────────────┐ │
│  │  收件箱     │  │  邮件内容区域             │ │
│  │            │  │                          │ │
│  │  📧 验证码  │  │  发件人: no-reply@xx.com │ │
│  │  来自 Google │  │  主题: 您的验证码是...   │ │
│  │  2 分钟前   │  │  ──────────────────     │ │
│  │            │  │  您的验证码是: 382947    │ │
│  │  📧 欢迎!   │  │                          │ │
│  │  来自 GitHub │  │  [附件] logo.png 12KB   │ │
│  │  15 分钟前  │  │                          │ │
│  └───────────┘  └──────────────────────────┘ │
│                                              │
└─────────────────────────────────────────────┘
```

## Cloudflare 资源清单

| 资源 | 用途 | 计费 |
|------|------|------|
| Email Routing | 捕获 `*@ylhx.site` 邮件 | 免费 |
| Workers (receive) | 接收并解析邮件 | 免费额度 10万请求/天 |
| Workers (api) | REST API 接口 | 同上 |
| Workers (cron) | 定时清理 | 同上一份配额（可合并） |
| D1 | 存储邮件元数据 | 免费 5GB |
| R2 | 存储原始邮件和附件 | 免费 10GB |
| Pages | 前端托管 | 免费 |

## 部署步骤

### 前置条件

1. `ylhx.site` 域名已托管到 Cloudflare
2. 已启用 Cloudflare Email Routing
3. 安装 `wrangler` CLI

### 1. 创建 D1 数据库

```bash
npx wrangler d1 create temp-mail-db
```

### 2. 创建 R2 存储桶

```bash
npx wrangler r2 bucket create temp-mail-attachments
```

### 3. 配置 Email Routing

在 Cloudflare Dashboard → Email Routing → 添加 Catch-All 路由，指向 Email Worker。

### 4. 部署 Workers

```bash
# 部署邮件接收 Worker
npx wrangler deploy src/email-worker/index.ts
```

### 5. 部署前端

```bash
# 构建并部署 Pages
npx wrangler pages deploy dist/
```

## 安全考虑

| 风险 | 缓解措施 |
|------|----------|
| 恶意滥用（发垃圾邮件） | 限制同一 IP 生成地址频率 |
| 存储攻击（超大附件） | 限制附件大小 ≤ 10MB |
| 隐私泄露 | 邮件 1 小时后自动永久删除 |
| API 滥用 | 频率限制，CORS 白名单 |

## 与现有博客集成

- 独立域名：`temp.ylhx.site` 
- 在博客工具导航中添加入口
- 共享 `ylhx.site` 的 Cloudflare 配置
