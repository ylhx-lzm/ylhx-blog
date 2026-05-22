type D1Database = {
	prepare: (query: string) => D1PreparedStatement;
	batch?: (statements: D1PreparedStatement[]) => Promise<unknown[]>;
};

type D1PreparedStatement = {
	bind: (...values: unknown[]) => D1PreparedStatement;
	first: <T = Record<string, unknown>>() => Promise<T | null>;
	all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
	run: () => Promise<unknown>;
};

type Env = {
	DB: D1Database;
	ASSETS?: { fetch: (request: Request) => Promise<Response> };
	TURNSTILE_SECRET_KEY?: string;
	ADMIN_EMAIL?: string;
	ADMIN_DEV_TOKEN?: string;
	GITHUB_TOKEN?: string;
	GITHUB_REPO?: string;
	GITHUB_BRANCH?: string;
};

type ApiErrorCode =
	| "bad_request"
	| "forbidden"
	| "not_found"
	| "method_not_allowed"
	| "turnstile_failed"
	| "server_error";

const jsonHeaders = {
	"content-type": "application/json; charset=utf-8",
	"cache-control": "no-store",
};

const maxBodyBytes = 32 * 1024;
const textEncoder = new TextEncoder();

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname.startsWith("/admin/")) {
			// 页面请求（HTML）放行，让客户端 JS 处理登录
			// API 请求仍然需要鉴权
			const accept = request.headers.get("Accept") || "";
			const isPageRequest = accept.includes("text/html");
			if (!isPageRequest) {
				const auth = isLocalRequest(url) ? null : requireAdmin(request, env);
				if (auth) return auth;
			}
			return (
				env.ASSETS?.fetch(request) ?? new Response("Not found", { status: 404 })
			);
		}

		if (!url.pathname.startsWith("/api/")) {
			return (
				env.ASSETS?.fetch(request) ?? new Response("Not found", { status: 404 })
			);
		}

		try {
			return await route(request, env, url);
		} catch (error) {
			console.error("Worker API error", error);
			return apiError("server_error", "Server error", 500);
		}
	},
};

async function route(request: Request, env: Env, url: URL): Promise<Response> {
	const path = normalizePathname(url.pathname);

	if (request.method === "OPTIONS") return json({ ok: true });

	if (path === "/api/comments" && request.method === "GET")
		return listComments(env, url);
	if (path === "/api/comments" && request.method === "POST")
		return createComment(request, env);
	if (
		path.match(/^\/api\/comments\/[^/]+\/like$/) &&
		request.method === "POST"
	) {
		return likeComment(request, env, decodeURIComponent(path.split("/")[3]));
	}

	if (path === "/api/stats" && request.method === "GET")
		return getStats(env, url);
	if (path === "/api/stats/view" && request.method === "POST")
		return recordView(request, env);
	if (path === "/api/stats/like" && request.method === "POST")
		return likePost(request, env);

	if (path === "/api/public/announcement" && request.method === "GET")
		return getPublicAnnouncement(env);
	if (path === "/api/friends/apply" && request.method === "POST")
		return applyFriend(request, env);
	if (path === "/api/subscribe" && request.method === "POST")
		return subscribe(request, env);

	if (path.startsWith("/api/admin/")) {
		const auth = requireAdmin(request, env);
		if (auth) return auth;
		return routeAdmin(request, env, url, path);
	}

	return apiError("not_found", "Not found", 404);
}

