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
let previewHtml = "";
let showPreview = false;

const headers = () => {
	const token = localStorage.getItem("firefly:admin-token");
	return {
		"content-type": "application/json",
		...(token ? { "x-admin-token": token } : {}),
	};
};

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
	renderPreview();
}

async function saveDraft() {
	message = "保存中...";
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
		message = data.message || "保存失败";
		return;
	}
	current = data.draft;
	message = "已保存";
	await loadDrafts();
}

async function publishDraft() {
	if (!current.id) {
		message = "请先保存草稿。";
		return;
	}
	message = "发布中...";
	const response = await fetch(
		`/api/admin/drafts/${encodeURIComponent(current.id)}/publish`,
		{
			method: "POST",
			headers: headers(),
		},
	);
	const data = await response.json();
	message = response.ok ? `已发布：${data.path}` : data.message || "发布失败";
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
	message = "";
}

async function renderPreview() {
	if (!current.content.trim()) {
		previewHtml = "<p style='color:var(--content-meta,#888);text-align:center;padding:2rem;'>暂无内容</p>";
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
			<h2 class="font-bold">草稿</h2>
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
						<div class="mt-1 text-xs text-(--content-meta)">{draft.slug} · {draft.status || "draft"}</div>
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
				<span class="font-medium">Markdown</span>
				<button type="button" class="text-xs text-(--primary) cursor-pointer" onclick={togglePreview}>
					{showPreview ? "编辑" : "预览"}
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
		<div class="flex flex-wrap items-center gap-3">
			<button class="btn-card rounded-lg px-4 py-2 font-medium" type="submit">保存草稿</button>
			<button class="btn-card rounded-lg px-4 py-2 font-medium" type="button" onclick={publishDraft}>发布到 GitHub</button>
			<span class="text-sm text-(--content-meta)">{message}</span>
		</div>
	</form>
</section>