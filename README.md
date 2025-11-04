# pediatric_ECMO
エクモレジストリを作る、HTMLファイルを調整

## Firebase Functions の設定

削除依頼メールは Firebase Functions から SendGrid を利用して送信します。デプロイ前に以下の環境変数を設定してください。

```
firebase functions:config:set \
  sendgrid.key="<YOUR_SENDGRID_API_KEY>" \
  sendgrid.from="sakai@tron2040.com" \
  sendgrid.to="sakai@tron2040.com"
```

- `sendgrid.from` / `sendgrid.to` を設定しない場合、既定で `sakai@tron2040.com` が利用されます。
- `sendgrid.to` はカンマ区切りで複数アドレスを指定できます。
- 設定後は `firebase deploy --only functions` で Cloud Functions をデプロイしてください。

## 削除依頼ボタンを動かすためのポイント

1. **Cloud Functions をデプロイしてエンドポイント URL を確認する**  
   `firebase deploy --only functions` の完了後、コンソールに表示される `sendDeleteRequest` の URL（例：`https://asia-northeast1-<your-project-id>.cloudfunctions.net/sendDeleteRequest`）を控えてください。

2. **フロントエンドにエンドポイントを設定する**  
   `index.html` の削除依頼ボタン（`id="deleteRequestButton"`）には `data-delete-request-endpoint` 属性で既定の URL を記述しています。Firebase プロジェクトが異なる場合は、この属性を自分のエンドポイントに書き換えるか、`window.DELETE_REQUEST_ENDPOINT = "<your-url>";` を index.html の `<script>` で定義してください。

3. **ローカル確認時は必ず HTTP(S) サーバー経由で開く**  
   `file://` で直接開くとブラウザが Firebase SDK（ES Modules）をブロックし、ボタンが反応しません。`firebase emulators:start --only hosting` や `npx serve` などでローカルサーバーを立ててアクセスするようにしてください。

4. **開発者ツールのコンソール／ネットワークを確認する**  
   送信に失敗した場合はエラーメッセージをアラート表示しています。それでも解決しない場合はブラウザの開発者ツールでコンソールとネットワークログを確認し、HTTP ステータスや CORS エラーの有無をチェックしてください。
