const BASE = "https://www.googleapis.com/youtube/v3";
const PAGES = 3; // 最大3ページ（50件×3 = 最大150件）取得してからフィルタ
const MIN_DURATION_SEC = 180; // 3分未満のショートを除外

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// ISO 8601 duration (PT1H2M3S) を秒数に変換
function parseDuration(iso) {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] ?? "0", 10);
  const m = parseInt(match[2] ?? "0", 10);
  const s = parseInt(match[3] ?? "0", 10);
  return h * 3600 + m * 60 + s;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { q } = req.query;
  if (!q) {
    return res.status(400).json({ error: "クエリパラメータ q が必要です" });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "YOUTUBE_API_KEY が設定されていません" });
  }

  try {
    // Step 1: search.list を最大3ページ取得して動画IDを集める
    const allSearchItems = [];
    let pageToken = "";

    for (let page = 0; page < PAGES; page++) {
      const url =
        `${BASE}/search?part=snippet&type=video&maxResults=50` +
        `&q=${encodeURIComponent(q)}&regionCode=JP&relevanceLanguage=ja&key=${apiKey}` +
        (pageToken ? `&pageToken=${pageToken}` : "");
      const data = await fetchJson(url);
      allSearchItems.push(...(data.items ?? []));
      pageToken = data.nextPageToken ?? "";
      if (!pageToken) break;
    }

    if (allSearchItems.length === 0) {
      return res.status(200).json({ results: [] });
    }

    // 重複排除
    const videoIdSet = new Set();
    const uniqueItems = allSearchItems.filter((it) => {
      if (videoIdSet.has(it.id.videoId)) return false;
      videoIdSet.add(it.id.videoId);
      return true;
    });

    const videoIds = uniqueItems.map((it) => it.id.videoId).join(",");
    const channelIds = [...new Set(uniqueItems.map((it) => it.snippet.channelId))].join(",");

    // Step 2: videos.list — 再生回数・投稿日・動画長さを一括取得
    // Step 3: channels.list — 登録者数を一括取得
    // videos は最大50件ずつしか取れないため分割リクエスト
    const videoIdChunks = videoIds.split(",").reduce((acc, id, i) => {
      const chunkIdx = Math.floor(i / 50);
      if (!acc[chunkIdx]) acc[chunkIdx] = [];
      acc[chunkIdx].push(id);
      return acc;
    }, []);

    const channelIdChunks = channelIds.split(",").reduce((acc, id, i) => {
      const chunkIdx = Math.floor(i / 50);
      if (!acc[chunkIdx]) acc[chunkIdx] = [];
      acc[chunkIdx].push(id);
      return acc;
    }, []);

    const [videoResults, channelResults] = await Promise.all([
      Promise.all(
        videoIdChunks.map((chunk) =>
          fetchJson(
            `${BASE}/videos?part=statistics,snippet,contentDetails&id=${chunk.join(",")}&key=${apiKey}`
          )
        )
      ),
      Promise.all(
        channelIdChunks.map((chunk) =>
          fetchJson(
            `${BASE}/channels?part=statistics&id=${chunk.join(",")}&key=${apiKey}`
          )
        )
      ),
    ]);

    const allVideos = videoResults.flatMap((r) => r.items ?? []);

    // チャンネルID → 登録者数 のマップを作成
    const subscriberMap = {};
    for (const ch of channelResults.flatMap((r) => r.items ?? [])) {
      subscriberMap[ch.id] = parseInt(ch.statistics?.subscriberCount ?? "0", 10);
    }

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const results = [];

    for (const video of allVideos) {
      const views = parseInt(video.statistics?.viewCount ?? "0", 10);
      const channelId = video.snippet?.channelId ?? "";
      const subscribers = subscriberMap[channelId] ?? 0;
      const publishedAt = new Date(video.snippet?.publishedAt ?? 0);
      const viralRate = subscribers > 0 ? views / subscribers : 0;
      const durationSec = parseDuration(video.contentDetails?.duration ?? "");

      // フィルタ条件
      if (durationSec < MIN_DURATION_SEC) continue; // 3分未満のショートを除外
      if (views < 10000) continue;
      if (viralRate < 1) continue;

      results.push({
        videoId: video.id,
        title: video.snippet?.title ?? "",
        thumbnail:
          video.snippet?.thumbnails?.high?.url ??
          video.snippet?.thumbnails?.default?.url ??
          "",
        channelId,
        channelTitle: video.snippet?.channelTitle ?? "",
        publishedAt: video.snippet?.publishedAt ?? "",
        views,
        subscribers,
        viralRate: Math.round(viralRate * 100) / 100,
        durationSec,
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
