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
