<script lang="ts">
import { marked } from "marked";

type Draft = {
	id?: string;
	slug: string;
	title: string;
	frontmatter: string;
	content: string;
	status?: string;
	updated_at?: number;
};

type PublishResult = {
	verified: boolean;
	sha: string;
	commit: string;
	path: string;
	url: string;
	branch: string;
};

let drafts: Draft[] = [];
let current: Draft = {
	slug: "",
	title: "",
	frontmatter: JSON.stringify(
		{
			published: new Date().toISOString().slice(0, 10),
			category: "",
			tags: [],
		},
		null,
		2,
	),
	content: "",
};
let loading = true;
let message = "";
let messageType: "info" | "error" | "success" = "info";
let previewHtml = "";
let showPreview = false;
let publishResult: PublishResult | null = null;

$effect(() => {
	// live preview: auto-render when content changes in preview mode
	if (showPreview && current.content.trim()) {
		renderPreview();
	}
});

const headers = () => {
	const token = localStorage.getItem("firefly:admin-token");
	return {
		"content-type": "application/json",
		...(token ? { "x-admin-token": token } : {}),
	};
};

function setMessage(text: string, type: "info" | "error" | "success" = "info") {
	message = text;
	messageType = type;
}

async function loadDrafts() {
	loading = true;
	try {
		const response = await fetch("/api/admin/drafts", { headers: headers() });
		const data = await response.json();
		drafts = data.drafts || [];
	} finally {
		loading = false;
	}
}

async function openDraft(id: string | undefined) {
	if (!id) return;
	const response = await fetch(`/api/admin/drafts/${encodeURIComponent(id)}`, {
		headers: headers(),
	});
	const data = await response.json();
	current = data.draft || current;
	publishResult = null;
	message = "";
	renderPreview();
}

async function saveDraft() {
	setMessage("保存中...");
	const response = await fetch(
		current.id
			? `/api/admin/drafts/${encodeURIComponent(current.id)}`
			: "/api/admin/drafts",
		{
			method: current.id ? "PATCH" : "POST",
			headers: headers(),
			body: JSON.stringify(current),
		},
	);
	const data = await response.json();
	if (!response.ok) {
		setMessage(data.message || "保存失败", "error");
		return;
	}
	current = data.draft;
	setMessage("已保存", "success");
	await loadDrafts();
}

function validateBeforePublish(): string | null {
	if (!current.slug.trim()) return "Slug 不能为空";
	if (!current.title.trim()) return "标题不能为空";
	try {
		const fm = JSON.parse(current.frontmatter);
		if (typeof fm !== "object" || fm === null)
			return "Frontmatter 必须是有效的 JSON 对象";
	} catch {
		return "Frontmatter JSON 格式错误，请检查";
	}
	return null;
}

async function publishDraft() {
	if (!current.id) {
		setMessage("请先保存草稿。", "error");
		return;
	}
	const validationError = validateBeforePublish();
	if (validationError) {
		setMessage(validationError, "error");
		return;
	}
	publishResult = null;
	setMessage("正在发布到 GitHub...");
	const response = await fetch(
		`/api/admin/drafts/${encodeURIComponent(current.id)}/publish`,
		{
			method: "POST",
			headers: headers(),
		},
	);
	const data = await response.json();
	if (!response.ok) {
		setMessage(data.message || "发布失败", "error");
		return;
	}
	setMessage("发布成功！", "success");
	publishResult = {
		verified: data.verified || false,
		sha: data.sha || "",
		commit: data.commit || "",
		path: data.path || "",
		url: data.url || "",
		branch: data.branch || "main",
	};
	await loadDrafts();
}

function newDraft() {
	current = {
		slug: "",
		title: "",
		frontmatter: JSON.stringify(
			{
				published: new Date().toISOString().slice(0, 10),
				category: "",
				tags: [],
			},
			null,
			2,
		),
		content: "",
	};
	previewHtml = "";
	showPreview = false;
	publishResult = null;
	message = "";
}

async function renderPreview() {
	if (!current.content.trim()) {
		previewHtml =
			"<p style='color:var(--content-meta,#888);text-align:center;padding:2rem;'>暂无内容</p>";
		return;
	}
	try {
		previewHtml = await marked.parse(current.content);
	} catch {
		previewHtml = "<p style='color:red'>渲染失败</p>";
	}
}

function togglePreview() {
	showPreview = !showPreview;
	if (showPreview) renderPreview();
}

$effect(() => {
	loadDrafts();
});
</script>

