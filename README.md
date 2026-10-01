# ちはや｜競技かるた対戦

スマホ対応の競技かるたMVPです。

## 現在の機能
- 100枚をシャッフルし、50枚を使用して25枚ずつ配布
- ブラウザの crypto.getRandomValues() による Fisher–Yates シャッフル
- 3×9盤面へのランダム配置
- 1人練習 / 2人ローカル対戦
- 読札のブラウザ音声合成
- 取得・お手つき・送札ログ
- 札分け結果の一覧
- PWA用manifest / service worker
- mainへのpush時にGitHub PagesへデプロイするActions workflow

## 公平性
現在の札分けはクライアント側の乱数です。オンライン大会用途では、サーバー側で札分けと試合状態を管理し、結果・時刻・ディール情報を監査可能に保存する構成へ移行します。

## GitHub Pages
`.github/workflows/pages.yml` でGitHub Actionsから公開します。初回のみ、リポジトリの Settings > Pages で公開元を GitHub Actions にする操作が必要になる場合があります。

オンライン対戦用のNode/Django等のバックエンドはGitHub Pagesでは動かないため、後続フェーズで別ホスティングします。
