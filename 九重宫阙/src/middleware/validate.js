// Input validation middleware
const VALIDATION_RULES = {
  // Common validations
  username: (val) => typeof val === 'string' && val.length >= 3 && val.length <= 20 && /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(val),
  password: (val) => typeof val === 'string' && val.length >= 6 && val.length <= 50,
  nickname: (val) => typeof val === 'string' && val.length >= 1 && val.length <= 20,
  faction: (val) => ['martial', 'spirit', 'demon'].includes(val),
  amount: (val) => Number.isInteger(val) && val > 0 && val <= 1000000,
  itemId: (val) => Number.isInteger(val) && val > 0,
  recipeId: (val) => Number.isInteger(val) && val > 0,
  packageId: (val) => Number.isInteger(val) && val > 0,
  skillId: (val) => Number.isInteger(val) && val > 0,
  talentId: (val) => typeof val === 'string' && val.length > 0,
  level: (val) => Number.isInteger(val) && val > 0 && val <= 1000,
  realm: (val) => typeof val === 'string' && val.length > 0,
  name: (val) => typeof val === 'string' && val.length >= 1 && val.length <= 50,
  content: (val) => typeof val === 'string' && val.length <= 500,
  search: (val) => typeof val === 'string' && val.length <= 100,
  hours: (val) => Number.isInteger(val) && val > 0 && val <= 24,
  quantity: (val) => Number.isInteger(val) && val > 0 && val <= 9999,
  page: (val) => Number.isInteger(val) && val > 0,
  limit: (val) => Number.isInteger(val) && val > 0 && val <= 100,
  price: (val) => Number.isInteger(val) && val > 0,
  jade: (val) => Number.isInteger(val) && val >= 0,
  spiritStone: (val) => Number.isInteger(val) && val >= 0,
  role: (val) => ['user', 'admin', 'super_admin'].includes(val),
  type: (val) => typeof val === 'string' && val.length > 0,
  subtype: (val) => ['weapon','head','chest','legs','gloves','boots','necklace','ring'].includes(val),
  quality: (val) => typeof val === 'string' && val.length > 0,
  slot: (val) => ['weapon','head','chest','legs','gloves','boots','necklace','ring'].includes(val),
  mapId: (val) => Number.isInteger(val) && val > 0,
  dungeonId: (val) => Number.isInteger(val) && val > 0,
  guildId: (val) => Number.isInteger(val) && val > 0,
  monsterId: (val) => Number.isInteger(val) && val > 0,
  targetId: (val) => Number.isInteger(val) && val > 0,
  characterId: (val) => Number.isInteger(val) && val > 0,
  userId: (val) => Number.isInteger(val) && val > 0,
  turnstileToken: (val) => typeof val === 'string' && val.length > 0,
  gongfaId: (val) => Number.isInteger(val) && val > 0,
  petId: (val) => Number.isInteger(val) && val > 0,
  foodType: (val) => typeof val === 'string' && val.length > 0,
  formationId: (val) => Number.isInteger(val) && val > 0,
  veinId: (val) => Number.isInteger(val) && val > 0,
  talismanId: (val) => Number.isInteger(val) && val > 0,
  facilityId: (val) => Number.isInteger(val) && val > 0,
  auxiliaryMaterialId: (val) => Number.isInteger(val) && val > 0,
  catalystId: (val) => Number.isInteger(val) && val > 0,
  flameType: (val) => typeof val === 'string' && val.length > 0,
  equipmentId: (val) => Number.isInteger(val) && val > 0,
  materialIds: (val) => Array.isArray(val) && val.every(v => Number.isInteger(v) && v > 0),
  auxMaterialIds: (val) => Array.isArray(val) && val.every(v => Number.isInteger(v) && v > 0),
  catalystIds: (val) => Array.isArray(val) && val.every(v => Number.isInteger(v) && v > 0),
  useAux: (val) => typeof val === 'boolean',
  useCatalyst: (val) => typeof val === 'boolean',
  betAmount: (val) => Number.isInteger(val) && val >= 0,
  enchantType: (val) => typeof val === 'string' && val.length > 0,
  practiceHours: (val) => Number.isInteger(val) && val > 0 && val <= 24,
  itemIds: (val) => Array.isArray(val) && val.every(v => Number.isInteger(v) && v > 0),
  craftCount: (val) => Number.isInteger(val) && val > 0,
  achievementId: (val) => Number.isInteger(val) && val > 0,
  skillIndex: (val) => Number.isInteger(val) && val >= 0,
  enemyId: (val) => Number.isInteger(val) && val > 0,
  date: (val) => typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val),
  active: (val) => typeof val === 'boolean',
  isActive: (val) => typeof val === 'boolean',
  enabled: (val) => typeof val === 'boolean',
  image: (val) => typeof val === 'string' && val.length <= 500,
  description: (val) => typeof val === 'string' && val.length <= 1000,
  stats: (val) => typeof val === 'object' && val !== null,
  materials: (val) => Array.isArray(val) && val.every(m => m.item_id && m.quantity),
  result: (val) => Number.isInteger(val) && val > 0,
  reward: (val) => typeof val === 'object' && val !== null,
  resultItem: (val) => typeof val === 'object' && val !== null,
  resultQuantity: (val) => Number.isInteger(val) && val > 0,
  costs: (val) => typeof val === 'object' && val !== null,
  benefits: (val) => typeof val === 'object' && val !== null,
  packages: (val) => Array.isArray(val),
  badge: (val) => typeof val === 'string' && val.length <= 20,
  condition: (val) => typeof val === 'object' && val !== null,
  rewards: (val) => typeof val === 'object' && val !== null,
  progress: (val) => typeof val === 'object' && val !== null,
  unlockLevel: (val) => Number.isInteger(val) && val >= 0,
  maxLevel: (val) => Number.isInteger(val) && val > 0,
  required: (val) => Number.isInteger(val) && val >= 0,
  minLevel: (val) => Number.isInteger(val) && val >= 0,
  difficulty: (val) => Number.isInteger(val) && val > 0 && val <= 10,
  dropRate: (val) => typeof val === 'number' && val > 0,
  element: (val) => typeof val === 'string' && val.length > 0,
  levelRange: (val) => Array.isArray(val) && val.length === 2 && val.every(v => Number.isInteger(v) && v > 0),
  channel: (val) => typeof val === 'string' && val.length > 0,
  lastLogin: (val) => typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val),
  createdAt: (val) => typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val),
  expiresAt: (val) => val === null || (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)),
  priority: (val) => ['low', 'normal', 'high'].includes(val),
  announcementType: (val) => ['system', 'event', 'maintenance'].includes(val),
  title: (val) => typeof val === 'string' && val.length >= 1 && val.length <= 100,
  guildName: (val) => typeof val === 'string' && val.length >= 1 && val.length <= 20,
  notice: (val) => typeof val === 'string' && val.length <= 500,
  position: (val) => ['成员', '长老', '副盟主', '盟主'].includes(val),
  isLeader: (val) => typeof val === 'boolean',
  donation: (val) => Number.isInteger(val) && val > 0,
  skillName: (val) => typeof val === 'string' && val.length > 0,
  multiplier: (val) => typeof val === 'number' && val > 0,
  cost: (val) => Number.isInteger(val) && val >= 0,
  expGain: (val) => Number.isInteger(val) && val >= 0,
  successRate: (val) => typeof val === 'number' && val >= 0 && val <= 1,
  qualityFloor: (val) => Number.isInteger(val) && val >= 0,
  outputBonus: (val) => Number.isInteger(val) && val >= 0,
  critRate: (val) => typeof val === 'number' && val >= 0 && val <= 1,
  herbReduce: (val) => Number.isInteger(val) && val >= 0,
  successBonus: (val) => typeof val === 'number' && val >= 0,
  speedBonus: (val) => typeof val === 'number' && val >= 0,
  maxQuality: (val) => typeof val === 'string' && val.length > 0,
  maxOutput: (val) => Number.isInteger(val) && val > 0,
  furnaceLevel: (val) => Number.isInteger(val) && val > 0 && val <= 8,
  alchemyLevel: (val) => Number.isInteger(val) && val > 0,
  alchemyExp: (val) => Number.isInteger(val) && val >= 0,
  practiceCount: (val) => Number.isInteger(val) && val >= 0,
  dailyCraft: (val) => Number.isInteger(val) && val >= 0,
  lastCraftDay: (val) => typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val),
  talents: (val) => Array.isArray(val),
  proficiency: (val) => typeof val === 'object' && val !== null,
  isSuperior: (val) => typeof val === 'boolean',
  lines: (val) => Number.isInteger(val) && val >= 0,
  spiritAffinity: (val) => Number.isInteger(val) && val >= 0,
  hasSpirit: (val) => typeof val === 'boolean',
  temperCount: (val) => Number.isInteger(val) && val >= 0,
  enchants: (val) => Array.isArray(val),
  spiritSkill: (val) => typeof val === 'string' && val.length > 0,
  spiritRoots: (val) => Array.isArray(val) && val.every(r => r.type && typeof r.purity === 'number'),
  mood: (val) => typeof val === 'string' && val.length > 0,
  moodActions: (val) => typeof val === 'object' && val !== null,
  constitution: (val) => Number.isInteger(val) && val >= 1,
  strength: (val) => Number.isInteger(val) && val >= 1,
  physique: (val) => Number.isInteger(val) && val >= 1,
  wisdom: (val) => Number.isInteger(val) && val >= 1,
  soul: (val) => Number.isInteger(val) && val >= 1,
  talent: (val) => Number.isInteger(val) && val >= 1,
  comprehension: (val) => Number.isInteger(val) && val >= 1,
  affinity: (val) => Number.isInteger(val) && val >= 1,
  luck: (val) => Number.isInteger(val) && val >= 1,
  daoAffinity: (val) => Number.isInteger(val) && val >= 1,
  appearance: (val) => Number.isInteger(val) && val >= 1,
  fortune: (val) => Number.isInteger(val) && val >= 1,
  lifespan: (val) => Number.isInteger(val) && val >= 1,
  moodValue: (val) => typeof val === 'number' && val >= 0 && val <= 100,
  // Generic array validation
  arrayOfInts: (val) => Array.isArray(val) && val.every(v => Number.isInteger(v)),
  arrayOfStrings: (val) => Array.isArray(val) && val.every(v => typeof v === 'string'),
  object: (val) => typeof val === 'object' && val !== null,
};

