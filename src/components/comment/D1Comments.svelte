<script lang="ts">
import { onMount } from "svelte";

type CommentStatus = "approved" | "pending" | "rejected";

type D1Comment = {
	id: string;
	path: string;
	parent_id?: string | null;
	parentId?: string | null;
	author: string;
	website?: string | null;
	content: string;
	status?: CommentStatus;
	likes?: number;
	created_at?: number | string;
	createdAt?: number | string;
};

type CommentForm = {
	author: string;
	email: string;
	website: string;
	content: string;
};

type TurnstileApi = {
	render: (
		element: HTMLElement,
		options: {
			sitekey: string;
			callback: (token: string) => void;
			"expired-callback": () => void;
			"error-callback": () => void;
		},
	) => string;
	reset: (widgetId?: string) => void;
};

declare global {
	interface Window {
		turnstile?: TurnstileApi;
	}
}

export let path: string;
export let apiBase = "";
export let turnstileSiteKey = "";

const maxAuthorLength = 40;
const maxEmailLength = 120;
const maxWebsiteLength = 200;
const maxContentLength = 1200;

let comments: D1Comment[] = [];
let form: CommentForm = { author: "", email: "", website: "", content: "" };
let replyForm: CommentForm = {
	author: "",
	email: "",
	website: "",
	content: "",
};
let replyTo: D1Comment | null = null;
let loading = true;
let submitting = false;
let likingId = "";
let errorMessage = "";
let noticeMessage = "";
let turnstileToken = "";
let turnstileElement: HTMLDivElement;
let turnstileWidgetId = "";

const normalizeApiBase = (value: string): string => value.replace(/\/+$/, "");

const commentsEndpoint = (): string =>
	`${normalizeApiBase(apiBase)}/api/comments`;

const likeEndpoint = (id: string): string =>
	`${commentsEndpoint()}/${encodeURIComponent(id)}/like`;

const getParentId = (comment: D1Comment): string | null =>
	comment.parent_id || comment.parentId || null;

const rootComments = (): D1Comment[] =>
	comments.filter((comment) => !getParentId(comment));

const childComments = (parentId: string): D1Comment[] =>
	comments.filter((comment) => getParentId(comment) === parentId);

const formatDate = (value?: number | string): string => {
	if (!value) return "";
	const date =
		typeof value === "number"
			? new Date(value > 1000000000000 ? value : value * 1000)
			: new Date(value);
	return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};

const normalizeComments = (data: unknown): D1Comment[] => {
	if (Array.isArray(data)) return data as D1Comment[];
	if (
		data &&
		typeof data === "object" &&
		Array.isArray((data as { comments?: unknown }).comments)
	) {
		return (data as { comments: D1Comment[] }).comments;
	}
	return [];
};

const setError = (message: string) => {
	errorMessage = message;
	noticeMessage = "";
};

const setNotice = (message: string) => {
	noticeMessage = message;
	errorMessage = "";
};

const resetTurnstile = () => {
	turnstileToken = "";
	window.turnstile?.reset(turnstileWidgetId);
};

const loadComments = async () => {
	loading = true;
	errorMessage = "";
	try {
		const response = await fetch(
			`${commentsEndpoint()}?path=${encodeURIComponent(path)}`,
			{ headers: { accept: "application/json" } },
		);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		comments = normalizeComments(await response.json());
	} catch (error) {
		console.error("Failed to load D1 comments:", error);
		setError("评论加载失败，请稍后重试。");
	} finally {
		loading = false;
	}
};

const validateForm = (target: CommentForm): string => {
	const author = target.author.trim();
	const email = target.email.trim();
	const website = target.website.trim();
	const content = target.content.trim();
	if (!author) return "请填写昵称。";
	if (author.length > maxAuthorLength) return "昵称过长。";
	if (!email) return "请填写邮箱。";
	if (
		email.length > maxEmailLength ||
		!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
	) {
		return "邮箱格式不正确。";
	}
	if (website) {
		if (website.length > maxWebsiteLength) return "网站链接过长。";
		try {
			const url = new URL(website);
			if (!["http:", "https:"].includes(url.protocol))
				return "网站链接必须是 http 或 https。";
		} catch {
			return "网站链接格式不正确。";
		}
	}
	if (!content) return "请填写评论内容。";
	if (content.length > maxContentLength) return "评论内容过长。";
	if (!turnstileSiteKey) return "Turnstile siteKey 未配置，暂时无法提交评论。";
	if (!turnstileToken) return "请先完成人机验证。";
	return "";
};

