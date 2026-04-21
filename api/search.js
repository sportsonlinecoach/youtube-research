const BASE = "https://www.googleapis.com/youtube/v3";

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { q, maxResults = "50" } = req.query;
  if (!q) {
    return res.status(400).json({ error: "クエリパラメータ q が必要です" });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "YOUTUBE_API_KEY が設定されていません" });
  }

  try {
    // Step 1: search.list — video IDs と channel IDs を取得
    const searchUrl =
      `${BASE}/search?part=snippet&type=video&maxResults=${maxResults}` +
      `&q=${encodeURIComponent(q)}&key=${apiKey}`;
    const searchData = await fetchJson(searchUrl);

    const items = searchData.items ?? [];
    if (items.length === 0) {
      return res.status(200).json({ results: [] });
    }

    const videoIds = items.map((it) => it.id.videoId).join(",");
    const channelIds = [...new Set(items.map((it) => it.snippet.channelId))].join(",");

    // Step 2: videos.list — 再生回数・投稿日を一括取得
    // Step 3: channels.list — 登録者数を一括取得
    const [videoData, channelData] = await Promise.all([
      fetchJson(
        `${BASE}/videos?part=statistics,snippet&id=${videoIds}&key=${apiKey}`
      ),
      fetchJson(
        `${BASE}/channels?part=statistics&id=${channelIds}&key=${apiKey}`
      ),
    ]);

    // チャンネルID → 登録者数 のマップを作成
    const subscriberMap = {};
    for (const ch of channelData.items ?? []) {
      subscriberMap[ch.id] = parseInt(ch.statistics?.subscriberCount ?? "0", 10);
    }

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const results = [];

    for (const video of videoData.items ?? []) {
      const views = parseInt(video.statistics?.viewCount ?? "0", 10);
      const channelId = video.snippet?.channelId ?? "";
      const subscribers = subscriberMap[channelId] ?? 0;
      const publishedAt = new Date(video.snippet?.publishedAt ?? 0);
      const viralRate = subscribers > 0 ? views / subscribers : 0;

      // フィルタ条件
      if (views < 10000) continue;
      if (viralRate < 1) continue;
      if (publishedAt < oneYearAgo) continue;

      results.push({
        videoId: video.id,
        title: video.snippet?.title ?? "",
        thumbnail:
          video.snippet?.thumbnails?.high?.url ??
          video.snippet?.thumbnails?.default?.url ??
          "",
        channelTitle: video.snippet?.channelTitle ?? "",
        publishedAt: video.snippet?.publishedAt ?? "",
        views,
        subscribers,
        viralRate: Math.round(viralRate * 100) / 100,
      });
    }

    // 拡散率の降順でソート
    results.sort((a, b) => b.viralRate - a.viralRate);

    return res.status(200).json({ results, total: results.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