function validateRequest(rules) {
  return (req, res, next) => {
    const body = req.body || {};
    const query = req.query || {};
    const params = req.params || {};
    
    // Combine all input sources
    const allInput = { ...query, ...params, ...body };
    
    for (const [field, validator] of Object.entries(rules)) {
      const value = allInput[field];
      if (value !== undefined && !validator(value)) {
        return res.status(400).json({ 
          error: `无效的参数: ${field}`,
          field,
          value
        });
      }
    }
    next();
  }
}

// Sanitize input to prevent injection
// 轮66：口令字段必须**原样**透传，不参与清洗。
// 旧实现对每个字符串都删 <>"'&，于是密码 "Pw<ord>&1" 与 "Pword1" 被削成同一串 ⇒ 同一个 bcrypt hash
// ⇒ 这五个字符事实上变成"可忽略字符"：猜中其中一种写法就能登录用另一种写法的账号。
// 而 <>"'& 都是合法密码字符（password 规则只查长度 6-50），用户改密码时被静默改写也是真实现象。
// XSS 的防线不在这里：前端渲染侧与 SQL 参数化各有其位，本中间件洗的是展示型输入。
const CREDENTIAL_KEY = /password/i;   // password / newPassword / currentPassword / confirmPassword 全覆盖
function sanitizeInput(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    // 轮63：原来只删 <>"'&，于是 <script>alert(1)</script>道号 被削成 scriptalert(1)/script道号
    // （23 字符）。这既不算"洗干净"（标签名和斜杠全留下），又撞上 nickname 的 20 字符上限，
    // 表现为"带 XSS 前缀的合法汉字道号被误杀"。先整段去掉标签，再兜底删残留的裸字符。
    let cleaned = obj.replace(/<[^>]*>/g, '');
    cleaned = cleaned.replace(/[<>"'&]/g, '');
    return cleaned;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeInput);
  }
  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = CREDENTIAL_KEY.test(key) ? value : sanitizeInput(value);   // 轮66：口令原样透传
    }
    return sanitized;
  }
  return obj;
}

function sanitizeMiddleware(req, res, next) {
  req.body = sanitizeInput(req.body);
  req.query = sanitizeInput(req.query);
  req.params = sanitizeInput(req.params);
  next();
}

module.exports = { validateRequest, sanitizeMiddleware, sanitizeInput, VALIDATION_RULES };