# Cloudflare 无服务器博客后台实施方案

本文档面向当前 Firefly/Astro 静态博客项目，目标是在不引入传统服务器的前提下，使用 Cloudflare Workers Static Assets、D1、Turnstile、Cloudflare Access 和可选 GitHub API，实现个人博客后台、评论审核、访问统计、点赞、Markdown 草稿与发布、友链申请、订阅和站内公告。

当前项目文章内容仍建议继续放在：

```txt
src/content/posts/
src/content/spec/
```

Astro 构建后输出到：

```txt
dist/
```

Cloudflare 继续托管静态产物。新增 Worker 只处理动态接口和后台能力。

## 目标架构

```txt
浏览器
  ├─ 静态博客页面: /, /posts/*, /archive/*       -> Cloudflare Static Assets -> dist
  ├─ 公开动态接口: /api/comments, /api/stats/*    -> Worker -> D1
  ├─ 轻量公开接口: /api/friends/apply, /api/subscribe, /api/public/*
  ├─ 后台页面: /admin/*                           -> Cloudflare Access -> Static Assets
  └─ 后台接口: /api/admin/*                       -> Cloudflare Access -> Worker -> D1
```

推荐原则：

- 文章正式内容继续使用 Markdown/MDX 文件，由 Astro 静态生成。
- D1 存评论、留言、访问统计、点赞、草稿、公告、友链申请、订阅等轻量动态数据。
- 后台 Markdown 编辑器先保存草稿到 D1，发布时通过 GitHub API 写入 `src/content/posts/{slug}.md` 并触发重新部署。
- 不把所有文章正式内容直接迁移到 D1，避免破坏当前静态页面、RSS、sitemap、Pagefind 搜索和 SEO。

## Cloudflare 配置

目标 `wrangler.toml`：

```toml
name = "ylhx-blog"
compatibility_date = "2026-05-21"
main = "src/worker/index.ts"

[assets]
directory = "./dist"
binding = "ASSETS"

[[d1_databases]]
binding = "DB"
database_name = "ylhx_blog"
database_id = "待填"
```

推荐使用的 Cloudflare 能力：

- Workers Static Assets：托管静态博客。
- D1：存储评论、统计、草稿和后台数据。
- Turnstile：保护公开提交接口，防刷。
- Cloudflare Access：保护 `/admin/*` 和 `/api/admin/*`，只允许自己的邮箱访问。
- Worker secrets：保存 GitHub token、Turnstile secret 等敏感配置。

## 目录规划

```txt
migrations/
  0001_init.sql

src/
  worker/
    index.ts
    env.ts
    router.ts
    response.ts
    auth.ts
    turnstile.ts
    rate-limit.ts
    crypto.ts
    db/
      comments.ts
      stats.ts
      drafts.ts
      friends.ts
      announcements.ts
      subscriptions.ts
    handlers/
      comments.ts
      stats.ts
      public.ts
      admin-comments.ts
      admin-dashboard.ts
      admin-drafts.ts
      admin-friends.ts
      admin-announcements.ts
      admin-subscriptions.ts
      github-publish.ts

  pages/
    admin/
      index.astro
      comments.astro
      posts.astro
      stats.astro
      friends.astro
      announcements.astro

  components/
    admin/
      AdminLayout.astro
      DashboardCards.svelte
      CommentsTable.svelte
      MarkdownEditor.svelte
      StatsCharts.svelte
      FriendRequestsTable.svelte
      AnnouncementEditor.svelte

    comment/
      D1Comments.svelte
```

## D1 Schema

建议放入 `migrations/0001_init.sql`。

```sql
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  parent_id TEXT,
  author TEXT NOT NULL,
  email_hash TEXT,
  website TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  ip_hash TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE comment_likes (
  comment_id TEXT NOT NULL,
  voter_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (comment_id, voter_hash)
);

CREATE TABLE post_stats (
  path TEXT PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE daily_stats (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  pv INTEGER NOT NULL DEFAULT 0,
  uv INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);

CREATE TABLE daily_visitors (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (day, path, visitor_hash)
);

CREATE TABLE drafts (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  frontmatter TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER
);

CREATE TABLE friend_requests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  avatar TEXT,
  description TEXT,
  email_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  starts_at INTEGER,
  ends_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL UNIQUE,
  email_encrypted TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_comments_path_status ON comments(path, status, created_at);
CREATE INDEX idx_comments_status_created ON comments(status, created_at);
CREATE INDEX idx_daily_stats_day ON daily_stats(day);
CREATE INDEX idx_drafts_status_updated ON drafts(status, updated_at);
CREATE INDEX idx_friend_requests_status_created ON friend_requests(status, created_at);
CREATE INDEX idx_announcements_enabled ON announcements(enabled, starts_at, ends_at);
```

