<script lang="ts">
	type FriendRequest = {
		id: string;
		name: string;
		url: string;
		avatar?: string;
		description?: string;
		status: string;
		created_at: number;
	};

	let friends: FriendRequest[] = [];
	let status = "pending";
	let message = "";

	const headers = () => {
		const token = localStorage.getItem("firefly:admin-token");
		return { "content-type": "application/json", ...(token ? { "x-admin-token": token } : {}) };
	};

	async function load() {
		const response = await fetch(`/api/admin/friends?status=${encodeURIComponent(status)}`, { headers: headers() });
		const data = await response.json();
		friends = data.friends || [];
		message = response.ok ? "" : data.message || "加载失败";
	}

	async function update(id: string, nextStatus: string) {
		await fetch(`/api/admin/friends/${encodeURIComponent(id)}`, {
			method: "PATCH",
			headers: headers(),
			body: JSON.stringify({ status: nextStatus }),
		});
		await load();
	}

	$effect(() => {
		load();
	});
</script>

<section class="card-base p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h2 class="text-2xl font-bold">友链申请</h2>
		<select class="admin-input w-auto" bind:value={status} onchange={load}>
			<option value="pending">待审核</option>
			<option value="approved">已通过</option>
			<option value="rejected">已拒绝</option>
			<option value="all">全部</option>
		</select>
	</div>
	{#if message}<p class="mt-4 text-sm text-red-500">{message}</p>{/if}
	<div class="mt-5 space-y-3">
		{#each friends as friend}
			<article class="rounded-lg border border-(--line-divider) p-4">
				<div class="flex flex-wrap justify-between gap-3">
					<div>
						<a class="font-bold hover:text-(--primary)" href={friend.url} target="_blank" rel="noreferrer">{friend.name}</a>
						<div class="mt-1 text-xs text-(--content-meta)">{friend.url} · {friend.status}</div>
					</div>
					<div class="flex gap-2">
						<button class="btn-card rounded-md px-3 py-1" type="button" onclick={() => update(friend.id, "approved")}>通过</button>
						<button class="btn-card rounded-md px-3 py-1" type="button" onclick={() => update(friend.id, "rejected")}>拒绝</button>
					</div>
				</div>
				{#if friend.description}<p class="mt-3 text-sm">{friend.description}</p>{/if}
			</article>
		{:else}
			<div class="text-sm text-(--content-meta)">暂无数据</div>
		{/each}
	</div>
</section>
