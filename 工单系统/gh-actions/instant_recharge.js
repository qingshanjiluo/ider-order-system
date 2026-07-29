/**
 * 灵石即时充值 - 游戏内挂单支付系统
 * 
 * 流程:
 *   用户创建灵石充值单 → Worker 登录 zzhx → 上架交易所 → 
 *   用户购买 → Worker 检测邮件 → 自动通过充值
 */
const crypto = require('crypto');
const fetch = require('node-fetch');

const API_BASE = 'https://idlexiuxianzhuan.cn';
const CLIENT_VERSION = '1.2.4';
const SIGN_KEY = 'KDYJ1iHyB02LgyN1Jljb5pQkTHU1ELC6Vg6ox6FC0iX0dW9l';
const SELLER = { username: 'zzhx', password: 'Pipi20100817' };

let _reqIdx = 0;

function makeSign(method, path, timestamp, bodyStr) {
  const hmac = crypto.createHmac('sha256', SIGN_KEY);
  hmac.update(method + '\n' + path + '\n' + timestamp + '\n' + bodyStr);
  return hmac.digest('hex');
}

async function api(method, path, token, body) {
  const ts = Math.floor(Date.now() / 1000);
  const bs = body ? JSON.stringify(body) : '';
  const sign = makeSign(method, path, ts, bs);
  const headers = {
    'Content-Type': 'application/json', 'X-Client-Version': CLIENT_VERSION,
    'X-Sign-T': String(ts), 'X-Sign': sign,
    'User-Agent': 'Mozilla/5.0 Chrome/125.0.0.0',
    'X-Forwarded-For': '61.152.' + Math.floor(Math.random()*255) + '.' + Math.floor(Math.random()*255),
  };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const r = await fetch(API_BASE + path, { method, headers, body: bs || undefined });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch(e) { throw new Error('非JSON('+r.status+'): '+text.slice(0,200)); }
  if (!data || data.ok === false) throw new Error(data && data.error ? data.error : '请求失败');
  return data;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 登录游戏账号
async function gameLogin(username, password) {
  const machineId = 'web_' + Math.random().toString(36).slice(2,10);
  return api('POST', '/auth/login', null, { username, password, machine_id: machineId, client_version: CLIENT_VERSION });
}

// 获取玩家背包
async function getInventory(token) {
  const sync = await api('GET', '/player/sync', token);
  return sync.player?.inventory || [];
}

// 查找可上架的装备
function findSellableItem(inventory) {
  // 找最便宜的装备：一阶装备、白色品质
  for (const slot of inventory) {
    if (!slot || !slot.id || slot.type === 'material') continue;
    if (slot.equip_type && slot.quality <= 2) {
      return { page: 0, slot_index: inventory.indexOf(slot), item_id: slot.item_id, name: slot.name || '装备' };
    }
  }
  return null;
}

// 上架交易所
async function listOnExchange(token, item, price) {
  return api('POST', '/exchange/listings', token, {
    page: item.page, slot_index: item.slot_index,
    quantity: 1, unit_price: price, expect_item_id: item.item_id
  });
}

// 查询我的挂单
async function getMyListings(token) {
  return api('GET', '/exchange/my/listings', token);
}

// 获取邮件列表
async function getMails(token) {
  return api('GET', '/mail/list', token);
}

// 主函数：创建即时充值
async function createInstantRecharge(rechargeRecord) {
  const log = [];
  function addLog(msg) { log.push({t: new Date().toISOString(), m: msg}); console.log(msg); }

  try {
    addLog('登录卖家账号: ' + SELLER.username);
    const loginRes = await gameLogin(SELLER.username, SELLER.password);
    const token = loginRes.token;
    addLog('登录成功');

    // 获取背包找可卖装备
    const inv = await getInventory(token);
    const item = findSellableItem(inv);
    if (!item) {
      addLog('错误: 背包中无可售装备');
      return { ok: false, error: '卖家背包无可用装备', log };
    }
    addLog('找到可售装备: ' + item.name + ' (slot:' + item.slot_index + ')');

    // 计算价格：充值金额对应灵石
    const spiritPrice = rechargeRecord.amount_spirit; // 万灵石
    const pricePerUnit = spiritPrice; // 单价 = 总价（只挂1件）

    // 上架
    const listing = await listOnExchange(token, item, pricePerUnit);
    if (!listing || !listing.listing) {
      addLog('上架失败');
      return { ok: false, error: '上架失败', log };
    }
    const listingId = listing.listing.id;
    addLog('上架成功, listingId=' + listingId + ', 价格=' + pricePerUnit + '灵石');

    return { ok: true, listing_id: listingId, price: pricePerUnit, log };
  } catch(e) {
    addLog('错误: ' + e.message);
    return { ok: false, error: e.message, log };
  }
}

// 主函数：检测挂单是否售出
async function checkListingSold(rechargeRecord) {
  const log = [];
  function addLog(msg) { log.push({t: new Date().toISOString(), m: msg}); console.log(msg); }

  try {
    const loginRes = await gameLogin(SELLER.username, SELLER.password);
    const token = loginRes.token;
    addLog('登录成功，检查邮件...');

    // 检查邮件是否有 "已售出" 通知
    const mails = await getMails(token);
    const mailList = mails.mails || mails || [];
    const soldMail = mailList.find(m => 
      m.title && (m.title.includes('售出') || m.title.includes('出售') || m.content?.includes('灵石'))
    );
    if (soldMail) {
      addLog('检测到售出邮件: ' + (soldMail.title || ''));
      return { ok: true, sold: true, mail: soldMail, log };
    }
    addLog('未检测到售出邮件');
    return { ok: true, sold: false, log };
  } catch(e) {
    addLog('错误: ' + e.message);
    return { ok: false, error: e.message, log };
  }
}

module.exports = { createInstantRecharge, checkListingSold };

if (require.main === module) {
  // 测试：创建即时充值
  createInstantRecharge({ amount_spirit: 100 }).then(r => {
    console.log(JSON.stringify(r, null, 2));
    if (r.ok && r.listing_id) {
      console.log('用户在交易所搜索 listingId=' + r.listing_id + ' 并购买');
      console.log('等待检测...');
      setTimeout(async () => {
        const check = await checkListingSold(r);
        console.log(JSON.stringify(check, null, 2));
      }, 30000);
    }
  });
}
