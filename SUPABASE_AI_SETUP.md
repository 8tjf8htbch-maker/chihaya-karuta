# 國大練習：実AI分析の設定

## 仕組み

ブラウザ（GitHub Pages）からOpenAI APIを直接呼び出しません。OpenAI APIキーはSupabase Edge FunctionのSecretsに保存し、Edge FunctionからResponses APIを呼び出します。

## Supabase側

Supabase Dashboardの **Edge Functions > Secrets** で次を設定します。

- `OPENAI_API_KEY`：OpenAI APIキー
- `OPENAI_MODEL`：任意。未設定なら `gpt-6-luna` を使用

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
npx supabase secrets set OPENAI_API_KEY=... --project-ref <PROJECT_REF>
```

## アプリ側

戦績 > AI分析 に **「AIに詳しく分析してもらう」** ボタンが追加され、記録データをEdge Functionへ送り、OpenAI Responses APIの分析結果を表示します。

従来のローカル自動分析も残してあります。AIが利用できない場合でも、既存の統計分析は利用できます。

## 注意

現在のEdge FunctionはGitHub Pagesからの呼び出しを想定しています。OpenAI APIキーをブラウザに置かない構成です。
