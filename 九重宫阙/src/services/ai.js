/**
 * AI 系统（阶段8 · 原始设定 13 · 决议 D4）
 *
 * D4 核心原则：AI 仅生成「名称与文案」，数值一律程序化、服务器权威。
 *  - 密钥池：多密钥/URL/模型，purpose 映射，测速，fail_count≥3 自动禁用（容灾降级），全不可用显式报错
 *  - 生成管线：数值程序化（各 purpose 生成器）→ 文案层（LLM 可用则 AI 化，不可用降级本地词库）
 *  - 复用配方库：同参数 hash 命中 approved 记录直接复用，不重复生成
 *  - 审核池：AI 来源内容 status=pending，管理员 approve/reject 后生效；本地降级内容确定性 → 自动 approved
 */
const store = require('../db/store');
const { loadDatabase, saveDatabase, getNextId } = require('../database');
const elements = require('./elements');
const balance = require('../config/balance');

const FAIL_DISABLE_THRESHOLD = 3;
const PURPOSES = ['recipe_forge', 'recipe_alchemy', 'guild_content', 'lore', 'skill_invent', 'sect_found'];

// ---------- 密钥池 ----------
function listKeys() {
  return store.queryRel('ai_keys').map(k => ({ ...k, api_key: k.api_key ? k.api_key.slice(0, 6) + '***' : '' }));
}

function addKey({ name, provider, base_url, api_key, model, purpose }) {
  if (!name || !provider || !api_key || !model) throw new Error('name/provider/api_key/model 必填');
  return store.insertRel('ai_keys', {
    name, provider, base_url: base_url || '', api_key, model,
    purpose: purpose || null, enabled: 1, fail_count: 0
  });
}

function removeKey(id) {
  store.deleteRel('ai_keys', Number(id));
}

function updateKey(id, patch) {
  const clean = {};
  for (const k of ['name', 'base_url', 'model', 'purpose', 'enabled']) if (k in patch) clean[k] = patch[k];
  if (Object.keys(clean).length) store.updateRel('ai_keys', Number(id), clean);
}

/** 挑选可用密钥：purpose 专属优先，fail_count 少者优先，延迟低者优先 */
function pickKey(purpose) {
  const keys = store.queryRel('ai_keys').filter(k => k.enabled && (!k.purpose || k.purpose === purpose));
  const scoped = keys.filter(k => k.purpose === purpose);
  const pool = scoped.length ? scoped : keys.filter(k => !k.purpose);
  if (!pool.length) return null;
  pool.sort((a, b) => (a.fail_count - b.fail_count) || ((a.last_latency_ms || 9e9) - (b.last_latency_ms || 9e9)));
  return pool[0];
}

