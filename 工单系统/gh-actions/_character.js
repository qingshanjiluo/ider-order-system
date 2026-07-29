/**
 * 艾德尔工单系统 - 角色创建工具模块
 * 检查角色是否存在，不存在则自动创建（金灵根100）
 * 被 health_check.js / auto_levelup_all.js / daily_maintenance.js 共用
 */
async function ensureCharacter(apiRequest, token, serverUsername) {
  let syncResult;
  try {
    syncResult = await apiRequest('GET', '/player/sync', token);
  } catch (e) {
    return { ok: false, error: '同步失败: ' + e.message, player: {} };
  }

  if (syncResult?.hasCharacter !== false) {
    return { ok: true, created: false, player: syncResult?.player || {}, hasCharacter: true };
  }

  let playerName = serverUsername.slice(0, 12);
  let createResult;
  for (let nameRetry = 0; nameRetry < 15; nameRetry++) {
    if (nameRetry > 0) {
      // 用不同后缀避免重复
      var suffixes = ['_'+nameRetry, '_'+Math.floor(Math.random()*999), String.fromCharCode(97+nameRetry), '_x' + nameRetry];
      playerName = serverUsername.slice(0, 8) + suffixes[nameRetry % suffixes.length];
    }
    try {
      createResult = await apiRequest('POST', '/player/create', token, {
        name: playerName,
        spirit_roots: { metal: 100, wood: 0, water: 0, fire: 0, earth: 0 },
      });
      break;
    } catch (e) {
      if (/角色名已|已被使用|taken/i.test(e.message || '') && nameRetry < 9) {
        continue;
      }
      throw e;
    }
  }

  const createdName = createResult?.player?.name || playerName;

  try {
    syncResult = await apiRequest('GET', '/player/sync', token);
  } catch (e) {
    return { ok: true, created: true, player: {}, createdName, hasCharacter: true };
  }

  return { ok: true, created: true, player: syncResult?.player || {}, createdName, hasCharacter: true };
}

module.exports = { ensureCharacter };
