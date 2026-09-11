// Audit logging middleware
const { loadDatabase, saveDatabase } = require('../database');

const AUDIT_ACTIONS = {
  // User management
  'register': '用户注册',
  'login': '用户登录',
  'logout': '用户登出',
  'change_password': '修改密码',
  
  // Character
  'create_character': '创建角色',
  'update_character': '更新角色',
  'delete_character': '删除角色',
  
  // Economy
  'recharge': '充值',
  'spend_jade': '消费仙玉',
  'spend_spirit_stone': '消费灵石',
  'trade': '交易',
  'give_item': '赠送物品',
  
  // Combat
  'battle': '战斗',
  'arena_battle': '擂台战',
  'duel': '斗法',
  'guild_war': '仙盟战',
  
  // Guild
  'create_guild': '创建仙盟',
  'join_guild': '加入仙盟',
  'leave_guild': '退出仙盟',
  'kick_member': '踢出成员',
  'set_guild_role': '设置职位',
  'donate_guild': '捐献仙盟',
  
  // Items
  'craft_item': '锻造物品',
  'forge_equipment': '锻造装备',
  'alchemy_craft': '炼丹',
  'refine_item': '重炼物品',
  'dissolve_item': '溶解物品',
  'enhance_equipment': '强化装备',
  'enchant_equipment': '附魔装备',
  'temper_equipment': '淬炼装备',
  'spirit_infuse': '韵灵',
  
  // Admin
  'admin_ban_user': '封禁用户',
  'admin_unban_user': '解封用户',
  'admin_set_role': '设置角色',
  'admin_add_stones': '发放灵石',
  'admin_add_jade': '发放仙玉',
  'admin_set_level': '设置等级',
  'admin_add_item': '发放物品',
  'admin_reset_character': '重置角色',
  'admin_broadcast': '系统广播',
  
  // Other
  'checkin': '签到',
  'complete_quest': '完成任务',
  'claim_achievement': '领取成就',
  'practice': '练习',
  'cultivate': '修炼',
  'breakthrough': '突破',
  'upgrade_furnace': '升级丹炉',
  'unlock_talent': '解锁天赋',
  'claim_vip_daily': '领取VIP每日',
};

function auditLog(action, req, details = {}) {
  try {
    const db = loadDatabase();
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const userId = req.userId || (req.headers.authorization ? 'authenticated' : 'anonymous');
    const username = details.username || 'unknown';
    
    if (!db.audit_logs) db.audit_logs = [];
    
    db.audit_logs.push({
      id: (db.audit_logs.length || 0) + 1,
      action: action,
      actionLabel: AUDIT_ACTIONS[action] || action,
      userId: userId,
      username: username,
      ip: ip,
      details: details,
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent'] || 'unknown'
    });
    
    // Keep only last 10000 logs
    if (db.audit_logs.length > 10000) {
      db.audit_logs = db.audit_logs.slice(-10000);
    }
    
    saveDatabase(db);
  } catch (error) {
    console.error('Audit log error:', error);
  }
}

function auditMiddleware(action) {
  return (req, res, next) => {
    // Store original res.json to capture response
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      // Log after response is sent
      setImmediate(() => {
        auditLog(action, req, {
          username: req.body?.username || req.body?.name || 'unknown',
          success: res.statusCode < 400,
          statusCode: res.statusCode,
          ...data
        });
      });
      return originalJson(data);
    };
    next();
  };
}

module.exports = { auditLog, auditMiddleware, AUDIT_ACTIONS };