async function routeAdmin(
	request: Request,
	env: Env,
	url: URL,
	path: string,
): Promise<Response> {
	if (path === "/api/admin/dashboard" && request.method === "GET")
		return adminDashboard(env);

	if (path === "/api/admin/comments" && request.method === "GET")
		return adminComments(env, url);
	if (
		path.match(/^\/api\/admin\/comments\/[^/]+$/) &&
		request.method === "PATCH"
	) {
		return adminUpdateComment(
			request,
			env,
			decodeURIComponent(path.split("/")[4]),
		);
	}
	if (
		path.match(/^\/api\/admin\/comments\/[^/]+$/) &&
		request.method === "DELETE"
	) {
		return adminDeleteComment(env, decodeURIComponent(path.split("/")[4]));
	}

	if (path === "/api/admin/drafts" && request.method === "GET")
		return adminListDrafts(env);
	if (path === "/api/admin/drafts" && request.method === "POST")
		return adminSaveDraft(request, env);
	if (path.match(/^\/api\/admin\/drafts\/[^/]+$/) && request.method === "GET") {
		return adminGetDraft(env, decodeURIComponent(path.split("/")[4]));
	}
	if (
		path.match(/^\/api\/admin\/drafts\/[^/]+$/) &&
		request.method === "PATCH"
	) {
		return adminSaveDraft(request, env, decodeURIComponent(path.split("/")[4]));
	}
	if (
		path.match(/^\/api\/admin\/drafts\/[^/]+\/publish$/) &&
		request.method === "POST"
	) {
		return adminPublishDraft(env, decodeURIComponent(path.split("/")[4]));
	}

	if (path === "/api/admin/friends" && request.method === "GET")
		return adminFriendRequests(env, url);
	if (
		path.match(/^\/api\/admin\/friends\/[^/]+$/) &&
		request.method === "PATCH"
	) {
		return adminUpdateFriend(
			request,
			env,
			decodeURIComponent(path.split("/")[4]),
		);
	}

	if (path === "/api/admin/announcements" && request.method === "GET")
		return adminAnnouncements(env);
	if (path === "/api/admin/announcements" && request.method === "POST")
		return adminSaveAnnouncement(request, env);
	if (
		path.match(/^\/api\/admin\/announcements\/[^/]+$/) &&
		request.method === "PATCH"
	) {
		return adminSaveAnnouncement(
			request,
			env,
			decodeURIComponent(path.split("/")[4]),
		);
	}
	if (
		path.match(/^\/api\/admin\/announcements\/[^/]+$/) &&
		request.method === "DELETE"
	) {
		return adminDeleteAnnouncement(env, decodeURIComponent(path.split("/")[4]));
	}

	if (path === "/api/admin/subscriptions" && request.method === "GET")
		return adminSubscriptions(env);

	return apiError("not_found", "Not found", 404);
}

function json(data: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(data), {
		...init,
		headers: { ...jsonHeaders, ...init.headers },
	});
}

function apiError(
	code: ApiErrorCode,
	message: string,
	status: number,
): Response {
	return json({ ok: false, code, message }, { status });
}

function normalizePathname(pathname: string): string {
	return pathname.replace(/\/+$/, "") || "/";
}

function normalizeContentPath(path: unknown): string {
	if (typeof path !== "string") return "";
	const trimmed = path.trim();
	if (!trimmed || trimmed.length > 240) return "";
	return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

async function readJson<T = Record<string, unknown>>(
	request: Request,
): Promise<T | null> {
	const clone = request.clone();
	const body = await clone.text();
	if (body.length > maxBodyBytes) return null;
	if (!body) return {} as T;
	try {
		return JSON.parse(body) as T;
	} catch {
		return null;
	}
}

function requireAdmin(request: Request, env: Env): Response | null {
	const accessEmail =
		request.headers.get("cf-access-authenticated-user-email") || "";
	const devToken = request.headers.get("x-admin-token") || "";
	if (env.ADMIN_DEV_TOKEN && devToken === env.ADMIN_DEV_TOKEN) return null;
	if (env.ADMIN_EMAIL) {
		return accessEmail.toLowerCase() === env.ADMIN_EMAIL.toLowerCase()
			? null
			: apiError("forbidden", "Admin access required", 403);
	}
	return accessEmail
		? null
		: apiError("forbidden", "Cloudflare Access header required", 403);
}

function isLocalRequest(url: URL): boolean {
	return ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
}

async function verifyTurnstile(
	request: Request,
	env: Env,
	token: unknown,
): Promise<boolean> {
	// 未配置 TURNSTILE_SECRET_KEY 时跳过验证
	if (!env.TURNSTILE_SECRET_KEY) return true;
	if (typeof token !== "string" || !token) return false;

	const response = await fetch(
		"https://challenges.cloudflare.com/turnstile/v0/siteverify",
		{
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				secret: env.TURNSTILE_SECRET_KEY,
				response: token,
				remoteip: request.headers.get("cf-connecting-ip") || "",
			}),
		},
	);
	const result = (await response.json().catch(() => null)) as {
		success?: boolean;
	} | null;
	return result?.success === true;
}