## API 设计

### 公开接口

```txt
GET  /api/comments?path=/posts/foo/
POST /api/comments
POST /api/comments/:id/like

GET  /api/stats?paths=/posts/a/,/posts/b/
POST /api/stats/view
POST /api/stats/like

GET  /api/public/announcement
POST /api/friends/apply
POST /api/subscribe
```

公开写接口必须具备：

- Turnstile 校验。
- 请求体大小限制。
- 内容长度限制。
- URL、邮箱、昵称、正文校验。
- IP hash + path 的轻量限流。
- 评论默认 `pending`，后台审核后展示。

### 后台接口

```txt
GET    /api/admin/dashboard

GET    /api/admin/comments?status=pending
PATCH  /api/admin/comments/:id
DELETE /api/admin/comments/:id

GET    /api/admin/drafts
POST   /api/admin/drafts
GET    /api/admin/drafts/:id
PATCH  /api/admin/drafts/:id
DELETE /api/admin/drafts/:id
POST   /api/admin/drafts/:id/publish

GET    /api/admin/friend-requests
PATCH  /api/admin/friend-requests/:id

GET    /api/admin/announcements
POST   /api/admin/announcements
PATCH  /api/admin/announcements/:id
DELETE /api/admin/announcements/:id

GET    /api/admin/subscriptions
PATCH  /api/admin/subscriptions/:id
```

后台接口必须具备：

- Cloudflare Access 鉴权。
- 不允许未鉴权访问。
- 不返回 Worker secret。
- GitHub token 只从 Worker secret 读取。
- 所有 SQL 使用 prepared statement，不拼接用户输入。

## 后台页面设计

### `/admin`

仪表盘展示：

- 今日 PV。
- 今日 UV。
- 近 7 天 PV/UV 趋势。
- 全站总浏览量。
- 热门文章。
- 待审核评论数量。
- 待审核友链数量。
- 草稿数量。

### `/admin/comments`

功能：

- 按状态筛选：待审核、已通过、已拒绝。
- 查看评论路径、作者、时间、内容。
- 通过、拒绝、删除。
- 支持回复或标记。

### `/admin/posts`

功能：

- 草稿列表。
- 新建 Markdown 草稿。
- 编辑 frontmatter。
- Markdown 编辑与预览。
- 保存到 D1。
- 发布到 GitHub 仓库。

发布流程：

```txt
后台点击发布
  -> POST /api/admin/drafts/:id/publish
  -> Worker 校验 Access
  -> 读取 D1 drafts
  -> 组合 frontmatter + Markdown content
  -> GitHub Contents API 写入 src/content/posts/{slug}.md
  -> 触发部署或依赖 GitHub/Cloudflare 自动构建
  -> drafts.status = published
```

### `/admin/stats`

功能：

- 今日、近 7 天、近 30 天 PV/UV。
- 按文章路径查看访问量。
- 点赞排行。
- 趋势图。

### `/admin/friends`

功能：

- 查看友链申请。
- 通过、拒绝、删除。
- 通过后可选择写入 D1 展示，或后续生成静态配置。

### `/admin/announcements`

功能：

- 新建公告。
- 设置启用状态。
- 设置起止时间。
- 前台通过 `/api/public/announcement` 获取当前启用公告。

## 分阶段实施

### 第一阶段：D1 评论/留言板 + Turnstile + 简单后台审核

目标：

- 新增 Worker 和 D1。
- 完成 comments 表。
- 实现公开评论提交和评论读取。
- 实现 Turnstile 校验。
- 实现后台评论审核。
- 留言板复用评论系统，路径固定为 `/guestbook/`。

验收：

- 评论提交后默认待审核。
- 未审核评论前台不可见。
- 后台可以通过、拒绝、删除。
- 审核通过后前台可见。
- Turnstile 失败时公开提交被拒绝。

### 第二阶段：文章访问量/点赞统计

目标：

