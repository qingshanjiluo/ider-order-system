/**
 * 数据修复：清除重复 id（阶段0 P0-1 配套）
 *
 * 背景：旧 getNextId() 恒返回 1，导致 users/characters/inventory 存在重复 id。
 * 策略：
 *   1. 备份 data/game.json
 *   2. users 按 id 去重（保留首个，其余重排新 id），并经 username → user_id 重建 characters 关联
 *      （本项目惯例：character.name 与 user.username 一一对应）
 *   3. characters 按 id 去重；重复实例的新 id 通过「引用记录自带的 user_id」精确级联，
 *      无 user_id 的引用按重排队列顺序消费
 *   4. inventory 按 id 去重（独立实例，无反向引用）
 *   5. 重算 id_counters 并校验
 * 用法：node scripts/fix-duplicate-ids.js
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'game.json');

function main() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(DATA_DIR, `game.json.backup-fixids-${ts}`);
  fs.copyFileSync(DB_FILE, backup);
  console.log(`[backup] ${backup}`);

  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  const summary = [];

  // ---------- 1) users 去重 ----------
  const users = db.users || [];
  const seenUserIds = new Set();
  let maxUserId = users.reduce((m, u) => Math.max(m, Number(u.id) || 0), 0);
  const usernameToId = new Map(); // username -> 最终 user.id
  let userChanged = 0;
  const userRearged = [];
  for (const u of users) {
    const id = Number(u.id);
    if (seenUserIds.has(id)) {
      maxUserId += 1;
      u.id = maxUserId;
      userRearged.push(`${u.username}:${id}→${maxUserId}`);
      userChanged += 1;
    }
    seenUserIds.add(u.id);
    usernameToId.set(u.username, u.id);
  }
  // characters.user_id 重建关联（重复 user id 期间无法区分归属，按 username 权威映射）
  for (const c of db.characters || []) {
    if (c.user_id !== undefined && usernameToId.has(c.name)) {
      c.user_id = usernameToId.get(c.name);
    }
  }
  if (userChanged) {
    summary.push(`users: 重排 ${userChanged} 条 (${userRearged.join(', ')})`);
  }

  // ---------- 2) characters 去重 + 级联 ----------
  const chars = db.characters || [];
  const seenCharIds = new Set();
  let maxCharId = chars.reduce((m, c) => Math.max(m, Number(c.id) || 0), 0);
  const charRemapByOld = new Map(); // oldId -> [newId...]（按实例出现顺序）
  const charNewIdByInstance = new Map(); // character对象 -> newId（用于精确级联）
  let charChanged = 0;
  for (const c of chars) {
    const id = Number(c.id);
    if (seenCharIds.has(id)) {
      maxCharId += 1;
      if (!charRemapByOld.has(id)) charRemapByOld.set(id, []);
      charRemapByOld.get(id).push(maxCharId);
      charNewIdByInstance.set(c, maxCharId);
      c.id = maxCharId;
      charChanged += 1;
    } else {
      seenCharIds.add(id);
    }
  }
  if (charChanged) {
    const consumeIdx = new Map(); // oldId -> 队列消费指针
    for (const coll of Object.values(db)) {
      if (!Array.isArray(coll)) continue;
      for (const rec of coll) {
        if (!rec || typeof rec !== 'object') continue;
        if (rec.character_id === undefined || rec === null) continue;
        const oldId = Number(rec.character_id);
        if (!charRemapByOld.has(oldId)) continue;
        // 优先精确级联：引用记录自带 user_id → 找到该 user 现在的角色实例
        if (rec.user_id !== undefined) {
          const owner = chars.find(c => c.user_id === rec.user_id);
          if (owner && charNewIdByInstance.has(owner)) {
            rec.character_id = charNewIdByInstance.get(owner);
            continue;
          }
          // user 的角色未重排（仍持原 id）→ 保持不变
          if (owner && !charNewIdByInstance.has(owner)) continue;
        }
        // 兜底：按重排队列顺序消费
        const queue = charRemapByOld.get(oldId);
        const idx = consumeIdx.get(oldId) || 0;
        rec.character_id = queue[idx % queue.length];
        consumeIdx.set(oldId, idx + 1);
      }
    }
    summary.push(`characters: 重排 ${charChanged} 条并级联引用`);
  }

  // ---------- 3) inventory 去重 ----------
  const inv = db.inventory || [];
  const seenInvIds = new Set();
  let maxInvId = inv.reduce((m, i) => Math.max(m, Number(i.id) || 0), 0);
  let invChanged = 0;
  for (const it of inv) {
    const id = Number(it.id);
    if (!Number.isFinite(id)) {
      // 缺失/非法 id：直接补号（无效数据本身就是待修复项）
      maxInvId += 1;
      it.id = maxInvId;
      invChanged += 1;
      continue;
    }
    if (seenInvIds.has(id)) {
      maxInvId += 1;
      it.id = maxInvId;
      invChanged += 1;
    } else {
      seenInvIds.add(id);
    }
  }
  if (invChanged) summary.push(`inventory: 重排 ${invChanged} 条`);

  // ---------- 4) 重算 id_counters ----------
  if (!db.id_counters) db.id_counters = {};
  for (const [name, coll] of Object.entries(db)) {
    if (Array.isArray(coll) && coll.length && coll[0] && coll[0].id !== undefined) {
      db.id_counters[name] = coll.reduce((m, x) => Math.max(m, Number(x && x.id) || 0), 0);
    }
  }

  // ---------- 5) 校验 ----------
  let totalDup = 0;
  const dupReport = [];
  for (const name of ['users', 'characters', 'inventory', 'items', 'equipments']) {
    const s = new Set();
    for (const x of db[name] || []) {
      if (s.has(x.id)) { totalDup += 1; dupReport.push(`${name}#${x.id}`); }
      s.add(x.id);
    }
  }

  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  console.log(`[summary] ${summary.join(' | ') || '无重复，无需修改'}`);
  console.log(`[verify] 剩余重复 id: ${totalDup}${dupReport.length ? ' -> ' + dupReport.join(', ') : ''}`);
  console.log(`[done] users=${db.users.length} characters=${db.characters.length} inventory=${db.inventory.length}`);
  process.exit(totalDup === 0 ? 0 : 1);
}

main();