const submitComment = async (parentId?: string) => {
	const target = parentId ? replyForm : form;
	const validationError = validateForm(target);
	if (validationError) {
		setError(validationError);
		return;
	}

	submitting = true;
	errorMessage = "";
	try {
		const payload = {
			path,
			parent_id: parentId || null,
			parentId: parentId || null,
			author: target.author.trim(),
			email: target.email.trim(),
			website: target.website.trim(),
			content: target.content.trim(),
			turnstileToken,
		};
		const response = await fetch(commentsEndpoint(), {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json",
			},
			body: JSON.stringify(payload),
		});
		if (!response.ok) {
			const data = await response.json().catch(() => null);
			throw new Error(
				data?.message || data?.error || `HTTP ${response.status}`,
			);
		}
		form = {
			author: form.author,
			email: form.email,
			website: form.website,
			content: "",
		};
		replyForm = {
			author: form.author,
			email: form.email,
			website: form.website,
			content: "",
		};
		replyTo = null;
		resetTurnstile();
		setNotice("评论已提交，审核通过后会显示。");
		await loadComments();
	} catch (error) {
		console.error("Failed to submit D1 comment:", error);
		setError(
			error instanceof Error ? error.message : "评论提交失败，请稍后重试。",
		);
		resetTurnstile();
	} finally {
		submitting = false;
	}
};

const likeComment = async (comment: D1Comment) => {
	if (likingId) return;
	likingId = comment.id;
	try {
		const response = await fetch(likeEndpoint(comment.id), {
			method: "POST",
			headers: { accept: "application/json" },
		});
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const data = await response.json().catch(() => null);
		const nextLikes =
			typeof data?.likes === "number" ? data.likes : (comment.likes || 0) + 1;
		comments = comments.map((item) =>
			item.id === comment.id ? { ...item, likes: nextLikes } : item,
		);
	} catch (error) {
		console.error("Failed to like D1 comment:", error);
		setError("点赞失败，请稍后重试。");
	} finally {
		likingId = "";
	}
};

const loadTurnstile = () =>
	new Promise<void>((resolve, reject) => {
		if (!turnstileSiteKey) {
			resolve();
			return;
		}
		if (window.turnstile) {
			resolve();
			return;
		}
		const existingScript = document.querySelector<HTMLScriptElement>(
			'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]',
		);
		if (existingScript) {
			existingScript.addEventListener("load", () => resolve(), { once: true });
			existingScript.addEventListener("error", () => reject(), { once: true });
			return;
		}
		const script = document.createElement("script");
		script.src =
			"https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
		script.async = true;
		script.defer = true;
		script.addEventListener("load", () => resolve(), { once: true });
		script.addEventListener("error", () => reject(), { once: true });
		document.head.append(script);
	});

onMount(async () => {
	await loadComments();
	try {
		await loadTurnstile();
		if (turnstileSiteKey && turnstileElement && window.turnstile) {
			turnstileWidgetId = window.turnstile.render(turnstileElement, {
				sitekey: turnstileSiteKey,
				callback: (token: string) => {
					turnstileToken = token;
				},
				"expired-callback": () => {
					turnstileToken = "";
				},
				"error-callback": () => {
					turnstileToken = "";
					setError("人机验证加载失败，请刷新后重试。");
				},
			});
		}
	} catch {
		setError("人机验证加载失败，请检查网络后重试。");
	}
});
</script>