async function hash(value: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		textEncoder.encode(value),
	);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

function now(): number {
	return Date.now();
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
	const d = new Date();
	d.setDate(d.getDate() - n);
	return d.toISOString().slice(0, 10);
}

function clientFingerprint(request: Request): string {
	return [
		request.headers.get("cf-connecting-ip") || "",
		request.headers.get("user-agent") || "",
		request.headers.get("accept-language") || "",
	].join("|");
}

function validateString(value: unknown, min: number, max: number): string {
	if (typeof value !== "string") return "";
	const trimmed = value.trim();
	if (trimmed.length < min || trimmed.length > max) return "";
	return trimmed;
}

function validateUrl(value: unknown): string {
	const raw = validateString(value, 0, 240);
	if (!raw) return "";
	try {
		const url = new URL(raw);
		return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
	} catch {
		return "";
	}
}

async function listComments(env: Env, url: URL): Promise<Response> {
	const path = normalizeContentPath(url.searchParams.get("path"));
	if (!path) return apiError("bad_request", "Invalid path", 400);
	const rows = await env.DB.prepare(
		`SELECT c.id, c.path, c.parent_id, c.author, c.website, c.content, c.created_at, c.updated_at,
			COUNT(l.comment_id) AS likes
		 FROM comments c
		 LEFT JOIN comment_likes l ON l.comment_id = c.id
		 WHERE c.path = ? AND c.status = 'approved'
		 GROUP BY c.id
		 ORDER BY c.created_at ASC`,
	)
		.bind(path)
		.all();
	return json({ ok: true, comments: rows.results || [] });
}

