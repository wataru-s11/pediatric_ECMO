const functions = require("firebase-functions");
const sgMail = require("@sendgrid/mail");
const cors = require("cors")({ origin: true });

const config = functions.config();
const SENDGRID_KEY = config.sendgrid && config.sendgrid.key;
const SENDGRID_FROM = config.sendgrid && config.sendgrid.from;
const SENDGRID_TO = config.sendgrid && config.sendgrid.to;

if (SENDGRID_KEY) {
  sgMail.setApiKey(SENDGRID_KEY);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildMessageBody({ facility, recordId, recordDate, note }) {
  const lines = [
    `施設名: ${facility}`,
    `削除依頼ID: ${recordId || "(未入力)"}`,
    `入力日付: ${recordDate || "(未入力)"}`,
    "",
    "--- 自由記載 ---",
    note ? note : "(未入力)"
  ];

  return lines.join("\n");
}

exports.sendDeleteRequest = functions
  .region("asia-northeast1")
  .https.onRequest((req, res) => {
    cors(req, res, async () => {
      if (req.method === "OPTIONS") {
        res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.set("Access-Control-Allow-Headers", "Content-Type");
        res.status(204).send("");
        return;
      }

      if (req.method !== "POST") {
        res.set("Allow", "POST");
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      if (!SENDGRID_KEY) {
        res
          .status(500)
          .json({ error: "SendGrid API key is not configured." });
        return;
      }

      if (!SENDGRID_FROM || !SENDGRID_TO) {
        res.status(500).json({
          error: "SendGrid sender/recipient is not configured."
        });
        return;
      }

      const {
        facility = "",
        recordId = "",
        recordDate = "",
        note = "",
        attachment
      } = req.body || {};

      if (!facility.trim()) {
        res.status(400).json({ error: "施設名は必須です。" });
        return;
      }

      if (!recordId.trim() && !recordDate.trim()) {
        res.status(400).json({
          error: "削除依頼IDまたは入力日付のいずれかを入力してください。"
        });
        return;
      }

      const toAddresses = SENDGRID_TO.split(",")
        .map(address => address.trim())
        .filter(Boolean);

      if (toAddresses.length === 0) {
        res.status(500).json({
          error: "宛先メールアドレスの設定が正しくありません。"
        });
        return;
      }

      const message = {
        to: toAddresses,
        from: SENDGRID_FROM,
        subject: `【削除依頼】${facility}`,
        text: buildMessageBody({ facility, recordId, recordDate, note }),
        html: buildMessageBody({ facility, recordId, recordDate, note })
          .split("\n")
          .map(line =>
            line ? `<p>${escapeHtml(line)}</p>` : "<p>&nbsp;</p>"
          )
          .join("")
      };

      if (attachment && attachment.content) {
        message.attachments = [
          {
            content: attachment.content,
            filename: attachment.filename || "attachment",
            type: attachment.type || "application/octet-stream",
            disposition: "attachment"
          }
        ];
      }

      try {
        await sgMail.send(message);
        res.status(200).json({ success: true });
      } catch (error) {
        console.error("SendGrid error", error);
        const messageText =
          (error.response && error.response.body && error.response.body.errors &&
            error.response.body.errors[0] &&
            error.response.body.errors[0].message) ||
          error.message ||
          "Unknown error";
        res.status(500).json({ error: messageText });
      }
    });
  });
