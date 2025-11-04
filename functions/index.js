const functions = require("firebase-functions");
const sgMail = require("@sendgrid/mail");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const FieldValue = admin.firestore.FieldValue;

const config = functions.config();
const DEFAULT_EMAIL = "sakai@tron2040.com";
const SENDGRID_KEY = config.sendgrid && config.sendgrid.key;
const SENDGRID_FROM =
  (config.sendgrid && config.sendgrid.from) || DEFAULT_EMAIL;
const SENDGRID_TO =
  (config.sendgrid && config.sendgrid.to) || DEFAULT_EMAIL;

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

function sanitizeDeleteRequestPayload(rawPayload) {
  const payload = rawPayload || {};
  const toString = value => (value === undefined || value === null ? "" : String(value));

  const facility = toString(payload.facility).trim();
  const recordId = toString(payload.recordId).trim();
  const recordDate = toString(payload.recordDate).trim();
  const note = toString(payload.note);

  if (!facility) {
    throw new Error("施設名は必須です。");
  }

  if (!recordId && !recordDate) {
    throw new Error("削除依頼IDまたは入力日付のいずれかを入力してください。");
  }

  let attachment = null;
  if (payload.attachment && payload.attachment.content) {
    attachment = {
      content: toString(payload.attachment.content),
      filename: toString(payload.attachment.filename) || "attachment",
      type: toString(payload.attachment.type) || "application/octet-stream",
      disposition: "attachment"
    };
  }

  return {
    facility,
    recordId,
    recordDate,
    note,
    attachment
  };
}

function createSendgridMessage(payload) {
  const sanitized = sanitizeDeleteRequestPayload(payload);

  const toAddresses = SENDGRID_TO.split(",")
    .map(address => address.trim())
    .filter(Boolean);

  if (toAddresses.length === 0) {
    throw new Error("宛先メールアドレスの設定が正しくありません。");
  }

  const message = {
    to: toAddresses,
    from: SENDGRID_FROM,
    subject: `【削除依頼】${sanitized.facility}`,
    text: buildMessageBody(sanitized),
    html: buildMessageBody(sanitized)
      .split("\n")
      .map(line => (line ? `<p>${escapeHtml(line)}</p>` : "<p>&nbsp;</p>"))
      .join("")
  };

  if (sanitized.attachment) {
    message.attachments = [sanitized.attachment];
  }

  return { message, sanitized };
}

async function sendDeleteRequestEmail(payload) {
  const { message, sanitized } = createSendgridMessage(payload);
  await sgMail.send(message);
  return sanitized;
}

function extractSendgridError(error) {
  return (
    (error.response &&
      error.response.body &&
      error.response.body.errors &&
      error.response.body.errors[0] &&
      error.response.body.errors[0].message) ||
    error.message ||
    "Unknown error"
  );
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  const allowOrigin = origin && origin !== "null" ? origin : "*";
  res.set("Access-Control-Allow-Origin", allowOrigin);
  if (allowOrigin !== "*") {
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  const requestedHeaders = req.headers["access-control-request-headers"];
  if (requestedHeaders) {
    res.set("Access-Control-Allow-Headers", requestedHeaders);
  } else {
    res.set("Access-Control-Allow-Headers", "Content-Type");
  }
}

exports.sendDeleteRequest = functions
  .region("asia-northeast1")
  .https.onRequest(async (req, res) => {
    applyCors(req, res);

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.set("Allow", "POST");
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    if (!SENDGRID_KEY) {
      res.status(500).json({ error: "SendGrid API key is not configured." });
      return;
    }

    if (!SENDGRID_FROM || !SENDGRID_TO) {
      res.status(500).json({
        error: "SendGrid sender/recipient is not configured."
      });
      return;
    }

    let sanitizedPayload;
    try {
      sanitizedPayload = sanitizeDeleteRequestPayload(req.body || {});
    } catch (validationError) {
      res.status(400).json({ error: validationError.message });
      return;
    }

    try {
      await sendDeleteRequestEmail(sanitizedPayload);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("SendGrid error", error);
      const messageText = extractSendgridError(error);
      res.status(500).json({ error: messageText });
    }
  });

exports.processDeleteRequest = functions
  .region("asia-northeast1")
  .firestore.document("delete_requests/{requestId}")
  .onCreate(async snapshot => {
    if (!SENDGRID_KEY) {
      await snapshot.ref.update({
        status: "error",
        errorMessage: "SendGrid API key is not configured.",
        lastError: "SendGrid API key is not configured.",
        processedAt: FieldValue.serverTimestamp()
      });
      return;
    }

    if (!SENDGRID_FROM || !SENDGRID_TO) {
      await snapshot.ref.update({
        status: "error",
        errorMessage: "SendGrid sender/recipient is not configured.",
        lastError: "SendGrid sender/recipient is not configured.",
        processedAt: FieldValue.serverTimestamp()
      });
      return;
    }

    let sanitizedPayload;
    try {
      sanitizedPayload = sanitizeDeleteRequestPayload(snapshot.data() || {});
    } catch (validationError) {
      await snapshot.ref.update({
        status: "error",
        errorMessage: validationError.message,
        lastError: validationError.message,
        processedAt: FieldValue.serverTimestamp()
      });
      return;
    }

    try {
      await snapshot.ref.update({
        status: "processing",
        processingStartedAt: FieldValue.serverTimestamp(),
        errorMessage: FieldValue.delete()
      });
      await sendDeleteRequestEmail(sanitizedPayload);
      await snapshot.ref.update({
        status: "sent",
        processedAt: FieldValue.serverTimestamp(),
        lastError: null,
        errorMessage: FieldValue.delete()
      });
    } catch (error) {
      console.error("SendGrid error", error);
      const messageText = extractSendgridError(error);
      await snapshot.ref.update({
        status: "error",
        errorMessage: messageText,
        lastError: messageText,
        processedAt: FieldValue.serverTimestamp()
      });
    }
  });
