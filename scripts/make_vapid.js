// Makes the VAPID key pair that signs push notifications. Run once: node scripts/make_vapid.js
// The private key goes to notify-worker/.vapid.json (never uploaded to GitHub) and then into the
// Worker as a secret. The public key goes into app/index.html and notify-worker/wrangler.toml.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const out = path.join(__dirname, "..", "notify-worker", ".vapid.json");
if (fs.existsSync(out)) { console.log("Keys already exist in notify-worker/.vapid.json; not replacing them."); process.exit(0); }
const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = privateKey.export({ format: "jwk" });
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]).toString("base64url");
fs.writeFileSync(out, JSON.stringify({ publicKey: pub, privateJwk: jwk }, null, 1));
console.log("Public key:", pub);