async function createComment(request: Request, env: Env): Promise<Response> {
	const body = await readJson<Record<string, unknown>>(request);
	if (!body) return apiError("bad_request", "Invalid JSON body", 400);
	if (!(await verifyTurnstile(request, env, body.turnstileToken))) {
		return apiError("turnstile_failed", "Turnstile verification failed", 403);
	}

	const path = normalizeContentPath(body.path);
	const parentId =
		validateString(body.parent_id || body.parentId, 0, 80) || null;
	const author = validateString(body.author, 1, 40);
	const email = validateString(body.email, 3, 120);
	const website = validateUrl(body.website);
	const content = validateString(body.content, 1, 1200);
	if (!path || !author || !email || !content)
		return apiError("bad_request", "Invalid comment", 400);

	const id = crypto.randomUUID();
	const timestamp = now();
	await env.DB.prepare(
		`INSERT INTO comments
		 (id, path, parent_id, author, email_hash, website, content, status, ip_hash, user_agent, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
	)
		.bind(
			id,
			path,
			parentId,
			author,
			await hash(email.toLowerCase()),
			website || null,
			content,
			await hash(clientFingerprint(request)),
			request.headers.get("user-agent") || "",
			timestamp,
			timestamp,
		)
		.run();
	return json({ ok: true, id, status: "pending" }, { status: 201 });
}

async function likeComment(
	request: Request,
	env: Env,
	id: string,
): Promise<Response> {
	const voter = await hash(clientFingerprint(request));
	await env.DB.prepare(
		"INSERT OR IGNORE INTO comment_likes (comment_id, voter_hash, created_at) VALUES (?, ?, ?)",
	)
		.bind(id, voter, now())
		.run();
	const row = await env.DB.prepare(
		"SELECT COUNT(*) AS likes FROM comment_likes WHERE comment_id = ?",
	)
		.bind(id)
		.first<{ likes: number }>();
	return json({ ok: true, likes: row?.likes || 0 });
}

async function getStats(env: Env, url: URL): Promise<Response> {
	const paths = (
		url.searchParams.get("paths") ||
		url.searchParams.get("path") ||
		""
	)
		.split(",")
		.map(normalizeContentPath)
		.filter(Boolean);
	if (!paths.length) return apiError("bad_request", "Invalid paths", 400);

	const rows: Record<string, unknown>[] = [];
	for (const path of paths.slice(0, 50)) {
		const row = await env.DB.prepare(
			"SELECT path, views, likes, updated_at FROM post_stats WHERE path = ?",
		)
			.bind(path)
			.first();
		rows.push(row || { path, views: 0, likes: 0, updated_at: null });
	}
	return json({ ok: true, stats: rows.length === 1 ? rows[0] : rows });
}

async function recordView(request: Request, env: Env): Promise<Response> {
	const body = await readJson<Record<string, unknown>>(request);
	const path = normalizeContentPath(body?.path);
	if (!path) return apiError("bad_request", "Invalid path", 400);

	const timestamp = now();
	const day = today();
	const visitorHash = await hash(
		`${day}|${path}|${clientFingerprint(request)}`,
	);
	await env.DB.prepare(
		`INSERT INTO post_stats (path, views, likes, updated_at) VALUES (?, 1, 0, ?)
		 ON CONFLICT(path) DO UPDATE SET views = views + 1, updated_at = excluded.updated_at`,
	)
		.bind(path, timestamp)
		.run();
	const inserted = await env.DB.prepare(
		"INSERT OR IGNORE INTO daily_visitors (day, path, visitor_hash, created_at) VALUES (?, ?, ?, ?)",
	)
		.bind(day, path, visitorHash, timestamp)
		.run();
	await env.DB.prepare(
		`INSERT INTO daily_stats (day, path, pv, uv, likes) VALUES (?, ?, 1, 1, 0)
		 ON CONFLICT(day, path) DO UPDATE SET pv = pv + 1, uv = uv + ?`,
	)
		.bind(day, path, inserted ? visitorInsertDelta(inserted) : 0)
		.run();

	const row = await env.DB.prepare(
		"SELECT path, views, likes, updated_at FROM post_stats WHERE path = ?",
	)
		.bind(path)
		.first();
	return json({ ok: true, stats: row });
}

function visitorInsertDelta(result: unknown): number {
	const meta = result as { meta?: { changes?: number } };
	return meta.meta?.changes ? 1 : 0;
}

async function likePost(request: Request, env: Env): Promise<Response> {
	const body = await readJson<Record<string, unknown>>(request);
	const path = normalizeContentPath(body?.path);
	if (!path) return apiError("bad_request", "Invalid path", 400);

	const liked = body?.liked !== false;
	const voterHash = await hash(`${path}|${clientFingerprint(request)}`);
	const timestamp = now();
	if (liked) {
		await env.DB.prepare(
			"INSERT OR IGNORE INTO post_likes (path, voter_hash, created_at) VALUES (?, ?, ?)",
		)
			.bind(path, voterHash, timestamp)
			.run();
	} else {
		await env.DB.prepare(
			"DELETE FROM post_likes WHERE path = ? AND voter_hash = ?",
		)
			.bind(path, voterHash)
			.run();
	}
	const likesRow = await env.DB.prepare(
		"SELECT COUNT(*) AS likes FROM post_likes WHERE path = ?",
	)
		.bind(path)
		.first<{ likes: number }>();
	await env.DB.prepare(
		`INSERT INTO post_stats (path, views, likes, updated_at) VALUES (?, 0, ?, ?)
		 ON CONFLICT(path) DO UPDATE SET likes = excluded.likes, updated_at = excluded.updated_at`,
	)
		.bind(path, likesRow?.likes || 0, timestamp)
		.run();
	await env.DB.prepare(
		`INSERT INTO daily_stats (day, path, pv, uv, likes) VALUES (?, ?, 0, 0, ?)
		 ON CONFLICT(day, path) DO UPDATE SET likes = excluded.likes`,
	)
		.bind(today(), path, likesRow?.likes || 0)
		.run();
	const row = await env.DB.prepare(
		"SELECT path, views, likes, updated_at FROM post_stats WHERE path = ?",
	)
		.bind(path)
		.first();
	return json({ ok: true, stats: row });
}

async function getPublicAnnouncement(env: Env): Promise<Response> {
	const timestamp = now();
	const row = await env.DB.prepare(
		`SELECT id, title, content, starts_at, ends_at FROM announcements
		 WHERE enabled = 1
		   AND (starts_at IS NULL OR starts_at <= ?)
		   AND (ends_at IS NULL OR ends_at >= ?)
		 ORDER BY updated_at DESC LIMIT 1`,
	)
		.bind(timestamp, timestamp)
		.first();
	return json({ ok: true, announcement: row || null });
}

async function applyFriend(request: Request, env: Env): Promise<Response> {
	const body = await readJson<Record<string, unknown>>(request);
	if (!body) return apiError("bad_request", "Invalid JSON body", 400);
	if (!(await verifyTurnstile(request, env, body.turnstileToken))) {
		return apiError("turnstile_failed", "Turnstile verification failed", 403);
	}
	const name = validateString(body.name, 1, 60);
	const url = validateUrl(body.url);
	const avatar = validateUrl(body.avatar);
	const description = validateString(body.description, 0, 240);
	const email = validateString(body.email, 3, 120);
	if (!name || !url)
		return apiError("bad_request", "Invalid friend request", 400);

	const timestamp = now();
	const id = crypto.randomUUID();
	await env.DB.prepare(
		`INSERT INTO friend_requests
		 (id, name, url, avatar, description, email_hash, status, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
	)
		.bind(
			id,
			name,
			url,
			avatar || null,
			description || null,
			email ? await hash(email.toLowerCase()) : null,
			timestamp,
			timestamp,
		)
		.run();
	return json({ ok: true, id, status: "pending" }, { status: 201 });
}

async function subscribe(request: Request, env: Env): Promise<Response> {
	const body = await readJson<Record<string, unknown>>(request);
	if (!body) return apiError("bad_request", "Invalid JSON body", 400);
	if (!(await verifyTurnstile(request, env, body.turnstileToken))) {
		return apiError("turnstile_failed", "Turnstile verification failed", 403);
	}
	const email = validateString(body.email, 3, 120);
	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
		return apiError("bad_request", "Invalid email", 400);
	const timestamp = now();
	await env.DB.prepare(
		`INSERT INTO subscriptions (id, email_hash, email_encrypted, status, created_at, updated_at)
		 VALUES (?, ?, ?, 'active', ?, ?)
		 ON CONFLICT(email_hash) DO UPDATE SET status = 'active', updated_at = excluded.updated_at`,
	)
		.bind(
			crypto.randomUUID(),
			await hash(email.toLowerCase()),
			btoa(email),
			timestamp,
			timestamp,
		)
		.run();
	return json({ ok: true });
}

async function adminDashboard(env: Env): Promise<Response> {
	const totals = await env.DB.prepare(
		"SELECT COALESCE(SUM(views), 0) AS totalViews, COALESCE(SUM(likes), 0) AS totalLikes, COUNT(*) AS totalPosts FROM post_stats",
	).first<{
		totalViews: number;
		totalLikes: number;
		totalPosts: number;
	}>();
	const todayRows = await env.DB.prepare(
		"SELECT COALESCE(SUM(pv), 0) AS todayViews FROM daily_stats WHERE day = ?",
	)
		.bind(today())
		.first<{ todayViews: number }>();
	const topPosts = await env.DB.prepare(
		"SELECT path, views, likes, updated_at AS updatedAt FROM post_stats ORDER BY views DESC, likes DESC LIMIT 20",
	).all();
	const pending = await env.DB.prepare(
		`SELECT
		 (SELECT COUNT(*) FROM comments WHERE status = 'pending') AS pendingComments,
		 (SELECT COUNT(*) FROM friend_requests WHERE status = 'pending') AS pendingFriends,
		 (SELECT COUNT(*) FROM subscriptions WHERE status = 'active') AS subscriptions`,
	).first();

	const sixDaysAgoDate = daysAgo(6);
	const trendViews = await env.DB.prepare(
		"SELECT day, SUM(pv) AS views FROM daily_stats WHERE day >= ? GROUP BY day ORDER BY day ASC LIMIT 7",
	)
		.bind(sixDaysAgoDate)
		.all();
	const sixDaysAgoMs = new Date(sixDaysAgoDate).getTime();
	const trendLikes = await env.DB.prepare(
		`SELECT DATE(created_at / 1000, 'unixepoch') AS day, COUNT(*) AS likes
		 FROM post_likes
		 WHERE created_at >= ?
		 GROUP BY day
		 ORDER BY day ASC`,
	)
		.bind(sixDaysAgoMs)
		.all();
	const likesMap = new Map<string, number>();
	for (const row of (trendLikes.results || []) as Array<{
		day: string;
		likes: number;
	}>) {
		likesMap.set(row.day, row.likes);
	}
	const trendRows = ((trendViews.results || []) as Array<{
		day: string;
		views: number;
	}>).map((row) => ({
		day: row.day,
		views: row.views,
		likes: likesMap.get(row.day) || 0,
	}));

	return json({
		ok: true,
		data: {
			...(totals || {}),
			todayViews: todayRows?.todayViews || 0,
			...(pending || {}),
			trendRows,
			topPosts: topPosts.results || [],
		},
	});
}

async function adminComments(env: Env, url: URL): Promise<Response> {
	const status = url.searchParams.get("status") || "pending";
	const rows = await env.DB.prepare(
		`SELECT id, path, parent_id, author, website, content, status, created_at, updated_at
		 FROM comments WHERE (? = 'all' OR status = ?) ORDER BY created_at DESC LIMIT 200`,
	)
		.bind(status, status)
		.all();
	return json({ ok: true, comments: rows.results || [] });
}

async function adminUpdateComment(
	request: Request,
	env: Env,
	id: string,
): Promise<Response> {
	const body = await readJson<Record<string, unknown>>(request);
	const status = validateString(body?.status, 1, 20);
	if (!["pending", "approved", "rejected"].includes(status))
		return apiError("bad_request", "Invalid status", 400);
	await env.DB.prepare(
		"UPDATE comments SET status = ?, updated_at = ? WHERE id = ?",
	)
		.bind(status, now(), id)
		.run();
	return json({ ok: true });
}

async function adminDeleteComment(env: Env, id: string): Promise<Response> {
	await env.DB.prepare("DELETE FROM comment_likes WHERE comment_id = ?")
		.bind(id)
		.run();
	await env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(id).run();
	return json({ ok: true });
}

async function adminListDrafts(env: Env): Promise<Response> {
	const rows = await env.DB.prepare(
		"SELECT id, slug, title, status, created_at, updated_at, published_at FROM drafts ORDER BY updated_at DESC LIMIT 200",
	).all();
	return json({ ok: true, drafts: rows.results || [] });
}

async function adminGetDraft(env: Env, id: string): Promise<Response> {
	const row = await env.DB.prepare("SELECT * FROM drafts WHERE id = ?")
		.bind(id)
		.first();
	return row
		? json({ ok: true, draft: row })
		: apiError("not_found", "Draft not found", 404);
}

async function adminSaveDraft(
	request: Request,
	env: Env,
	existingId?: string,
): Promise<Response> {
	const body = await readJson<Record<string, unknown>>(request);
	if (!body) return apiError("bad_request", "Invalid JSON body", 400);
	const id =
		existingId || validateString(body.id, 1, 80) || crypto.randomUUID();
	const slug = validateString(body.slug, 1, 160);
	const title = validateString(body.title, 1, 160);
	const content = validateString(body.content, 0, 20000);
	const frontmatter = validateString(body.frontmatter, 0, 5000) || "{}";
	if (!slug || !title) return apiError("bad_request", "Invalid draft", 400);
	const timestamp = now();
	await env.DB.prepare(
		`INSERT INTO drafts (id, slug, title, content, frontmatter, status, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)
		 ON CONFLICT(id) DO UPDATE SET
		   slug = excluded.slug,
		   title = excluded.title,
		   content = excluded.content,
		   frontmatter = excluded.frontmatter,
		   updated_at = excluded.updated_at`,
	)
		.bind(id, slug, title, content, frontmatter, timestamp, timestamp)
		.run();
	return json({
		ok: true,
		draft: {
			id,
			slug,
			title,
			content,
			frontmatter,
			status: "draft",
			updated_at: timestamp,
		},
	});
}

async function adminPublishDraft(env: Env, id: string): Promise<Response> {
	const draft = await env.DB.prepare("SELECT * FROM drafts WHERE id = ?")
		.bind(id)
		.first<{
			id: string;
			slug: string;
			title: string;
			content: string;
			frontmatter: string;
		}>();
	if (!draft) return apiError("not_found", "Draft not found", 404);
	if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
		return apiError(
			"bad_request",
			"GITHUB_TOKEN and GITHUB_REPO are required",
			400,
		);
	}

	const branch = env.GITHUB_BRANCH || "main";
	const filePath = `src/content/posts/${draft.slug.replace(/^\/+|\/+$/g, "")}.md`;
	const existing = await fetch(
		`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${filePath}?ref=${branch}`,
		{
			headers: githubHeaders(env),
		},
	);
	const existingJson = existing.ok
		? ((await existing.json()) as { sha?: string })
		: null;
	const markdown = renderMarkdown(draft);
	const response = await fetch(
		`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${filePath}`,
		{
			method: "PUT",
			headers: githubHeaders(env),
			body: JSON.stringify({
				message: `publish: ${draft.title}`,
				content: toBase64(markdown),
				branch,
				sha: existingJson?.sha,
			}),
		},
	);
	if (!response.ok) {
		const errorText = await response.text();
		return apiError(
			"server_error",
			`GitHub publish failed: ${errorText.slice(0, 300)}`,
			502,
		);
	}

	// 发布后验证：从 GitHub 重新拉取文件确认
	const publishResult = (await response.json()) as {
		content?: { sha?: string; html_url?: string };
		commit?: { sha?: string };
	};
	let verified = false;
	let verifySha = "";
	let verifyUrl = "";
	let commitSha = "";
	if (publishResult.content?.sha) {
		verified = true;
		verifySha = publishResult.content.sha;
		verifyUrl = publishResult.content.html_url || "";
	}
	if (publishResult.commit?.sha) {
		commitSha = publishResult.commit.sha;
	}

	await env.DB.prepare(
		"UPDATE drafts SET status = 'published', published_at = ?, updated_at = ? WHERE id = ?",
	)
		.bind(now(), now(), id)
		.run();
	return json({
		ok: true,
		path: filePath,
		verified,
		sha: verifySha.substring(0, 7),
		commit: commitSha.substring(0, 7),
		url: verifyUrl,
		branch,
	});
}