<section class="grid gap-4 lg:grid-cols-[18rem_1fr]">
	<aside class="card-base p-4">
		<div class="flex items-center justify-between gap-2">
			<h2 class="font-bold">草稿箱</h2>
			<button class="btn-card rounded-md px-3 py-1 text-sm" type="button" onclick={newDraft}>新建</button>
		</div>
		<div class="mt-4 space-y-2 text-sm">
			{#if loading}
				<div class="text-(--content-meta)">加载中...</div>
			{:else if drafts.length === 0}
				<div class="text-(--content-meta)">暂无草稿</div>
			{:else}
				{#each drafts as draft}
					<button type="button" class="block w-full rounded-lg p-3 text-left hover:bg-(--btn-regular-bg)" onclick={() => openDraft(draft.id)}>
						<div class="font-medium">{draft.title}</div>
						<div class="mt-1 text-xs text-(--content-meta)">{draft.slug}
							<span class="inline-block mx-1">·</span>
							<span class={draft.status === "published" ? "text-green-500 dark:text-green-400" : ""}>
								{draft.status === "published" ? "已发布" : "草稿"}
							</span>
						</div>
					</button>
				{/each}
			{/if}
		</div>
	</aside>

	<form class="card-base space-y-4 p-4" onsubmit={(event) => { event.preventDefault(); saveDraft(); }}>
		<div class="grid gap-3 md:grid-cols-2">
			<label class="space-y-1 text-sm">
				<span>Slug</span>
				<input class="admin-input" bind:value={current.slug} placeholder="my-post" />
			</label>
			<label class="space-y-1 text-sm">
				<span>标题</span>
				<input class="admin-input" bind:value={current.title} placeholder="文章标题" />
			</label>
		</div>
		<label class="space-y-1 text-sm">
			<span>Frontmatter JSON</span>
			<textarea class="admin-input min-h-32 font-mono" bind:value={current.frontmatter}></textarea>
		</label>
		<div class="space-y-1 text-sm">
			<div class="flex items-center gap-4 mb-1">
				<span class="font-medium">Markdown 内容</span>
				<button type="button" class="text-xs text-(--primary) cursor-pointer" onclick={togglePreview}>
					{showPreview ? "编辑" : "Markdown 预览"}
				</button>
			</div>
			{#if showPreview}
				<div class="admin-input min-h-[28rem] overflow-auto prose prose-sm dark:prose-invert max-w-none">
					{@html previewHtml}
				</div>
			{:else}
				<textarea class="admin-input min-h-[28rem] font-mono" bind:value={current.content} placeholder="在此输入 Markdown 内容..."></textarea>
			{/if}
		</div>

		<!-- 发布验证结果 -->
		{#if publishResult}
			<div class="rounded-lg border p-4 {publishResult.verified ? 'border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-950/20' : 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20'}">
				<div class="flex items-center gap-2 text-sm font-medium">
					{#if publishResult.verified}
						<svg class="h-4 w-4 text-green-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>
						<span class="text-green-700 dark:text-green-300">验证通过：文件已成功发布到 GitHub</span>
					{:else}
						<svg class="h-4 w-4 text-amber-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
						<span class="text-amber-700 dark:text-amber-300">警告：发布后无法验证文件状态</span>
					{/if}
				</div>
				<div class="mt-2 text-xs space-y-1 text-neutral-600 dark:text-neutral-400">
					<div class="flex flex-wrap gap-x-4 gap-y-1">
						<span>分支：<code class="font-mono bg-black/10 dark:bg-white/10 px-1 rounded">{publishResult.branch}</code></span>
						<span>路径：<code class="font-mono bg-black/10 dark:bg-white/10 px-1 rounded">{publishResult.path}</code></span>
						{#if publishResult.sha}
							<span>SHA：<code class="font-mono bg-black/10 dark:bg-white/10 px-1 rounded">{publishResult.sha}</code></span>
						{/if}
						{#if publishResult.commit}
							<span>提交：<code class="font-mono bg-black/10 dark:bg-white/10 px-1 rounded">{publishResult.commit}</code></span>
						{/if}
					</div>
					{#if publishResult.url}
						<a href={publishResult.url} target="_blank" rel="noopener noreferrer" class="link-lg inline-flex items-center gap-1 mt-1">
							在 GitHub 上查看
							<svg class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" /><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" /></svg>
						</a>
					{/if}
				</div>
			</div>
		{/if}

		<div class="flex flex-wrap items-center gap-3">
			<button class="btn-card rounded-lg px-4 py-2 font-medium" type="submit">保存草稿</button>
			<button class="btn-card rounded-lg px-4 py-2 font-medium" type="button" onclick={publishDraft}>发布到 GitHub</button>
			<span class="text-sm {messageType === 'error' ? 'text-red-500' : messageType === 'success' ? 'text-green-500' : 'text-(--content-meta)'}">{message}</span>
		</div>
	</form>
</section>