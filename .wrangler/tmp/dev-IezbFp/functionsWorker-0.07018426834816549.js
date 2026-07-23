var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-8gu0YB/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// .wrangler/tmp/pages-nadU62/functionsWorker-0.07018426834816549.mjs
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
function stripCfConnectingIPHeader2(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader2, "stripCfConnectingIPHeader");
__name2(stripCfConnectingIPHeader2, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader2.apply(null, argArray)
    ]);
  }
});
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(json, "json");
__name2(json, "json");
function isLegacyHash(hash) {
  return /^[a-f0-9]{64}$/.test(hash);
}
__name(isLegacyHash, "isLegacyHash");
__name2(isLegacyHash, "isLegacyHash");
function uint8ArrayToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
__name(uint8ArrayToBase64, "uint8ArrayToBase64");
__name2(uint8ArrayToBase64, "uint8ArrayToBase64");
function base64ToUint8Array(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
__name(base64ToUint8Array, "base64ToUint8Array");
__name2(base64ToUint8Array, "base64ToUint8Array");
function constantTimeEqual(a, b) {
  if (a.length !== b.length)
    return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
__name(constantTimeEqual, "constantTimeEqual");
__name2(constantTimeEqual, "constantTimeEqual");
async function hashPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltB64 = uint8ArrayToBase64(salt);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pw),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const iterations = 1e5;
  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );
  const hashB64 = uint8ArrayToBase64(new Uint8Array(hash));
  return `pbkdf2:${iterations}:${saltB64}:${hashB64}`;
}
__name(hashPassword, "hashPassword");
__name2(hashPassword, "hashPassword");
async function verifyPassword(pw, storedHash) {
  if (!storedHash)
    return false;
  if (isLegacyHash(storedHash)) {
    const encoder = new TextEncoder();
    const data = encoder.encode("ider:" + pw + ":order-system");
    const hash2 = await crypto.subtle.digest("SHA-256", data);
    const hexHash = Array.from(new Uint8Array(hash2)).map((b) => b.toString(16).padStart(2, "0")).join("");
    return constantTimeEqual(hexHash, storedHash);
  }
  const parts = storedHash.split(":");
  if (parts[0] !== "pbkdf2" || parts.length !== 4)
    return false;
  const iterations = parseInt(parts[1], 10);
  const salt = base64ToUint8Array(parts[2]);
  const expectedHashB64 = parts[3];
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pw),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );
  const hashB64 = uint8ArrayToBase64(new Uint8Array(hash));
  return constantTimeEqual(hashB64, expectedHashB64);
}
__name(verifyPassword, "verifyPassword");
__name2(verifyPassword, "verifyPassword");
function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(generateToken, "generateToken");
__name2(generateToken, "generateToken");
function getClientIP(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
}
__name(getClientIP, "getClientIP");
__name2(getClientIP, "getClientIP");
async function logActivity(env, orderId, userId, action, detail) {
  await env.DB.prepare(
    "INSERT INTO order_activities (order_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
  ).bind(orderId, userId, action, detail || "").run();
}
__name(logActivity, "logActivity");
__name2(logActivity, "logActivity");
async function authenticate(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "");
  if (!token)
    return null;
  const result = await env.DB.prepare(
    "SELECT user_id, expires_at FROM sessions WHERE token = ?"
  ).bind(token).first();
  if (!result)
    return null;
  if (new Date(result.expires_at) < /* @__PURE__ */ new Date()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return null;
  }
  const user = await env.DB.prepare(
    "SELECT id, username, display_name, level, xp, total_orders, total_spent, invite_code, invited_by, invite_points, total_invited, total_purchased_points, commission_rate, email, avatar_url, bio, is_admin, locked FROM users WHERE id = ?"
  ).bind(result.user_id).first();
  return user;
}
__name(authenticate, "authenticate");
__name2(authenticate, "authenticate");
function authenticateApi(request, env) {
  const key = request.headers.get("X-API-Key") || "";
  return constantTimeEqual(key, env.API_KEY || "");
}
__name(authenticateApi, "authenticateApi");
__name2(authenticateApi, "authenticateApi");
async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === "POST") {
    const user = await authenticate(request, env);
    if (!user || !user.is_admin)
      return json({ error: "\u65E0\u6743\u9650" }, 403);
    const appealId = parseInt(params.id);
    const body = await request.json().catch(() => ({}));
    const { reply, status } = body;
    await env.DB.prepare(
      "UPDATE appeals SET admin_reply = ?, status = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(reply || "", status || "resolved", appealId).run();
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest, "onRequest");
__name2(onRequest, "onRequest");
async function onRequest2(context) {
  const { request, env, params } = context;
  if (request.method === "POST") {
    const admin = await authenticate(request, env);
    if (!admin || !admin.is_admin)
      return json({ error: "\u65E0\u6743\u9650" }, 403);
    const targetId = parseInt(params.id);
    const body = await request.json().catch(() => ({}));
    const { is_admin } = body;
    await env.DB.prepare("UPDATE users SET is_admin = ? WHERE id = ?").bind(is_admin ? 1 : 0, targetId).run();
    return json({ ok: true, message: is_admin ? "\u5DF2\u63D0\u5347\u4E3A\u7BA1\u7406\u5458" : "\u5DF2\u53D6\u6D88\u7BA1\u7406\u5458" });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest2, "onRequest2");
__name2(onRequest2, "onRequest");
async function onRequest3(context) {
  const { request, env, params } = context;
  if (request.method === "DELETE") {
    const admin = await authenticate(request, env);
    if (!admin || !admin.is_admin)
      return json({ error: "\u65E0\u6743\u9650" }, 403);
    const targetId = parseInt(params.id);
    if (targetId === admin.id)
      return json({ error: "\u4E0D\u80FD\u5220\u9664\u81EA\u5DF1" }, 400);
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(targetId).run();
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(targetId).run();
    return json({ ok: true, message: "\u7528\u6237\u5DF2\u5220\u9664" });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest3, "onRequest3");
__name2(onRequest3, "onRequest");
async function onRequest4(context) {
  const { request, env, params } = context;
  if (request.method === "POST") {
    const admin = await authenticate(request, env);
    if (!admin || !admin.is_admin)
      return json({ error: "\u65E0\u6743\u9650" }, 403);
    const targetId = parseInt(params.id);
    const body = await request.json().catch(() => ({}));
    const { level } = body;
    if (!level || level < 1 || level > 10)
      return json({ error: "\u7B49\u7EA7\u9700\u57281-10\u4E4B\u95F4" }, 400);
    await env.DB.prepare("UPDATE users SET level = ? WHERE id = ?").bind(level, targetId).run();
    return json({ ok: true, message: "\u7B49\u7EA7\u5DF2\u66F4\u65B0" });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest4, "onRequest4");
__name2(onRequest4, "onRequest");
async function onRequest5(context) {
  const { request, env, params } = context;
  if (request.method === "POST") {
    const user = await authenticate(request, env);
    if (!user || !user.is_admin)
      return json({ error: "\u65E0\u6743\u9650" }, 403);
    const targetId = parseInt(params.id);
    const body = await request.json().catch(() => ({}));
    const { locked } = body;
    await env.DB.prepare("UPDATE users SET locked = ? WHERE id = ?").bind(locked ? 1 : 0, targetId).run();
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest5, "onRequest5");
__name2(onRequest5, "onRequest");
async function onRequest6(context) {
  const { request, env, params } = context;
  if (request.method === "POST") {
    const admin = await authenticate(request, env);
    if (!admin || !admin.is_admin)
      return json({ error: "\u65E0\u6743\u9650" }, 403);
    const targetId = parseInt(params.id);
    const body = await request.json().catch(() => ({}));
    const { new_password } = body;
    if (!new_password || new_password.length < 6)
      return json({ error: "\u5BC6\u7801\u81F3\u5C116\u4F4D" }, 400);
    const hash = await hashPassword(new_password);
    await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(hash, targetId).run();
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(targetId).run();
    return json({ ok: true, message: "\u5BC6\u7801\u5DF2\u91CD\u7F6E\uFF0C\u7528\u6237\u9700\u91CD\u65B0\u767B\u5F55" });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest6, "onRequest6");
__name2(onRequest6, "onRequest");
async function onRequest7(context) {
  const { request, env, params } = context;
  if (request.method === "DELETE") {
    const admin = await authenticate(request, env);
    if (!admin || !admin.is_admin)
      return json({ error: "\u65E0\u6743\u9650" }, 403);
    const id = parseInt(params.id);
    await env.DB.prepare("DELETE FROM ads WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest7, "onRequest7");
__name2(onRequest7, "onRequest");
async function onRequest8(context) {
  const { request, env, params } = context;
  if (request.method === "DELETE") {
    const admin = await authenticate(request, env);
    if (!admin || !admin.is_admin)
      return json({ error: "\u65E0\u6743\u9650" }, 403);
    const id = parseInt(params.id);
    await env.DB.prepare("DELETE FROM announcements WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest8, "onRequest8");
__name2(onRequest8, "onRequest");
async function onRequest9(context) {
  const { request, env, params } = context;
  if (request.method === "DELETE") {
    const user = await authenticate(request, env);
    if (!user || !user.is_admin)
      return json({ error: "\u65E0\u6743\u9650" }, 403);
    const id = parseInt(params.id);
    await env.DB.prepare("DELETE FROM coupons WHERE id = ?").bind(id).run();
    return json({ ok: true, message: "\u4F18\u60E0\u5238\u5DF2\u5220\u9664" });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest9, "onRequest9");
__name2(onRequest9, "onRequest");
async function onRequest10(context) {
  const { request, env, params } = context;
  if (request.method === "GET") {
    const user = await authenticate(request, env);
    if (!user)
      return json({ error: "\u672A\u767B\u5F55" }, 401);
    const aid = parseInt(params.id);
    const acc = await env.DB.prepare(
      "SELECT ga.*, o.user_id as order_user_id FROM game_accounts ga JOIN orders o ON ga.order_id = o.id WHERE ga.id = ?"
    ).bind(aid).first();
    if (!acc)
      return json({ error: "\u8D26\u53F7\u4E0D\u5B58\u5728" }, 404);
    if (acc.order_user_id !== user.id && !user.is_admin)
      return json({ error: "\u65E0\u6743\u9650" }, 403);
    const logs = await env.DB.prepare(
      "SELECT * FROM account_logs WHERE account_id = ? ORDER BY created_at DESC LIMIT 100"
    ).bind(aid).all();
    return json({ ok: true, logs: logs.results });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest10, "onRequest10");
__name2(onRequest10, "onRequest");
async function onRequest11(context) {
  const { request, env, params } = context;
  if (request.method === "POST") {
    const user = await authenticate(request, env);
    if (!user)
      return json({ error: "\u672A\u767B\u5F55" }, 401);
    const itemId = parseInt(params.id);
    const body = await request.json().catch(() => ({}));
    const { content } = body;
    if (!content)
      return json({ error: "\u8BF7\u586B\u5199\u56DE\u590D\u5185\u5BB9" }, 400);
    const item = await env.DB.prepare("SELECT * FROM appeals WHERE id = ? AND user_id = ?").bind(itemId, user.id).first();
    if (!item)
      return json({ error: "\u552E\u540E\u8BF7\u6C42\u4E0D\u5B58\u5728" }, 404);
    const existing = item.admin_reply || "";
    await env.DB.prepare(
      "UPDATE appeals SET admin_reply = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(existing + "\n[\u7528\u6237\u56DE\u590D] " + content, itemId).run();
    return json({ ok: true, message: "\u5DF2\u56DE\u590D" });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest11, "onRequest11");
__name2(onRequest11, "onRequest");
async function onRequest12(context) {
  const { request, env, params } = context;
  if (request.method !== "GET")
    return json({ error: "Method not allowed" }, 405);
  const user = await authenticate(request, env);
  if (!user)
    return json({ error: "\u672A\u767B\u5F55" }, 401);
  const orderId = parseInt(params.id);
  if (isNaN(orderId))
    return json({ error: "\u65E0\u6548\u5DE5\u5355ID" }, 400);
  const order = await env.DB.prepare("SELECT user_id FROM orders WHERE id = ?").bind(orderId).first();
  if (!order)
    return json({ error: "\u5DE5\u5355\u4E0D\u5B58\u5728" }, 404);
  if (order.user_id !== user.id && !user.is_admin)
    return json({ error: "\u65E0\u6743\u9650" }, 403);
  const activities = await env.DB.prepare(
    "SELECT * FROM order_activities WHERE order_id = ? ORDER BY created_at ASC"
  ).bind(orderId).all();
  return json({ ok: true, activities: activities.results });
}
__name(onRequest12, "onRequest12");
__name2(onRequest12, "onRequest");
var XP_LEVELS = [0, 0, 100, 300, 700, 1500, 3100, 6300, 12700, 25500, 51100];
var INVITE_BOOST_TIERS = [
  { min: 0, max: 4999, mult: 1, label: "\u57FA\u7840", rate: 30 },
  { min: 5e3, max: 19999, mult: 1.2, label: "\u9752\u94DC", rate: 36 },
  { min: 2e4, max: 49999, mult: 1.5, label: "\u767D\u94F6", rate: 45 },
  { min: 5e4, max: 99999, mult: 2, label: "\u9EC4\u91D1", rate: 60 },
  { min: 1e5, max: Infinity, mult: 3, label: "\u81F3\u5C0A", rate: 90 }
];
var INVITE_PACKAGES = [
  { id: "bronze", name: "\u5C0F\u8BD5\u725B\u5200", points: 6e3, price: 50, desc: "\u89E3\u9501\u9752\u94DC\u500D\u7387(1.2x)" },
  { id: "silver", name: "\u6E10\u5165\u4F73\u5883", points: 12e3, price: 100, desc: "\u89E3\u9501\u767D\u94F6\u500D\u7387(1.5x)" },
  { id: "gold", name: "\u5982\u864E\u6DFB\u7FFC", points: 3e4, price: 250, desc: "\u89E3\u9501\u9EC4\u91D1\u500D\u7387(2.0x)" },
  { id: "diamond", name: "\u767B\u5CF0\u9020\u6781", points: 6e4, price: 500, desc: "\u89E3\u9501\u81F3\u5C0A\u500D\u7387(3.0x)" },
  { id: "legend", name: "\u81F3\u5C0A\u65E0\u654C", points: 12e4, price: 1e3, desc: "\u6EE1\u7EA7\u500D\u7387(3.0x)+\u4E13\u5C5E\u6807\u8BC6" }
];
function getInviteBoost(totalPurchased) {
  const tier = INVITE_BOOST_TIERS.find((t) => totalPurchased >= t.min && totalPurchased < t.max) || INVITE_BOOST_TIERS[0];
  return tier;
}
__name(getInviteBoost, "getInviteBoost");
__name2(getInviteBoost, "getInviteBoost");
async function recalcUserLevel(env, userId) {
  const user = await env.DB.prepare("SELECT id, xp FROM users WHERE id = ?").bind(userId).first();
  if (!user)
    return;
  let level = 1;
  for (let i = XP_LEVELS.length - 1; i >= 1; i--) {
    if (user.xp >= XP_LEVELS[i]) {
      level = i;
      break;
    }
  }
  await env.DB.prepare("UPDATE users SET level = ? WHERE id = ?").bind(level, userId).run();
}
__name(recalcUserLevel, "recalcUserLevel");
__name2(recalcUserLevel, "recalcUserLevel");
async function addXP(env, userId, amount, reason) {
  await env.DB.prepare("UPDATE users SET xp = xp + ? WHERE id = ?").bind(amount, userId).run();
  await recalcUserLevel(env, userId);
  const title = "\u7ECF\u9A8C\u503C +" + amount;
  const content = reason + "\uFF0C\u83B7\u5F97 " + amount + " \u7ECF\u9A8C\u503C";
  await env.DB.prepare(
    "INSERT INTO notifications (user_id, title, content, type) VALUES (?, ?, ?, ?)"
  ).bind(userId, title, content, "xp").run();
}
__name(addXP, "addXP");
__name2(addXP, "addXP");
var INVITE_BOOST_TIERS2 = [
  { min: 0, max: 4999, mult: 1, label: "\u57FA\u7840", rate: 30 },
  { min: 5e3, max: 19999, mult: 1.2, label: "\u9752\u94DC", rate: 36 },
  { min: 2e4, max: 49999, mult: 1.5, label: "\u767D\u94F6", rate: 45 },
  { min: 5e4, max: 99999, mult: 2, label: "\u9EC4\u91D1", rate: 60 },
  { min: 1e5, max: Infinity, mult: 3, label: "\u81F3\u5C0A", rate: 90 }
];
function getInviteBoost2(totalPurchased) {
  return INVITE_BOOST_TIERS2.find((t) => totalPurchased >= t.min && totalPurchased < t.max) || INVITE_BOOST_TIERS2[0];
}
__name(getInviteBoost2, "getInviteBoost2");
__name2(getInviteBoost2, "getInviteBoost");
async function onRequest13(context) {
  const { request, env, params } = context;
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405);
  const user = await authenticate(request, env);
  if (!user || !user.is_admin)
    return json({ error: "\u65E0\u6743\u9650" }, 403);
  const orderId = parseInt(params.id);
  if (isNaN(orderId))
    return json({ error: "\u65E0\u6548\u5DE5\u5355ID" }, 400);
  const body = await request.json().catch(() => ({}));
  const { status, admin_notes } = body;
  if (!status || !["approved", "rejected", "completed"].includes(status)) {
    return json({ error: "\u65E0\u6548\u72B6\u6001\u503C" }, 400);
  }
  await env.DB.prepare(
    "UPDATE orders SET status = ?, admin_notes = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(status, admin_notes || "", orderId).run();
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first();
  if (!order)
    return json({ error: "\u5DE5\u5355\u4E0D\u5B58\u5728" }, 404);
  if (status === "approved") {
    await env.DB.prepare(
      "UPDATE users SET total_orders = total_orders + 1, total_spent = total_spent + ? WHERE id = ?"
    ).bind(order.bonus_points, order.user_id).run();
    const isPackage = order.invite_code && order.invite_code.startsWith("PKG:");
    if (isPackage) {
      const pkgPoints = order.bonus_points || 0;
      await env.DB.prepare(
        "UPDATE users SET total_purchased_points = COALESCE(total_purchased_points, 0) + ?, invite_points = invite_points + ? WHERE id = ?"
      ).bind(pkgPoints, pkgPoints, order.user_id).run();
      const pkgName = order.invite_code.replace("PKG:", "").split(":")[1] || "\u9080\u8BF7\u5957\u9910";
      await env.DB.prepare(
        "INSERT INTO notifications (user_id, title, content, type) VALUES (?, '\u5957\u9910\u5DF2\u5230\u8D26', '\u300C' || ? || '\u300D' || ? || ' \u9080\u8BF7\u79EF\u5206\u5DF2\u5230\u8D26\uFF0C\u5F53\u524D\u500D\u7387\u5DF2\u63D0\u5347\uFF01', 'commission')"
      ).bind(order.user_id, pkgName, pkgPoints).run();
      await logActivity(env, orderId, order.user_id, "commission", "\u8D2D\u4E70\u5957\u9910\u5230\u8D26 " + pkgPoints + " \u79EF\u5206");
    } else {
      const xpGain = Math.max(10, Math.floor(order.bonus_points * 0.1));
      await addXP(env, order.user_id, xpGain, "\u5DE5\u5355 #" + orderId + " \u5BA1\u6838\u901A\u8FC7");
      await logActivity(env, orderId, order.user_id, "approved", "\u5DE5\u5355\u5DF2\u5BA1\u6838\u901A\u8FC7");
      if (order.user_id) {
        const buyer = await env.DB.prepare("SELECT invited_by FROM users WHERE id = ?").bind(order.user_id).first();
        if (buyer && buyer.invited_by > 0) {
          const boostInfo = getInviteBoost2(
            (await env.DB.prepare("SELECT total_purchased_points FROM users WHERE id = ?").bind(buyer.invited_by).first())?.total_purchased_points || 0
          );
          const commission = order.bonus_points * (boostInfo.rate / 100);
          await env.DB.prepare(
            "UPDATE users SET invite_points = invite_points + ? WHERE id = ?"
          ).bind(commission, buyer.invited_by).run();
          await env.DB.prepare(
            "INSERT INTO notifications (user_id, title, content, type) VALUES (?, '\u9080\u8BF7\u5206\u6210\u5230\u8D26', '\u4E0B\u7EBF\u6210\u4EA4\u83B7\u5F97 ' || ? || ' \u9080\u8BF7\u79EF\u5206\u5956\u52B1\uFF08' || ? || '\u500D\u7387\uFF09', 'commission')"
          ).bind(buyer.invited_by, commission.toFixed(1), boostInfo.label).run();
          await logActivity(env, orderId, buyer.invited_by, "commission", "\u83B7\u5F97\u5206\u6210 " + commission.toFixed(1) + " \u79EF\u5206\uFF08" + boostInfo.label + "\u500D\u7387\uFF09");
        }
      }
    }
    await env.DB.prepare(
      "INSERT INTO notifications (user_id, title, content, type) VALUES (?, '\u5DE5\u5355\u5DF2\u901A\u8FC7', '\u5DE5\u5355 #' || ? || ' \u5DF2\u5BA1\u6838\u901A\u8FC7\uFF0C\u6B63\u5728\u5904\u7406\u4E2D', 'order')"
    ).bind(order.user_id, orderId).run();
  } else if (status === "rejected") {
    await env.DB.prepare(
      "INSERT INTO notifications (user_id, title, content, type) VALUES (?, '\u5DE5\u5355\u88AB\u62D2\u7EDD', '\u5DE5\u5355 #' || ? || ' \u88AB\u62D2\u7EDD: ' || ?, 'order')"
    ).bind(order.user_id, orderId, admin_notes || "\u65E0\u539F\u56E0").run();
    await logActivity(env, orderId, order.user_id, "rejected", "\u62D2\u7EDD\u539F\u56E0: " + (admin_notes || "\u672A\u8BF4\u660E"));
  } else if (status === "completed") {
    await logActivity(env, orderId, order.user_id, "completed", "\u5DE5\u5355\u5DF2\u5B8C\u6210");
  }
  return json({ ok: true, message: "\u72B6\u6001\u5DF2\u66F4\u65B0" });
}
__name(onRequest13, "onRequest13");
__name2(onRequest13, "onRequest");
async function onRequest14(context) {
  const { request, env, params } = context;
  if (request.method === "GET") {
    const uid = parseInt(params.id);
    const u = await env.DB.prepare(
      "SELECT id, username, display_name, level, total_orders, total_spent, invite_code, avatar_url, bio, created_at FROM users WHERE id = ?"
    ).bind(uid).first();
    if (!u)
      return json({ error: "\u7528\u6237\u4E0D\u5B58\u5728" }, 404);
    const totalInvited = await env.DB.prepare("SELECT COUNT(*) as cnt FROM users WHERE invited_by = ?").bind(uid).first();
    return json({ ok: true, user: { ...u, total_invited: totalInvited.cnt } });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest14, "onRequest14");
__name2(onRequest14, "onRequest");
async function onRequest15(context) {
  const { request, env } = context;
  if (request.method === "GET") {
    const user = await authenticate(request, env);
    if (!user || !user.is_admin)
      return json({ error: "\u65E0\u6743\u9650" }, 403);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "";
    let query = "SELECT ga.*, o.user_id as order_user_id, u.username as user_name FROM game_accounts ga JOIN orders o ON ga.order_id = o.id JOIN users u ON o.user_id = u.id";
    const params = [];
    if (status) {
      query += " WHERE ga.status = ?";
      params.push(status);
    }
    query += " ORDER BY ga.id DESC LIMIT 100";
    const accounts = await env.DB.prepare(query).bind(...params).all();
    return json({ ok: true, accounts: accounts.results });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest15, "onRequest15");
__name2(onRequest15, "onRequest");
async function onRequest16(context) {
  const { request, env } = context;
  if (request.method === "GET") {
    const admin = await authenticate(request, env);
    if (!admin || !admin.is_admin)
      return json({ error: "\u65E0\u6743\u9650" }, 403);
    const ads = await env.DB.prepare("SELECT * FROM ads ORDER BY created_at DESC").all();
    return json({ ok: true, ads: ads.results });
  }
  if (request.method === "POST") {
    const admin = await authenticate(request, env);
    if (!admin || !admin.is_admin)
      return json({ error: "\u65E0\u6743\u9650" }, 403);
    const body = await request.json().catch(() => ({}));
    const { type, image_url, link_url, title, enabled } = body;
    if (!image_url)
      return json({ error: "\u8BF7\u4E0A\u4F20\u56FE\u7247" }, 400);
    await env.DB.prepare(
      "INSERT INTO ads (type, image_url, link_url, title, enabled, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
    ).bind(type || "popup", image_url, link_url || "", title || "", enabled ? 1 : 0).run();
    return json({ ok: true, message: "\u5E7F\u544A\u5DF2\u6DFB\u52A0" });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest16, "onRequest16");
__name2(onRequest16, "onRequest");
async function onRequest17(context) {
  const { request, env } = context;
  if (request.method === "GET") {
    const admin = await authenticate(request, env);
    if (!admin || !admin.is_admin)
      return json({ error: "\u65E0\u6743\u9650" }, 403);
    const anns = await env.DB.prepare("SELECT * FROM announcements ORDER BY created_at DESC").all();
    return json({ ok: true, announcements: anns.results });
  }
  if (request.method === "POST") {
    const admin = await authenticate(request, env);
    if (!admin || !admin.is_admin)
      return json({ error: "\u65E0\u6743\u9650" }, 403);
    const body = await request.json().catch(() => ({}));
    const { content, enabled } = body;
    if (!content)
      return json({ error: "\u8BF7\u8F93\u5165\u516C\u544A\u5185\u5BB9" }, 400);
    await env.DB.prepare(
      "INSERT INTO announcements (content, enabled, created_at) VALUES (?, ?, datetime('now'))"
    ).bind(content, enabled !== false ? 1 : 0).run();
    return json({ ok: true, message: "\u516C\u544A\u5DF2\u53D1\u5E03" });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest17, "onRequest17");
__name2(onRequest17, "onRequest");
async function onRequest18(context) {
  const { request, env } = context;
  if (request.method === "GET") {
    const user = await authenticate(request, env);
    if (!user || !user.is_admin)
      return json({ error: "\u65E0\u6743\u9650" }, 403);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "";
    let query = "SELECT a.*, u.username as user_name FROM appeals a JOIN users u ON a.user_id = u.id";
    const params = [];
    if (status) {
      query += " WHERE a.status = ?";
      params.push(status);
    }
    query += " ORDER BY a.created_at DESC";
    const appeals = await env.DB.prepare(query).bind(...params).all();
    return json({ ok: true, appeals: appeals.results });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest18, "onRequest18");
__name2(onRequest18, "onRequest");
async function onRequest19(context) {
  const { request, env } = context;
  if (request.method === "GET") {
    const user = await authenticate(request, env);
    if (!user || !user.is_admin)
      return json({ error: "\u65E0\u6743\u9650" }, 403);
    const configs = await env.DB.prepare("SELECT * FROM config").all();
    return json({ ok: true, config: configs.results });
  }
  if (request.method === "POST") {
    const user = await authenticate(request, env);
    if (!user || !user.is_admin)
      return json({ error: "\u65E0\u6743\u9650" }, 403);
    const body = await request.json().catch(() => ({}));
    const { key, value } = body;
    if (!key || value === void 0)
      return json({ error: "\u53C2\u6570\u4E0D\u5168" }, 400);
    await env.DB.prepare("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)").bind(key, String(value)).run();
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest19, "onRequest19");
__name2(onRequest19, "onRequest");
async function onRequest20(context) {
  const { request, env } = context;
  if (request.method === "GET") {
    const user = await authenticate(request, env);
    if (!user || !user.is_admin)
      return json({ error: "\u65E0\u6743\u9650" }, 403);
    const coupons = await env.DB.prepare("SELECT * FROM coupons ORDER BY created_at DESC").all();
    return json({ ok: true, coupons: coupons.results });
  }
  if (request.method === "POST") {
    const user = await authenticate(request, env);
    if (!user || !user.is_admin)
      return json({ error: "\u65E0\u6743\u9650" }, 403);
    const body = await request.json().catch(() => ({}));
    const { code, discount_percent, max_uses, expires_at, description } = body;
    if (!code || discount_percent === void 0)
      return json({ error: "\u53C2\u6570\u4E0D\u5168" }, 400);
    if (discount_percent < 1 || discount_percent > 100)
      return json({ error: "\u6298\u6263\u6BD4\u4F8B\u9700\u57281-100\u4E4B\u95F4" }, 400);
    const cleanCode = code.trim().toUpperCase();
    const existing = await env.DB.prepare("SELECT id FROM coupons WHERE code = ?").bind(cleanCode).first();
    if (existing)
      return json({ error: "\u4F18\u60E0\u7801\u5DF2\u5B58\u5728" }, 400);
    await env.DB.prepare(
      "INSERT INTO coupons (code, discount_percent, max_uses, expires_at, description) VALUES (?, ?, ?, ?, ?)"
    ).bind(cleanCode, discount_percent, max_uses || 0, expires_at || null, description || "").run();
    return json({ ok: true, message: "\u4F18\u60E0\u5238\u5DF2\u521B\u5EFA" });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest20, "onRequest20");
__name2(onRequest20, "onRequest");
async function onRequest21(context) {
  const { request, env } = context;
  if (request.method === "GET") {
    const user = await authenticate(request, env);
    if (!user || !user.is_admin)
      return json({ error: "\u65E0\u6743\u9650" }, 403);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "";
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = 50;
    const offset = (page - 1) * limit;
    let query = "SELECT o.*, u.username as user_name FROM orders o JOIN users u ON o.user_id = u.id";
    const params = [];
    if (status) {
      query += " WHERE o.status = ?";
      params.push(status);
    }
    query += " ORDER BY o.created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);
    const orders = await env.DB.prepare(query).bind(...params).all();
    return json({ ok: true, orders: orders.results, page, limit });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest21, "onRequest21");
__name2(onRequest21, "onRequest");
async function onRequest22(context) {
  const { request, env } = context;
  if (request.method === "GET") {
    const admin = await authenticate(request, env);
    if (!admin || !admin.is_admin)
      return json({ error: "\u65E0\u6743\u9650" }, 403);
    const [
      totalUsers,
      totalOrders,
      approvedOrders,
      completedOrders,
      rejectedOrders,
      pendingOrders,
      totalAccounts,
      onlineAccounts,
      completedAccounts,
      errorAccounts,
      totalRevenue,
      todayOrders,
      todayRevenue,
      weeklyOrders
    ] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as cnt FROM users").first(),
      env.DB.prepare("SELECT COUNT(*) as cnt FROM orders").first(),
      env.DB.prepare("SELECT COUNT(*) as cnt FROM orders WHERE status='approved'").first(),
      env.DB.prepare("SELECT COUNT(*) as cnt FROM orders WHERE status='completed'").first(),
      env.DB.prepare("SELECT COUNT(*) as cnt FROM orders WHERE status='rejected'").first(),
      env.DB.prepare("SELECT COUNT(*) as cnt FROM orders WHERE status='pending'").first(),
      env.DB.prepare("SELECT COUNT(*) as cnt FROM game_accounts").first(),
      env.DB.prepare("SELECT COUNT(*) as cnt FROM game_accounts WHERE status IN ('farming','active')").first(),
      env.DB.prepare("SELECT COUNT(*) as cnt FROM game_accounts WHERE status='completed'").first(),
      env.DB.prepare("SELECT COUNT(*) as cnt FROM game_accounts WHERE status IN ('error','failed')").first(),
      env.DB.prepare("SELECT COALESCE(SUM(bonus_points), 0) as total FROM orders WHERE status IN ('approved','completed')").first(),
      env.DB.prepare("SELECT COUNT(*) as cnt FROM orders WHERE created_at >= datetime('now', '-1 day')").first(),
      env.DB.prepare("SELECT COALESCE(SUM(bonus_points), 0) as total FROM orders WHERE created_at >= datetime('now', '-1 day') AND status IN ('approved','completed')").first(),
      env.DB.prepare("SELECT COUNT(*) as cnt FROM orders WHERE created_at >= datetime('now', '-7 days')").first()
    ]);
    const levelDist = await env.DB.prepare(
      "SELECT level, COUNT(*) as cnt FROM users GROUP BY level ORDER BY level"
    ).all();
    const orderStatusDist = await env.DB.prepare(
      "SELECT status, COUNT(*) as cnt FROM orders GROUP BY status"
    ).all();
    const accountStatusDist = await env.DB.prepare(
      "SELECT status, COUNT(*) as cnt FROM game_accounts GROUP BY status"
    ).all();
    const topSpenders = await env.DB.prepare(
      "SELECT id, username, display_name, total_spent, total_orders, level FROM users WHERE total_spent > 0 ORDER BY total_spent DESC LIMIT 5"
    ).all();
    const dailyTrend = await env.DB.prepare(
      "SELECT date(created_at) as day, COUNT(*) as cnt, COALESCE(SUM(bonus_points), 0) as revenue FROM orders WHERE created_at >= datetime('now', '-7 days') GROUP BY date(created_at) ORDER BY day"
    ).all();
    return json({
      ok: true,
      stats: {
        total_users: totalUsers.cnt,
        total_orders: totalOrders.cnt,
        approved_orders: approvedOrders.cnt,
        completed_orders: completedOrders.cnt,
        rejected_orders: rejectedOrders.cnt,
        pending_orders: pendingOrders.cnt,
        total_accounts: totalAccounts.cnt,
        online_accounts: onlineAccounts.cnt,
        completed_accounts: completedAccounts.cnt,
        error_accounts: errorAccounts.cnt,
        total_revenue: totalRevenue.total || 0,
        today_orders: todayOrders.cnt,
        today_revenue: todayRevenue.total || 0,
        weekly_orders: weeklyOrders.cnt,
        level_distribution: levelDist.results,
        order_status_distribution: orderStatusDist.results,
        account_status_distribution: accountStatusDist.results,
        top_spenders: topSpenders.results,
        daily_trend: dailyTrend.results
      }
    });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest22, "onRequest22");
__name2(onRequest22, "onRequest");
async function onRequest23(context) {
  const { request, env } = context;
  if (request.method === "GET") {
    const user = await authenticate(request, env);
    if (!user || !user.is_admin)
      return json({ error: "\u65E0\u6743\u9650" }, 403);
    const users = await env.DB.prepare(
      "SELECT id, username, display_name, level, xp, total_orders, total_spent, total_invited, invite_code, invite_points, total_purchased_points, email, avatar_url, bio, is_admin, locked, created_at, last_login FROM users ORDER BY id DESC"
    ).all();
    return json({ ok: true, users: users.results });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest23, "onRequest23");
__name2(onRequest23, "onRequest");
async function onRequest24(context) {
  const { request, env } = context;
  if (request.method === "GET") {
    const popup = await env.DB.prepare("SELECT * FROM ads WHERE type = 'popup' AND enabled = 1 ORDER BY created_at DESC LIMIT 1").first();
    const sidebar = await env.DB.prepare("SELECT * FROM ads WHERE type = 'sidebar' AND enabled = 1 ORDER BY created_at DESC LIMIT 1").first();
    return json({ ok: true, popup: popup || null, sidebar: sidebar || null });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest24, "onRequest24");
__name2(onRequest24, "onRequest");
async function onRequest25(context) {
  const { request, env } = context;
  if (request.method === "GET") {
    const ann = await env.DB.prepare(
      "SELECT * FROM announcements WHERE enabled = 1 ORDER BY created_at DESC LIMIT 1"
    ).first();
    return json({ ok: true, announcement: ann || null });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest25, "onRequest25");
__name2(onRequest25, "onRequest");
async function onRequest26(context) {
  const { request, env } = context;
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  const body = await request.json().catch(() => ({}));
  const { username, email } = body;
  if (!username)
    return json({ error: "\u8BF7\u8F93\u5165\u7528\u6237\u540D" }, 400);
  const user = await env.DB.prepare(
    "SELECT id, username, email FROM users WHERE username = ?"
  ).bind(username).first();
  if (!user)
    return json({ error: "\u7528\u6237\u4E0D\u5B58\u5728" }, 404);
  if (email && user.email && user.email !== email) {
    return json({ error: "\u90AE\u7BB1\u4E0E\u8D26\u53F7\u4E0D\u5339\u914D" }, 400);
  }
  const token = generateToken();
  const expiresAt = Date.now() + 15 * 60 * 1e3;
  await env.DB.prepare(
    "INSERT OR REPLACE INTO reset_tokens (token, user_id, username, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(token, user.id, user.username, expiresAt).run();
  await env.DB.prepare(
    "DELETE FROM reset_tokens WHERE expires_at < ?"
  ).bind(Date.now()).run();
  return json({
    ok: true,
    message: "\u91CD\u7F6E\u7801\u5DF2\u751F\u6210\uFF0C\u8BF7\u4F7F\u7528\u91CD\u7F6E\u7801\u91CD\u8BBE\u5BC6\u7801\uFF08\u6709\u6548\u671F15\u5206\u949F\uFF09",
    reset_token: token,
    expires_in: 900
  });
}
__name(onRequest26, "onRequest26");
__name2(onRequest26, "onRequest");
async function onRequest27(context) {
  const { request, env } = context;
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  const body = await request.json().catch(() => ({}));
  const { username, password } = body;
  if (!username || !password)
    return json({ error: "\u53C2\u6570\u4E0D\u5168" }, 400);
  const user = await env.DB.prepare(
    "SELECT id, username, password_hash, level, locked, is_admin FROM users WHERE username = ?"
  ).bind(username).first();
  if (!user)
    return json({ error: "\u7528\u6237\u4E0D\u5B58\u5728" }, 404);
  if (user.locked)
    return json({ error: "\u8D26\u53F7\u5DF2\u9501\u5B9A" }, 403);
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid)
    return json({ error: "\u5BC6\u7801\u9519\u8BEF" }, 401);
  if (isLegacyHash(user.password_hash)) {
    const newHash = await hashPassword(password);
    await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(newHash, user.id).run();
  }
  const token = generateToken();
  const expires = new Date(Date.now() + 7 * 864e5).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)"
  ).bind(user.id, token, expires).run();
  await env.DB.prepare(
    "UPDATE users SET last_login = datetime('now') WHERE id = ?"
  ).bind(user.id).run();
  return json({
    ok: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      level: user.level,
      is_admin: user.is_admin
    }
  });
}
__name(onRequest27, "onRequest27");
__name2(onRequest27, "onRequest");
async function onRequest28(context) {
  const { request, env } = context;
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  const body = await request.json().catch(() => ({}));
  const { username, password, email, invite_code } = body;
  if (!username || !password)
    return json({ error: "\u7528\u6237\u540D\u548C\u5BC6\u7801\u4E0D\u80FD\u4E3A\u7A7A" }, 400);
  if (username.length < 3 || username.length > 20)
    return json({ error: "\u7528\u6237\u540D3-20\u5B57\u7B26" }, 400);
  if (password.length < 6)
    return json({ error: "\u5BC6\u7801\u81F3\u5C116\u4F4D" }, 400);
  const ip = getClientIP(request);
  const ipCount = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM users WHERE ip_address = ?"
  ).bind(ip).first();
  if (ipCount.cnt > 0)
    return json({ error: "\u8BE5IP\u5DF2\u6CE8\u518C\u8FC7\u8D26\u53F7\uFF0C\u6BCFIP\u4EC5\u9650\u4E00\u4E2A\u8D26\u53F7" }, 403);
  const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
  if (existing)
    return json({ error: "\u7528\u6237\u540D\u5DF2\u5B58\u5728" }, 409);
  const hash = await hashPassword(password);
  const myInviteCode = "IDR" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
  let inviterId = 0;
  if (invite_code) {
    const inviter = await env.DB.prepare("SELECT id FROM users WHERE invite_code = ?").bind(invite_code).first();
    if (inviter)
      inviterId = inviter.id;
  }
  await env.DB.prepare(
    "INSERT INTO users (username, password_hash, email, invite_code, invited_by, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
  ).bind(username, hash, email || "", myInviteCode, inviterId, ip).run();
  if (inviterId > 0) {
    await env.DB.prepare("UPDATE users SET total_invited = total_invited + 1 WHERE id = ?").bind(inviterId).run();
    await addXP(env, inviterId, 50, "\u6210\u529F\u9080\u8BF7\u7528\u6237 " + username);
  }
  return json({ ok: true, message: "\u6CE8\u518C\u6210\u529F" });
}
__name(onRequest28, "onRequest28");
__name2(onRequest28, "onRequest");
async function onRequest29(context) {
  const { request, env } = context;
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  const body = await request.json().catch(() => ({}));
  const { reset_token, new_password } = body;
  if (!reset_token || !new_password)
    return json({ error: "\u8BF7\u586B\u5199\u91CD\u7F6E\u7801\u548C\u65B0\u5BC6\u7801" }, 400);
  if (new_password.length < 6)
    return json({ error: "\u65B0\u5BC6\u7801\u81F3\u5C116\u4F4D" }, 400);
  const data = await env.DB.prepare(
    "SELECT user_id, expires_at FROM reset_tokens WHERE token = ?"
  ).bind(reset_token).first();
  if (!data)
    return json({ error: "\u91CD\u7F6E\u7801\u65E0\u6548\u6216\u5DF2\u8FC7\u671F" }, 404);
  if (Date.now() > data.expires_at) {
    await env.DB.prepare("DELETE FROM reset_tokens WHERE token = ?").bind(reset_token).run();
    return json({ error: "\u91CD\u7F6E\u7801\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u7533\u8BF7" }, 400);
  }
  const hash = await hashPassword(new_password);
  await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(hash, data.user_id).run();
  await env.DB.prepare("DELETE FROM reset_tokens WHERE token = ?").bind(reset_token).run();
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(data.user_id).run();
  return json({ ok: true, message: "\u5BC6\u7801\u91CD\u7F6E\u6210\u529F\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55" });
}
__name(onRequest29, "onRequest29");
__name2(onRequest29, "onRequest");
async function onRequest30(context) {
  const { request, env } = context;
  if (request.method === "POST") {
    const user = await authenticate(request, env);
    if (!user)
      return json({ error: "\u672A\u767B\u5F55" }, 401);
    const body = await request.json().catch(() => ({}));
    const { question } = body;
    if (!question)
      return json({ error: "\u8BF7\u8F93\u5165\u95EE\u9898" }, 400);
    const answer = await getBotAnswer(question, env, user);
    await env.DB.prepare(
      "INSERT INTO bot_logs (user_id, question, answer) VALUES (?, ?, ?)"
    ).bind(user.id, question, answer).run();
    return json({ ok: true, answer });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest30, "onRequest30");
__name2(onRequest30, "onRequest");
async function getBotAnswer(question, env, user) {
  const q = question.toLowerCase().trim();
  const orderInfo = await env.DB.prepare(
    "SELECT id, status, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 5"
  ).bind(user.id).all();
  if (q.includes("\u8BA2\u5355") || q.includes("\u5DE5\u5355") || q.includes("\u72B6\u6001") || q.includes("\u5BA1\u6838")) {
    if (!orderInfo.results.length)
      return "\u60A8\u8FD8\u6CA1\u6709\u63D0\u4EA4\u8FC7\u5DE5\u5355\u54E6~\n\u524D\u5F80\u63A7\u5236\u53F0\u63D0\u4EA4\u5DE5\u5355\u5373\u53EF\u5F00\u59CB\u3002";
    let reply = "\u{1F4CB} \u60A8\u7684\u5DE5\u5355\u72B6\u6001\uFF1A\n";
    for (const o of orderInfo.results) {
      const statusMap = { pending: "\u23F3 \u5BA1\u6838\u4E2D", approved: "\u2705 \u5DF2\u901A\u8FC7", rejected: "\u274C \u5DF2\u62D2\u7EDD", completed: "\u{1F389} \u5DF2\u5B8C\u6210" };
      const estMap = { pending: "\u7B49\u5F85\u5BA1\u6838", approved: "\u5904\u7406\u4E2D", rejected: "\u5DF2\u62D2\u7EDD", completed: "\u5DF2\u5B8C\u6210" };
      reply += `  #${o.id} ${statusMap[o.status] || o.status} (${estMap[o.status] || ""})
`;
    }
    return reply + '\n\u{1F4A1} \u53D1\u9001 "\u8BA2\u5355 #\u7F16\u53F7" \u67E5\u770B\u8BE6\u60C5';
  }
  if (/订单\s*#?\d+/.test(q)) {
    const match2 = q.match(/订单\s*#?(\d+)/);
    if (match2) {
      const detail = await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND user_id = ?").bind(match2[1], user.id).first();
      if (detail)
        return `\u{1F4E6} \u5DE5\u5355 #${detail.id}
\u9080\u8BF7\u7801: ${detail.invite_code}
\u91D1\u989D: \xA5${detail.price}
\u652F\u4ED8: ${detail.payment_method === "wechat" ? "\u5FAE\u4FE1" : "\u7075\u77F3"}
\u72B6\u6001: ${detail.status}
\u4F18\u60E0: ${detail.discount}%
\u9884\u8BA1\u5B8C\u6210: ${detail.est_complete_date || "\u5BA1\u6838\u4E2D"}
\u521B\u5EFA: ${detail.created_at}`;
      return "\u672A\u627E\u5230\u8BE5\u5DE5\u5355";
    }
  }
  if (q.includes("\u591A\u4E45") || q.includes("\u5230\u8D26") || q.includes("\u65F6\u95F4") || q.includes("\u7B49\u5F85")) {
    return "\u23F1 \u5DE5\u5355\u5BA1\u6838\u901A\u8FC7\u540E\uFF0C\u9884\u8BA1 5 \u5929\u5185\u5B8C\u6210\u8D26\u53F7\u6CE8\u518C\u548C\u5347\u7EA7\u3002\u5982\u679C\u8D85\u8FC7\u65F6\u95F4\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458\u3002";
  }
  if (q.includes("\u4EF7\u683C") || q.includes("\u591A\u5C11\u94B1") || q.includes("\u79EF\u5206") || q.includes("\u6536\u8D39")) {
    return "\u{1F4B0} \u4EF7\u683C\u8BF4\u660E\uFF1A\n\u25B8 \u5FAE\u4FE1\u652F\u4ED8\uFF1A1\u5143 = 120\u9080\u8BF7\u79EF\u5206\n\u25B8 \u7075\u77F3\u652F\u4ED8\uFF1A100\u4E07\u7075\u77F3 = 10\u9080\u8BF7\u79EF\u5206\n\u25B8 \u7B49\u7EA7\u6298\u6263\uFF1A\u6700\u9AD8Lv.10 \u4EAB70%\u4F18\u60E0\n\u25B8 \u4F18\u60E0\u7801\u53EF\u53E0\u52A0\u4F7F\u7528\n\n\u{1F4A1} \u7B49\u7EA7\u8D8A\u9AD8\u8D8A\u4F18\u60E0\uFF0C\u5FEB\u53BB\u5B8C\u6210\u5DE5\u5355\u63D0\u5347\u7B49\u7EA7\u5427\uFF01";
  }
  if (q.includes("\u4F18\u60E0") || q.includes("\u6298\u6263") || q.includes("\u7B49\u7EA7") || q.includes("\u4F1A\u5458")) {
    return "\u{1F4CA} \u7528\u6237\u7B49\u7EA7\u6743\u76CA\uFF1A\nLv.1 \u57FA\u7840\u4EF7\u683C\nLv.2 \u89E3\u9501\u9080\u8BF7\u7CFB\u7EDF\nLv.3 \u4EAB10%\u4F18\u60E0\nLv.4 \u4EAB20%\u4F18\u60E0\nLv.5 \u4EAB30%\u4F18\u60E0\nLv.6 \u4EAB40%\u4F18\u60E0\nLv.7 \u4EAB45%\u4F18\u60E0\nLv.8 \u4EAB50%\u4F18\u60E0\nLv.9 \u4EAB60%\u4F18\u60E0\nLv.10 \u4EAB70%\u4F18\u60E0\n\n\u60A8\u5F53\u524D\u7B49\u7EA7: Lv." + (user.level || 1) + "\n\u6BCF\u5B8C\u6210\u4E00\u5355\u63D0\u5347\u4E00\u7EA7\uFF01";
  }
  if (q.includes("\u9080\u8BF7") || q.includes("\u5206\u6210") || q.includes("\u4F63\u91D1") || q.includes("\u63A8\u5E7F")) {
    return "\u{1F91D} \u9080\u8BF7\u7CFB\u7EDF\uFF1A\n\u25B8 \u5728\u9080\u8BF7\u9875\u9762\u751F\u6210\u4F60\u7684\u4E13\u5C5E\u9080\u8BF7\u7801\n\u25B8 \u5206\u4EAB\u7ED9\u597D\u53CB\u6CE8\u518C\u65F6\u586B\u5199\n\u25B8 \u597D\u53CB\u8BA2\u5355\u5BA1\u6838\u901A\u8FC7\u540E\uFF0C\u4F60\u83B7\u5F97\u8BA2\u5355\u91D1\u989D30%\u9080\u8BF7\u79EF\u5206\n\u25B8 \u9080\u8BF7\u79EF\u5206\u53EF\u63D0\u73B0\u6216\u6D88\u8D39\n\n\u60A8\u7684\u9080\u8BF7\u7801: " + (user.invite_code || "\u524D\u5F80\u63A7\u5236\u53F0\u67E5\u770B") + "\n\u79EF\u5206\u4F59\u989D: " + (user.invite_points || 0).toFixed(1);
  }
  if (q.includes("\u8D26\u53F7") || q.includes("\u6E38\u620F") || q.includes("\u89D2\u8272")) {
    const accCount = await env.DB.prepare("SELECT COUNT(*) as cnt FROM game_accounts ga JOIN orders o ON ga.order_id = o.id WHERE o.user_id = ?").bind(user.id).first();
    if (accCount.cnt > 0)
      return "\u60A8\u5171\u6709 " + accCount.cnt + " \u4E2A\u6E38\u620F\u8D26\u53F7\u3002\u524D\u5F80\u300C\u8D26\u53F7\u5217\u8868\u300D\u67E5\u770B\u8BE6\u7EC6\u7B49\u7EA7\u3001\u88C5\u5907\u548C\u5730\u56FE\u4FE1\u606F\u3002";
    return "\u60A8\u8FD8\u6CA1\u6709\u6E38\u620F\u8D26\u53F7\uFF0C\u63D0\u4EA4\u5DE5\u5355\u5BA1\u6838\u901A\u8FC7\u540E\u4F1A\u81EA\u52A8\u521B\u5EFA\u3002";
  }
  if (q.includes("\u552E\u540E") || q.includes("\u7533\u8BC9") || q.includes("\u9000\u6B3E") || q.includes("\u6295\u8BC9")) {
    return "\u5982\u9700\u552E\u540E\u6216\u7533\u8BC9\uFF1A\n1. \u5728\u63A7\u5236\u53F0\u300C\u7533\u8BC9\u552E\u540E\u300D\u9875\u9762\u63D0\u4EA4\u7533\u8BC9\n2. \u586B\u5199\u76F8\u5173\u5DE5\u5355\u7F16\u53F7\u548C\u95EE\u9898\u63CF\u8FF0\n3. \u7BA1\u7406\u5458\u4F1A\u572824\u5C0F\u65F6\u5185\u56DE\u590D\n\n\u7D27\u6025\u60C5\u51B5\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458\u76F4\u63A5\u5904\u7406\u3002";
  }
  if (q.includes("\u4F60\u597D") || q.includes("\u55E8") || q.includes("\u5728\u5417") || q.includes("hello")) {
    return "\u4F60\u597D " + (user.username || "\u9053\u53CB") + '\uFF01\u6211\u662F\u827E\u5FB7\u5C14\u5DE5\u5355\u52A9\u624B \u{1F916}\n\u4F60\u53EF\u4EE5\u95EE\u6211\uFF1A\n\u25B8 "\u6211\u7684\u8BA2\u5355\u72B6\u6001" - \u67E5\u770B\u5DE5\u5355\n\u25B8 "\u4EF7\u683C\u8BF4\u660E" - \u4E86\u89E3\u6536\u8D39\n\u25B8 "\u4F18\u60E0\u6298\u6263" - \u67E5\u770B\u7B49\u7EA7\u4F18\u60E0\n\u25B8 "\u9080\u8BF7\u5206\u6210" - \u9080\u8BF7\u597D\u53CB\u8D5A\u94B1\n\u25B8 "\u9884\u8BA1\u591A\u4E45" - \u5230\u8D26\u65F6\u95F4\n\u25B8 "\u600E\u4E48\u7533\u8BC9" - \u552E\u540E\u6D41\u7A0B\n\u25B8 "\u8BA2\u5355 #1" - \u67E5\u770B\u8BA2\u5355\u8BE6\u60C5';
  }
  if (q.includes("\u5E2E\u52A9") || q.includes("\u529F\u80FD") || q.includes("\u80FD\u505A\u4EC0\u4E48")) {
    return "\u{1F916} \u6211\u53EF\u4EE5\u56DE\u7B54\u8FD9\u4E9B\u95EE\u9898\uFF1A\n1. \u67E5\u770B\u5DE5\u5355\u72B6\u6001\n2. \u67E5\u8BE2\u4EF7\u683C\u548C\u79EF\u5206\n3. \u4E86\u89E3\u7B49\u7EA7\u6298\u6263\n4. \u9080\u8BF7\u5206\u6210\u8BF4\u660E\n5. \u9884\u8BA1\u5230\u8D26\u65F6\u95F4\n6. \u552E\u540E\u7533\u8BC9\u6D41\u7A0B\n7. \u67E5\u770B\u6E38\u620F\u8D26\u53F7\u4FE1\u606F\n\n\u76F4\u63A5\u8F93\u5165\u95EE\u9898\u5373\u53EF~";
  }
  const orderCount = orderInfo.results.length;
  const pendingOrders = orderInfo.results.filter((o) => o.status === "pending").length;
  return "\u62B1\u6B49\uFF0C\u4E0D\u592A\u7406\u89E3\u60A8\u7684\u95EE\u9898 \u{1F914}\n\n\u60A8\u6709 " + orderCount + " \u4E2A\u5DE5\u5355\uFF0C\u5176\u4E2D " + pendingOrders + ' \u4E2A\u5F85\u5BA1\u6838\u3002\n\n\u8BD5\u8BD5\u95EE\uFF1A\n- "\u6211\u7684\u8BA2\u5355\u72B6\u6001"\n- "\u4EF7\u683C\u8BF4\u660E"\n- "\u4F18\u60E0\u6298\u6263"\n- "\u9080\u8BF7\u5206\u6210"\n- "\u9884\u8BA1\u591A\u4E45\u5230\u8D26"';
}
__name(getBotAnswer, "getBotAnswer");
__name2(getBotAnswer, "getBotAnswer");
async function onRequest31(context) {
  const { request, env } = context;
  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const { code } = body;
    if (!code)
      return json({ error: "\u8BF7\u8F93\u5165\u4F18\u60E0\u7801" }, 400);
    const coupon = await env.DB.prepare(
      "SELECT * FROM coupons WHERE code = ? AND (expires_at IS NULL OR expires_at > datetime('now'))"
    ).bind(code).first();
    if (!coupon)
      return json({ error: "\u4F18\u60E0\u7801\u65E0\u6548\u6216\u5DF2\u8FC7\u671F" }, 404);
    if (coupon.used_count >= coupon.max_uses)
      return json({ error: "\u4F18\u60E0\u7801\u5DF2\u7528\u5B8C" }, 400);
    return json({ ok: true, discount_percent: coupon.discount_percent, min_amount: coupon.min_amount });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest31, "onRequest31");
__name2(onRequest31, "onRequest");
async function onRequest32(context) {
  const { request, env } = context;
  if (request.method === "GET") {
    if (!authenticateApi(request, env))
      return json({ error: "\u65E0\u6548API\u5BC6\u94A5" }, 403);
    const accounts = await env.DB.prepare(
      "SELECT ga.*, o.user_id, o.invite_code FROM game_accounts ga JOIN orders o ON ga.order_id = o.id WHERE ga.status IN ('farming', 'active', 'registering') AND (ga.stop_monitor_at IS NULL OR ga.stop_monitor_at > datetime('now')) LIMIT 200"
    ).all();
    return json({ ok: true, accounts: accounts.results });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest32, "onRequest32");
__name2(onRequest32, "onRequest");
async function onRequest33(context) {
  const { request, env } = context;
  if (request.method === "GET") {
    if (!authenticateApi(request, env))
      return json({ error: "\u65E0\u6548API\u5BC6\u94A5" }, 403);
    const orders = await env.DB.prepare(
      "SELECT o.*, u.username as user_name FROM orders o JOIN users u ON o.user_id = u.id WHERE o.status = 'approved' ORDER BY o.id ASC"
    ).all();
    return json({ ok: true, orders: orders.results });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest33, "onRequest33");
__name2(onRequest33, "onRequest");
async function onRequest34(context) {
  const { request, env } = context;
  if (request.method === "POST") {
    if (!authenticateApi(request, env))
      return json({ error: "\u65E0\u6548API\u5BC6\u94A5" }, 403);
    const body = await request.json().catch(() => ({}));
    const { order_id } = body;
    const pending = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM game_accounts WHERE order_id = ? AND status NOT IN ('completed', 'failed')"
    ).bind(order_id).first();
    if (pending.cnt === 0) {
      const order = await env.DB.prepare("SELECT user_id FROM orders WHERE id = ?").bind(order_id).first();
      await env.DB.prepare(
        "UPDATE orders SET status = 'completed', completed_at = datetime('now') WHERE id = ?"
      ).bind(order_id).run();
      if (order) {
        await env.DB.prepare(
          "INSERT INTO notifications (user_id, title, content, type) VALUES (?, '\u5DE5\u5355\u5DF2\u5B8C\u6210', '\u5DE5\u5355 #' || ? || ' \u5DF2\u5168\u90E8\u5B8C\u6210\uFF0C\u8D26\u53F7\u5DF2\u5230\u8FBE120\u7EA7', 'order')"
        ).bind(order.user_id, order_id).run();
        await logActivity(env, order_id, order.user_id, "completed", "\u6240\u6709\u8D26\u53F7\u5DF2\u5230120\u7EA7\uFF0C\u5DE5\u5355\u81EA\u52A8\u5B8C\u6210");
      }
      return json({ ok: true, message: "\u8BA2\u5355\u5DF2\u5B8C\u6210" });
    }
    return json({ ok: true, message: "\u4ECD\u6709\u8D26\u53F7\u672A\u5B8C\u6210", pending: pending.cnt });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest34, "onRequest34");
__name2(onRequest34, "onRequest");
async function onRequest35(context) {
  const { request, env } = context;
  if (request.method === "POST") {
    if (!authenticateApi(request, env))
      return json({ error: "\u65E0\u6548API\u5BC6\u94A5" }, 403);
    const body = await request.json().catch(() => ({}));
    const { order_id, username, password, status, level, map_id, map_name, skills, techniques, equipment, error_msg, server_username, server_password } = body;
    if (status === "creating") {
      const existing = await env.DB.prepare(
        "SELECT id FROM game_accounts WHERE username = ? AND order_id = ?"
      ).bind(username, order_id).first();
      if (!existing) {
        await env.DB.prepare(
          "INSERT INTO game_accounts (order_id, username, password, server_username, server_password, status, created_at) VALUES (?, ?, ?, ?, ?, 'registering', datetime('now'))"
        ).bind(order_id, username, password, server_username || "", server_password || "").run();
        const ord = await env.DB.prepare("SELECT user_id FROM orders WHERE id = ?").bind(order_id).first();
        await logActivity(env, order_id, ord?.user_id || 0, "account_created", "\u521B\u5EFA\u8D26\u53F7: " + username);
      }
    } else if (status === "farming" || status === "active") {
      await env.DB.prepare(
        "UPDATE game_accounts SET status = ?, level = ?, map_id = ?, map_name = ?, skills = ?, techniques = ?, equipment = ?, is_farming = 1, last_check_at = datetime('now'), health_status = 'ok' WHERE username = ? AND order_id = ?"
      ).bind(status, level || 0, map_id || 0, map_name || "", JSON.stringify(skills || []), JSON.stringify(techniques || []), JSON.stringify(equipment || []), username, order_id).run();
    } else if (status === "completed") {
      await env.DB.prepare(
        "UPDATE game_accounts SET status = ?, level = ?, reached_120_at = datetime('now'), stop_monitor_at = datetime('now', '+2 days'), last_check_at = datetime('now'), health_status = 'completed' WHERE username = ? AND order_id = ?"
      ).bind(status, level || 0, username, order_id).run();
    } else if (status === "error" || status === "failed") {
      await env.DB.prepare(
        "UPDATE game_accounts SET status = ?, level = ?, error_msg = ?, last_check_at = datetime('now'), health_status = 'error' WHERE username = ? AND order_id = ?"
      ).bind(status, level || 0, error_msg || "", username, order_id).run();
    } else {
      await env.DB.prepare(
        "UPDATE game_accounts SET status = ?, level = ?, last_check_at = datetime('now') WHERE username = ? AND order_id = ?"
      ).bind(status, level || 0, username, order_id).run();
    }
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest35, "onRequest35");
__name2(onRequest35, "onRequest");
async function onRequest36(context) {
  const { request, env } = context;
  if (request.method === "POST") {
    if (!authenticateApi(request, env))
      return json({ error: "\u65E0\u6548API\u5BC6\u94A5" }, 403);
    const body = await request.json().catch(() => ({}));
    const { order_id, username, level, status, map_id, map_name, error_msg } = body;
    const isCompleted = level >= 120;
    const reportStatus = isCompleted ? "completed" : status || "farming";
    await env.DB.prepare(
      "UPDATE game_accounts SET status = ?, level = ?, map_id = ?, map_name = ?, last_check_at = datetime('now'), error_msg = ?, reached_120_at = CASE WHEN ? >= 120 THEN datetime('now') ELSE reached_120_at END, stop_monitor_at = CASE WHEN ? >= 120 THEN datetime('now', '+2 days') ELSE stop_monitor_at END WHERE username = ? AND order_id = ?"
    ).bind(reportStatus, level || 0, map_id || 0, map_name || "", error_msg || "", level || 0, level || 0, username, order_id).run();
    return json({ ok: true, completed: isCompleted });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest36, "onRequest36");
__name2(onRequest36, "onRequest");
async function onRequest37(context) {
  const { request, env } = context;
  if (request.method === "POST") {
    if (!authenticateApi(request, env))
      return json({ error: "\u65E0\u6548API\u5BC6\u94A5" }, 403);
    const body = await request.json().catch(() => ({}));
    const { account_id, order_id, log_type, message, raw_output } = body;
    await env.DB.prepare(
      "INSERT INTO account_logs (account_id, order_id, log_type, message, raw_output) VALUES (?, ?, ?, ?, ?)"
    ).bind(account_id || 0, order_id || 0, log_type || "info", message || "", raw_output || "").run();
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest37, "onRequest37");
__name2(onRequest37, "onRequest");
async function onRequest38(context) {
  const { request, env } = context;
  if (request.method === "GET") {
    const user = await authenticate(request, env);
    if (!user)
      return json({ error: "\u672A\u767B\u5F55" }, 401);
    const totalInvited = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM users WHERE invited_by = ?"
    ).bind(user.id).first();
    const inviteOrders = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM orders o JOIN users u ON o.user_id = u.id WHERE u.invited_by = ? AND o.status = 'approved'"
    ).bind(user.id).first();
    const inviteEarnings = await env.DB.prepare(
      "SELECT COALESCE(SUM(o.bonus_points), 0) as total FROM orders o JOIN users u ON o.user_id = u.id WHERE u.invited_by = ? AND o.status = 'approved'"
    ).bind(user.id).first();
    const totalPurchased = user.total_purchased_points || 0;
    const boost = getInviteBoost(totalPurchased);
    const nextTier = INVITE_BOOST_TIERS.find((t) => t.mult > boost.mult);
    return json({
      ok: true,
      invite_code: user.invite_code,
      total_invited: totalInvited.cnt,
      invite_orders: inviteOrders.cnt,
      invite_points: user.invite_points,
      invite_earnings: inviteEarnings.total,
      commission_rate: boost.rate,
      base_rate: 30,
      boost_mult: boost.mult,
      boost_label: boost.label,
      total_purchased_points: totalPurchased,
      next_tier: nextTier ? { label: nextTier.label, need: nextTier.min - totalPurchased, rate: nextTier.rate } : null,
      packages: INVITE_PACKAGES
    });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest38, "onRequest38");
__name2(onRequest38, "onRequest");
async function onRequest39(context) {
  const { request } = context;
  if (request.method === "GET") {
    return json({ ok: true, packages: INVITE_PACKAGES });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest39, "onRequest39");
__name2(onRequest39, "onRequest");
async function onRequest40(context) {
  const { request, env } = context;
  if (request.method === "POST") {
    const user = await authenticate(request, env);
    if (!user)
      return json({ error: "\u672A\u767B\u5F55" }, 401);
    const body = await request.json().catch(() => ({}));
    const { package_id, payment_method, payment_account } = body;
    if (!package_id || !payment_method || !payment_account)
      return json({ error: "\u8BF7\u586B\u5199\u5B8C\u6574\u4FE1\u606F" }, 400);
    const pkg = INVITE_PACKAGES.find((p) => p.id === package_id);
    if (!pkg)
      return json({ error: "\u65E0\u6548\u5957\u9910" }, 400);
    if (!["wechat", "spirit_stone"].includes(payment_method))
      return json({ error: "\u65E0\u6548\u652F\u4ED8\u65B9\u5F0F" }, 400);
    const price = payment_method === "wechat" ? pkg.price : pkg.price * 1e6;
    const bonusPoints = payment_method === "wechat" ? pkg.points : Math.floor(pkg.points / 12);
    const result = await env.DB.prepare(
      "INSERT INTO orders (user_id, invite_code, payment_method, payment_account, amount, price, bonus_points, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))"
    ).bind(user.id, "PKG:" + package_id + ":" + pkg.name, payment_method, payment_account, pkg.price, price, bonusPoints).run();
    await env.DB.prepare(
      "INSERT INTO notifications (user_id, title, content, type) VALUES (?, '\u5957\u9910\u8D2D\u4E70\u5DF2\u63D0\u4EA4', '\u9080\u8BF7\u79EF\u5206\u5957\u9910\u300C' || ? || '\u300D\u8D2D\u4E70\u8BA2\u5355\u5DF2\u63D0\u4EA4\uFF0C\u7B49\u5F85\u7BA1\u7406\u5458\u5BA1\u6838', 'order')"
    ).bind(user.id, pkg.name).run();
    return json({ ok: true, message: "\u8D2D\u4E70\u7533\u8BF7\u5DF2\u63D0\u4EA4\uFF0C\u7B49\u5F85\u7BA1\u7406\u5458\u5BA1\u6838", order_id: result.meta.last_row_id });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest40, "onRequest40");
__name2(onRequest40, "onRequest");
async function onRequest41(context) {
  const { request, env } = context;
  if (request.method === "POST") {
    const user = await authenticate(request, env);
    if (!user)
      return json({ error: "\u672A\u767B\u5F55" }, 401);
    const body = await request.json().catch(() => ({}));
    const { points } = body;
    if (!points || points < 10)
      return json({ error: "\u6700\u5C11\u63D0\u73B010\u79EF\u5206" }, 400);
    if ((user.invite_points || 0) < points)
      return json({ error: "\u79EF\u5206\u4E0D\u8DB3" }, 400);
    await env.DB.prepare(
      "UPDATE users SET invite_points = invite_points - ? WHERE id = ?"
    ).bind(points, user.id).run();
    return json({ ok: true, message: "\u63D0\u73B0\u7533\u8BF7\u5DF2\u63D0\u4EA4\uFF0C\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458\u5904\u7406" });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest41, "onRequest41");
__name2(onRequest41, "onRequest");
async function onRequest42(context) {
  const { request, env } = context;
  if (request.method === "GET") {
    const users = await env.DB.prepare(
      "SELECT id, username, display_name, avatar_url, level, total_invited, xp, total_spent, bio FROM users WHERE total_invited > 0 ORDER BY total_invited DESC LIMIT 50"
    ).all();
    return json({ ok: true, leaderboard: users.results });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest42, "onRequest42");
__name2(onRequest42, "onRequest");
async function onRequest43(context) {
  const { request, env } = context;
  if (request.method === "GET") {
    const users = await env.DB.prepare(
      "SELECT id, username, display_name, avatar_url, level, xp, total_orders, bio FROM users ORDER BY xp DESC LIMIT 50"
    ).all();
    return json({ ok: true, leaderboard: users.results });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest43, "onRequest43");
__name2(onRequest43, "onRequest");
async function onRequest44(context) {
  const { request, env } = context;
  if (request.method === "GET") {
    const users = await env.DB.prepare(
      "SELECT id, username, display_name, avatar_url, level, total_orders, total_spent, total_invited, xp, bio FROM users WHERE total_spent > 0 ORDER BY total_spent DESC LIMIT 50"
    ).all();
    return json({ ok: true, leaderboard: users.results });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest44, "onRequest44");
__name2(onRequest44, "onRequest");
async function onRequest45(context) {
  const { request, env } = context;
  if (request.method === "POST") {
    const user = await authenticate(request, env);
    if (!user)
      return json({ error: "\u672A\u767B\u5F55" }, 401);
    const body = await request.json().catch(() => ({}));
    const { id } = body;
    if (id) {
      await env.DB.prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?").bind(id, user.id).run();
    } else {
      await env.DB.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").bind(user.id).run();
    }
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest45, "onRequest45");
__name2(onRequest45, "onRequest");
async function onRequest46(context) {
  const { request, env } = context;
  if (request.method === "GET") {
    const configs = await env.DB.prepare("SELECT key, value FROM config").all();
    const cfg = {};
    for (const c of configs.results)
      cfg[c.key] = c.value;
    const ann = await env.DB.prepare("SELECT * FROM announcements WHERE enabled = 1 ORDER BY created_at DESC LIMIT 1").first();
    const adsData = { popup: null, sidebar: null };
    const popupAd = await env.DB.prepare("SELECT * FROM ads WHERE type = 'popup' AND enabled = 1 ORDER BY created_at DESC LIMIT 1").first();
    const sidebarAd = await env.DB.prepare("SELECT * FROM ads WHERE type = 'sidebar' AND enabled = 1 ORDER BY created_at DESC LIMIT 1").first();
    if (popupAd)
      adsData.popup = popupAd;
    if (sidebarAd)
      adsData.sidebar = sidebarAd;
    return json({ ok: true, config: cfg, announcement: ann || null, ads: adsData });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest46, "onRequest46");
__name2(onRequest46, "onRequest");
async function onRequest47(context) {
  const { request, env } = context;
  if (request.method === "POST") {
    const user = await authenticate(request, env);
    if (!user)
      return json({ error: "\u672A\u767B\u5F55" }, 401);
    const body = await request.json().catch(() => ({}));
    const { old_password, new_password } = body;
    if (!old_password || !new_password)
      return json({ error: "\u8BF7\u586B\u5199\u65E7\u5BC6\u7801\u548C\u65B0\u5BC6\u7801" }, 400);
    if (new_password.length < 6)
      return json({ error: "\u65B0\u5BC6\u7801\u81F3\u5C116\u4F4D" }, 400);
    if (new_password.length > 64)
      return json({ error: "\u65B0\u5BC6\u7801\u8FC7\u957F" }, 400);
    const current = await env.DB.prepare(
      "SELECT password_hash FROM users WHERE id = ?"
    ).bind(user.id).first();
    if (!current)
      return json({ error: "\u7528\u6237\u4E0D\u5B58\u5728" }, 404);
    const valid = await verifyPassword(old_password, current.password_hash);
    if (!valid)
      return json({ error: "\u65E7\u5BC6\u7801\u9519\u8BEF" }, 400);
    const newHash = await hashPassword(new_password);
    await env.DB.prepare(
      "UPDATE users SET password_hash = ? WHERE id = ?"
    ).bind(newHash, user.id).run();
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id).run();
    return json({ ok: true, message: "\u5BC6\u7801\u4FEE\u6539\u6210\u529F\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55" });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest47, "onRequest47");
__name2(onRequest47, "onRequest");
async function onRequest48(context) {
  const { request, env } = context;
  if (request.method === "GET") {
    const user = await authenticate(request, env);
    if (!user)
      return json({ error: "\u672A\u767B\u5F55" }, 401);
    const totalInvited = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM users WHERE invited_by = ?"
    ).bind(user.id).first();
    const nextXP = XP_LEVELS[Math.min(user.level + 1, XP_LEVELS.length - 1)] || 0;
    return json({ ok: true, user: { ...user, total_invited: totalInvited.cnt, xp_next: nextXP, password_hash: void 0 } });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest48, "onRequest48");
__name2(onRequest48, "onRequest");
async function onRequest49(context) {
  const { request, env } = context;
  if (request.method === "PUT") {
    const user = await authenticate(request, env);
    if (!user)
      return json({ error: "\u672A\u767B\u5F55" }, 401);
    const body = await request.json().catch(() => ({}));
    const { email, avatar_url, display_name, bio } = body;
    if (email !== void 0) {
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return json({ error: "\u90AE\u7BB1\u683C\u5F0F\u4E0D\u6B63\u786E" }, 400);
      await env.DB.prepare("UPDATE users SET email = ? WHERE id = ?").bind(email || "", user.id).run();
    }
    if (avatar_url !== void 0) {
      if (avatar_url.length > 500)
        return json({ error: "\u5934\u50CFURL\u8FC7\u957F" }, 400);
      await env.DB.prepare("UPDATE users SET avatar_url = ? WHERE id = ?").bind(avatar_url, user.id).run();
    }
    if (display_name !== void 0) {
      if (display_name.length > 30)
        return json({ error: "\u663E\u793A\u540D\u8FC7\u957F" }, 400);
      await env.DB.prepare("UPDATE users SET display_name = ? WHERE id = ?").bind(display_name, user.id).run();
    }
    if (bio !== void 0) {
      if (bio.length > 200)
        return json({ error: "\u7B80\u4ECB\u8FC7\u957F" }, 400);
      await env.DB.prepare("UPDATE users SET bio = ? WHERE id = ?").bind(bio, user.id).run();
    }
    return json({ ok: true, message: "\u8D44\u6599\u5DF2\u66F4\u65B0" });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest49, "onRequest49");
__name2(onRequest49, "onRequest");
async function onRequest50(context) {
  const { request, env, params } = context;
  if (request.method === "GET") {
    const user = await authenticate(request, env);
    if (!user)
      return json({ error: "\u672A\u767B\u5F55" }, 401);
    const account = await env.DB.prepare(
      "SELECT ga.*, o.status as order_status, o.user_id as order_user_id FROM game_accounts ga JOIN orders o ON ga.order_id = o.id WHERE ga.id = ?"
    ).bind(parseInt(params.id)).first();
    if (!account)
      return json({ error: "\u8D26\u53F7\u4E0D\u5B58\u5728" }, 404);
    if (account.order_user_id !== user.id && !user.is_admin)
      return json({ error: "\u65E0\u6743\u9650" }, 403);
    return json({ ok: true, account });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest50, "onRequest50");
__name2(onRequest50, "onRequest");
async function onRequest51(context) {
  const { request, env, params } = context;
  if (request.method !== "GET")
    return json({ error: "Method not allowed" }, 405);
  const user = await authenticate(request, env);
  if (!user)
    return json({ error: "\u672A\u767B\u5F55" }, 401);
  const orderId = parseInt(params.id);
  if (isNaN(orderId))
    return json({ error: "\u65E0\u6548\u5DE5\u5355ID" }, 400);
  const order = await env.DB.prepare(
    "SELECT o.*, (SELECT COUNT(*) FROM game_accounts WHERE order_id = o.id) as account_count FROM orders o WHERE o.id = ? AND (o.user_id = ? OR ? = 1)"
  ).bind(orderId, user.id, user.is_admin || 0).first();
  if (!order)
    return json({ error: "\u5DE5\u5355\u4E0D\u5B58\u5728" }, 404);
  const accounts = await env.DB.prepare(
    "SELECT * FROM game_accounts WHERE order_id = ? ORDER BY id ASC"
  ).bind(order.id).all();
  return json({ ok: true, order, accounts: accounts.results });
}
__name(onRequest51, "onRequest51");
__name2(onRequest51, "onRequest");
async function onRequest52(context) {
  const { request, env } = context;
  if (request.method === "GET") {
    const user = await authenticate(request, env);
    if (!user)
      return json({ error: "\u672A\u767B\u5F55" }, 401);
    const url = new URL(request.url);
    const orderId = url.searchParams.get("order_id") || "";
    let query = "SELECT ga.*, o.status as order_status, o.invite_code FROM game_accounts ga JOIN orders o ON ga.order_id = o.id WHERE o.user_id = ?";
    const params = [user.id];
    if (orderId) {
      query += " AND ga.order_id = ?";
      params.push(orderId);
    }
    const accounts = await env.DB.prepare(query + " ORDER BY ga.id DESC").bind(...params).all();
    return json({ ok: true, accounts: accounts.results });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest52, "onRequest52");
__name2(onRequest52, "onRequest");
async function onRequest53(context) {
  const { request, env } = context;
  if (request.method === "GET") {
    const user = await authenticate(request, env);
    if (!user)
      return json({ error: "\u672A\u767B\u5F55" }, 401);
    const items = await env.DB.prepare(
      "SELECT a.*, o.invite_code as order_invite_code FROM appeals a LEFT JOIN orders o ON a.order_id = o.id WHERE a.user_id = ? AND a.type IN ('after_sales','appeal') ORDER BY a.created_at DESC"
    ).bind(user.id).all();
    return json({ ok: true, items: items.results });
  }
  if (request.method === "POST") {
    const user = await authenticate(request, env);
    if (!user)
      return json({ error: "\u672A\u767B\u5F55" }, 401);
    const body = await request.json().catch(() => ({}));
    const { order_id, title, content } = body;
    if (!title || !content)
      return json({ error: "\u8BF7\u586B\u5199\u6807\u9898\u548C\u5185\u5BB9" }, 400);
    if (!order_id)
      return json({ error: "\u8BF7\u9009\u62E9\u76F8\u5173\u5DE5\u5355" }, 400);
    await env.DB.prepare(
      "INSERT INTO appeals (user_id, order_id, title, content, type, status, created_at) VALUES (?, ?, ?, ?, 'after_sales', 'pending', datetime('now'))"
    ).bind(user.id, order_id, title, content).run();
    return json({ ok: true, message: "\u552E\u540E\u8BF7\u6C42\u5DF2\u63D0\u4EA4\uFF0C\u7B49\u5F85\u7BA1\u7406\u5458\u56DE\u590D" });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest53, "onRequest53");
__name2(onRequest53, "onRequest");
async function onRequest54(context) {
  const { request, env } = context;
  if (request.method === "GET") {
    const user = await authenticate(request, env);
    if (!user)
      return json({ error: "\u672A\u767B\u5F55" }, 401);
    const appeals = await env.DB.prepare(
      "SELECT * FROM appeals WHERE user_id = ? ORDER BY created_at DESC"
    ).bind(user.id).all();
    return json({ ok: true, appeals: appeals.results });
  }
  if (request.method === "POST") {
    const user = await authenticate(request, env);
    if (!user)
      return json({ error: "\u672A\u767B\u5F55" }, 401);
    const body = await request.json().catch(() => ({}));
    const { order_id, title, content, type } = body;
    if (!title || !content)
      return json({ error: "\u8BF7\u586B\u5199\u6807\u9898\u548C\u5185\u5BB9" }, 400);
    await env.DB.prepare(
      "INSERT INTO appeals (user_id, order_id, title, content, type, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))"
    ).bind(user.id, order_id || 0, title, content, type || "appeal").run();
    return json({ ok: true, message: "\u7533\u8BC9\u5DF2\u63D0\u4EA4" });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest54, "onRequest54");
__name2(onRequest54, "onRequest");
async function onRequest55(context) {
  const { request, env } = context;
  if (request.method === "GET") {
    const configs = await env.DB.prepare("SELECT key, value FROM config").all();
    const cfg = {};
    for (const c of configs.results)
      cfg[c.key] = c.value;
    return json({ ok: true, config: cfg });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest55, "onRequest55");
__name2(onRequest55, "onRequest");
async function onRequest56(context) {
  const { request, env } = context;
  if (request.method === "GET") {
    const user = await authenticate(request, env);
    if (!user)
      return json({ error: "\u672A\u767B\u5F55" }, 401);
    const url = new URL(request.url);
    const type = url.searchParams.get("type") || "";
    let query = "SELECT * FROM notifications WHERE user_id = ?";
    const params = [user.id];
    if (type) {
      query += " AND type = ?";
      params.push(type);
    }
    const notifs = await env.DB.prepare(query + " ORDER BY created_at DESC LIMIT 50").bind(...params).all();
    const unreadCount = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0"
    ).bind(user.id).first();
    return json({ ok: true, notifications: notifs.results, unread: unreadCount.cnt });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest56, "onRequest56");
__name2(onRequest56, "onRequest");
async function onRequest57(context) {
  const { request, env } = context;
  if (request.method === "GET") {
    const user = await authenticate(request, env);
    if (!user)
      return json({ error: "\u672A\u767B\u5F55" }, 401);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "";
    let query = "SELECT o.*, (SELECT COUNT(*) FROM game_accounts WHERE order_id = o.id) as account_count FROM orders o WHERE o.user_id = ?";
    const params = [user.id];
    if (status) {
      query += " AND o.status = ?";
      params.push(status);
    }
    query += " ORDER BY o.created_at DESC";
    const orders = await env.DB.prepare(query).bind(...params).all();
    return json({ ok: true, orders: orders.results });
  }
  if (request.method === "POST") {
    const user = await authenticate(request, env);
    if (!user)
      return json({ error: "\u672A\u767B\u5F55" }, 401);
    const body = await request.json().catch(() => ({}));
    const { invite_code, payment_method, payment_account, amount, coupon_code, bind_account_name, bind_invite_code, game_account_count } = body;
    if (!invite_code || !payment_method || !payment_account || !amount) {
      return json({ error: "\u8BF7\u586B\u5199\u5B8C\u6574\u4FE1\u606F" }, 400);
    }
    if (!["wechat", "spirit_stone"].includes(payment_method)) {
      return json({ error: "\u65E0\u6548\u652F\u4ED8\u65B9\u5F0F" }, 400);
    }
    let price = 0;
    let bonusPoints = 0;
    if (payment_method === "wechat") {
      price = amount;
      bonusPoints = amount * 120;
    } else {
      price = amount * 1e6;
      bonusPoints = amount * 10;
    }
    let discount = 0;
    if (coupon_code) {
      const coupon = await env.DB.prepare(
        "SELECT * FROM coupons WHERE code = ? AND (expires_at IS NULL OR expires_at > datetime('now')) AND used_count < max_uses"
      ).bind(coupon_code).first();
      if (coupon) {
        discount = coupon.discount_percent;
        await env.DB.prepare(
          "UPDATE coupons SET used_count = used_count + 1 WHERE id = ?"
        ).bind(coupon.id).run();
      }
    }
    const userLevel = user.level || 1;
    const levelDiscounts = { 1: 0, 2: 0, 3: 10, 4: 20, 5: 30, 6: 40, 7: 45, 8: 50, 9: 60, 10: 70 };
    const maxDiscount = Math.max(discount, levelDiscounts[userLevel] || 0);
    const finalPrice = price * (100 - maxDiscount) / 100;
    const accCount = game_account_count || Math.max(1, Math.ceil(bonusPoints / 120));
    const estDays = parseInt((await env.DB.prepare("SELECT value FROM config WHERE key='est_delivery_days'").first())?.value || "5");
    const estDate = new Date(Date.now() + estDays * 864e5).toISOString().split("T")[0];
    const result = await env.DB.prepare(
      "INSERT INTO orders (user_id, invite_code, payment_method, payment_account, amount, price, coupon_code, discount, bonus_points, bind_account_name, bind_invite_code, status, created_at, est_complete_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), ?)"
    ).bind(user.id, invite_code, payment_method, payment_account, amount, finalPrice, coupon_code || "", maxDiscount, bonusPoints, bind_account_name || "", bind_invite_code || "", estDate).run();
    await env.DB.prepare(
      "INSERT INTO notifications (user_id, title, content, type) VALUES (?, '\u5DE5\u5355\u5DF2\u63D0\u4EA4', '\u5DE5\u5355 #' || ? || ' \u5DF2\u63D0\u4EA4\uFF0C\u7B49\u5F85\u7BA1\u7406\u5458\u5BA1\u6838\u4E2D', 'order')"
    ).bind(user.id, result.meta.last_row_id).run();
    await logActivity(env, result.meta.last_row_id, user.id, "created", "\u63D0\u4EA4\u5DE5\u5355: " + accCount + " \u4E2A\u8D26\u53F7");
    return json({ ok: true, message: "\u5DE5\u5355\u5DF2\u63D0\u4EA4\uFF0C\u7B49\u5F85\u5BA1\u6838", order_id: result.meta.last_row_id });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest57, "onRequest57");
__name2(onRequest57, "onRequest");
async function onRequest58(context) {
  const { request, env } = context;
  if (request.method === "POST") {
    const user = await authenticate(request, env);
    if (!user)
      return json({ error: "\u672A\u767B\u5F55" }, 401);
    const body = await request.json().catch(() => ({}));
    const { code } = body;
    if (!code)
      return json({ error: "\u8BF7\u8F93\u5165\u5151\u6362\u7801" }, 400);
    const clean = code.trim().toUpperCase();
    const rc = await env.DB.prepare(
      "SELECT * FROM redeem_codes WHERE code = ? AND (expires_at IS NULL OR expires_at > datetime('now')) AND (max_uses = 0 OR used_count < max_uses)"
    ).bind(clean).first();
    if (!rc)
      return json({ error: "\u5151\u6362\u7801\u65E0\u6548\u6216\u5DF2\u7528\u5B8C" }, 404);
    const used = await env.DB.prepare("SELECT id FROM redeem_log WHERE user_id = ? AND code = ?").bind(user.id, clean).first();
    if (used)
      return json({ error: "\u60A8\u5DF2\u4F7F\u7528\u8FC7\u6B64\u5151\u6362\u7801" }, 400);
    await env.DB.prepare("UPDATE redeem_codes SET used_count = used_count + 1 WHERE id = ?").bind(rc.id).run();
    await env.DB.prepare("INSERT INTO redeem_log (user_id, code, xp) VALUES (?, ?, ?)").bind(user.id, clean, rc.xp).run();
    await addXP(env, user.id, rc.xp, "\u4F7F\u7528\u5151\u6362\u7801 " + clean);
    return json({ ok: true, message: "\u5151\u6362\u6210\u529F\uFF0C\u83B7\u5F97 " + rc.xp + " \u7ECF\u9A8C\u503C", xp: rc.xp });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest58, "onRequest58");
__name2(onRequest58, "onRequest");
async function onRequest59(context) {
  const { request, env } = context;
  if (request.method === "GET") {
    const totalUsers = await env.DB.prepare("SELECT COUNT(*) as cnt FROM users").first();
    const totalOrders = await env.DB.prepare("SELECT COUNT(*) as cnt FROM orders").first();
    const totalApproved = await env.DB.prepare("SELECT COUNT(*) as cnt FROM orders WHERE status='approved'").first();
    const totalCompleted = await env.DB.prepare("SELECT COUNT(*) as cnt FROM orders WHERE status='completed'").first();
    const totalAccounts = await env.DB.prepare("SELECT COUNT(*) as cnt FROM game_accounts").first();
    const onlineAccounts = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM game_accounts WHERE status IN ('farming','active')"
    ).first();
    return json({
      ok: true,
      stats: {
        total_users: totalUsers.cnt,
        total_orders: totalOrders.cnt,
        approved_orders: totalApproved.cnt,
        completed_orders: totalCompleted.cnt,
        total_accounts: totalAccounts.cnt,
        online_accounts: onlineAccounts.cnt
      }
    });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(onRequest59, "onRequest59");
__name2(onRequest59, "onRequest");
function getCorsOrigin(env) {
  const allowedOrigin = env && env.CORS_ORIGIN || "";
  return allowedOrigin || "*";
}
__name(getCorsOrigin, "getCorsOrigin");
__name2(getCorsOrigin, "getCorsOrigin");
function getCorsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": getCorsOrigin(env),
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-API-Key",
    "Vary": "Origin"
  };
}
__name(getCorsHeaders, "getCorsHeaders");
__name2(getCorsHeaders, "getCorsHeaders");
var rateLimitMap = /* @__PURE__ */ new Map();
var RATE_LIMIT_MAX = 1e4;
function checkRateLimit(key, max = 60, windowSec = 60) {
  const now = Date.now();
  if (rateLimitMap.size > RATE_LIMIT_MAX)
    rateLimitMap.clear();
  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.reset > windowSec * 1e3) {
    rateLimitMap.set(key, { count: 1, reset: now });
    return true;
  }
  if (entry.count >= max)
    return false;
  entry.count++;
  return true;
}
__name(checkRateLimit, "checkRateLimit");
__name2(checkRateLimit, "checkRateLimit");
async function onRequest60(context) {
  const { request, next, env } = context;
  const corsHeaders = getCorsHeaders(env);
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) {
    const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
    const routeKey = url.pathname.split("/")[3] || "api";
    const isAuth = url.pathname.includes("/auth/");
    const max = isAuth ? 10 : 60;
    if (!checkRateLimit(ip + ":" + routeKey, max)) {
      return new Response(JSON.stringify({ error: "\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
  const response = await next();
  const newHeaders = new Headers(response.headers);
  Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}
__name(onRequest60, "onRequest60");
__name2(onRequest60, "onRequest");
var routes = [
  {
    routePath: "/api/admin/appeals/:id/reply",
    mountPath: "/api/admin/appeals/:id",
    method: "",
    middlewares: [],
    modules: [onRequest]
  },
  {
    routePath: "/api/admin/users/:id/admin",
    mountPath: "/api/admin/users/:id",
    method: "",
    middlewares: [],
    modules: [onRequest2]
  },
  {
    routePath: "/api/admin/users/:id/delete",
    mountPath: "/api/admin/users/:id",
    method: "",
    middlewares: [],
    modules: [onRequest3]
  },
  {
    routePath: "/api/admin/users/:id/level",
    mountPath: "/api/admin/users/:id",
    method: "",
    middlewares: [],
    modules: [onRequest4]
  },
  {
    routePath: "/api/admin/users/:id/lock",
    mountPath: "/api/admin/users/:id",
    method: "",
    middlewares: [],
    modules: [onRequest5]
  },
  {
    routePath: "/api/admin/users/:id/reset-password",
    mountPath: "/api/admin/users/:id",
    method: "",
    middlewares: [],
    modules: [onRequest6]
  },
  {
    routePath: "/api/admin/ads/:id",
    mountPath: "/api/admin/ads/:id",
    method: "",
    middlewares: [],
    modules: [onRequest7]
  },
  {
    routePath: "/api/admin/announcements/:id",
    mountPath: "/api/admin/announcements/:id",
    method: "",
    middlewares: [],
    modules: [onRequest8]
  },
  {
    routePath: "/api/admin/coupons/:id",
    mountPath: "/api/admin/coupons/:id",
    method: "",
    middlewares: [],
    modules: [onRequest9]
  },
  {
    routePath: "/api/accounts/:id/logs",
    mountPath: "/api/accounts/:id",
    method: "",
    middlewares: [],
    modules: [onRequest10]
  },
  {
    routePath: "/api/after-sales/:id/reply",
    mountPath: "/api/after-sales/:id",
    method: "",
    middlewares: [],
    modules: [onRequest11]
  },
  {
    routePath: "/api/orders/:id/activities",
    mountPath: "/api/orders/:id",
    method: "",
    middlewares: [],
    modules: [onRequest12]
  },
  {
    routePath: "/api/orders/:id/status",
    mountPath: "/api/orders/:id",
    method: "",
    middlewares: [],
    modules: [onRequest13]
  },
  {
    routePath: "/api/user/:id/public",
    mountPath: "/api/user/:id",
    method: "",
    middlewares: [],
    modules: [onRequest14]
  },
  {
    routePath: "/api/admin/accounts",
    mountPath: "/api/admin",
    method: "",
    middlewares: [],
    modules: [onRequest15]
  },
  {
    routePath: "/api/admin/ads",
    mountPath: "/api/admin",
    method: "",
    middlewares: [],
    modules: [onRequest16]
  },
  {
    routePath: "/api/admin/announcements",
    mountPath: "/api/admin",
    method: "",
    middlewares: [],
    modules: [onRequest17]
  },
  {
    routePath: "/api/admin/appeals",
    mountPath: "/api/admin",
    method: "",
    middlewares: [],
    modules: [onRequest18]
  },
  {
    routePath: "/api/admin/config",
    mountPath: "/api/admin",
    method: "",
    middlewares: [],
    modules: [onRequest19]
  },
  {
    routePath: "/api/admin/coupons",
    mountPath: "/api/admin",
    method: "",
    middlewares: [],
    modules: [onRequest20]
  },
  {
    routePath: "/api/admin/orders",
    mountPath: "/api/admin",
    method: "",
    middlewares: [],
    modules: [onRequest21]
  },
  {
    routePath: "/api/admin/stats",
    mountPath: "/api/admin",
    method: "",
    middlewares: [],
    modules: [onRequest22]
  },
  {
    routePath: "/api/admin/users",
    mountPath: "/api/admin",
    method: "",
    middlewares: [],
    modules: [onRequest23]
  },
  {
    routePath: "/api/ads/active",
    mountPath: "/api/ads",
    method: "",
    middlewares: [],
    modules: [onRequest24]
  },
  {
    routePath: "/api/announcements/active",
    mountPath: "/api/announcements",
    method: "",
    middlewares: [],
    modules: [onRequest25]
  },
  {
    routePath: "/api/auth/forgot-password",
    mountPath: "/api/auth",
    method: "",
    middlewares: [],
    modules: [onRequest26]
  },
  {
    routePath: "/api/auth/login",
    mountPath: "/api/auth",
    method: "",
    middlewares: [],
    modules: [onRequest27]
  },
  {
    routePath: "/api/auth/register",
    mountPath: "/api/auth",
    method: "",
    middlewares: [],
    modules: [onRequest28]
  },
  {
    routePath: "/api/auth/reset-password",
    mountPath: "/api/auth",
    method: "",
    middlewares: [],
    modules: [onRequest29]
  },
  {
    routePath: "/api/bot/ask",
    mountPath: "/api/bot",
    method: "",
    middlewares: [],
    modules: [onRequest30]
  },
  {
    routePath: "/api/coupon/validate",
    mountPath: "/api/coupon",
    method: "",
    middlewares: [],
    modules: [onRequest31]
  },
  {
    routePath: "/api/gh/active-accounts",
    mountPath: "/api/gh",
    method: "",
    middlewares: [],
    modules: [onRequest32]
  },
  {
    routePath: "/api/gh/approved-orders",
    mountPath: "/api/gh",
    method: "",
    middlewares: [],
    modules: [onRequest33]
  },
  {
    routePath: "/api/gh/complete-order",
    mountPath: "/api/gh",
    method: "",
    middlewares: [],
    modules: [onRequest34]
  },
  {
    routePath: "/api/gh/report-account",
    mountPath: "/api/gh",
    method: "",
    middlewares: [],
    modules: [onRequest35]
  },
  {
    routePath: "/api/gh/report-health",
    mountPath: "/api/gh",
    method: "",
    middlewares: [],
    modules: [onRequest36]
  },
  {
    routePath: "/api/gh/report-log",
    mountPath: "/api/gh",
    method: "",
    middlewares: [],
    modules: [onRequest37]
  },
  {
    routePath: "/api/invite/info",
    mountPath: "/api/invite",
    method: "",
    middlewares: [],
    modules: [onRequest38]
  },
  {
    routePath: "/api/invite/packages",
    mountPath: "/api/invite",
    method: "",
    middlewares: [],
    modules: [onRequest39]
  },
  {
    routePath: "/api/invite/purchase",
    mountPath: "/api/invite",
    method: "",
    middlewares: [],
    modules: [onRequest40]
  },
  {
    routePath: "/api/invite/withdraw",
    mountPath: "/api/invite",
    method: "",
    middlewares: [],
    modules: [onRequest41]
  },
  {
    routePath: "/api/leaderboard/invite",
    mountPath: "/api/leaderboard",
    method: "",
    middlewares: [],
    modules: [onRequest42]
  },
  {
    routePath: "/api/leaderboard/level",
    mountPath: "/api/leaderboard",
    method: "",
    middlewares: [],
    modules: [onRequest43]
  },
  {
    routePath: "/api/leaderboard/purchase",
    mountPath: "/api/leaderboard",
    method: "",
    middlewares: [],
    modules: [onRequest44]
  },
  {
    routePath: "/api/notifications/read",
    mountPath: "/api/notifications",
    method: "",
    middlewares: [],
    modules: [onRequest45]
  },
  {
    routePath: "/api/public/config",
    mountPath: "/api/public",
    method: "",
    middlewares: [],
    modules: [onRequest46]
  },
  {
    routePath: "/api/user/change-password",
    mountPath: "/api/user",
    method: "",
    middlewares: [],
    modules: [onRequest47]
  },
  {
    routePath: "/api/user/info",
    mountPath: "/api/user",
    method: "",
    middlewares: [],
    modules: [onRequest48]
  },
  {
    routePath: "/api/user/profile",
    mountPath: "/api/user",
    method: "",
    middlewares: [],
    modules: [onRequest49]
  },
  {
    routePath: "/api/accounts/:id",
    mountPath: "/api/accounts/:id",
    method: "",
    middlewares: [],
    modules: [onRequest50]
  },
  {
    routePath: "/api/orders/:id",
    mountPath: "/api/orders",
    method: "",
    middlewares: [],
    modules: [onRequest51]
  },
  {
    routePath: "/api/accounts",
    mountPath: "/api/accounts",
    method: "",
    middlewares: [],
    modules: [onRequest52]
  },
  {
    routePath: "/api/after-sales",
    mountPath: "/api/after-sales",
    method: "",
    middlewares: [],
    modules: [onRequest53]
  },
  {
    routePath: "/api/appeals",
    mountPath: "/api/appeals",
    method: "",
    middlewares: [],
    modules: [onRequest54]
  },
  {
    routePath: "/api/config",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest55]
  },
  {
    routePath: "/api/notifications",
    mountPath: "/api/notifications",
    method: "",
    middlewares: [],
    modules: [onRequest56]
  },
  {
    routePath: "/api/orders",
    mountPath: "/api/orders",
    method: "",
    middlewares: [],
    modules: [onRequest57]
  },
  {
    routePath: "/api/redeem",
    mountPath: "/api/redeem",
    method: "",
    middlewares: [],
    modules: [onRequest58]
  },
  {
    routePath: "/api/stats",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest59]
  },
  {
    routePath: "/",
    mountPath: "/",
    method: "",
    middlewares: [onRequest60],
    modules: []
  }
];
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
__name2(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name2(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name2(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name2(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name2(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name2(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
__name2(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
__name2(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name2(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
__name2(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
__name2(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
__name2(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
__name2(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
__name2(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
__name2(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
__name2(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");
__name2(pathToRegexp, "pathToRegexp");
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
__name2(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name2(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: () => {
            isFailOpen = true;
          }
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name2((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
var drainBody = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
__name2(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
__name2(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
__name2(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");
__name2(__facade_invoke__, "__facade_invoke__");
var __Facade_ScheduledController__ = /* @__PURE__ */ __name(class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
}, "__Facade_ScheduledController__");
__name2(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name2(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name2(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
__name2(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
__name2(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default2 = drainBody2;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError2(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError2(e.cause)
  };
}
__name(reduceError2, "reduceError");
var jsonError2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError2(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default2 = jsonError2;

// .wrangler/tmp/bundle-8gu0YB/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__2 = [
  middleware_ensure_req_body_drained_default2,
  middleware_miniflare3_json_error_default2
];
var middleware_insertion_facade_default2 = middleware_loader_entry_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__2 = [];
function __facade_register__2(...args) {
  __facade_middleware__2.push(...args.flat());
}
__name(__facade_register__2, "__facade_register__");
function __facade_invokeChain__2(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__2(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__2, "__facade_invokeChain__");
function __facade_invoke__2(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__2(request, env, ctx, dispatch, [
    ...__facade_middleware__2,
    finalMiddleware
  ]);
}
__name(__facade_invoke__2, "__facade_invoke__");

// .wrangler/tmp/bundle-8gu0YB/middleware-loader.entry.ts
var __Facade_ScheduledController__2 = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__2)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__2, "__Facade_ScheduledController__");
function wrapExportedHandler2(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__2(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__2(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler2, "wrapExportedHandler");
function wrapWorkerEntrypoint2(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__2(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__2(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint2, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY2;
if (typeof middleware_insertion_facade_default2 === "object") {
  WRAPPED_ENTRY2 = wrapExportedHandler2(middleware_insertion_facade_default2);
} else if (typeof middleware_insertion_facade_default2 === "function") {
  WRAPPED_ENTRY2 = wrapWorkerEntrypoint2(middleware_insertion_facade_default2);
}
var middleware_loader_entry_default2 = WRAPPED_ENTRY2;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__2 as __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default2 as default
};
//# sourceMappingURL=functionsWorker-0.07018426834816549.js.map