function githubHeaders(env: Env): HeadersInit {
	return {
		authorization: `Bearer ${env.GITHUB_TOKEN}`,
		accept: "application/vnd.github+json",
		"user-agent": "firefly-cloudflare-admin",
		"x-github-api-version": "2022-11-28",
	};
}

function toBase64(value: string): string {
	let binary = "";
	for (const byte of textEncoder.encode(value)) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

function renderMarkdown(draft: {
	title: string;
	frontmatter: string;
	content: string;
}): string {
	let extra = draft.frontmatter.trim();
	if (extra.startsWith("{")) {
		try {
			const data = JSON.parse(extra) as Record<string, unknown>;
			extra = Object.entries(data)
				.map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
				.join("\n");
		} catch {
			extra = "";
		}
	}
	return `---\ntitle: ${JSON.stringify(draft.title)}\n${extra ? `${extra}\n` : ""}---\n\n${draft.content.trim()}\n`;
}

async function adminFriendRequests(env: Env, url: URL): Promise<Response> {
	const status = url.searchParams.get("status") || "pending";
	const rows = await env.DB.prepare(
		`SELECT id, name, url, avatar, description, status, created_at, updated_at
		 FROM friend_requests WHERE (? = 'all' OR status = ?) ORDER BY created_at DESC LIMIT 200`,
	)
		.bind(status, status)
		.all();
	return json({ ok: true, friends: rows.results || [] });
}

async function adminUpdateFriend(
	request: Request,
	env: Env,
	id: string,
): Promise<Response> {
	const body = await readJson<Record<string, unknown>>(request);
	const status = validateString(body?.status, 1, 20);
	if (!["pending", "approved", "rejected"].includes(status))
		return apiError("bad_request", "Invalid status", 400);
	await env.DB.prepare(
		"UPDATE friend_requests SET status = ?, updated_at = ? WHERE id = ?",
	)
		.bind(status, now(), id)
		.run();
	return json({ ok: true });
}

async function adminAnnouncements(env: Env): Promise<Response> {
	const rows = await env.DB.prepare(
		"SELECT * FROM announcements ORDER BY updated_at DESC LIMIT 100",
	).all();
	return json({ ok: true, announcements: rows.results || [] });
}

async function adminSaveAnnouncement(
	request: Request,
	env: Env,
	existingId?: string,
): Promise<Response> {
	const body = await readJson<Record<string, unknown>>(request);
	if (!body) return apiError("bad_request", "Invalid JSON body", 400);
	const id =
		existingId || validateString(body.id, 1, 80) || crypto.randomUUID();
	const title = validateString(body.title, 1, 120);
	const content = validateString(body.content, 1, 2000);
	const enabled = body.enabled ? 1 : 0;
	if (!title || !content)
		return apiError("bad_request", "Invalid announcement", 400);
	const timestamp = now();
	await env.DB.prepare(
		`INSERT INTO announcements (id, title, content, enabled, starts_at, ends_at, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET
		   title = excluded.title,
		   content = excluded.content,
		   enabled = excluded.enabled,
		   starts_at = excluded.starts_at,
		   ends_at = excluded.ends_at,
		   updated_at = excluded.updated_at`,
	)
		.bind(
			id,
			title,
			content,
			enabled,
			body.starts_at || null,
			body.ends_at || null,
			timestamp,
			timestamp,
		)
		.run();
	return json({ ok: true, announcement: { id, title, content, enabled } });
}

async function adminDeleteAnnouncement(
	env: Env,
	id: string,
): Promise<Response> {
	await env.DB.prepare("DELETE FROM announcements WHERE id = ?").bind(id).run();
	return json({ ok: true });
}

async function adminSubscriptions(env: Env): Promise<Response> {
	const rows = await env.DB.prepare(
		"SELECT id, email_hash, status, created_at, updated_at FROM subscriptions ORDER BY created_at DESC LIMIT 200",
	).all();
	return json({ ok: true, subscriptions: rows.results || [] });
}