- 新增 `post_stats`、`daily_stats`、`daily_visitors`。
- 文章页展示浏览量和点赞数。
- 后台展示 PV/UV、热门文章、趋势数据。

验收：

- 页面访问后浏览量增加。
- 同一浏览器短时间刷新不会无限刷 UV。
- 点赞本地去重。
- 后台 dashboard 可以看到今日数据和热门文章。
- SQL 查询使用索引，避免大范围全表扫描。

### 第三阶段：Live2D/音频性能优化

目标：

- 大音频资源转为更小格式。
- Live2D/Spine 默认延迟加载。
- 移动端默认关闭。
- 首屏不加载大型模型资源。

验收：

- 首页首屏不主动请求最大模型和音频资源。
- 移动端默认不加载 Live2D/Spine。
- 构建产物最大资源有明确下降，或请求时机明显后移。

### 第四阶段：拆分重复内联脚本、压缩 HTML 体积

目标：

- 将通用内联脚本拆成可缓存外部模块。
- 统一 Pagefind 初始化逻辑。
- 减少每个 HTML 页面的重复代码。

验收：

- `dist` 中普通文章 HTML 平均体积下降。
- 搜索功能仍可用。
- 主题切换、布局切换、Swup 导航不回归。

### 第五阶段：友链申请、订阅表单、站内公告后台

目标：

- 友链公开申请 + 后台审核。
- 订阅表单提交。
- 后台公告管理。
- 前台读取当前启用公告。

验收：

- 友链申请默认待审核。
- 后台可以处理友链申请。
- 订阅接口有 Turnstile 和限流。
- 公告启用后前台展示，关闭后不展示。

## 子 Agent 并行实现提示词

下面提示词可直接复制给不同子 agent。建议先让 Agent A 完成基础设施，再让 Agent B/C/D/E 并行，最后由 Agent F 交叉验证。

### Agent A：Worker 基础设施与安全

```txt
你负责为当前 Astro 静态博客增加 Cloudflare Worker + D1 基础设施。

上下文：
- 当前项目是 Astro 静态博客，构建产物在 dist。
- 当前 wrangler.toml 只有 Static Assets 配置。
- 目标是在不引入传统服务器的情况下，用 Worker 处理 /api/*，静态页面继续由 Cloudflare Static Assets 服务。

任务：
1. 更新 wrangler.toml，增加 main、assets binding、D1 binding 示例。
2. 新增 migrations/0001_init.sql，包含 comments、comment_likes、post_stats、daily_stats、daily_visitors、drafts、friend_requests、announcements、subscriptions 及必要索引。
3. 新增 src/worker/index.ts，完成 Worker 入口。
4. 新增路由分发工具，只处理 /api/*，其他请求交给 ASSETS.fetch。
5. 新增 JSON 响应、错误处理、请求体解析、请求大小限制工具。
6. 新增 Cloudflare Access 后台鉴权工具，用于保护 /api/admin/*。
7. 新增 Turnstile 校验工具，用于公开写接口。
8. 新增 IP hash、UA hash 和基础限流工具。

约束：
- 不要改前台 UI。
- 不要硬编码任何 secret。
- GitHub token、Turnstile secret 后续必须通过 Worker secret 注入。
- SQL 必须使用 prepared statement。

完成后输出：
- 修改/新增文件列表。
- 本地验证命令。
- 需要用户在 Cloudflare 控制台配置的变量和 secret 清单。
```

### Agent B：D1 评论与留言板

```txt
你负责实现 D1 原生评论与留言板。

上下文：
- 项目已有 src/components/comment 目录和 src/pages/guestbook.astro。
- 当前 commentConfig.ts 的 type 是 none。
- 需要新增一种 D1 原生评论模式，但不能破坏已有 twikoo、waline、giscus、disqus、artalk 配置。

任务：
1. 新增 D1 评论前台组件，支持按 path 获取已通过评论。
2. 支持提交评论和回复评论。
3. 提交评论必须携带 Turnstile token，服务端校验通过后写入 D1。
4. 新评论默认 status=pending。
5. 留言板复用同一评论系统，customPath 使用 /guestbook/。
6. 新增后台评论审核页面或组件，支持 pending/approved/rejected 筛选。
7. 后台支持通过、拒绝、删除评论。
8. 评论内容需要做基础前端展示安全处理，避免直接渲染未净化 HTML。

约束：
- 保持现有页面视觉风格。
- 不引入传统服务器。
- 不泄露邮箱明文，邮箱只存 hash 或可选加密值。

完成后输出：
- 修改/新增文件列表。
- 评论提交流程说明。
- 后台审核流程说明。
- 接口 smoke test 示例。
```

