<script lang="ts">
type DashboardRow = {
	path?: string;
	title?: string;
	views?: number;
	likes?: number;
	updatedAt?: string;
	lastViewedAt?: string;
};

type DashboardData = {
	totalViews?: number;
	totalLikes?: number;
	totalPosts?: number;
	todayViews?: number;
	topPosts?: DashboardRow[];
	recentPosts?: DashboardRow[];
	rows?: DashboardRow[];
};

let loading = $state(true);
let error = $state("");
let dashboard = $state<DashboardData>({});

const numberFormat = new Intl.NumberFormat();

function adminHeaders() {
	const token = localStorage.getItem("firefly:admin-token");
	return token
		? { Accept: "application/json", "x-admin-token": token }
		: { Accept: "application/json" };
}

function asNumber(value: unknown) {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeRows(data: DashboardData) {
	return data.topPosts || data.recentPosts || data.rows || [];
}

async function loadDashboard() {
	loading = true;
	error = "";

	try {
		const response = await fetch("/api/admin/dashboard", {
			headers: adminHeaders(),
			credentials: "same-origin",
		});

		if (!response.ok) {
			throw new Error(`请求失败：${response.status}`);
		}

		const data = await response.json();
		dashboard = data?.data || data || {};
	} catch (err) {
		error = err instanceof Error ? err.message : "无法加载统计数据";
	} finally {
		loading = false;
	}
}

$effect(() => {
	loadDashboard();
});
</script>

<section class="card-base p-6">
	<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
		<div>
			<h2 class="text-2xl font-bold text-neutral-900 dark:text-neutral-100">访问统计</h2>
			<p class="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
				D1 访问量与点赞数据概览
			</p>
		</div>
		<button
			type="button"
			class="btn-card h-10 px-4 rounded-lg text-sm font-medium"
			onclick={loadDashboard}
			disabled={loading}
		>
			{loading ? "刷新中" : "刷新"}
		</button>
	</div>

	{#if error}
		<div class="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
			{error}
		</div>
	{/if}

	<div class="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
		<div class="rounded-lg bg-black/5 p-4 dark:bg-white/10">
			<div class="text-sm text-neutral-500 dark:text-neutral-400">总浏览</div>
			<div class="mt-2 text-2xl font-bold">{numberFormat.format(asNumber(dashboard.totalViews))}</div>
		</div>
		<div class="rounded-lg bg-black/5 p-4 dark:bg-white/10">
			<div class="text-sm text-neutral-500 dark:text-neutral-400">总点赞</div>
			<div class="mt-2 text-2xl font-bold">{numberFormat.format(asNumber(dashboard.totalLikes))}</div>
		</div>
		<div class="rounded-lg bg-black/5 p-4 dark:bg-white/10">
			<div class="text-sm text-neutral-500 dark:text-neutral-400">收录页面</div>
			<div class="mt-2 text-2xl font-bold">{numberFormat.format(asNumber(dashboard.totalPosts))}</div>
		</div>
		<div class="rounded-lg bg-black/5 p-4 dark:bg-white/10">
			<div class="text-sm text-neutral-500 dark:text-neutral-400">今日浏览</div>
			<div class="mt-2 text-2xl font-bold">{numberFormat.format(asNumber(dashboard.todayViews))}</div>
		</div>
	</div>

	<div class="mt-6 overflow-x-auto">
		<table class="w-full min-w-[42rem] text-left text-sm">
			<thead class="border-b border-(--line-divider) text-neutral-500 dark:text-neutral-400">
				<tr>
					<th class="py-3 pr-4 font-medium">页面</th>
					<th class="py-3 pr-4 font-medium">浏览</th>
					<th class="py-3 pr-4 font-medium">点赞</th>
					<th class="py-3 font-medium">更新时间</th>
				</tr>
			</thead>
			<tbody>
				{#if loading}
					<tr>
						<td class="py-5 text-neutral-500 dark:text-neutral-400" colspan="4">加载中...</td>
					</tr>
				{:else if normalizeRows(dashboard).length === 0}
					<tr>
						<td class="py-5 text-neutral-500 dark:text-neutral-400" colspan="4">暂无数据</td>
					</tr>
				{:else}
					{#each normalizeRows(dashboard) as row}
						<tr class="border-b border-(--line-divider)">
							<td class="py-3 pr-4">
								<a class="link-lg font-medium" href={row.path || "#"}>{row.title || row.path || "未命名页面"}</a>
								{#if row.title && row.path}
									<div class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{row.path}</div>
								{/if}
							</td>
							<td class="py-3 pr-4">{numberFormat.format(asNumber(row.views))}</td>
							<td class="py-3 pr-4">{numberFormat.format(asNumber(row.likes))}</td>
							<td class="py-3 text-neutral-500 dark:text-neutral-400">
								{row.updatedAt || row.lastViewedAt || "-"}
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</section>
