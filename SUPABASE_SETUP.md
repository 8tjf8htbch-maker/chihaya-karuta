# 國大練習：共有データ設定

現在のGitHub Pages版は、端末ごとの保存ではなくSupabaseを共有データベースとして使う構成に移行します。

## 1. Supabaseプロジェクトを作成
Supabaseで新しいプロジェクトを1つ作成します。

## 2. データベースを作成
SupabaseのSQL Editorで、リポジトリの `supabase/schema.sql` をそのまま実行します。

このSQLは、全員が参照できる共有状態を1行で管理し、書き込みはPostgres関数経由だけにします。書き込み時には「現在のrevision」と比較し、同時更新があった場合は競合を検出します。

## 3. URLとPublishable keyを設定
SupabaseのProject URLとPublishable keyを、`supabase-config.js` の空欄に入れます。

`sb_secret_...` や旧 `service_role` は絶対に入れないでください。ブラウザ側にはPublishable keyだけを置きます。

## 4. GitHub Pagesで公開
`supabase-config.js` の設定後にmainへpushすれば、GitHub Pagesへ反映されます。

## 5. データ移行
初回接続時、サーバー側が空（revision 0）で、この端末に旧版の`kokudai-practice-v1`が残っている場合は、旧データを共有データへ移行できます。以後の通常保存はSupabaseのみで行います。

## 競合対策
- Supabase/Postgres側で1行をロックして書き込みを直列化。
- revisionを比較して、古い状態の上書きを拒否。
- クライアント側で「自分の変更」「他人の変更」を3-way mergeして再送。
- 別端末の更新はRealtimeで受け取り、画面へ反映。
