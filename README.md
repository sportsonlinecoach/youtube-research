# YouTube 拡散率検索アプリ

再生回数 ÷ チャンネル登録者数「拡散率」の高い動画を発見するツール。

## フィルタ条件

- 再生回数 **1万回以上**
- 拡散率 **1.0 以上**（再生回数 ÷ 登録者数）
- 投稿日 **1年以内**

結果は拡散率の高い順に表示されます。

---

## セットアップ

### 1. YouTube Data API v3 キーの取得

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. プロジェクトを作成（または既存を選択）
3. **APIとサービス → ライブラリ** を開き「YouTube Data API v3」を有効化
4. **APIとサービス → 認証情報 → 認証情報を作成 → APIキー** でキーを発行
5. 必要に応じてキーに「HTTP リファラー」制限を設定（本番環境推奨）

### 2. ローカル開発

```bash
# 依存パッケージをインストール
npm install

# 環境変数ファイルを作成
cp .env.local.example .env.local
# .env.local を編集して YOUTUBE_API_KEY に実際のキーを貼り付け

# 開発サーバー起動（Vercel CLI を使用）
npm run dev
# → http://localhost:3000 で確認
```

### 3. Vercel へのデプロイ

```bash
# Vercel CLI でデプロイ（初回はアカウント連携が必要）
npm run deploy
```

または GitHub リポジトリを Vercel に連携することで自動デプロイも可能です。

**Vercel ダッシュボードでの環境変数設定（必須）:**

1. プロジェクト → **Settings → Environment Variables**
2. `YOUTUBE_API_KEY` に取得したキーを設定
3. 再デプロイ（または自動で反映）

---

## API クォータについて

YouTube Data API v3 の無料枠は **1日 10,000 ユニット**。

| 処理 | 消費ユニット |
|------|-------------|
| `search.list` (1回の検索) | 100 |
| `videos.list` (最大50件) | 最大50 |
| `channels.list` (ユニーク分) | 最大20 |
| **1検索あたり合計** | **約170** |
| **1日の検索可能回数** | **約58回** |

チームで多用する場合は [Google Cloud Console](https://console.cloud.google.com/) からクォータ増量をリクエストできます。

---

## ファイル構成

```
youtube-search/
├── api/
│   └── search.js        # Vercel サーバーレス関数（YouTube API プロキシ）
├── public/
│   └── index.html       # フロントエンド
├── .env.local.example   # 環境変数のサンプル
├── vercel.json          # Vercel ルーティング設定
└── package.json
```
