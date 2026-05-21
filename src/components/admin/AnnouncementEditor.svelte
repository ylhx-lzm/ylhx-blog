<script lang="ts">
type Announcement = {
	id?: string;
	title: string;
	content: string;
	enabled: number | boolean;
};

let announcements: Announcement[] = [];
let current: Announcement = { title: "", content: "", enabled: true };
let message = "";

const headers = () => {
	const token = localStorage.getItem("firefly:admin-token");
	return {
		"content-type": "application/json",
		...(token ? { "x-admin-token": token } : {}),
	};
};

async function load() {
	const response = await fetch("/api/admin/announcements", {
		headers: headers(),
	});
	const data = await response.json();
	announcements = data.announcements || [];
}

async function save() {
	const response = await fetch(
		current.id
			? `/api/admin/announcements/${encodeURIComponent(current.id)}`
			: "/api/admin/announcements",
		{
			method: current.id ? "PATCH" : "POST",
			headers: headers(),
			body: JSON.stringify(current),
		},
	);
	const data = await response.json();
	message = response.ok ? "已保存" : data.message || "保存失败";
	await load();
}

async function remove(id: string | undefined) {
	if (!id) return;
	await fetch(`/api/admin/announcements/${encodeURIComponent(id)}`, {
		method: "DELETE",
		headers: headers(),
	});
	current = { title: "", content: "", enabled: true };
	await load();
}

$effect(() => {
	load();
});
</script>

<section class="grid gap-4 lg:grid-cols-[20rem_1fr]">
	<aside class="card-base p-4">
		<div class="flex items-center justify-between gap-2">
			<h2 class="font-bold">公告</h2>
			<button class="btn-card rounded-md px-3 py-1 text-sm" type="button" onclick={() => (current = { title: "", content: "", enabled: true })}>新建</button>
		</div>
		<div class="mt-4 space-y-2">
			{#each announcements as item}
				<button class="block w-full rounded-lg p-3 text-left hover:bg-(--btn-regular-bg)" type="button" onclick={() => (current = { ...item })}>
					<div class="font-medium">{item.title}</div>
					<div class="mt-1 text-xs text-(--content-meta)">{item.enabled ? "启用" : "停用"}</div>
				</button>
			{:else}
				<div class="text-sm text-(--content-meta)">暂无公告</div>
			{/each}
		</div>
	</aside>

	<form class="card-base space-y-4 p-4" onsubmit={(event) => { event.preventDefault(); save(); }}>
		<label class="space-y-1 text-sm">
			<span>标题</span>
			<input class="admin-input" bind:value={current.title} />
		</label>
		<label class="space-y-1 text-sm">
			<span>内容</span>
			<textarea class="admin-input min-h-40" bind:value={current.content}></textarea>
		</label>
		<label class="flex items-center gap-2 text-sm">
			<input type="checkbox" bind:checked={current.enabled} />
			<span>启用</span>
		</label>
		<div class="flex flex-wrap items-center gap-3">
			<button class="btn-card rounded-lg px-4 py-2 font-medium" type="submit">保存</button>
			{#if current.id}
				<button class="btn-card rounded-lg px-4 py-2 font-medium" type="button" onclick={() => remove(current.id)}>删除</button>
			{/if}
			<span class="text-sm text-(--content-meta)">{message}</span>
		</div>
	</form>
</section>