### Agent C：访问量、点赞与后台仪表盘

```txt
你负责文章访问量、点赞和后台统计仪表盘。

上下文：
- 当前文章页由 Astro 静态生成。
- 当前评论系统关闭时没有独立访问量统计。
- D1 中已有 post_stats、daily_stats、daily_visitors 设计。

任务：
1. 实现 GET /api/stats?paths=...，批量返回文章 views 和 likes。
2. 实现 POST /api/stats/view，按 path 记录 PV/UV。
3. 实现 POST /api/stats/like，按 path 点赞。
4. 前台文章页展示浏览量和点赞数。
5. 浏览器本地对同一文章做短时间去重，避免刷新无限写。
6. Worker 侧使用 daily_visitors 对 UV 去重。
7. 后台 dashboard 展示今日 PV、今日 UV、近 7 天趋势、热门文章、待审核评论数。

约束：
- 避免对 daily_stats 做无条件全表扫描。
- 查询必须使用 day/path 相关索引。
- 点赞接口需要防止同一浏览器连续点击刷写。
- 不要影响静态构建。

完成后输出：
- 修改/新增文件列表。
- D1 读写量风险说明。
- 统计数据验收步骤。
```

### Agent D：后台 Markdown 草稿与 GitHub 发布

```txt
你负责后台 Markdown 草稿和发布流程。

上下文：
- 当前正式文章位于 src/content/posts。
- 推荐方案是 D1 存草稿，发布时通过 GitHub API 写入 Markdown 文件并触发重新部署。
- 不建议把正式文章全部动态存 D1。

任务：
1. 实现后台文章草稿列表。
2. 实现新建草稿、编辑草稿、保存草稿。
3. 实现 Markdown 编辑器和预览。
4. 草稿保存到 D1 drafts 表。
5. 实现 POST /api/admin/drafts/:id/publish。
6. 发布接口通过 GitHub Contents API 写入 src/content/posts/{slug}.md。
7. frontmatter 和 Markdown content 必须组合成合法 Markdown 文件。
8. GitHub token 必须来自 Worker secret。
9. 如果 GitHub token、repo、branch 等配置缺失，后台应显示明确错误。

约束：
- 不硬编码 GitHub token。
- 发布接口必须走 /api/admin/* 鉴权。
- 不要破坏现有 src/content/posts 下的文件格式。
- slug 必须校验，只允许安全路径字符，防止路径穿越。

完成后输出：
- 修改/新增文件列表。
- 发布流程说明。
- 需要配置的 Worker secret 和变量。
- mock GitHub API 或手动验证方案。
```

### Agent E：友链、订阅、公告与性能优化

```txt
你负责第五阶段轻量动态功能，以及 Live2D/音频和 HTML 体积优化。

上下文：
- 当前项目已有 friends、announcement、music、Live2D/Spine 等功能。
- dist 中存在较大的 wav、Live2D texture、Spine/Live2D JS。
- 普通 HTML 页面体积偏大，可能有重复内联脚本。

任务：
1. 实现 POST /api/friends/apply，友链申请默认 pending。
2. 实现后台友链申请审核页面。
3. 实现 POST /api/subscribe，订阅提交，必须 Turnstile + 限流。
4. 实现公告后台管理和 GET /api/public/announcement。
5. 前台读取当前启用公告。
6. 将 Live2D/Spine 改为延迟加载或用户主动点击后加载。
7. 移动端默认关闭 Live2D/Spine。
8. 将大型 wav 音频替换或转为更小格式，若不能转换则给出明确原因。
9. 统一 Pagefind 初始化逻辑，减少重复内联脚本。
10. 尽量将 Layout 中重复内联脚本拆成外部可缓存模块。

约束：
- 不破坏现有外观和交互。
- 不移除用户已有功能，只改变加载时机或增加配置开关。
- 性能优化要有构建产物大小对比。

完成后输出：
- 修改/新增文件列表。
- 构建前后最大资源对比。
- 移动端和桌面端验证步骤。
```

### Agent F：交叉验证与全局测试