/** 测速（OpenAI 兼容 GET /models，8s 超时） */
async function testKey(id) {
  const rows = store.queryRel('ai_keys', { id: Number(id) });
  const k = rows[0];
  if (!k) throw new Error('密钥不存在');
  const started = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const url = `${(k.base_url || 'https://api.openai.com/v1').replace(/\/$/, '')}/models`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${k.api_key}` }, signal: ctrl.signal });
    clearTimeout(timer);
    const latency = Date.now() - started;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    store.updateRel('ai_keys', k.id, { last_latency_ms: latency, last_ok_at: new Date().toISOString(), fail_count: 0, enabled: 1 });
    return { ok: true, latency };
  } catch (e) {
    const fail = (k.fail_count || 0) + 1;
    store.updateRel('ai_keys', k.id, {
      fail_count: fail,
      enabled: fail >= FAIL_DISABLE_THRESHOLD ? 0 : k.enabled,
      last_latency_ms: null
    });
    return { ok: false, error: e.message, fail_count: fail, disabled: fail >= FAIL_DISABLE_THRESHOLD };
  }
}

async function callLLM(key, prompt, system) {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const url = `${(key.base_url || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key.api_key}` },
      body: JSON.stringify({
        model: key.model,
        messages: [{ role: 'system', content: system || '你是修仙游戏文案引擎，只输出JSON：{"name":"...","desc":"..."}，name≤8字，desc≤40字。' }, { role: 'user', content: prompt }],
        temperature: 0.9, max_tokens: 200
      }),
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('响应无JSON');
    const parsed = JSON.parse(m[0]);
    if (!parsed.name) throw new Error('缺name');
    return { name: String(parsed.name).slice(0, 12), desc: String(parsed.desc || '').slice(0, 60), latency: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

function markKeyResult(keyId, ok, latency) {
  const rows = store.queryRel('ai_keys', { id: keyId });
  if (!rows.length) return;
  const k = rows[0];
  if (ok) {
    store.updateRel('ai_keys', keyId, { last_latency_ms: latency, last_ok_at: new Date().toISOString(), fail_count: 0 });
  } else {
    const fail = (k.fail_count || 0) + 1;
    store.updateRel('ai_keys', keyId, { fail_count: fail, enabled: fail >= FAIL_DISABLE_THRESHOLD ? 0 : k.enabled });
  }
}

// ---------- 程序化数值生成器（服务器权威，D4） ----------
const QUALITY_LADDER = ['凡品', '灵品', '宝品', '灵阶', '玄阶', '地阶', '天阶'];
const FORGE_KINDS = ['剑', '鼎', '铃', '镜', '塔', '印', '扇', '幡'];
const PILL_KINDS = ['丹', '散', '露', '丸'];

function proceduralStats(purpose, params) {
  const rnd = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
  const el = elements.normalize(params.element || 'none');
  if (purpose === 'recipe_forge') {
    const quality = params.quality || QUALITY_LADDER[rnd(0, QUALITY_LADDER.length - 1)];
    const qIdx = QUALITY_LADDER.indexOf(quality);
    return {
      kind: '装备配方',
      type: '法器',
      quality,
      element: el,
      stats: {
        attack: rnd(5 + qIdx * 8, 12 + qIdx * 15),
        defense: rnd(3 + qIdx * 5, 8 + qIdx * 10),
        hp: rnd(20 + qIdx * 30, 60 + qIdx * 80)
      },
      success_rate: Math.max(0.05, 0.75 - qIdx * 0.08),
      main_material_tier: Math.min(4, qIdx + 1)
    };
  }
  if (purpose === 'recipe_alchemy') {
    const quality = params.quality || QUALITY_LADDER[rnd(0, 3)];
    const qIdx = QUALITY_LADDER.indexOf(quality);
    return {
      kind: '丹方',
      type: '丹药',
      quality,
      element: el,
      stats: { effect_type: params.effect_type || 'exp', effect_value: rnd(50 + qIdx * 60, 150 + qIdx * 150) },
      success_rate: Math.max(0.1, 0.7 - qIdx * 0.07)
    };
  }
  if (purpose === 'skill_invent') {
    return {
      kind: '功法',
      type: '战斗',
      quality: params.quality || '玄阶',
      element: el,
      stats: { skill_damage: Number((1.2 + Math.random() * 1.8).toFixed(2)), skill_slots: 0 }
    };
  }
  // guild_content / lore / sect_found：纯文案
  return { kind: purpose === 'lore' ? '剧情' : '文案', element: el };
}

// ---------- 本地词库（降级保底） ----------
const WORDBANK = {
  prefix: ['青', '赤', '玄', '黄', '紫', '太', '混', '御', '凌', '镇'],
  core: ['霄', '冥', '煌', '渊', '穹', '尘', '岚', '曦', '凰', '龙'],
  suffixForge: FORGE_KINDS,
  suffixPill: PILL_KINDS,
  descForge: ['灵光流转，隐有龙吟', '铭刻上古阵纹，寒气逼人', '温润如玉，灵气内蕴', '煞气凛然，非凡品可比'],
  descPill: ['丹香扑鼻，药力浑厚', '丹纹三环，灵光内敛', '药香清冽，服用后灵台清明'],
  descGeneric: ['蕴含大道至理', '气韵玄妙，难以言喻', '有前辈手泽，气象不凡']
};

function localText(purpose, stats) {
  const name = WORDBANK.prefix[Math.floor(Math.random() * 10)] + WORDBANK.core[Math.floor(Math.random() * 10)] +
    (purpose === 'recipe_alchemy' ? WORDBANK.suffixPill[Math.floor(Math.random() * 4)] : purpose === 'recipe_forge' ? WORDBANK.suffixForge[Math.floor(Math.random() * 8)] : '诀');
  const pool = purpose === 'recipe_alchemy' ? WORDBANK.descPill : purpose === 'recipe_forge' ? WORDBANK.descForge : WORDBANK.descGeneric;
  return { name, desc: pool[Math.floor(Math.random() * pool.length)] };
}

// ---------- P6：世界观锚点（AI 文案引擎的"常识层"） ----------
// 真源派生：境界梯子取 balance.REALM_ORDER（十六期锁定的单一真源），地名/秘境取在用存档的
// maps/dungeons 目录——内容库每补一图，提示词自动跟进，不存在手抄词表漂移的可能。
// 纪律不变（D4）：锚点只约束文风与世界自洽，数值与入库权威仍在服务器。
function worldAnchorBrief() {
  const realms = (balance.REALM_ORDER || []).slice();
  let places = [], dungeons = [];
  try {
    const db = loadDatabase();
    places = (db.maps || []).map((m) => m && String(m.name || '')).filter(Boolean);
    dungeons = (db.dungeons || []).map((d) => d && String(d.name || '')).filter(Boolean);
  } catch (e) { /* 库不可读时锚点降级为空，不阻断生成 */ }
  return { realms, places, dungeons };
}

/** 按 purpose 字轮换的稳定切片：同 purpose 两次取值一致（可测），不同 purpose 少些雷同 */
function pickRotate(list, purpose, n) {
  if (!Array.isArray(list) || !list.length) return [];
  let seed = 0;
  for (const ch of String(purpose)) seed = (seed + ch.charCodeAt(0)) >>> 0;
  const out = [];
  for (let i = 0; i < Math.min(n, list.length); i++) out.push(list[(seed + i * 7) % list.length]);
  return out;
}

const PURPOSE_STYLE = {
  recipe_forge: '这是炼器配方文案：名如法器（剑/鼎/镜/印…），desc 呼应材质与灵性气质。',
  recipe_alchemy: '这是丹方文案：名如丹药（丹/散/露/丸），desc 呼应药性与功效意象。',
  skill_invent: '这是功法文案：名带诀/功/经/典，desc 贴合五行属性与境界气度。',
  guild_content: '这是仙盟公告/福利文案：宗门礼律感，短促有力，不承诺具体数值。',
  lore: '这是《九重宫阙》剧情片段：写宫阙遗踪、前辈手泽与秘境玄机，必须落在给定世界锚点之内。',
  sect_found: '这是新宗门创立文案：给出山名与立派一言，气象要配得上开山祖师。'
};

/** 组装锚定后的 system prompt。导出供测试逐字判定（防"函数写了没人调"的幽灵实装）。 */
function buildSystemPrompt(purpose, stats) {
  const a = worldAnchorBrief();
  const parts = ['你是《九重宫阙》（仙界帝君遗府，九重云阙）的文案引擎，只输出JSON：{"name":"...","desc":"..."}，name≤8字，desc≤40字。'];
  if (a.realms.length) parts.push(`境界梯子（由低至高）：${a.realms.join('→')}。不得发明梯子之外的境界。`);
  const places = pickRotate(a.places, purpose, 4);
  const dungeons = pickRotate(a.dungeons, purpose, 3);
  if (places.length || dungeons.length) {
    parts.push(`世界锚点（可呼应其气韵，勿照抄成名件）：地名 ${places.join('、') || '（暂无）'}；秘境 ${dungeons.join('、') || '（暂无）'}。`);
  }
  if (PURPOSE_STYLE[purpose]) parts.push(PURPOSE_STYLE[purpose]);
  const el = stats && stats.element != null ? elements.displayMeta(stats.element).name : null;
  if (el) parts.push(`本件属性：${el}，措辞需与之相合。`);
  parts.push('古风用语；不得出现现实品牌、真实宗教名、现代口语。');
  return parts.join(' ');
}

// ---------- 复用配方库 ----------
function hashParams(obj) {
  // djb2 全字符串哈希（base64 截断会丢尾部参数导致误复用）
  const s = JSON.stringify(obj);
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = ((h1 << 5) + h1 + c) >>> 0;
    h2 = ((h2 << 5) + h2 + c) >>> 0;
  }
  return h1.toString(36) + h2.toString(36);
}

function findReused(purpose, hash) {
  const rows = store.queryRel('ai_generations', { purpose, status: 'approved' });
  const hit = rows.find(r => (r.prompt || '').startsWith(`#${hash}#`));
  if (hit) return { id: hit.id, result: JSON.parse(hit.result || '{}') };
  return null;
}

/**
 * 生成入口。
 * opts.forcePending：本地降级内容也进审核池（测试/审核流程用）
 * 返回 { reused, generationId, status, source, content }
 */
async function generate(purpose, params = {}, opts = {}) {
  if (!PURPOSES.includes(purpose)) throw new Error(`未知生成类型: ${purpose}`);
  const hash = hashParams({ purpose, ...params });
  const reused = findReused(purpose, hash);
  if (reused) return { reused: true, generationId: reused.id, status: 'approved', source: reused.result.source, content: reused.result };

  const stats = proceduralStats(purpose, params); // 数值：程序化权威
  let text = null, source = 'local', keyUsed = null;

  const key = pickKey(purpose);
  if (key) {
    try {
      const prompt = `为修仙游戏生成${stats.kind}：品质${stats.quality || '任意'}，元素${elements.displayMeta(stats.element).name}。要求古风、不出现现实品牌。`;
      // P6：带上世界观锚点的 system prompt（不传则 callLLM 只能退回无世界的通用模板）
      text = await callLLM(key, prompt, buildSystemPrompt(purpose, stats));
      source = 'ai';
      keyUsed = { id: key.id, provider: key.provider, model: key.model };
      markKeyResult(key.id, true, text.latency);
    } catch (e) {
      markKeyResult(key.id, false);
      text = null;
    }
  }
  if (!text) text = localText(purpose, stats);

  const content = { ...stats, name: text.name, desc: text.desc, source };
  const status = source === 'ai' || opts.forcePending ? 'pending' : 'approved';
  const id = store.insertRel('ai_generations', {
    purpose,
    prompt: `#${hash}# ${JSON.stringify(params)}`,
    provider: keyUsed ? keyUsed.provider : 'local',
    model: keyUsed ? keyUsed.model : 'wordbank',
    status,
    result: JSON.stringify(content),
    created_at: new Date().toISOString()
  });
  return { reused: false, generationId: id, status, source, content };
}

// ---------- 审核池 ----------
function listGenerations(status) {
  const rows = status ? store.queryRel('ai_generations', { status }) : store.queryRel('ai_generations');
  return rows.map(r => {
    let result = null;
    try { result = JSON.parse(r.result || 'null'); } catch { /* 保留null */ }
    return { ...r, result, api_key: undefined };
  });
}

function review(id, action, note) {
  const rows = store.queryRel('ai_generations', { id: Number(id) });
  if (!rows.length) throw new Error('生成记录不存在');
  if (!['approved', 'rejected'].includes(action)) throw new Error('action 必须为 approved/rejected');
  store.updateRel('ai_generations', Number(id), { status: action, reviewer_note: note || '', reviewed_at: new Date().toISOString() });
  return { ok: true };
}

module.exports = {
  PURPOSES, FAIL_DISABLE_THRESHOLD,
  listKeys, addKey, removeKey, updateKey, testKey, pickKey,
  generate, listGenerations, review, hashParams, proceduralStats, localText,
  worldAnchorBrief, buildSystemPrompt, pickRotate
};
