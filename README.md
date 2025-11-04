# pediatric_ECMO
エクモレジストリを作る、HTMLファイルを調整

## Firebase Functions の設定

削除依頼メールは Firebase Functions から SendGrid を利用して送信します。デプロイ前に以下の環境変数を設定してください。

```
firebase functions:config:set \
  sendgrid.key="<YOUR_SENDGRID_API_KEY>" \
  sendgrid.from="no-reply@example.com" \
  sendgrid.to="admin@example.com"
```

- `sendgrid.from` には SendGrid で認証済みの送信元メールアドレスを設定してください。
- `sendgrid.to` はカンマ区切りで複数アドレスを指定できます。
- 設定後は `firebase deploy --only functions` で Cloud Functions をデプロイしてください。
