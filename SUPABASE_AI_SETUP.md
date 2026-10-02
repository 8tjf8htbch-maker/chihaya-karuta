# 國大練習：実AI分析の設定

## 仕組み

ブラウザ（GitHub Pages）からGemini APIを直接呼び出しません。Gemini APIキーはSupabase Edge FunctionのSecretsに保存し、Edge FunctionからGemini APIを呼び出します。

## Supabase側

Supabase Dashboardの **Edge Functions > Secrets** で次を設定します。

- `GEMINI_API_KEY`：Google AI Studio / Gemini APIのAPIキー
- `GEMINI_MODEL`：任意。未設定なら `gemini-3.8-flash` を使用

APIキーをGitHubや`supabase-config.js`に書かないでください。

## Edge Functionのデプロイ

リポジトリには以下を追加済みです。

- `supabase/functions/ai-analysis/index.ts`
- `supabase/config.toml`

Supabase CLIを使う場合は、Supabaseプロジェクトにログインした状態で、リポジトリのルートから以下を実行します。

```bash
npx supabase functions deploy ai-analysis --project-ref <PROJECT_REF>
```

SecretsはDashboardまたはCLIから設定できます。

```bash
npx supabase secrets set GEMINI_API_KEY=... --project-ref <PROJECT_REF>
```

## アプリ側

戦績 > AI分析 の **「AIに詳しく分析してもらう」** ボタンから、記録データをEdge Functionへ送り、Geminiによる分析結果を表示します。

## エラーが出る場合

画面に `[401]`、`[403]`、`[429]` などの番号が表示されるようになっています。

- `401 / 403`：APIキーまたはGemini APIへのアクセス設定を確認
- `429`：利用上限・レート制限を確認
- `400`：モデル名やリクエスト内容を確認
- `503` で `GEMINI_API_KEY is not configured`：Supabase Edge Function Secretsにキーを登録

GitHubの更新だけではSupabase Edge Functionは自動更新されません。Edge Functionのコードを変更した場合は、必ず再デプロイしてください。

## 注意

Gemini APIキーはブラウザに置かない構成です。GitHub Pagesには公開用のSupabase設定だけを置き、Gemini APIキーはSupabase側だけに保存します。