```txt
你负责交叉验证所有模块。请以代码审查和验收测试的方式检查 Agent A-E 的实现。

验证范围：
1. D1 migration 是否能执行。
2. wrangler.toml 是否支持 Static Assets + Worker + D1。
3. /api/* 路由是否正确，静态页面是否仍由 assets 服务。
4. /api/admin/* 是否必须经过 Cloudflare Access 鉴权。
5. 公开写接口是否有 Turnstile 校验、限流、请求体大小限制。
6. 评论提交、审核、展示闭环是否完整。
7. 留言板是否复用评论系统。
8. 访问量和点赞是否不会被简单刷新刷爆。
9. 统计 SQL 是否使用索引，是否存在明显全表扫描风险。
10. 草稿保存和发布是否不泄露 GitHub token。
11. Markdown 发布是否能生成合法 frontmatter。
12. 友链、订阅、公告后台和前台是否闭环。
13. Live2D/音频是否延迟加载，移动端是否默认关闭。
14. Pagefind 搜索、主题切换、Swup 导航是否回归。
15. pnpm check、pnpm build、wrangler dev 是否通过。

输出要求：
- 先列 P0/P1/P2 问题。
- 每个问题给出文件路径、触发条件、影响和建议修复。
- 可以安全修复的小问题直接修复。
- 最后给出完整验收结论和剩余风险。
```

## 交叉验证矩阵

```txt
Agent A -> Agent F 验证：部署配置、D1 binding、Access、Turnstile、错误处理。
Agent B -> Agent C 验证：评论数量是否进入 dashboard，审核状态是否正确。
Agent C -> Agent F 验证：统计 SQL 是否有索引，访问量是否被重复刷爆。
Agent D -> Agent A 验证：GitHub token secret、安全边界、发布 API 鉴权。
Agent E -> Agent F 验证：构建体积、移动端加载、旧功能兼容。
Agent F -> 全局最终验证：pnpm check、pnpm build、wrangler dev、接口 smoke test。
```

## 全局验收标准

```txt
1. pnpm build 成功，静态页面仍正常生成。
2. wrangler dev 下 /api/* 可访问，普通静态路由仍走 assets。
3. 未登录不能访问 /admin/* 和 /api/admin/*。
4. 评论提交需要 Turnstile，提交后默认 pending。
5. 后台能审核评论，审核后前台显示。
6. 留言板能提交和审核。
7. 文章页能显示访问量和点赞。
8. 刷新页面不会无限增加 UV。
9. 后台 dashboard 能展示今日 PV/UV、近 7 天趋势、热门文章和待审核数量。
10. 后台能保存 Markdown 草稿。
11. GitHub token 配置后能发布文章并触发重新部署。
12. GitHub token 未配置时有明确错误，不会静默失败。
13. 友链申请、订阅和公告功能闭环可用。
14. Live2D/音频不阻塞首屏。
15. 移动端默认不加载大型 Live2D/Spine 资源。
16. 普通 HTML 或首屏请求体积相比当前有明确下降，或提供未下降原因。
```

## 推荐实施顺序

```txt
第 0 步：创建 D1 数据库，配置 Cloudflare Access 策略，准备 Turnstile site key 和 secret。
第 1 步：Agent A 实现 Worker + D1 + 安全基础设施。
第 2 步：Agent B/C/D/E 并行实现评论、统计、草稿发布、轻量动态功能和性能优化。
第 3 步：Agent F 做全局交叉验证。
第 4 步：修复 P0/P1 问题。
第 5 步：部署到 Cloudflare 预览环境。
第 6 步：验证真实域名、Access、Turnstile、D1、GitHub 发布链路。
第 7 步：切换生产。
```

## 必需配置清单

Cloudflare：

```txt
D1 database: ylhx_blog
Turnstile site key
Turnstile secret key
Cloudflare Access application:
  - /admin/*
  - /api/admin/*
  - allowed email: 你的邮箱
```

Worker secrets：

```txt
TURNSTILE_SECRET_KEY
GITHUB_TOKEN
```

Worker variables：

```txt
GITHUB_OWNER
GITHUB_REPO
GITHUB_BRANCH
GITHUB_POSTS_DIR=src/content/posts
ADMIN_EMAIL=你的邮箱
```

本地命令示例：

```bash
pnpm build
wrangler d1 migrations apply ylhx_blog --local
wrangler dev
```

生产命令示例：

```bash
wrangler d1 migrations apply ylhx_blog --remote
wrangler deploy
```
