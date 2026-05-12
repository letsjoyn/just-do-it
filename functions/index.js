/**
 * POST JSON { "imageBase64": "<png as base64>" }
 * Header: Authorization: Bearer <Firebase ID token>
 * Sends mail to the email on that token only.
 *
 * Secrets (set via Firebase CLI, never in the desktop app):
 *   GMAIL_USER           — Gmail address used to send
 *   GMAIL_APP_PASSWORD   — App Password for that Gmail
 */
const {setGlobalOptions} = require("firebase-functions/v2");
const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();
setGlobalOptions({region: "us-central1"});

const gmailUser = defineSecret("GMAIL_USER");
const gmailAppPassword = defineSecret("GMAIL_APP_PASSWORD");

exports.sendQrUnlockEmail = onRequest(
  {
    cors: true,
    secrets: [gmailUser, gmailAppPassword],
    invoker: "public",
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (req, res) => {
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({error: "POST only"});
      return;
    }

    const authHeader = req.headers.authorization || "";
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!m) {
      res.status(401).json({error: "Missing Authorization: Bearer <idToken>"});
      return;
    }

    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(m[1]);
    } catch (e) {
      res.status(401).json({error: "Invalid or expired token"});
      return;
    }

    const toEmail = decoded.email;
    if (!toEmail) {
      res.status(400).json({error: "Account has no email"});
      return;
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const imageBase64 = body.imageBase64;
    if (!imageBase64 || typeof imageBase64 !== "string") {
      res.status(400).json({error: "Missing imageBase64"});
      return;
    }

    let png;
    try {
      png = Buffer.from(imageBase64, "base64");
    } catch (e) {
      res.status(400).json({error: "Invalid base64"});
      return;
    }
    if (png.length < 32 || png.length > 2 * 1024 * 1024) {
      res.status(413).json({error: "Bad image size"});
      return;
    }

    const fromAddr = gmailUser.value().trim();
    const pass = (gmailAppPassword.value() || "").trim();
    if (!fromAddr || !pass) {
      res.status(500).json({error: "Server mail not configured (GMAIL_USER / secret)"});
      return;
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {user: fromAddr, pass},
    });

    try {
      await transporter.sendMail({
        from: `"Just Do It" <${fromAddr}>`,
        to: toEmail,
        subject: "Unlock authorization QR — Just Do It",
        text: "Attach this QR image when you use webcam unlock to end a focus session early.",
        html: `<p>Use the attached <strong>unlock_qr.png</strong> with the app’s <strong>QR / webcam</strong> early-exit flow.</p>`,
        attachments: [
          {filename: "unlock_qr.png", content: png, contentType: "image/png"},
        ],
      });
      res.status(200).json({ok: true, to: toEmail});
    } catch (e) {
      console.error(e);
      res.status(502).json({
        error: "Mail send failed",
        detail: e && e.message ? e.message : String(e),
      });
    }
  }
);
