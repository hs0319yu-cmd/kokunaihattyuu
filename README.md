# 国内発注アプリ（GitHub Pages版）

## 構成
- `index.html`：商品検索・注文書作成・印刷/PDF・注文履歴画面
- `config.js`：Google Apps ScriptのウェブアプリURL設定
- `Code.gs`：Googleスプレッドシートを共有データベースとして扱うAPI

## 公開手順
1. GitHubで新しい **Public** リポジトリを作成（例：`domestic-order-app`）。
2. このフォルダ内の `index.html`、`config.js`、`Code.gs`、`README.md` をリポジトリ直下へアップロード。
3. `config.js` の `GAS_API_URL` を、現在デプロイ済みのGoogle Apps ScriptウェブアプリURL（`https://script.google.com/macros/s/.../exec`）に置き換えて保存。
4. Google Apps Scriptの `Code.gs` を、このフォルダの `Code.gs` に置き換えて保存。
5. Apps Scriptで **デプロイ → デプロイを管理 → 編集 → 新バージョン → デプロイ**。URLが変わった場合は `config.js` も更新。
6. GitHubリポジトリの **Settings → Pages** を開き、Deploy from a branch、`main`、`/(root)` を選んで保存。
7. Pagesの公開URLを5〜8人に共有。

## 共有のしくみと注意
- GitHub Pagesは画面を配信し、注文履歴・入荷状況・仕入先はGoogleスプレッドシートへ保存します。
- 既存のApps Scriptを「次のユーザーとして実行：自分」「アクセスできるユーザー：全員」で公開してください。利用者ごとのGoogleログインは不要ですが、URLを知る人はデータの閲覧・変更が可能です。
- この簡易APIはJSONP（GET）で通信します。URLを知る人なら操作できるため、URLは社内だけで共有してください。機密情報・個人情報・単価などを保存しない運用にしてください。
- GitHubリポジトリはPublicにする必要があります。商品データや画面コードは公開されます。共有用GAS URLも `config.js` に含まれるため、公開情報として扱ってください。
- 注文者名・下書き・社判画像は従来どおり各端末のブラウザーに保存されます。共有されるのは注文履歴、入荷状況、仕入先です。
- 注文データは自動で約30秒ごとに再読込します。同時更新の競合を完全保証する仕組みではありません。削除前には確認ダイアログが出ます。

## 初回確認
別の端末またはシークレットウィンドウでPages URLを開き、仕入先一覧が表示されるか確認してください。テスト注文を登録し、別端末でも履歴が見えること、入荷状況の変更が反映されることを確認してください。