{#if loading}
	<div class="py-8 text-center text-(--content-meta)">评论加载中...</div>
{:else}
	<div class="space-y-6">
		{#if errorMessage}
			<div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
				{errorMessage}
			</div>
		{/if}
		{#if noticeMessage}
			<div class="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-200">
				{noticeMessage}
			</div>
		{/if}

		<div class="space-y-4">
			{#each rootComments() as comment (comment.id)}
				<article class="rounded-lg border border-(--line-divider) bg-(--card-bg) p-4">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div>
							<div class="font-semibold text-(--content)">{comment.author}</div>
							<div class="text-xs text-(--content-meta)">{formatDate(comment.created_at || comment.createdAt)}</div>
						</div>
						<div class="flex items-center gap-2">
							<button
								type="button"
								class="rounded-md px-3 py-1 text-sm text-(--content-meta) hover:bg-(--btn-regular-bg) hover:text-(--primary)"
								disabled={likingId === comment.id}
								on:click={() => likeComment(comment)}
							>
								赞 {comment.likes || 0}
							</button>
							<button
								type="button"
								class="rounded-md px-3 py-1 text-sm text-(--content-meta) hover:bg-(--btn-regular-bg) hover:text-(--primary)"
								on:click={() => {
									replyTo = replyTo?.id === comment.id ? null : comment;
									replyForm = { author: form.author, email: form.email, website: form.website, content: "" };
								}}
							>
								回复
							</button>
						</div>
					</div>
					<p class="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-(--content)">{comment.content}</p>

					{#if childComments(comment.id).length}
						<div class="mt-4 space-y-3 border-l-2 border-(--line-divider) pl-4">
							{#each childComments(comment.id) as child (child.id)}
								<div class="rounded-md bg-(--btn-plain-bg-hover) p-3">
									<div class="flex flex-wrap items-center justify-between gap-2">
										<div class="font-medium text-(--content)">{child.author}</div>
										<div class="text-xs text-(--content-meta)">{formatDate(child.created_at || child.createdAt)}</div>
									</div>
									<p class="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-(--content)">{child.content}</p>
									<button
										type="button"
										class="mt-2 rounded-md px-2 py-1 text-xs text-(--content-meta) hover:bg-(--btn-regular-bg) hover:text-(--primary)"
										disabled={likingId === child.id}
										on:click={() => likeComment(child)}
									>
										赞 {child.likes || 0}
									</button>
								</div>
							{/each}
						</div>
					{/if}

					{#if replyTo?.id === comment.id}
						<form class="mt-4 space-y-3" on:submit|preventDefault={() => submitComment(comment.id)}>
							<div class="grid gap-3 md:grid-cols-3">
								<input class="d1-input" bind:value={replyForm.author} maxlength={maxAuthorLength} placeholder="昵称" />
								<input class="d1-input" bind:value={replyForm.email} maxlength={maxEmailLength} placeholder="邮箱" />
								<input class="d1-input" bind:value={replyForm.website} maxlength={maxWebsiteLength} placeholder="网站（可选）" />
							</div>
							<textarea class="d1-input min-h-24" bind:value={replyForm.content} maxlength={maxContentLength} placeholder={`回复 ${comment.author}`}></textarea>
							<div class="flex justify-end gap-2">
								<button type="button" class="d1-secondary-button" on:click={() => (replyTo = null)}>取消</button>
								<button type="submit" class="d1-primary-button" disabled={submitting}>
									{submitting ? "提交中..." : "提交回复"}
								</button>
							</div>
						</form>
					{/if}
				</article>
			{:else}
				<div class="rounded-lg border border-dashed border-(--line-divider) py-8 text-center text-sm text-(--content-meta)">
					暂无评论，来写第一条吧。
				</div>
			{/each}
		</div>

		<form class="space-y-4" on:submit|preventDefault={() => submitComment()}>
			<div class="grid gap-3 md:grid-cols-3">
				<input class="d1-input" bind:value={form.author} maxlength={maxAuthorLength} placeholder="昵称" />
				<input class="d1-input" bind:value={form.email} maxlength={maxEmailLength} placeholder="邮箱" />
				<input class="d1-input" bind:value={form.website} maxlength={maxWebsiteLength} placeholder="网站（可选）" />
			</div>
			<textarea class="d1-input min-h-32" bind:value={form.content} maxlength={maxContentLength} placeholder="写下你的评论"></textarea>
			<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div bind:this={turnstileElement}></div>
				<button type="submit" class="d1-primary-button md:self-end" disabled={submitting}>
					{submitting ? "提交中..." : "提交评论"}
				</button>
			</div>
			<p class="text-xs text-(--content-meta)">评论提交后会进入待审核状态，通过后公开显示。</p>
		</form>
	</div>
{/if}

<style>
.d1-input {
	width: 100%;
	border-radius: 0.5rem;
	border: 1px solid var(--line-divider);
	background: var(--card-bg);
	padding: 0.75rem 0.875rem;
	color: var(--content);
	outline: none;
}

.d1-input:focus {
	border-color: var(--primary);
	box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 18%, transparent);
}

.d1-primary-button,
.d1-secondary-button {
	border-radius: 0.5rem;
	padding: 0.625rem 1rem;
	font-size: 0.875rem;
	font-weight: 600;
	transition: background-color 0.2s ease, color 0.2s ease, opacity 0.2s ease;
}

.d1-primary-button {
	background: var(--primary);
	color: var(--btn-content);
}

.d1-secondary-button {
	background: var(--btn-regular-bg);
	color: var(--content);
}

.d1-primary-button:disabled,
.d1-secondary-button:disabled {
	cursor: not-allowed;
	opacity: 0.65;
}
</style>
