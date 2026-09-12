let currentTab = 'character';
let gameState = {};
let _currentEquips = {};

// Global Error Handler
window.onerror = function(msg, url, line, col, error) {
  console.error('Global error:', msg, url, line);
  if (typeof ui !== 'undefined') {
    ui.showToast('发生错误，请刷新页面重试');
  }
  return false;
};

window.addEventListener('unhandledrejection', function(e) {
  console.error('Unhandled promise rejection:', e.reason);
  if (typeof ui !== 'undefined') {
    ui.showToast('网络错误，请检查连接');
  }
});

async function init() {
  const token = localStorage.getItem('token');
  if (token) {
    try {
      await loadGameEnhanced();
    } catch (e) {
      localStorage.removeItem('token');
      ui.showView('login-view');
    }
  }

  document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    let turnstileToken = null;
    if (typeof turnstile !== 'undefined') {
      const widgetId = document.querySelector('#turnstile-login')?.dataset?.widgetId;
      if (widgetId) turnstileToken = turnstile.getResponse(widgetId);
    }
    try {
      const data = await api.login(username, password, turnstileToken);
      localStorage.setItem('token', data.token);
      await loadGameEnhanced();
    } catch (err) {
      ui.showToast(err.message);
    }
  };

  document.getElementById('register-form').onsubmit = async (e) => {
    e.preventDefault();
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;
    const nickname = document.getElementById('reg-nickname').value;
    const faction = document.getElementById('reg-faction').value;
    let turnstileToken = null;
    if (typeof turnstile !== 'undefined') {
      const widgetId = document.querySelector('#turnstile-register')?.dataset?.widgetId;
      if (widgetId) turnstileToken = turnstile.getResponse(widgetId);
    }
    try {
      const data = await api.register(username, password, nickname, faction, turnstileToken);
      localStorage.setItem('token', data.token);
      await loadGameEnhanced();
    } catch (err) {
      ui.showToast(err.message);
    }
  };

  document.getElementById('show-register').onclick = () => {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.remove('hidden');
  };

  document.getElementById('show-login').onclick = () => {
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
  };

  document.getElementById('logout-btn').onclick = () => {
    localStorage.removeItem('token');
    ui.showView('login-view');
  };

  document.querySelectorAll('.nav-item').forEach(item => {
    item.onclick = () => switchTab(item.dataset.tab);
  });

  // 阶段10：12 主导航分组折叠
  document.querySelectorAll('.nav-group-title').forEach(title => {
    title.onclick = () => title.closest('.nav-group').classList.toggle('open');
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });

  const updateMobileNav = () => {
    const isMobile = window.innerWidth <= 768;
    const mobileNav = document.getElementById('mobile-tab-nav');
    if (mobileNav) mobileNav.style.display = isMobile ? 'flex' : 'none';
  };
  window.addEventListener('resize', updateMobileNav);
  updateMobileNav(); // 首次加载即按视口宽度初始化（修复移动端无导航）
}

async function loadGame() {
  initTheme();
  ui.showView('game-view');
  await loadCharacter();
  await loadTabContent(currentTab);
  applyVipEffects();
  initChat();
}

async function loadCharacter() {
  try {
    const char = await api.getCharacter();
    gameState.character = char;

    const stats = await api.getStats();
    gameState.stats = stats;

    ui.updateCharacterInfo({
      ...char,
      combatPower: stats.combatPower,
      attack: stats.attack,
      defense: stats.defense,
      hp: char.hp || stats.hp,
      maxHp: char.maxHp || stats.maxHp,
      mp: char.mp || stats.mp,
      maxMp: char.maxMp || stats.maxMp,
      speed: stats.speed
    });

    // 装备栏：以后端 /equipment/slots 为唯一数据源（equipments 集合按 slot 存储，
    // character 对象上并无 equipment 字段——旧实现读取空对象导致装备栏永远空白）
    let equips = {};
    try {
      const slots = await api.getEquipmentSlots();
      for (const key of ['weapon', 'head', 'chest', 'legs', 'gloves', 'boots', 'necklace', 'ring']) {
        equips[key] = slots[key] && slots[key].equipped ? slots[key].item : null;
      }
    } catch (e) {
      console.error('Failed to load equipment slots:', e);
    }
    window._currentEquips = equips;
    ui.updateEquipGrid(equips);

    const realm = await api.getRealm();
    ui.updateCultivationProgress(realm);

  } catch (error) {
    console.error('Failed to load character:', error);
  }
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  loadTabContent(tab);
}

async function loadTabContent(tab) {
  const content = document.getElementById('tab-content');
  if (!content) return;

  ui.showSkeleton(content, 'card');

  try {
    switch (tab) {
      case 'character': await loadCharacterTab(); break;
      case 'cultivation': await loadCultivationTab(); break;
      case 'battle': await loadBattleTab(); break;
      case 'dungeon': await loadDungeonTab(); break;
      case 'skill': await loadSkillTab(); break;
      case 'gongfa': await loadGongfaTab(); break;
      case 'pet': await loadPetTab(); break;
      case 'weapons': await loadWeaponsTab(); break;
      case 'pills': await loadPillsTab(); break;
      case 'talismans': await loadTalismansTab(); break;
      case 'formations': await loadFormationsTab(); break;
      case 'quests': await loadQuestsTab(); break;
      case 'chronicle': await loadChronicleTab(); break;
      case 'market': await loadMarketTab(); break;
      case 'friend': await loadFriendTab(); break;        // P3（轮49）：接后端轮48 的 /api/friend
      case 'economy': await loadEconomyTab(); break;
      case 'sect': await loadSectTab(); break;
      case 'forge': await loadForgeTab(); break;
      case 'alchemist': await loadAlchemistTab(); break;
      case 'gathering': await loadGatheringTab(); break;
      case 'cave': await loadCaveTab(); break;
      case 'guild': await loadGuildTab(); break;
      case 'arena': await loadArenaTab(); break;
      case 'shop': await loadShopTab(); break;
      case 'afk': await loadAfkTab(); break;
      case 'season': await loadSeasonTab(); break;
      case 'vip': await loadVipTab(); break;
      case 'achievement': await loadAchievementTab(); break;
      case 'chat': await loadChatTab(); break;
      case 'settings': await loadSettingsTab(); break;
      case 'invite': await loadInviteTab(); break;
      case 'admin': await loadAdminTab(); break;
      default: content.innerHTML = '<div class="empty-state">功能开发中...</div>';
    }
  } catch (error) {
    console.error('Tab load error:', error);
    content.innerHTML = '<div class="empty-state">加载失败，请重试</div>';
  }
}

async function loadCharacterTab() {
  const content = document.getElementById('tab-content');
  try {
    const char = await api.getCharacter();
    const stats = await api.getStats();

    content.innerHTML = `
      <div class="char-panel">
        <div class="char-panel-header">
          <div class="char-panel-title">${char.name}</div>
          <span class="combat-power">战力 ${ui.formatNumber(stats.combatPower || 0)}</span>
        </div>

        <div class="bar-group">
          <div class="bar-label"><span>生命</span><span id="hp-text">${char.hp || 0}/${char.maxHp || 0}</span></div>
          <div class="bar-track"><div class="bar-fill hp-fill" id="hp-bar" style="width:${((char.hp || 0) / (char.maxHp || 1)) * 100}%"></div></div>
        </div>
        <div class="bar-group">
          <div class="bar-label"><span>灵气</span><span id="mp-text">${char.mp || 0}/${char.maxMp || 0}</span></div>
          <div class="bar-track"><div class="bar-fill mp-fill" id="mp-bar" style="width:${((char.mp || 0) / (char.maxMp || 1)) * 100}%"></div></div>
        </div>
        <div class="bar-group">
          <div class="bar-label"><span>修为</span><span id="exp-text">${char.exp || 0}/${char.expToNext || 100}</span></div>
          <div class="bar-track"><div class="bar-fill exp-fill" id="exp-bar" style="width:${((char.exp || 0) / (char.expToNext || 100)) * 100}%"></div></div>
        </div>
        <div class="bar-group">
          <div class="bar-label">
            <span>掉落保底</span>
            <span id="pity-text">${(char.lootPity || {}).dryStreak || 0}/${(char.lootPity || {}).threshold || '?'}${(char.lootPity || {}).nextIsGuaranteed ? ' · 下次必出' : ''}</span>
          </div>
          <div class="bar-track"><div class="bar-fill" id="pity-bar" style="width:${Math.min(100, ((char.lootPity || {}).dryStreak || 0) / Math.max(1, (char.lootPity || {}).threshold || 1) * 100)}%;background:var(--gold);"></div></div>
          <div style="font-size:10px;color:var(--text2);margin-top:2px;">连续 ${(char.lootPity || {}).dryStreak || 0} 场空手；满 ${(char.lootPity || {}).threshold || '?'} 场下一场必定掉落。</div>
        </div>
      </div>

      <div class="char-panel">
        <div class="char-panel-header">
          <div class="char-panel-title">属性</div>
        </div>
        <div class="stats-grid">
          <div class="stat-item"><span class="stat-label">攻击</span><span class="stat-value">${stats.attack || 0}</span></div>
          <div class="stat-item"><span class="stat-label">防御</span><span class="stat-value">${stats.defense || 0}</span></div>
          <div class="stat-item"><span class="stat-label">速度</span><span class="stat-value">${stats.speed || 0}</span></div>
          <div class="stat-item"><span class="stat-label">暴击</span><span class="stat-value">${stats.critRate || 5}%</span></div>
          <div class="stat-item"><span class="stat-label">生命</span><span class="stat-value">${char.maxHp || 0}</span></div>
          <div class="stat-item"><span class="stat-label">灵气</span><span class="stat-value">${char.maxMp || 0}</span></div>
        </div>
      </div>

      <div class="char-panel">
        <div class="char-panel-header">
          <div class="char-panel-title">装备</div>
        </div>
        <div class="equip-slots" id="equip-grid" style="grid-template-columns: repeat(4, 1fr); grid-template-rows: repeat(2, auto); gap: 8px;"></div>
      </div>

      <div class="char-panel">
        <div class="char-panel-header">
          <div class="char-panel-title">每日任务</div>
        </div>
        <div id="daily-tasks"></div>
      </div>

      <div class="char-panel">
        <div class="char-panel-header">
          <div class="char-panel-title">背包</div>
        </div>
        <div id="inventory-list"></div>
      </div>
    `;

    ui.updateEquipGrid({
      weapon: char.equipment?.weapon || null,
      head: char.equipment?.head || null,
      armor: char.equipment?.armor || null,
      legs: char.equipment?.legs || null,
      boots: char.equipment?.boots || null,
      ring: char.equipment?.ring || null,
      necklace: char.equipment?.necklace || null,
      cloak: char.equipment?.cloak || null
    });

    try {
      const tasks = await api.getDailyStatus();
      const taskList = [
        { name: '签到', completed: tasks.checkin?.checked || false },
        { name: '修炼', completed: tasks.cultivation?.completed || false },
        { name: '副本', completed: (tasks.dungeon?.count || 0) >= 3 },
        { name: '竞技', completed: (tasks.arena?.count || 0) >= 5 }
      ];
      ui.updateDailyTasks(taskList);
    } catch (e) {}

    try {
      const inventory = await api.getInventory();
      ui.updateInventory(inventory);
    } catch (e) {}

  } catch (error) {
    content.innerHTML = '<div class="char-panel"><p>加载失败</p></div>';
  }
}

// P3（轮50）：突破概率构成与失败代价。数据全部来自服务端同一份实现
// （realm.breakthroughPanel → 与 breakthroughProbability / handleBreakthroughFailure 同源），
// 界面不做任何二次计算，避免"显示 85% 实际按 70% 掷骰"这类漂移。
const BT_PART_LABELS = {
  base: '境界基础', innerDemon: '心魔侵蚀', failures: '连败累罚', heavenShield: '天道庇护',
  pill: '契机丹', formation: '聚灵阵法', vein: '洞府灵脉', artPerfect: '功法大成',
  epiphany: '顿悟', daoDamage: '道伤'
};

function btPartsRows(parts) {
  if (!parts) return '<p style="font-size:11px;color:var(--text2);">尚未达到瓶颈，暂无突破判定。</p>';
  return Object.keys(BT_PART_LABELS).map((k) => {
    const v = Number(parts[k]) || 0;
    if (v === 0) return '';
    return `<div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0;">
      <span style="color:var(--text2);">${BT_PART_LABELS[k]}</span>
      <span style="color:${v > 0 ? 'var(--success, #4caf50)' : '#e57373'};">${v > 0 ? '+' : ''}${v}%</span></div>`;
  }).join('') || '<div style="font-size:11px;color:var(--text2);">仅有境界基础值。</div>';
}

async function loadCultivationTab() {
  const content = document.getElementById('tab-content');
  try {
    const realm = await api.getRealm();
    const cultivation = await api.getCultivationStatus();
    const bt = await api.getBreakthroughPanel();
    const fp = bt.failurePreview || {};
    const panel = `
      <div class="char-panel" style="margin-top:16px;">
        <div class="char-panel-title" style="font-size:13px;margin-bottom:8px;">突破判定（与服务端结算同源）</div>
        <div style="font-size:11px;color:var(--text2);margin-bottom:6px;">
          ${bt.canBreakthrough
            ? `本次冲关成功率 <b style="color:var(--gold);">${bt.chance}%</b>（判定区间 5%~95%）`
            : '尚未满足突破条件（修为未满或瓶颈未破），以下为下次判定的预估'}
        </div>
        ${btPartsRows(bt.parts)}
        <div style="font-size:11px;margin-top:8px;padding-top:6px;border-top:1px dashed var(--gold);">
          契机丹持有 <b>${(bt.pill || {}).held || 0}</b> 枚
          ${(bt.pill || {}).held > 0
            ? `（判定 +${(bt.pill || {}).bonusEach}%，<span style="color:var(--text2);">无论成败只作用一次并消耗一枚</span>）`
            : `（<span style="color:var(--text2);">坊市可购，持有即 +${(bt.pill || {}).bonusEach || 0}%</span>）`}
        </div>
        <div style="font-size:11px;color:#e57373;margin-top:6px;">
          失败代价：折寿 <b>${fp.years || 0}</b> 年（当前寿元上限的 ${Math.round((fp.ratio || 0) * 100)}%）、
          修为回落 ${Math.round((fp.expFallbackRatio || 0) * 100)}%、心魔升至 ${fp.innerDemonAfter || 1} 层。
        </div>
      </div>`;

    content.innerHTML = `
      <div class="char-panel">
        <div class="char-panel-header">
          <div class="char-panel-title">闭关修炼</div>
        </div>
        <div class="bar-group">
          <div class="bar-label"><span>修炼进度</span><span>${realm.progress || 0}%</span></div>
          <div class="bar-track"><div class="bar-fill exp-fill" style="width:${realm.progress || 0}%"></div></div>
        </div>
        <div class="stats-grid" style="margin-bottom:16px;">
          <div class="stat-item"><span class="stat-label">当前境界</span><span class="stat-value">${realm.name}</span></div>
          <div class="stat-item"><span class="stat-label">突破成功率</span><span class="stat-value">${realm.breakthroughChance}%</span></div>
          <div class="stat-item"><span class="stat-label">修炼状态</span><span class="stat-value">${cultivation.isCultivating ? '修炼中' : '未修炼'}</span></div>
          <div class="stat-item"><span class="stat-label">每秒经验</span><span class="stat-value">${cultivation.expPerSecond || 0}</span></div>
          <div class="stat-item"><span class="stat-label">功法加成</span><span class="stat-value">${cultivation.bonus || 0}%</span></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn primary" onclick="handleCultivate()" style="flex:1;min-width:120px;">开始修炼</button>
          <button class="btn" onclick="handleBreakthrough()" style="flex:1;min-width:120px;">突破境界</button>
          <button class="btn" onclick="handleTrainOffline()" style="flex:1;min-width:120px;">离线修炼</button>
        </div>
      </div>
      ${panel}
    `;
  } catch (error) {
    content.innerHTML = `<div class="char-panel"><p>加载失败：${escText(api.errInfo(error).text)}</p></div>`;
  }
}

async function handleCultivate() {
  ui.showConfirm('修炼', '确定要开始修炼吗？', async () => {
    try {
      const result = await api.train();
      ui.showToast(`修炼成功，获得经验${result.expGained}`);
      await loadCharacter();
      loadTabContent('cultivation');
    } catch (error) {
      ui.showToast(error.message);
    }
  });
}

async function handleBreakthrough() {
  // 以前这里固定写"失败会损失修为"，玩家不知道失败还要折寿 —— 现在把服务端同一份预览念出来
  let detail = '确定要尝试突破吗？';
  try {
    const bt = await api.getBreakthroughPanel();
    const fp = bt.failurePreview || {};
    detail += `\n成功率 ${bt.chance}%（构成见修炼页）。`
      + `\n失败：折寿 ${fp.years} 年（寿元上限的 ${Math.round((fp.ratio || 0) * 100)}%）、`
      + `修为回落 ${Math.round((fp.expFallbackRatio || 0) * 100)}%、心魔升至 ${fp.innerDemonAfter} 层。`;
  } catch (e) { detail += '突破失败会损失修为与寿元。'; }
  ui.showConfirm('突破境界', detail, async () => {
    try {
      const result = await api.breakthrough();
      if (result.success) {
        ui.showToast('突破成功！');
      } else {
        ui.showToast('突破失败');
      }
      await loadCharacter();
      loadTabContent('cultivation');
    } catch (error) {
      ui.showToast(error.message);
    }
  });
}

async function handleTrainOffline() {
  const hours = prompt('离线修炼小时数（最多250）：', '8');
  if (!hours) return;
  try {
    const result = await api.trainOffline(parseInt(hours));
    ui.showToast(`离线修炼完成，获得经验${result.expGained}`);
    await loadCharacter();
    loadTabContent('cultivation');
  } catch (error) {
    ui.showToast(error.message);
  }
}

async function loadBattleTab() {
  const content = document.getElementById('tab-content');
  try {
    const character = await api.getCharacter();
    const maps = await api.getMaps();
    const enemy = await api.getEnemy();
    const skills = await api.getBattleSkills();

    content.innerHTML = `
      <div class="char-panel">
        <div class="char-panel-header">
          <div class="char-panel-title">战斗历练</div>
        </div>
        <div style="margin-bottom:16px;">
          <label style="font-size:12px;color:var(--text2);">选择地图</label>
          <select id="battle-map-select" class="input-field" style="width:100%;margin-top:4px;">
            ${(maps || []).map(m => `<option value="${m.id}">${m.name} (等级${m.min_level}-${m.max_level})</option>`).join('')}
          </select>
        </div>
        <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:20px;align-items:center;margin-bottom:20px;">
          <div style="text-align:center;">
            <div style="font-size:16px;font-weight:600;margin-bottom:4px;">${character.name}</div>
            <div style="font-size:12px;color:var(--text2);">${character.realm} Lv.${character.level}</div>
            <div style="font-size:12px;color:var(--green);">HP: ${character.hp || character.maxHp}/${character.maxHp}</div>
          </div>
          <div style="font-size:28px;color:var(--red);font-family:'Ma Shan Zheng',cursive;">VS</div>
          <div style="text-align:center;">
            <div style="font-size:16px;font-weight:600;margin-bottom:4px;">${enemy.name}</div>
            <div style="font-size:12px;color:var(--text2);">Lv.${enemy.level || 1}</div>
            <div style="font-size:12px;color:var(--red);">HP: ${enemy.hp}/${enemy.maxHp}</div>
          </div>
        </div>
        ${skills && skills.length > 0 ? `
          <div style="margin-bottom:12px;">
            <label style="font-size:12px;color:var(--text2);">选择技能</label>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">
              ${skills.map((s, i) => `
                <button class="btn small ${i === 0 ? 'primary' : ''}" onclick="selectBattleSkill(${i}, this)" data-skill-index="${i}">${s.name}</button>
              `).join('')}
            </div>
          </div>
        ` : ''}
        <button class="btn primary" onclick="handleBattle()" style="width:100%;">开始战斗</button>
      </div>
    `;
  } catch (error) {
    content.innerHTML = '<div class="char-panel"><p>加载失败</p></div>';
  }
}

let currentBattleSkill = 0;
function selectBattleSkill(index, btn) {
  currentBattleSkill = index;
  btn.parentElement.querySelectorAll('.btn').forEach(b => b.classList.remove('primary'));
  btn.classList.add('primary');
}

async function handleBattle() {
  const sel = document.getElementById('battle-map-select');
  const mapId = sel ? parseInt(sel.value) : 1;
  try {
    const result = await api.battle(mapId, currentBattleSkill);
    ui.showBattleResult(result);
    await loadCharacter();
    loadTabContent('battle');
  } catch (error) {
    ui.showToast(error.message);
  }
}

async function loadDungeonTab() {
  const content = document.getElementById('tab-content');
  try {
    const dungeons = await api.getDungeonList();
    content.innerHTML = `
      <div class="char-panel">
        <div class="char-panel-header">
          <div class="char-panel-title">副本挑战</div>
        </div>
        <div class="dungeon-grid">
          ${dungeons.map(d => `
            <div class="dungeon-card">
              <h4>${d.name}</h4>
              <p>推荐等级：${d.minLevel}-${d.maxLevel}</p>
              <p>难度：${'★'.repeat(Math.min(d.difficulty || 1, 5))}</p>
              <p>元素：${d.element || '无'}</p>
              <p>Boss：${d.boss || '未知'}</p>
              <div style="display:flex;gap:6px;margin-top:8px;">
                <button class="btn small primary" onclick="handleDungeon(${d.id})" style="flex:1;">挑战</button>
                <button class="btn small" onclick="handleSweepDungeon(${d.id})" style="flex:1;">扫荡</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (error) {
    content.innerHTML = '<div class="char-panel"><p>加载失败</p></div>';
  }
}

async function handleDungeon(dungeonId) {
  ui.showConfirm('进入副本', '确定要进入副本吗？', async () => {
    try {
      const result = await api.dungeonBattle(dungeonId);
      ui.showBattleResult(result);
      await loadCharacter();
    } catch (error) {
      ui.showToast(error.message);
    }
  });
}

async function handleSweepDungeon(dungeonId) {
  const times = prompt('扫荡次数（最多10）：', '1');
  if (!times) return;
  ui.showConfirm('扫荡副本', `确定要扫荡${times}次吗？`, async () => {
    try {
      const result = await api.sweepDungeon(dungeonId, parseInt(times));
      const r = result.rewards || {};
      ui.showToast(`扫荡完成，获得经验${r.exp || 0}，灵石${r.spiritStone || 0}`);
      await loadCharacter();
    } catch (error) { ui.showToast(error.message); }
  });
}

async function loadCaveTab() {
  const content = document.getElementById('tab-content');
  try {
    const data = await api.request('GET', '/cave/info');
    const cave = data.cave || {};
    content.innerHTML = `
      <div class="char-panel">
        <div class="char-panel-header">
          <div class="char-panel-title">洞府 - ${cave.caveName || '简陋石洞'}</div>
          <span style="font-size:12px;color:var(--gold);">等级 ${cave.level || 1}</span>
        </div>
        <div class="stats-grid" style="margin-bottom:16px;">
          <div class="stat-item"><div class="stat-label">大小</div><div class="stat-value">${cave.size || 10}</div></div>
          <div class="stat-item"><div class="stat-label">灵气/时</div><div class="stat-value">${cave.spiritPerHour || 0}</div></div>
          <div class="stat-item"><div class="stat-label">存储</div><div class="stat-value">${cave.spiritStored || 0}/${cave.storageLimit || 20}</div></div>
          <div class="stat-item"><div class="stat-label">美观</div><div class="stat-value">${cave.beauty || 0}</div></div>
        </div>
        ${cave.cultivationBonus ? `<div style="font-size:12px;color:var(--green);margin-bottom:8px;">修炼速度+${Math.floor(cave.cultivationBonus*100)}%</div>` : ''}
        <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;">
          <button class="btn small" onclick="caveAction('collect')">收取灵气</button>
          <button class="btn small" onclick="caveAction('upgrade')">升级洞府${data.upgradeCost ? ' ('+data.upgradeCost+'灵石)' : ''}</button>
        </div>
      </div>
      <div class="char-panel">
        <div class="char-panel-header"><div class="char-panel-title">阵法</div></div>
        <div style="font-size:12px;margin-bottom:8px;">已布置: ${(cave.formations||[]).length > 0 ? cave.formations.join(', ') : '无'}</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
          ${(data.availableFormations||[]).map(f => `
            <div class="shop-item" style="padding:6px;flex:1;min-width:120px;">
              <div class="shop-item-info">
                <div class="shop-item-name" style="font-size:12px;">${f.name}</div>
                <div class="shop-item-desc" style="font-size:11px;">${f.description}</div>
              </div>
              <button class="btn small" onclick="caveAction('formation','${f.id}')">${f.cost}灵石</button>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="char-panel">
        <div class="char-panel-header"><div class="char-panel-title">设施</div></div>
        <div style="font-size:12px;margin-bottom:8px;">已建造: ${(cave.facilities||[]).length > 0 ? cave.facilities.join(', ') : '无'}</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
          ${(data.availableFacilities||[]).map(f => `
            <div class="shop-item" style="padding:6px;flex:1;min-width:120px;">
              <div class="shop-item-info">
                <div class="shop-item-name" style="font-size:12px;">${f.name}</div>
                <div class="shop-item-desc" style="font-size:11px;">${f.description}</div>
              </div>
              <button class="btn small" onclick="caveAction('facility','${f.id}')">${f.cost}灵石</button>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="char-panel">
        <div class="char-panel-header"><div class="char-panel-title">符箓</div></div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
          ${(data.availableTalismans||[]).map(t => `
            <div class="shop-item" style="padding:6px;flex:1;min-width:120px;">
              <div class="shop-item-info">
                <div class="shop-item-name" style="font-size:12px;">${t.name}</div>
                <div class="shop-item-desc" style="font-size:11px;">${t.description}</div>
              </div>
              <button class="btn small" onclick="caveAction('talisman','${t.id}')">${t.cost}灵石</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (error) {
    content.innerHTML = '<div class="empty-state">加载洞府信息失败</div>';
  }
}

window.caveAction = async function(action, id) {
  try {
    if (action === 'collect') {
      const r = await api.request('POST', '/cave/collect');
      ui.showToast(`收取${r.collected}灵气`);
    } else if (action === 'upgrade') {
      const r = await api.request('POST', '/cave/upgrade');
      ui.showToast(r.message);
      await loadCaveTab();
    } else if (action === 'formation') {
      const r = await api.request('POST', '/cave/formation', { formationId: id });
      ui.showToast(r.message);
      await loadCaveTab();
    } else if (action === 'facility') {
      const r = await api.request('POST', '/cave/facility', { facilityId: id });
      ui.showToast(r.message);
      await loadCaveTab();
    } else if (action === 'talisman') {
      const r = await api.request('POST', '/cave/talisman', { talismanId: id });
      ui.showToast(r.message);
      await loadCaveTab();
    }
  } catch (error) { ui.showToast(error.message); }
};

async function loadGuildTab() {
  const content = document.getElementById('tab-content');
  try {
    const guild = await api.getGuildInfo();
    if (!guild) {
      content.innerHTML = `
        <div class="char-panel">
          <div class="char-panel-header">
            <div class="char-panel-title">仙盟</div>
          </div>
          <p style="margin-bottom:16px;color:var(--text2);">你还没有加入仙盟</p>
          <div style="display:flex;gap:8px;margin-bottom:16px;">
            <input type="text" id="guild-name-input" class="input-field" placeholder="输入仙盟名称" style="margin-bottom:0;flex:1;">
            <button class="btn primary" onclick="handleCreateGuild()" style="width:auto;margin-bottom:0;">创建仙盟</button>
          </div>
          <div id="guild-list"></div>
        </div>
      `;
      await loadGuildList();
    } else {
      content.innerHTML = `
        <div class="char-panel">
          <div class="char-panel-header">
            <div class="char-panel-title">${guild.name}</div>
            <span class="combat-power">等级：${guild.level} | 资金：${guild.funds || 0}</span>
          </div>
          <p style="font-size:12px;color:var(--text2);margin-bottom:12px;">公告：${guild.notice || '暂无'}</p>
          <div style="display:flex;gap:6px;margin-bottom:16px;">
            <button class="btn small active" onclick="loadGuildSub('members', this)">成员</button>
            <button class="btn small" onclick="loadGuildSub('buildings', this)">建筑</button>
            <button class="btn small" onclick="loadGuildSub('shop', this)">盟库</button>
            <button class="btn small" onclick="loadGuildSub('skills', this)">盟技</button>
            <button class="btn small" onclick="loadGuildSub('dungeon', this)">盟副本</button>
            <button class="btn small" onclick="loadGuildSub('activities', this)">活动</button>
            <button class="btn small danger" onclick="handleLeaveGuild()">退出</button>
          </div>
          <div id="guild-content"></div>
        </div>
      `;
      await loadGuildSub('members');
    }
  } catch (error) {
    content.innerHTML = '<div class="char-panel"><p>加载失败</p></div>';
  }
}

async function loadGuildSub(sub, btn) {
  if (btn) {
    btn.parentElement.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  const container = document.getElementById('guild-content');
  if (!container) return;

  switch (sub) {
    case 'members': {
      const members = await api.getGuildMembers();
      const myMember = members.find(m => m.id === gameState.character?.id);
      const isLeader = myMember?.position === '盟主';
      container.innerHTML = `
        <div style="display:flex;gap:8px;margin-bottom:12px;">
          <button class="btn small" onclick="handleDonateGuild()">捐献资金</button>
        </div>
        ${members.map(m => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid var(--border);">
            <div>
              <span style="font-weight:600;">${m.name}</span>
              <span style="color:var(--gold);font-size:11px;margin-left:8px;">${m.position}</span>
            </div>
            <div style="display:flex;gap:4px;align-items:center;">
              <span style="font-size:11px;color:var(--text2);">战力 ${m.combatPower}</span>
              ${isLeader && m.position !== '盟主' ? `
                <button class="btn small" onclick="handleSetGuildRole(${m.id}, '长老')">设长老</button>
                <button class="btn small danger" onclick="handleKickGuildMember(${m.id})">踢出</button>
              ` : ''}
            </div>
          </div>
        `).join('')}
      `;
      break;
    }
    case 'shop': {
      const shopData = await api.getGuildShop();
      container.innerHTML = `
        <div style="font-size:12px;color:var(--text2);margin-bottom:8px;">盟库资金：${shopData.funds || 0} | 消耗盟库资金购买物品</div>
        ${(shopData.items || []).length === 0 ? '<p style="font-size:12px;color:var(--text2);">暂无物品</p>' : (shopData.items || []).map(item => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid var(--border);">
            <div>
              <span style="font-weight:600;">${item.name}</span>
              <span style="font-size:11px;color:var(--text2);margin-left:8px;">${item.description || ''}</span>
            </div>
            <button class="btn small primary" onclick="handleGuildShopBuy(${item.id})">${item.cost} 资金</button>
          </div>
        `).join('')}
      `;
      break;
    }
    case 'skills': {
      const skillsResp = await api.getGuildSkills();
      const skills = skillsResp.skills || skillsResp || [];
      container.innerHTML = `
        <div style="font-size:12px;color:var(--text2);margin-bottom:8px;">消耗盟库资金升级技能，全盟加成 | 盟库资金：${skillsResp.guild_funds || 0}</div>
        ${(skills || []).length === 0 ? '<p style="font-size:12px;color:var(--text2);">暂无技能</p>' : (skills || []).map(s => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;margin-bottom:6px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg2);">
            <div style="flex:1;">
              <div style="font-weight:600;">${s.name}</div>
              <div style="font-size:11px;color:var(--text2);">等级 ${s.current_level || s.level || 0}/${s.max_level || s.maxLevel || 10} | ${s.description}</div>
            </div>
            <button class="btn small primary" onclick="handleGuildSkillUpgrade(${s.id})">升级</button>
          </div>
        `).join('')}
      `;
      break;
    }
    case 'dungeon': {
      const dungeon = await api.getGuildDungeon();
      container.innerHTML = `
        <div style="font-size:12px;color:var(--text2);margin-bottom:8px;">仙盟副本需3人以上组队进入</div>
        <div style="padding:12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg2);">
          <div style="font-weight:600;margin-bottom:4px;">${dungeon?.name || '仙盟秘境'}</div>
          <div style="font-size:11px;color:var(--text2);margin-bottom:8px;">推荐等级：${dungeon?.minLevel || 20}+ | 在线成员：${dungeon?.onlineCount || 0}</div>
          <button class="btn primary" onclick="handleGuildDungeonEnter()" style="width:100%;">${(dungeon?.onlineCount || 0) >= 3 ? '进入副本' : '人数不足(需3人)'}</button>
        </div>
      `;
      break;
    }
    case 'buildings': {
      try {
        const data = await api.request('GET', '/guild/buildings');
        const buildings = data.buildings || [];
        container.innerHTML = `
          <div style="font-size:12px;color:var(--text2);margin-bottom:8px;">盟库资金：${data.funds || 0} | 升级队列：${(data.buildQueue||[]).length}</div>
          ${(data.buildQueue||[]).length > 0 ? `<div style="font-size:11px;color:var(--gold);margin-bottom:8px;">升级中: ${(data.buildQueue||[]).map(b => b.buildingId).join(', ')}</div>` : ''}
          ${buildings.map(b => `
            <div class="shop-item" style="padding:10px;margin-bottom:6px;">
              <div class="shop-item-info" style="flex:1;">
                <div class="shop-item-name">${b.name} <span style="font-size:11px;color:var(--gold);">Lv.${b.currentLevel}/${b.maxLevel}</span></div>
                <div class="shop-item-desc">${b.description}</div>
              </div>
              ${b.currentLevel < b.maxLevel && !b.isUpgrading ? `<button class="btn small primary" onclick="handleGuildBuildUpgrade('${b.id}')">${b.upgradeCost}资金</button>` : ''}
              ${b.isUpgrading ? '<span style="font-size:11px;color:var(--gold);">升级中</span>' : ''}
            </div>
          `).join('')}
        `;
      } catch (e) { container.innerHTML = '<p style="font-size:12px;color:var(--red);">加载失败</p>'; }
      break;
    }
    case 'activities': {
      try {
        const data = await api.request('GET', '/guild/activities');
        const activities = data.activities || [];
        container.innerHTML = `
          <div style="font-size:12px;color:var(--text2);margin-bottom:8px;">盟内成员：${data.memberCount || 0}</div>
          ${activities.map(a => `
            <div class="shop-item" style="padding:10px;margin-bottom:6px;">
              <div class="shop-item-info" style="flex:1;">
                <div class="shop-item-name">${a.name}</div>
                <div class="shop-item-desc">${a.description} | 需${a.minMembers}人</div>
              </div>
              <button class="btn small primary" onclick="handleGuildActivity('${a.id}')" ${a.canEnter ? '' : 'disabled'}>${a.canEnter ? '参与' : '人数不足'}</button>
            </div>
          `).join('')}
        `;
      } catch (e) { container.innerHTML = '<p style="font-size:12px;color:var(--red);">加载失败</p>'; }
      break;
    }
  }
}

async function handleGuildShopBuy(itemId) {
  ui.showConfirm('购买', '确定要从盟库购买该物品吗？', async () => {
    try {
      const result = await api.guildShopBuy(itemId);
      ui.showToast('购买成功');
      loadGuildSub('shop');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleGuildSkillUpgrade(skillId) {
  ui.showConfirm('升级技能', '确定要升级该盟技吗？', async () => {
    try {
      const result = await api.upgradeGuildSkill(skillId);
      ui.showToast('升级成功');
      loadGuildSub('skills');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleGuildDungeonEnter() {
  ui.showConfirm('进入副本', '确定要进入仙盟副本吗？需要3人以上。', async () => {
    try {
      const result = await api.enterGuildDungeon();
      ui.showBattleResult(result);
      await loadCharacter();
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleGuildBuildUpgrade(buildingId) {
  ui.showConfirm('升级建筑', '确定要升级该建筑吗？', async () => {
    try {
      const result = await api.request('POST', '/guild/buildings/upgrade', { buildingId });
      ui.showToast(result.message || '升级成功');
      loadGuildSub('buildings');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleGuildActivity(activityId) {
  ui.showConfirm('参与活动', '确定要参与该活动吗？', async () => {
    try {
      const result = await api.request('POST', '/guild/activities/join', { activityId });
      ui.showToast(result.message || `获得经验${result.rewards?.exp || 0}`);
      await loadCharacter();
    } catch (error) { ui.showToast(error.message); }
  });
}

async function loadGuildList() {
  try {
    const list = await api.getGuildList();
    const container = document.getElementById('guild-list');
    if (!container) return;
    if (list.length === 0) {
      container.innerHTML = '<p style="color:var(--text2);">暂无仙盟</p>';
    } else {
      container.innerHTML = list.map(g => `
        <div class="shop-item">
          <div class="shop-item-info">
            <div class="shop-item-name">${g.name}</div>
            <div class="shop-item-desc">等级${g.level} | 成员${g.memberCount}/${g.maxMembers || 50}</div>
          </div>
          <button class="btn small primary" onclick="handleJoinGuild(${g.id})">加入</button>
        </div>
      `).join('');
    }
  } catch (error) {
    ui.showToast('加载仙盟列表失败');
  }
}

async function handleCreateGuild() {
  const name = document.getElementById('guild-name-input').value;
  if (!name) { ui.showToast('请输入仙盟名称'); return; }
  ui.showConfirm('创建仙盟', `确定要花费1000灵石创建仙盟"${name}"吗？`, async () => {
    try {
      await api.createGuild(name);
      ui.showToast('仙盟创建成功');
      await loadCharacter();
      loadTabContent('guild');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleJoinGuild(guildId) {
  ui.showConfirm('加入仙盟', '确定要加入该仙盟吗？', async () => {
    try {
      await api.joinGuild(guildId);
      ui.showToast('加入成功');
      loadTabContent('guild');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleLeaveGuild() {
  ui.showConfirm('退出仙盟', '确定要退出仙盟吗？', async () => {
    try {
      await api.leaveGuild();
      ui.showToast('已退出仙盟');
      loadTabContent('guild');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleDonateGuild() {
  const amount = prompt('捐献灵石数量：', '100');
  if (!amount) return;
  try {
    await api.donateGuild(parseInt(amount));
    ui.showToast('捐献成功');
    await loadCharacter();
    loadTabContent('guild');
  } catch (error) { ui.showToast(error.message); }
}

async function handleKickGuildMember(characterId) {
  ui.showConfirm('踢出成员', '确定要踢出该成员吗？', async () => {
    try {
      await api.kickGuildMember(characterId);
      ui.showToast('成员已踢出');
      loadTabContent('guild');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleSetGuildRole(characterId, role) {
  ui.showConfirm('设置职位', `确定要将该成员设为${role}吗？`, async () => {
    try {
      await api.setGuildRole(characterId, role);
      ui.showToast('职位已设置');
      loadTabContent('guild');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function loadArenaTab() {
  const content = document.getElementById('tab-content');
  try {
    const opponents = await api.getArenaOpponents();
    content.innerHTML = `
      <div class="char-panel">
        <div class="char-panel-header">
          <div class="char-panel-title">竞技场</div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:16px;">
          <button class="btn" onclick="handleArenaMatch()" style="flex:1;">随机匹配</button>
          <button class="btn" onclick="loadArenaTab()" style="flex:1;">刷新对手</button>
          <button class="btn" onclick="handleArenaRankings()" style="flex:1;">排行榜</button>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:8px;">选择对手挑战：</div>
        <div id="arena-opponents">
          ${opponents.length === 0 ? '<p style="font-size:12px;color:var(--text2);">暂无对手</p>' : opponents.map(o => `
            <div class="arena-opponent" style="display:flex;justify-content:space-between;align-items:center;padding:10px;margin-bottom:6px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg2);">
              <div>
                <div style="font-weight:600;">${o.name}</div>
                <div style="font-size:11px;color:var(--text2);">${o.realm} | 战力 ${o.combatPower}</div>
              </div>
              <button class="btn small primary" onclick="handleChallenge(${o.id})">挑战</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (error) {
    content.innerHTML = '<div class="char-panel"><p>加载失败</p></div>';
  }
}

async function handleArenaMatch() {
  try {
    const result = await api.arenaMatch();
    ui.showBattleResult(result);
    await loadCharacter();
    loadTabContent('arena');
  } catch (error) { ui.showToast(error.message); }
}

async function handleChallenge(opponentId) {
  ui.showConfirm('挑战', '确定要挑战该玩家吗？', async () => {
    try {
      const result = await api.challenge(opponentId);
      ui.showBattleResult(result);
      await loadCharacter();
      loadTabContent('arena');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleArenaRankings() {
  try {
    const data = await api.getArenaRankings();
    const rankings = data.rankings || data;
    const rankType = data.rankType || '排行';
    document.getElementById('modal-title').textContent = `${rankType}榜`;
    document.getElementById('modal-body').innerHTML = `
      <table class="rankings-table">
        <thead><tr><th>排名</th><th>名称</th><th>境界</th><th>战力</th></tr></thead>
        <tbody>
          ${rankings.map(r => `
            <tr><td>${r.rank}</td><td>${r.name}</td><td>${r.realm}</td><td>${r.combatPower || r.points || 0}</td></tr>
          `).join('')}
        </tbody>
      </table>
    `;
    document.getElementById('modal-footer').innerHTML = '<button class="btn primary" onclick="ui.closeModal()">关闭</button>';
    document.getElementById('modal').classList.remove('hidden');
  } catch (error) { ui.showToast('加载排行榜失败'); }
}

async function loadShopTab() {
  const content = document.getElementById('tab-content');
  try {
    const items = await api.getShopItems();
    const inventory = await api.getInventory();
    const categories = [...new Set(items.map(i => i.type || '其他'))];
    
    content.innerHTML = `
      <div class="char-panel">
        <div class="char-panel-header">
          <div class="char-panel-title">仙市交易</div>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;">
          <button class="btn small active" onclick="filterShop('all', this)" data-filter="all">全部</button>
          ${categories.map(c => `<button class="btn small" onclick="filterShop('${c}', this)" data-filter="${c}">${c}</button>`).join('')}
        </div>
        <div id="shop-items">
          ${items.map(item => `
            <div class="shop-item" data-type="${item.type || '其他'}">
              <div class="shop-item-info">
                <div class="shop-item-name">${item.name}</div>
                <div class="shop-item-desc">${item.description || ''}</div>
                <div class="shop-item-price">${item.price} 灵石</div>
              </div>
              <button class="btn small primary" onclick="handleBuyItem(${item.id})">购买</button>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="char-panel">
        <div class="char-panel-header">
          <div class="char-panel-title">出售物品</div>
        </div>
        <div id="sell-items">
          ${inventory.length === 0 ? '<p style="font-size:12px;color:var(--text2);">背包为空</p>' : inventory.map(i => `
            <div class="shop-item">
              <div class="shop-item-info">
                <div class="shop-item-name">${i.name || i.item?.name || '物品'}</div>
                <div class="shop-item-desc">${i.type || i.item?.type || ''} x${i.quantity || 1}</div>
              </div>
              <button class="btn small" onclick="handleSellItem(${i.id})">出售</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (error) {
    content.innerHTML = '<div class="char-panel"><p>加载失败</p></div>';
  }
}

function filterShop(type, btn) {
  document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('#shop-items .shop-item').forEach(item => {
    if (type === 'all' || item.dataset.type === type) {
      item.style.display = '';
    } else {
      item.style.display = 'none';
    }
  });
}

async function handleBuyItem(itemId) {
  ui.showConfirm('购买', '确定要购买该物品吗？', async () => {
    try {
      await api.buyItem(itemId);
      ui.showToast('购买成功');
      await loadCharacter();
    } catch (error) { ui.showToast(error.message); }
  });
}

async function loadAfkTab() {
  const content = document.getElementById('tab-content');
  try {
    const status = await api.getAfkStatus();
    content.innerHTML = `
      <div class="char-panel">
        <div class="char-panel-header">
          <div class="char-panel-title">挂机修炼</div>
        </div>
        <div class="stats-grid" style="margin-bottom:16px;">
          <div class="stat-item"><span class="stat-label">状态</span><span class="stat-value">${status.isAfk ? '挂机中' : '未挂机'}</span></div>
          <div class="stat-item"><span class="stat-label">挂机地图</span><span class="stat-value">${status.afkMap}</span></div>
          <div class="stat-item"><span class="stat-label">最大挂机时间</span><span class="stat-value">${status.maxOfflineHours}小时</span></div>
        </div>
        ${status.offlineRewards ? `
          <div style="margin-bottom:16px;padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);">
            <p style="font-size:12px;margin-bottom:8px;">离线收益：</p>
            <div class="stats-grid">
              <div class="stat-item"><span class="stat-label">经验</span><span class="stat-value">${status.offlineRewards.exp}</span></div>
              <div class="stat-item"><span class="stat-label">灵石</span><span class="stat-value">${status.offlineRewards.spiritStone}</span></div>
            </div>
          </div>
        ` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn primary" onclick="handleStartAfk()" style="flex:1;min-width:100px;">开始挂机</button>
          <button class="btn" onclick="handleStopAfk()" style="flex:1;min-width:100px;">停止挂机</button>
          <button class="btn" onclick="handleCollectAfk()" style="flex:1;min-width:100px;">领取收益</button>
        </div>
      </div>
    `;
  } catch (error) {
    content.innerHTML = '<div class="char-panel"><p>加载失败</p></div>';
  }
}

async function handleStartAfk() {
  const mapId = prompt('选择挂机地图（1-6）：', '1');
  if (!mapId) return;
  try {
    await api.startAfk(parseInt(mapId));
    ui.showToast('开始挂机');
    loadTabContent('afk');
  } catch (error) { ui.showToast(error.message); }
}

async function handleStopAfk() {
  try {
    const result = await api.stopAfk();
    if (result) {
      ui.showToast(`挂机结束，获得经验${result.expGained}，灵石${result.spiritStoneGained}`);
      await loadCharacter();
      loadTabContent('afk');
    }
  } catch (error) { ui.showToast(error.message); }
}

async function handleCollectAfk() {
  try {
    const result = await api.collectAfk();
    if (result) {
      ui.showToast(`领取成功，获得经验${result.expGained}，灵石${result.spiritStoneGained}`);
      await loadCharacter();
      loadTabContent('afk');
    }
  } catch (error) { ui.showToast(error.message); }
}

async function loadSeasonTab() {
  const content = document.getElementById('tab-content');
  try {
    const season = await api.getCurrentSeason();
    content.innerHTML = `
      <div class="char-panel">
        <div class="char-panel-header">
          <div class="char-panel-title">赛季竞技</div>
        </div>
        <div class="stats-grid" style="margin-bottom:16px;">
          <div class="stat-item"><span class="stat-label">当前赛季</span><span class="stat-value">${season.season.name}</span></div>
          <div class="stat-item"><span class="stat-label">距离重置</span><span class="stat-value">${season.daysUntilReset}天</span></div>
          <div class="stat-item"><span class="stat-label">报名状态</span><span class="stat-value">${season.seasonRegistered ? '已报名' : '未报名'}</span></div>
          <div class="stat-item"><span class="stat-label">报名费用</span><span class="stat-value">${season.registrationFee}灵石</span></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn primary" onclick="handleSeasonRegister()" style="flex:1;min-width:100px;">报名赛季</button>
          <button class="btn" onclick="handleSeasonRankings()" style="flex:1;min-width:100px;">排行榜</button>
          <button class="btn" onclick="handleSeasonSettle()" style="flex:1;min-width:100px;">结算赛季</button>
        </div>
        <div id="season-content" style="margin-top:16px;"></div>
      </div>
    `;
  } catch (error) {
    content.innerHTML = '<div class="char-panel"><p>加载失败</p></div>';
  }
}

async function handleSeasonRegister() {
  ui.showConfirm('报名赛季', '确定要花费1000灵石报名本赛季吗？', async () => {
    try {
      await api.registerSeason();
      ui.showToast('报名成功');
      await loadCharacter();
      loadTabContent('season');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleSeasonRankings() {
  try {
    const rankings = await api.getSeasonRankings();
    const content = document.getElementById('season-content');
    if (content) {
      content.innerHTML = `
        <div class="char-panel-title" style="margin-bottom:8px;">赛季排行榜</div>
        <table class="rankings-table">
          <thead><tr><th>排名</th><th>名称</th><th>境界</th><th>积分</th></tr></thead>
          <tbody>
            ${rankings.map(r => `<tr><td>${r.rank}</td><td>${r.name}</td><td>${r.realm}</td><td>${r.points}</td></tr>`).join('')}
          </tbody>
        </table>
      `;
    }
  } catch (error) { ui.showToast('加载排行榜失败'); }
}

async function handleSeasonSettle() {
  try {
    const result = await api.settleSeason();
    if (result.settled) {
      ui.showToast(`结算成功，排名${result.rank}，获得经验${result.rewards.exp}，灵石${result.rewards.spiritStone}`);
      await loadCharacter();
    } else {
      ui.showToast(result.message || `还有${result.daysLeft}天重置`);
    }
  } catch (error) { ui.showToast(error.message); }
}

async function loadVipTab() {
  const content = document.getElementById('tab-content');
  try {
    const [vipInfo, levelsData, history] = await Promise.all([
      api.getVipInfo(),
      api.getVipLevels(),
      api.getRechargeHistory()
    ]);
    const levels = levelsData.levels || [];
    const packages = levelsData.packages || [];
    content.innerHTML = `
      <div class="char-panel">
        <div class="char-panel-header">
          <div class="char-panel-title">VIP特权</div>
          <span style="font-size:12px;color:var(--gold);">仙玉: ${vipInfo.jade || 0}</span>
        </div>
        <div class="stats-grid" style="margin-bottom:12px;">
          <div class="stat-item"><div class="stat-label">当前等级</div><div class="stat-value">VIP${vipInfo.level} ${vipInfo.name}</div></div>
          <div class="stat-item"><div class="stat-label">经验加成</div><div class="stat-value">+${((vipInfo.benefits.expBonus - 1) * 100).toFixed(0)}%</div></div>
          <div class="stat-item"><div class="stat-label">灵石加成</div><div class="stat-value">+${((vipInfo.benefits.spiritStoneBonus - 1) * 100).toFixed(0)}%</div></div>
          <div class="stat-item"><div class="stat-label">每日仙玉</div><div class="stat-value">${vipInfo.dailyJade}</div></div>
        </div>
        ${vipInfo.canClaimDaily ? `<button class="btn small primary" onclick="handleClaimVipDaily()" style="margin-bottom:12px;width:100%;">领取每日${vipInfo.dailyJade}仙玉</button>` : ''}
        ${vipInfo.nextLevel ? `
          <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2);margin-bottom:4px;">
              <span>VIP${vipInfo.level}</span><span>VIP${vipInfo.nextLevel.level}</span>
            </div>
            <div style="height:6px;background:var(--border);border-radius:3px;">
              <div style="height:100%;width:${Math.min(100, ((vipInfo.nextLevel.required - vipInfo.nextLevel.remaining) / vipInfo.nextLevel.required * 100))}%;background:linear-gradient(90deg,var(--red),var(--gold));border-radius:3px;"></div>
            </div>
            <div style="font-size:11px;color:var(--text2);margin-top:4px;">还需${vipInfo.nextLevel.remaining}经验升级</div>
          </div>
        ` : '<div style="font-size:12px;color:var(--gold);margin-bottom:12px;">已达最高等级</div>'}
      </div>
      <div class="char-panel" style="margin-bottom:12px;">
        <div class="char-panel-header"><div class="char-panel-title">充值套餐</div></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
          ${packages.map(pkg => `
            <div style="border:1px solid var(--border);border-radius:var(--radius);padding:10px;text-align:center;cursor:pointer;transition:all 0.2s;"
                 onclick="handleVipRecharge(${pkg.id})" onmouseover="this.style.borderColor='var(--red)'" onmouseout="this.style.borderColor='var(--border)'">
              ${pkg.badge ? `<div style="background:var(--red);color:#fff;font-size:10px;padding:1px 4px;border-radius:3px;display:inline-block;margin-bottom:4px;">${pkg.badge}</div>` : ''}
              <div style="font-weight:600;font-size:12px;margin-bottom:2px;">${pkg.name}</div>
              <div style="font-size:18px;font-weight:700;color:var(--red);">${pkg.price}</div>
              <div style="font-size:10px;color:var(--gold);">${pkg.jade}仙玉${pkg.bonusJade ? `+${pkg.bonusJade}` : ''}</div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="char-panel" style="margin-bottom:12px;">
        <div class="char-panel-header"><div class="char-panel-title">等级一览</div></div>
        <div style="max-height:200px;overflow-y:auto;">
          ${levels.map(v => `
            <div style="display:flex;justify-content:space-between;padding:6px;border-bottom:1px solid var(--border);${v.level === vipInfo.level ? 'background:var(--bg2);' : ''}">
              <span style="font-size:12px;${v.level === vipInfo.level ? 'color:var(--gold);font-weight:600;' : ''}">VIP${v.level} ${v.name}</span>
              <span style="font-size:11px;color:var(--text2);">${v.required}经验 | +${((v.benefits.expBonus - 1) * 100).toFixed(0)}% | 日${v.benefits.dailyJade}玉</span>
            </div>
          `).join('')}
        </div>
      </div>
      ${history.logs && history.logs.length > 0 ? `
        <div class="char-panel">
          <div class="char-panel-header"><div class="char-panel-title">充值记录</div></div>
          ${history.logs.map(l => `
            <div style="display:flex;justify-content:space-between;padding:6px;border-bottom:1px solid var(--border);font-size:12px;">
              <span>${l.packageName} ¥${l.price}</span>
              <span style="color:var(--gold);">+${l.jade}仙玉</span>
              <span style="color:var(--text2);">${new Date(l.timestamp).toLocaleDateString()}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
  } catch (error) {
    content.innerHTML = '<div class="char-panel"><p>加载失败</p></div>';
  }
}

async function handleVipRecharge(packageId) {
  ui.showConfirm('确认充值', '确定要充值该套餐吗？', async () => {
    try {
      const result = await api.rechargeVip(packageId);
      ui.showToast(result.message || '充值成功');
      if (result.leveledUp) ui.showToast('VIP升级了！');
      await loadCharacter();
      loadTabContent('vip');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleClaimVipDaily() {
  try {
    const result = await api.claimVipDaily();
    ui.showToast(result.message || `领取${result.jade}仙玉`);
    await loadCharacter();
    loadTabContent('vip');
  } catch (error) { ui.showToast(error.message); }
}

async function loadAchievementTab() {
  const content = document.getElementById('tab-content');
  try {
    const achievements = await api.getAchievements();
    content.innerHTML = `
      <div class="char-panel">
        <div class="char-panel-header">
          <div class="char-panel-title">成就系统</div>
        </div>
        <div id="achievement-list">
          ${achievements.map(a => `
            <div class="shop-item">
              <div class="shop-item-info">
                <div class="shop-item-name">${a.name} ${a.unlocked ? '(已达成)' : ''}</div>
                <div class="shop-item-desc">${a.description}</div>
                <div style="margin-top:4px;">
                  <div class="bar-track" style="height:6px;">
                    <div class="bar-fill exp-fill" style="width:${a.progress * 100}%"></div>
                  </div>
                </div>
              </div>
              ${!a.unlocked && a.progress >= 1 ? `
                <button class="btn small primary" onclick="handleClaimAchievement(${a.id})">领取</button>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (error) {
    content.innerHTML = '<div class="char-panel"><p>加载失败</p></div>';
  }
}

async function handleClaimAchievement(achievementId) {
  try {
    const result = await api.claimAchievement(achievementId);
    if (result) {
      ui.showAchievementResult(result);
      await loadCharacter();
      loadTabContent('achievement');
    }
  } catch (error) { ui.showToast(error.message); }
}

async function loadPetTab() {
  const content = document.getElementById('tab-content');
  try {
    const pets = await api.getPets();
    content.innerHTML = `
      <div class="char-panel">
        <div class="char-panel-header">
          <div class="char-panel-title">灵宠</div>
        </div>
        ${pets.length === 0 ? '<div class="empty-state"><p>暂无灵宠</p></div>' : `
          <div id="pet-list">
            ${pets.map(p => {
              const stats = p.item ? JSON.parse(p.item.stats || '{}') : {};
              return `
              <div class="pet-card" style="padding:12px;margin-bottom:8px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg2);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                  <span style="font-weight:600;">${p.name || p.item?.name || '灵宠'}</span>
                  <span style="font-size:11px;color:var(--gold);">${p.quality || p.item?.quality || ''}</span>
                </div>
                <div style="font-size:11px;color:var(--text2);margin-bottom:6px;">
                  <span>等级：${p.level || 1}</span> | 
                  <span>攻击：${stats.attack || 0}</span> | 
                  <span>防御：${stats.defense || 0}</span> | 
                  <span>生命：${stats.hp || 0}</span>
                </div>
                <div style="display:flex;gap:6px;">
                  ${p.is_active ? '<span style="font-size:11px;color:var(--green);">出战中</span>' : `<button class="btn small primary" onclick="handleEquipPet(${p.id})">出战</button>`}
                  <button class="btn small" onclick="handleFeedPet(${p.id})">喂养</button>
                  <button class="btn small danger" onclick="handleUnequipPet(${p.id})">收回</button>
                </div>
              </div>
            `}).join('')}
          </div>
        `}
      </div>
    `;
  } catch (error) {
    content.innerHTML = '<div class="char-panel"><p>加载失败</p></div>';
  }
}

async function handleEquipPet(petId) {
  try {
    await api.equipPet(petId);
    ui.showToast('灵宠出战');
    await loadCharacter();
    loadTabContent('pet');
  } catch (error) { ui.showToast(error.message); }
}

async function handleFeedPet(petId) {
  const amount = prompt('喂养数量：', '10');
  if (!amount) return;
  try {
    await api.feedPet(petId, 'food', parseInt(amount));
    ui.showToast('喂养成功');
    loadTabContent('pet');
  } catch (error) { ui.showToast(error.message); }
}

async function handleUnequipPet(petId) {
  try {
    await api.unequipPet(petId);
    ui.showToast('灵宠已收回');
    await loadCharacter();
    loadTabContent('pet');
  } catch (error) { ui.showToast(error.message); }
}

async function loadGongfaTab() {
  const content = document.getElementById('tab-content');
  content.innerHTML = `
    <div class="char-panel">
      <div class="char-panel-header">
        <div class="char-panel-title">功法</div>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:16px;">
        <button class="btn small active" onclick="loadGongfaSub('all', this)">全部</button>
        <button class="btn small" onclick="loadGongfaSub('cultivation', this)">修炼功法</button>
        <button class="btn small" onclick="loadGongfaSub('combat', this)">战斗功法</button>
        <button class="btn small" onclick="loadGongfaSub('support', this)">辅助功法</button>
      </div>
      <div id="gongfa-content"></div>
    </div>
  `;
  await loadGongfaSub('all');
}

async function loadGongfaSub(sub, btn) {
  if (btn) {
    btn.parentElement.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  const container = document.getElementById('gongfa-content');
  if (!container) return;

  try {
    const gongfas = await api.getGongfa();
    const categoryNames = { cultivation: '修炼', combat: '战斗', support: '辅助' };
    const subtypeNames = {
      cultivation: { '吐纳': '呼吸吐纳', '引导': '引导术', '存想': '存想法' },
      combat: { '剑诀': '剑法', '掌法': '掌法', '身法': '身法', '阵法': '阵法', '符箓': '符箓术', '炼体': '炼体术' },
      support: { '炼丹': '炼丹术', '炼器': '炼器术', '采集': '采集术', '经商': '经商术' }
    };

    const filtered = sub === 'all' ? gongfas : gongfas.filter(g => {
      const cat = g.type || (g.item?.description?.includes('修炼') ? 'cultivation' : 'combat');
      return cat === sub;
    });

    if (filtered.length === 0) {
      container.innerHTML = '<p style="font-size:12px;color:var(--text2);">暂无功法</p>';
      return;
    }

    container.innerHTML = filtered.map(g => {
      const stats = g.item ? JSON.parse(g.item.stats || '{}') : {};
      const category = g.type || 'combat';
      const qualityColors = { '黄阶': '#888', '玄阶': '#4fc3f7', '地阶': '#66bb6a', '天阶': '#ffa726', '圣阶': '#ab47bc', '仙阶': '#ef5350' };
      return `
        <div style="padding:12px;margin-bottom:8px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg2);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-weight:600;">${g.name || g.item?.name || '功法'}</span>
            <div style="display:flex;gap:4px;align-items:center;">
              <span style="font-size:10px;padding:2px 6px;border-radius:3px;background:${qualityColors[g.quality] || '#888'};color:#fff;">${g.quality || '黄阶'}</span>
              <span style="font-size:10px;padding:2px 6px;border-radius:3px;background:var(--border);">${categoryNames[category] || '未知'}</span>
            </div>
          </div>
          <div style="font-size:11px;color:var(--text2);margin-bottom:6px;">
            <span>等级：${g.level || 1}</span>
            ${stats.cultivation_speed ? ` | 修炼速度：x${stats.cultivation_speed.toFixed(2)}` : ''}
            ${stats.skill_damage ? ` | 技能伤害：+${((stats.skill_damage - 1) * 100).toFixed(0)}%` : ''}
            ${stats.attack ? ` | 攻击：+${stats.attack}` : ''}
            ${stats.defense ? ` | 防御：+${stats.defense}` : ''}
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn small" onclick="handleUnequipGongfa(${g.id})">卸下</button>
            <button class="btn small primary" onclick="handleUpgradeGongfa(${g.id})">升级</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    container.innerHTML = '<p style="font-size:12px;color:var(--red);">加载失败</p>';
  }
}

async function handleUnequipGongfa(gongfaId) {
  ui.showConfirm('卸下功法', '确定要卸下该功法吗？', async () => {
    try {
      await api.unequipGongfa(gongfaId);
      ui.showToast('功法已卸下');
      await loadCharacter();
      loadTabContent('gongfa');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleUpgradeGongfa(gongfaId) {
  try {
    await api.upgradeGongfa(gongfaId);
    ui.showToast('功法升级成功');
    loadTabContent('gongfa');
  } catch (error) { ui.showToast(error.message); }
}

async function loadSkillTab() {
  const content = document.getElementById('tab-content');
  content.innerHTML = `
    <div class="char-panel">
      <div class="char-panel-header">
        <div class="char-panel-title">技能</div>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;">
        <button class="btn small active" onclick="loadSkillSub('my', this)">我的技能</button>
        <button class="btn small" onclick="loadSkillSub('all', this)">技能图鉴</button>
        <button class="btn small" onclick="loadSkillSub('shop', this)">技能商店</button>
        <button class="btn small" onclick="loadSkillSub('elements', this)">元素克制</button>
        <button class="btn small" onclick="loadSkillSub('hidden', this)">隐藏技能</button>
        <button class="btn small" onclick="loadSkillSub('synthesize', this)">技能合成</button>
      </div>
      <div id="skill-content"></div>
    </div>
  `;
  await loadSkillSub('my');
}

let skillSortBy = 'element';
let skillFilterElement = 'all';
let skillFilterSlot = 'all';
let skillFilterType = 'all';

async function loadSkillSub(sub, btn) {
  if (btn) {
    btn.parentElement.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  const container = document.getElementById('skill-content');
  if (!container) return;

  const ELEMENT_COLORS = {
    metal: '#ffd54f', wood: '#81c784', water: '#4fc3f7', fire: '#ff6b35',
    earth: '#8d6e63', light: '#fff176', dark: '#7e57c2', none: '#bdbdbd'
  };
  const ELEMENT_NAMES = {
    metal: '金', wood: '木', water: '水', fire: '火',
    earth: '土', light: '光明', dark: '黑暗', none: '无'
  };
  const SLOT_NAMES = { main: '主技能', sub: '副技能', ultimate: '终极' };
  const TYPE_NAMES = { active: '主动', passive: '被动' };

  switch (sub) {
    case 'my': {
      const data = await api.getMySkills();
      const skills = data.skills || data || [];
      const equipped = skills.filter(s => s.equipped_slot);
      const unequipped = skills.filter(s => !s.equipped_slot);
      // 阶段5：消费服务端槽位上限与 CD 惩罚
      const SERVER_MAX = data.slotLimits || {};
      const cdPenalty = data.cdPenalty || 1;
      const totalEquipped = equipped.length;

      container.innerHTML = `
        <div style="margin-bottom:12px;">
          <div style="font-size:12px;font-weight:600;margin-bottom:6px;">装备槽位
            <span style="color:${totalEquipped >= (data.maxSlots || 8) ? '#ff6b35' : 'var(--text2)'};font-size:11px;">
              已用 ${totalEquipped}/${data.maxSlots || '?'}（境界决定上限，min(2+境界序号, 8)）${totalEquipped >= (data.maxSlots || 8) ? ' · 已满，需先卸下一个' : ''}
            </span>
            ${data.cdPenalty > 1 ? `<span style="color:#ff6b35;font-size:10px;">⚠ 冷却×${data.cdPenalty}</span>` : ''}
          </div>
          <div style="font-size:11px;color:var(--text2);margin-bottom:6px;">
            低境界时下方 ${Object.values(SERVER_MAX).reduce((a, b) => a + b, 0)} 个分类槽位**装不满**：真正的限制是上面这条总槽位上限（服务端 ${data.maxSlots}）。
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px;margin-bottom:12px;">
            ${['main','sub','ultimate'].map(slot => {
              const slotSkills = equipped.filter(s => s.equipped_slot === slot);
              const maxSlots = SERVER_MAX[slot] || (slot === 'ultimate' ? 1 : 3);
              const filled = slotSkills.length;
              return `
                <div style="padding:8px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg2);">
                  <div style="font-size:11px;color:var(--text2);margin-bottom:4px;">${SLOT_NAMES[slot]} (${filled}/${maxSlots})</div>
                  ${slotSkills.map(s => `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">
                      <span style="font-size:11px;color:${ELEMENT_COLORS[s.element] || '#fff'};">[${ELEMENT_NAMES[s.element] || '无'}] ${s.name}</span>
                      <button class="btn small danger" onclick="handleUnequipSkill('${s.id}')" style="padding:1px 4px;font-size:10px;">卸</button>
                    </div>
                  `).join('')}
                  ${filled < maxSlots ? '<div style="font-size:10px;color:var(--text2);">空</div>' : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
          <select id="skill-sort" class="input-field" style="width:auto;padding:4px 8px;font-size:11px;" onchange="skillSortBy=this.value;loadSkillSub('my')">
            <option value="element" ${skillSortBy==='element'?'selected':''}>按元素</option>
            <option value="slot" ${skillSortBy==='slot'?'selected':''}>按槽位</option>
            <option value="level" ${skillSortBy==='level'?'selected':''}>按等级</option>
            <option value="quality" ${skillSortBy==='quality'?'selected':''}>按品质</option>
          </select>
          <select id="skill-filter-e" class="input-field" style="width:auto;padding:4px 8px;font-size:11px;" onchange="skillFilterElement=this.value;loadSkillSub('my')">
            <option value="all">全元素</option>
            ${Object.entries(ELEMENT_NAMES).map(([k,v]) => `<option value="${k}" ${skillFilterElement===k?'selected':''}>${v}</option>`).join('')}
          </select>
          <select id="skill-filter-t" class="input-field" style="width:auto;padding:4px 8px;font-size:11px;" onchange="skillFilterType=this.value;loadSkillSub('my')">
            <option value="all">全类型</option>
            <option value="active" ${skillFilterType==='active'?'selected':''}>主动</option>
            <option value="passive" ${skillFilterType==='passive'?'selected':''}>被动</option>
          </select>
        </div>
        <div style="font-size:12px;font-weight:600;margin-bottom:6px;">未装备 (${unequipped.length})</div>
        ${unequipped.length === 0 ? '<p style="font-size:12px;color:var(--text2);">暂无技能</p>' :
          unequipped.map(s => renderSkillCard(s, true)).join('')}
      `;
      break;
    }
    case 'all': {
      const data = await api.getAllSkills();
      const skills = data.skills || data || [];
      container.innerHTML = `
        <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;">
          <select class="input-field" style="width:auto;padding:4px 8px;font-size:11px;" onchange="skillFilterElement=this.value;loadSkillSub('all')">
            <option value="all">全元素</option>
            ${Object.entries(ELEMENT_NAMES).map(([k,v]) => `<option value="${k}" ${skillFilterElement===k?'selected':''}>${v}</option>`).join('')}
          </select>
          <select class="input-field" style="width:auto;padding:4px 8px;font-size:11px;" onchange="skillFilterSlot=this.value;loadSkillSub('all')">
            <option value="all">全槽位</option>
            <option value="main" ${skillFilterSlot==='main'?'selected':''}>主技能</option>
            <option value="sub" ${skillFilterSlot==='sub'?'selected':''}>副技能</option>
            <option value="ultimate" ${skillFilterSlot==='ultimate'?'selected':''}>终极</option>
          </select>
        </div>
        ${skills.filter(s => (skillFilterElement==='all' || s.element===skillFilterElement) && (skillFilterSlot==='all' || s.slot===skillFilterSlot)).map(s => `
          <div style="padding:10px;margin-bottom:6px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg2);">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <span style="font-weight:600;color:${ELEMENT_COLORS[s.element] || '#fff'};">[${ELEMENT_NAMES[s.element] || '无'}] ${s.name}</span>
                <span style="font-size:10px;padding:2px 6px;margin-left:6px;border-radius:3px;background:${ELEMENT_COLORS[s.element] || '#888'}40;">${SLOT_NAMES[s.slot] || s.slot}</span>
                <span style="font-size:10px;padding:2px 6px;margin-left:4px;border-radius:3px;background:var(--border);">${TYPE_NAMES[s.type] || s.type}</span>
              </div>
              <button class="btn small primary" onclick="handleLearnSkill('${s.id}')">领悟</button>
            </div>
            <div style="font-size:11px;color:var(--text2);margin-top:4px;">${s.description} | 消耗:${s.mana_cost} | 冷却:${s.cooldown}回合 | 倍率:${(s.damage_mult*100).toFixed(0)}%</div>
            <div style="font-size:10px;color:var(--gold);margin-top:2px;">${s.quality} | ${s.required_realm} | 来源:${s.source} | 领悟:${s.learn_cost}灵石</div>
          </div>
        `).join('')}
      `;
      break;
    }
    case 'shop': {
      const data = await api.getSkillShop();
      const books = data.shop || data.books || data || [];
      container.innerHTML = `
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;">技能书商店</div>
        <p style="font-size:11px;color:var(--text2);margin-bottom:12px;">购买技能书后可领悟对应技能</p>
        ${books.length === 0 ? '<p style="font-size:12px;color:var(--text2);">暂无技能书</p>' : books.map(b => `
          <div style="padding:10px;margin-bottom:6px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg2);">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <span style="font-weight:600;color:${ELEMENT_COLORS[b.element] || '#fff'};">[${ELEMENT_NAMES[b.element] || '无'}] ${b.name}</span>
                <span style="font-size:10px;padding:2px 6px;margin-left:6px;border-radius:3px;background:${ELEMENT_COLORS[b.element] || '#888'}40;">${b.quality}</span>
              </div>
              <button class="btn small primary" onclick="handleBuySkillBook('${b.id}')">${b.learn_cost}灵石</button>
            </div>
            <div style="font-size:11px;color:var(--text2);margin-top:4px;">${b.description}</div>
          </div>
        `).join('')}
      `;
      break;
    }
    case 'elements': {
      try {
        const data = await api.getSkillElements();
        const elements = data.elements || data || [];
        container.innerHTML = `
          <div style="font-size:12px;font-weight:600;margin-bottom:8px;">元素克制关系</div>
          <p style="font-size:11px;color:var(--text2);margin-bottom:12px;">克制: 伤害+20% | 被克制: 伤害-20%</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;">
            ${elements.map(e => `
              <div style="padding:10px;border:1px solid ${e.color || ELEMENT_COLORS[e.id] || '#888'}40;border-radius:var(--radius);background:${e.color || ELEMENT_COLORS[e.id] || '#888'}15;text-align:center;">
                <div style="font-size:16px;font-weight:700;color:${e.color || ELEMENT_COLORS[e.id] || '#888'};">${e.name || ELEMENT_NAMES[e.id] || '?'}</div>
                <div style="font-size:10px;color:var(--text2);margin-top:4px;">克制: ${(e.strong || []).join(', ') || '无'}</div>
                <div style="font-size:10px;color:var(--text2);">被克: ${(e.weak || []).join(', ') || '无'}</div>
              </div>
            `).join('')}
          </div>
        `;
      } catch (error) {
        container.innerHTML = '<p style="font-size:12px;color:var(--text2);">元素信息加载中...</p>';
      }
      break;
    }
    case 'hidden': {
      // 轮49 修正一处必然失败的 UI：/api/skill/all 只返回**非隐藏**技能（隐藏技本就不该被列出来），
      // 所以这个子页过去永远显示"暂无隐藏技能"；而它旁边那个「解锁」按钮调的是 /skill/unlock-hidden，
      // 该端点自轮47 起固定 501（服务端不再接受客户端自报解锁条件，那等于任何登录玩家 POST 一个 truthy 值
      // 就能白拿 7.0 倍率仙阶大招）。与其留一个点了必错的按钮，这里改成把真实规则讲清楚。
      const data = await api.getAllSkills();
      const skills = data.skills || data || [];
      const hidden = skills.filter(s => s.is_hidden);
      container.innerHTML = `
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;">隐藏技能</div>
        <p style="font-size:11px;color:var(--text2);margin-bottom:12px;line-height:1.6;">
          隐藏技能由**服务端记录的机缘**解锁（秘境、传承、特定 BOSS 首杀等），达成后会自动出现在技能列表中，
          无需也无法手动解锁。
        </p>
        ${hidden.length === 0 ? '<p style="font-size:12px;color:var(--text2);">当前没有已对你公开的隐藏技能。</p>' : hidden.map(s => `
          <div style="padding:10px;margin-bottom:6px;border:1px dashed var(--gold);border-radius:var(--radius);background:var(--bg2);">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <span style="font-weight:600;color:${ELEMENT_COLORS[s.element] || '#fff'};">[${ELEMENT_NAMES[s.element] || '无'}] ${s.name}</span>
                <span style="font-size:10px;padding:2px 6px;margin-left:6px;border-radius:3px;background:var(--gold);color:#000;">隐藏</span>
              </div>
              <span style="font-size:10px;color:var(--gold);">机缘未至</span>
            </div>
            <div style="font-size:11px;color:var(--text2);margin-top:4px;">${s.description}</div>
            <div style="font-size:10px;color:var(--gold);margin-top:2px;">解锁条件: ${s.hidden_condition || '未知'}</div>
          </div>
        `).join('')}
      `;
      break;
    }
    case 'synthesize': {
      const data = await api.getMySkills();
      const skills = data.skills || data || [];
      container.innerHTML = `
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;">技能合成</div>
        <p style="font-size:11px;color:var(--text2);margin-bottom:12px;">将两个相同技能合成为更高等级技能</p>
        <div style="margin-bottom:8px;">
          <label style="font-size:11px;">选择技能A</label>
          <select id="synth-a" class="input-field" style="width:100%;margin-top:4px;">
            ${skills.map(s => `<option value="${s.id}">[${ELEMENT_NAMES[s.element] || '无'}] ${s.name} Lv.${s.level || 1}</option>`).join('')}
          </select>
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-size:11px;">选择技能B（必须相同技能）</label>
          <select id="synth-b" class="input-field" style="width:100%;margin-top:4px;">
            ${skills.map(s => `<option value="${s.id}">[${ELEMENT_NAMES[s.element] || '无'}] ${s.name} Lv.${s.level || 1}</option>`).join('')}
          </select>
        </div>
        <button class="btn primary" onclick="handleSynthesize()" style="width:100%;">合成</button>
      `;
      break;
    }
  }
}

function renderSkillCard(s, showActions = false) {
  const ELEMENT_COLORS = {
    metal: '#ffd54f', wood: '#81c784', water: '#4fc3f7', fire: '#ff6b35',
    earth: '#8d6e63', light: '#fff176', dark: '#7e57c2', none: '#bdbdbd'
  };
  const ELEMENT_NAMES = {
    metal: '金', wood: '木', water: '水', fire: '火',
    earth: '土', light: '光明', dark: '黑暗', none: '无'
  };
  const SLOT_NAMES = { main: '主技能', sub: '副技能', ultimate: '终极' };
  const TYPE_NAMES = { active: '主动', passive: '被动' };

  return `
    <div style="padding:10px;margin-bottom:6px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg2);">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <span style="font-weight:600;color:${ELEMENT_COLORS[s.element] || '#fff'};">[${ELEMENT_NAMES[s.element] || '无'}] ${s.name || s.skill_name}</span>
          <span style="font-size:10px;padding:2px 4px;margin-left:4px;border-radius:3px;background:var(--border);">Lv.${s.level || 1}</span>
        </div>
        ${showActions ? `
          <div style="display:flex;gap:4px;">
            <button class="btn small" onclick="handleEquipSkillUI('${s.id}', 'main')">主</button>
            <button class="btn small" onclick="handleEquipSkillUI('${s.id}', 'sub')">副</button>
            <button class="btn small" onclick="handleUpgradeSkillUI('${s.id}')">升级</button>
          </div>
        ` : ''}
      </div>
      <div style="font-size:11px;color:var(--text2);margin-top:4px;">
        ${TYPE_NAMES[s.type] || s.type} | ${SLOT_NAMES[s.slot] || s.slot} | 消耗:${s.mana_cost} | 冷却:${s.cooldown}回合 | 倍率:${(s.damage_mult*100).toFixed(0)}%
      </div>
      <div style="font-size:10px;color:var(--gold);margin-top:2px;">${s.quality || ''} | ${s.effect || ''}</div>
    </div>
  `;
}

async function handleLearnSkill(skillId) {
  ui.showConfirm('领悟技能', '确定要领悟该技能吗？', async () => {
    try {
      await api.learnSkill(skillId);
      ui.showToast('领悟成功');
      await loadCharacter();
      loadSkillSub('my');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleBuySkillBook(skillId) {
  ui.showConfirm('购买技能书', '确定要购买该技能书吗？', async () => {
    try {
      await api.buySkillBook(skillId);
      ui.showToast('购买成功');
      await loadCharacter();
      loadSkillSub('shop');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleEquipSkillUI(playerSkillId, slot) {
  try {
    await api.equipSkill(playerSkillId, slot);
    ui.showToast('装备成功');
    loadSkillSub('my');
  } catch (error) { ui.showToast(error.message); }
}

async function handleUnequipSkill(playerSkillId) {
  try {
    await api.unequipSkill(playerSkillId);
    ui.showToast('卸下成功');
    loadSkillSub('my');
  } catch (error) { ui.showToast(error.message); }
}

async function handleUpgradeSkillUI(playerSkillId) {
  try {
    await api.upgradeSkill(playerSkillId);
    ui.showToast('升级成功');
    loadSkillSub('my');
  } catch (error) { ui.showToast(error.message); }
}

// 轮49 删除 handleUnlockHidden()：隐藏技解锁不接受客户端自报条件（服务端固定 501），
// 界面上不存在"点一下尝试解锁"这种交互；规则已并入技能心法 → 隐藏技能子页的说明文字。

// ===== P3 · 好友与洞府拜访（后端 /api/friend 轮48 上线，界面此前零引用 ⇒ 本轮接线）=====
// 道号是玩家自由输入的，必须转义后再进 innerHTML：既有面板普遍直接 ${name} 插入，
// 那是 P3 后续要统一清掉的一处注入面（已在《前端可见性与覆盖率测量.md》登记）。
function escText(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function friendRow(x, actions) {
  const c = x.character || {};
  return `<div style="padding:8px;margin-bottom:6px;border:1px solid var(--gold);border-radius:var(--radius);background:var(--bg2);display:flex;justify-content:space-between;align-items:center;gap:8px;">
    <div><b>${escText(c.name || '未知修士')}</b>
      <span style="font-size:10px;color:var(--text2);margin-left:6px;">${escText(c.realm || '?')}${c.realm_stage ? c.realm_stage + '期' : ''} · 亲密度 ${Number(x.intimacy) || 0}</span></div>
    <div style="white-space:nowrap;">${actions || ''}</div>
  </div>`;
}

async function loadFriendTab() {
  const content = document.getElementById('tab-content');
  if (!content) return;
  try {
    const data = await api.getFriends();
    const f = data.friends || [], inc = data.incoming || [], out = data.outgoing || [];
    const limit = data.limit || 50;
    const empty = (txt) => `<p style="font-size:11px;color:var(--text2);">${txt}</p>`;
    content.innerHTML = `
      <div style="font-size:12px;font-weight:600;margin-bottom:8px;">道友往来（好友 ${f.length}/${limit} · 待处理申请 ${(data.pendingLimit || 20) - out.length} 名额）</div>
      <div style="display:flex;gap:6px;margin-bottom:10px;">
        <input id="friend-kw" class="input" placeholder="搜索其他修士道号" style="flex:1;" />
        <button class="btn small" onclick="handleFriendSearch()">搜索</button>
      </div>
      <div id="friend-search"></div>
      <div style="font-size:12px;font-weight:600;margin:10px 0 6px;">收到的申请（${inc.length}）</div>
      ${inc.length ? inc.map((x) => friendRow(x,
        `<button class="btn small" onclick="handleFriendRespond(${x.requestId},true)">同意</button>
         <button class="btn small" onclick="handleFriendRespond(${x.requestId},false)">拒绝</button>`)).join('') : empty('暂无待处理申请')}
      <div style="font-size:12px;font-weight:600;margin:10px 0 6px;">我的好友（${f.length}/${limit}）</div>
      ${f.length ? f.map((x) => friendRow(x,
        `<button class="btn small" onclick="handleFriendVisit(${(x.character || {}).id})">拜访</button>
         <button class="btn small" onclick="handleFriendRemove(${(x.character || {}).id})">删除</button>`)).join('') : empty('还没有好友，用上面的搜索找一位道友')}
      <div style="font-size:12px;font-weight:600;margin:10px 0 6px;">我发出的申请（${out.length}）</div>
      ${out.length ? out.map((x) => friendRow(x, '<span style="font-size:10px;color:var(--gold);">等待回应</span>')).join('') : empty('暂无')}`;
  } catch (e) {
    content.innerHTML = `<p style="font-size:12px;color:var(--text2);">${escText(api.errInfo(e).text)}</p>`;
  }
}

async function handleFriendSearch() {
  const box = document.getElementById('friend-search');
  const kw = (document.getElementById('friend-kw') || {}).value || '';
  if (!kw.trim()) { ui.showToast('请输入道号'); return; }
  try {
    const r = await api.searchCharacters(kw.trim());
    const rows = r.results || [];
    if (box) box.innerHTML = rows.length ? rows.map((c) => `<div style="padding:6px 8px;margin-bottom:4px;border:1px dashed var(--gold);border-radius:var(--radius);display:flex;justify-content:space-between;">
      <span>${escText(c.name)} <span style="font-size:10px;color:var(--text2);">${escText(c.realm)} · ${c.relation === 'accepted' ? '已是好友' : c.relation === 'pending' ? '申请中' : '未添加'}</span></span>
      <button class="btn small" onclick="handleFriendRequest('${escText(c.id)}')">申请</button></div>`).join('') : '<p style="font-size:11px;color:var(--text2);">没有匹配的道友</p>';
  } catch (e) { ui.showToast(api.errInfo(e).text); }
}

async function handleFriendRequest(target) {
  try { const r = await api.requestFriend(target); ui.showToast(r.reused ? '已重新发出申请' : `已向 ${r.target} 发出申请`); loadTabContent('friend'); }
  catch (e) { ui.showToast(api.errInfo(e).text); }
}

async function handleFriendRespond(requestId, accept) {
  try { await api.respondFriend(requestId, accept); ui.showToast(accept ? '已结为道友' : '已拒绝'); loadTabContent('friend'); }
  catch (e) { ui.showToast(api.errInfo(e).text); }
}

async function handleFriendRemove(friendId) {
  ui.showConfirm('删除好友', '删除后亲密度归零，需重新申请。确定？', async () => {
    try { const r = await api.removeFriend(friendId); ui.showToast(`已解除关系，失去亲密度 ${r.intimacyLost || 0}`); loadTabContent('friend'); }
    catch (e) { ui.showToast(api.errInfo(e).text); }
  });
}

async function handleFriendVisit(hostId) {
  try { const r = await api.visitFriendCave(hostId); ui.showToast(`拜访 ${(r.host || {}).name || ''} 洞府，亲密度 ${r.intimacy}（今日 ${r.visitsToday} 次）`); loadTabContent('friend'); }
  catch (e) { ui.showToast(api.errInfo(e).text); }
}

async function handleSynthesize() {
  const a = document.getElementById('synth-a');
  const b = document.getElementById('synth-b');
  if (!a || !b) return;
  if (a.value === b.value) { ui.showToast('不能选择同一个技能'); return; }
  ui.showConfirm('技能合成', '确定要合成这两个技能吗？', async () => {
    try {
      await api.synthesizeSkills(a.value, b.value);
      ui.showToast('合成成功');
      loadSkillSub('synthesize');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function loadForgeTab() {
  const content = document.getElementById('tab-content');
  content.innerHTML = `
    <div class="char-panel">
      <div class="char-panel-header">
        <div class="char-panel-title">炼器</div>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:16px;">
        <button class="btn small active" onclick="loadForgeSub('craft', this)">炼器</button>
        <button class="btn small" onclick="loadForgeSub('refine', this)">精炼</button>
        <button class="btn small" onclick="loadForgeSub('codex', this)">神器谱</button>
        <button class="btn small" onclick="loadForgeSub('named', this)">词条炼器</button>
      </div>
      <div id="forge-content"></div>
    </div>
  `;
  await loadForgeSub('craft');
}

async function loadForgeSub(sub, btn) {
  if (btn) {
    btn.parentElement.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  const container = document.getElementById('forge-content');
  if (!container) return;

  switch (sub) {
    case 'craft': {
      const recipes = await api.getForgeForgeRecipes();
      container.innerHTML = `
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;">锻造配方</div>
        ${recipes.length === 0 ? '<p style="font-size:12px;color:var(--text2);">暂无配方</p>' : recipes.map(r => `
          <div class="shop-item" style="padding:10px;margin-bottom:6px;">
            <div class="shop-item-info" style="flex:1;">
              <div class="shop-item-name">${r.name} ${r.resultItem?.quality || ''}</div>
              <div class="shop-item-desc">材料：${r.materials.map(m => `${m.name}x${m.quantity}`).join(', ')}</div>
            </div>
            <button class="btn small primary" onclick="handleForgeEquip(${r.id})">锻造</button>
          </div>
        `).join('')}
      `;
      break;
    }
    case 'refine': {
      const equips = await api.getEquipments();
      container.innerHTML = `
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;">精炼装备</div>
        <p style="font-size:11px;color:var(--text2);margin-bottom:12px;">精炼可提升装备强化属性</p>
        ${equips.length === 0 ? '<p style="font-size:12px;color:var(--text2);">暂无可精炼的装备</p>' : equips.map(e => `
          <div class="shop-item" style="padding:10px;margin-bottom:6px;">
            <div class="shop-item-info" style="flex:1;">
              <div class="shop-item-name">${e.item?.name || '装备'} ${e.enhance > 0 ? `+${e.enhance}` : ''}</div>
              <div class="shop-item-desc">${e.item?.quality || ''} | ${e.slot_name || e.slot}</div>
            </div>
            <button class="btn small primary" onclick="handleRefineEquip(${e.id})">精炼</button>
          </div>
        `).join('')}
      `;
      break;
    }
    case 'codex': {
      const codex = await api.getCodex();
      const blueprints = await api.getBlueprints();
      container.innerHTML = `
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;">神器谱</div>
        <p style="font-size:11px;color:var(--text2);margin-bottom:12px;">收集图纸解锁神器图鉴，解锁后可锻造</p>
        <div style="margin-bottom:12px;">
          <div style="font-size:12px;font-weight:600;margin-bottom:6px;">我的图纸</div>
          ${blueprints.length === 0 ? '<p style="font-size:11px;color:var(--text2);">暂无图纸</p>' : blueprints.map(b => `
            <div style="display:inline-block;padding:4px 8px;margin:2px;font-size:11px;border:1px solid ${b.unlocked ? 'var(--green)' : 'var(--border)'};border-radius:4px;background:${b.unlocked ? 'rgba(0,255,0,0.1)' : 'var(--bg2)'};">
              ${b.name} ${b.unlocked ? '(已解锁)' : ''}
            </div>
          `).join('')}
        </div>
        <div style="font-size:12px;font-weight:600;margin-bottom:6px;">神器图鉴</div>
        ${codex.length === 0 ? '<p style="font-size:11px;color:var(--text2);">暂无图鉴</p>' : codex.map(c => `
          <div class="shop-item" style="padding:10px;margin-bottom:6px;">
            <div class="shop-item-info" style="flex:1;">
              <div class="shop-item-name" style="color:${c.unlocked ? 'var(--gold)' : 'var(--text2)'};">${c.name}</div>
              <div class="shop-item-desc">${c.quality} | ${c.slot} | ${c.description || ''}</div>
            </div>
            ${c.unlocked ? `<button class="btn small primary" onclick="handleUnlockCodex(${c.id})">锻造</button>` : '<span style="font-size:11px;color:var(--red);">需图纸</span>'}
          </div>
        `).join('')}
      `;
      break;
    }
    case 'named': {
      const affixes = await api.getAffixes();
      container.innerHTML = `
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;">词条炼器</div>
        <p style="font-size:11px;color:var(--text2);margin-bottom:12px;">消耗灵石和材料，锻造带有特殊词条的装备</p>
        <div style="margin-bottom:12px;">
          <label style="font-size:12px;display:block;margin-bottom:4px;">槽位</label>
          <select id="named-slot" class="input-field" style="width:100%;">
            <option value="weapon">武器</option>
            <option value="head">头盔</option>
            <option value="armor">护甲</option>
            <option value="legs">护腿</option>
            <option value="boots">鞋子</option>
            <option value="ring">戒指</option>
            <option value="necklace">项链</option>
            <option value="cloak">披风</option>
          </select>
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-size:12px;display:block;margin-bottom:4px;">品质</label>
          <select id="named-quality" class="input-field" style="width:100%;">
            <option value="凡器">凡器 (100灵石)</option>
            <option value="法器">法器 (300灵石)</option>
            <option value="灵器">灵器 (800灵石)</option>
            <option value="法宝">法宝 (2000灵石)</option>
          </select>
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-size:12px;display:block;margin-bottom:4px;">元素词条</label>
          <select id="named-affix" class="input-field" style="width:100%;">
            ${(affixes.affixes || []).map(a => `<option value="${a.name}">${a.name} (${a.description})</option>`).join('')}
          </select>
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-size:12px;display:block;margin-bottom:4px;">铭文</label>
          <select id="named-style" class="input-field" style="width:100%;">
            ${(affixes.styles || []).map(s => `<option value="${s.name}">${s.name}</option>`).join('')}
          </select>
        </div>
        <button class="btn primary" onclick="handleGenerateNamed()" style="width:100%;">锻造</button>
      `;
      break;
    }
  }
}

async function handleForgeEquip(recipeId) {
  ui.showConfirm('锻造', '确定要锻造该装备吗？', async () => {
    try {
      const result = await api.forgeEquipment(recipeId);
      ui.showToast(`锻造成功，获得${result.item?.name || '装备'}`);
      await loadCharacter();
      loadForgeSub('craft');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleRefineEquip(equipmentId) {
  ui.showConfirm('精炼', '确定要精炼该装备吗？', async () => {
    try {
      const result = await api.refineItem(equipmentId, 'equipment');
      ui.showToast(result.message || '精炼成功');
      loadForgeSub('refine');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleUnlockCodex(entryId) {
  ui.showConfirm('解锁神器', '确定要锻造该神器吗？需要图纸和材料。', async () => {
    try {
      const result = await api.unlockCodex(entryId);
      ui.showToast(`锻造成功，获得${result.item?.name || '神器'}`);
      await loadCharacter();
      loadForgeSub('codex');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleGenerateNamed() {
  const slot = document.getElementById('named-slot').value;
  const quality = document.getElementById('named-quality').value;
  const affix = document.getElementById('named-affix').value;
  const style = document.getElementById('named-style').value;
  ui.showConfirm('词条炼器', `确定要锻造${quality}${affix}${style}吗？`, async () => {
    try {
      const result = await api.generateNamedEquipment(slot, quality, affix, style);
      ui.showToast(`锻造成功，获得${result.item?.name || '装备'}`);
      await loadCharacter();
      loadForgeSub('named');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function loadAlchemistTab() {
  const content = document.getElementById('tab-content');
  content.innerHTML = `
    <div class="char-panel">
      <div class="char-panel-header">
        <div class="char-panel-title">炼丹</div>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:16px;">
        <button class="btn small active" onclick="loadAlchemistSub('craft', this)">炼丹</button>
        <button class="btn small" onclick="loadAlchemistSub('practice', this)">练习</button>
        <button class="btn small" onclick="loadAlchemistSub('refine', this)">重炼</button>
        <button class="btn small" onclick="loadAlchemistSub('talent', this)">天赋</button>
        <button class="btn small" onclick="loadAlchemistSub('proficiency', this)">熟练度</button>
        <button class="btn small" onclick="loadAlchemistSub('info', this)">丹炉</button>
      </div>
      <div id="alchemist-content"></div>
    </div>
  `;
  await loadAlchemistSub('craft');
}

async function loadAlchemistSub(sub, btn) {
  if (btn) {
    btn.parentElement.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  const container = document.getElementById('alchemist-content');
  if (!container) return;

  const qualityColor = (q) => {
    const colors = { '废品':'#888', '凡品':'#b0b0b0', '灵品':'#4fc3f7', '宝品':'#ffd54f', '仙品':'#ce93d8', '道品':'#ff8a65' };
    return colors[q] || '#b0b0b0';
  };

  switch (sub) {
    case 'craft': {
      try {
        const data = await api.getAlchemyRecipes();
        const recipes = data.recipes || [];
        const dailyLeft = (data.dailyLimit || 20) - (data.dailyCraft || 0);
        container.innerHTML = `
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2);margin-bottom:8px;">
            <span>等级: ${data.alchemyLevel || 1} | 丹炉: ${data.furnace?.name || '石炉'} | 最大产出: ${data.furnace?.maxOutput || 2}颗</span>
            <span style="color:${dailyLeft > 5 ? 'var(--green)' : 'var(--red)'};">今日剩余: ${dailyLeft}次</span>
          </div>
          <div style="font-size:13px;font-weight:600;margin-bottom:8px;">丹方</div>
          ${recipes.length === 0 ? '<p style="font-size:12px;color:var(--text2);">暂无丹方</p>' : recipes.map(r => `
            <div class="shop-item" style="padding:10px;margin-bottom:6px;">
              <div class="shop-item-info" style="flex:1;">
                <div class="shop-item-name">${r.name} <span style="color:${qualityColor(r.quality)};font-size:11px;">${r.quality}</span></div>
                <div class="shop-item-desc" style="font-size:11px;color:var(--text2);">需求: ${r.herb.name}x${r.herb.quantity} | 成功率: ${r.successRate}% | 经验: +${r.expGain} | 熟练: ${r.proficiency}/100</div>
                ${r.aux ? `<div class="shop-item-desc" style="font-size:11px;color:var(--green);">辅材: ${r.aux.name} (${r.aux.bonus})</div>` : ''}
                ${r.catalyst ? `<div class="shop-item-desc" style="font-size:11px;color:var(--gold);">催化: ${r.catalyst.name} (${r.catalyst.bonus} +品质)</div>` : ''}
              </div>
              <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;">
                <label style="font-size:11px;display:flex;gap:4px;align-items:center;"><input type="checkbox" id="aux-${r.id}" /> 辅材</label>
                <label style="font-size:11px;display:flex;gap:4px;align-items:center;"><input type="checkbox" id="cat-${r.id}" /> 催化</label>
                <button class="btn small primary" onclick="handleCraftPillNew(${r.id})">炼制</button>
              </div>
            </div>
          `).join('')}
        `;
      } catch (e) { container.innerHTML = '<p style="font-size:12px;color:var(--red);">加载失败</p>'; }
      break;
    }
    case 'practice': {
      try {
        const data = await api.getAlchemyRecipes();
        const recipes = data.recipes || [];
        container.innerHTML = `
          <div style="font-size:13px;font-weight:600;margin-bottom:8px;">练习炼丹</div>
          <p style="font-size:11px;color:var(--text2);margin-bottom:12px;">消耗药材练习，每小时获得2倍经验+2点熟练度</p>
          ${recipes.map(r => `
            <div class="shop-item" style="padding:10px;margin-bottom:6px;">
              <div class="shop-item-info" style="flex:1;">
                <div class="shop-item-name">${r.name} <span style="font-size:11px;color:${qualityColor(r.quality)};">${r.quality}</span></div>
                <div class="shop-item-desc" style="font-size:11px;">每小时消耗${r.herb.quantity}个${r.herb.name} | 熟练: ${r.proficiency}/100</div>
              </div>
              <button class="btn small" onclick="handlePracticeAlch(${r.id}, 1)">1h</button>
              <button class="btn small" onclick="handlePracticeAlch(${r.id}, 4)">4h</button>
              <button class="btn small" onclick="handlePracticeAlch(${r.id}, 8)">8h</button>
            </div>
          `).join('')}
        `;
      } catch (e) { container.innerHTML = '<p style="font-size:12px;color:var(--red);">加载失败</p>'; }
      break;
    }
    case 'refine': {
      try {
        const inv = await api.getInventory();
        const pills = (inv || []).filter(i => i.type === '消耗品' && (i.subtype === '丹药' || i.name.includes('丹')));
        container.innerHTML = `
          <div style="font-size:13px;font-weight:600;margin-bottom:8px;">重炼丹药</div>
          <p style="font-size:11px;color:var(--text2);margin-bottom:12px;">消耗灵石重炼，有概率提升品阶，12%损毁风险</p>
          <div style="display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap;">
            ${['废品','凡品','灵品','宝品','仙品','道品'].map(q => `<span style="font-size:10px;color:${qualityColor(q)};border:1px solid ${qualityColor(q)};padding:1px 4px;border-radius:3px;">${q}</span>`).join(' → ')}
          </div>
          ${pills.length === 0 ? '<p style="font-size:12px;color:var(--text2);">暂无丹药</p>' : pills.map(p => `
            <div class="shop-item" style="padding:10px;margin-bottom:6px;">
              <div class="shop-item-info" style="flex:1;">
                <div class="shop-item-name">${p.name} <span style="font-size:11px;color:${qualityColor(p.quality || '凡品')};">${p.quality || '凡品'}</span></div>
                <div class="shop-item-desc">数量: ${p.quantity || 1}</div>
              </div>
              <button class="btn small primary" onclick="handleRefinePill(${p.id})">重炼</button>
              <button class="btn small" onclick="handleDissolvePill(${p.id})">溶解</button>
            </div>
          `).join('')}
        `;
      } catch (e) { container.innerHTML = '<p style="font-size:12px;color:var(--red);">加载失败</p>'; }
      break;
    }
    case 'talent': {
      try {
        const data = await api.getAlchemyInfo();
        const talents = data.talentTree || [];
        container.innerHTML = `
          <div style="font-size:13px;font-weight:600;margin-bottom:8px;">炼丹天赋</div>
          <p style="font-size:11px;color:var(--text2);margin-bottom:12px;">消耗灵石解锁永久天赋</p>
          ${talents.map(t => `
            <div class="shop-item" style="padding:10px;margin-bottom:6px;${t.unlocked ? 'border-color:var(--green);' : ''}">
              <div class="shop-item-info" style="flex:1;">
                <div class="shop-item-name">${t.name} ${t.unlocked ? '<span style="color:var(--green);font-size:11px;">已解锁</span>' : ''}</div>
                <div class="shop-item-desc" style="font-size:11px;">${t.desc} | 需求等级: ${t.levelReq} | 费用: ${t.levelReq * 50}灵石</div>
              </div>
              ${t.unlocked ? '' : t.canUnlock ? `<button class="btn small primary" onclick="handleUnlockTalent('${t.id}')">解锁</button>` : `<span style="font-size:11px;color:var(--text2);">等级不足</span>`}
            </div>
          `).join('')}
        `;
      } catch (e) { container.innerHTML = '<p style="font-size:12px;color:var(--red);">加载失败</p>'; }
      break;
    }
    case 'proficiency': {
      try {
        const data = await api.getAlchemyProficiency();
        const prof = data.proficiency || [];
        container.innerHTML = `
          <div style="font-size:13px;font-weight:600;margin-bottom:8px;">丹方熟练度</div>
          <p style="font-size:11px;color:var(--text2);margin-bottom:12px;">熟练度影响成功率 | 20入门 50熟练 100精通</p>
          ${prof.map(p => `
            <div style="padding:8px;margin-bottom:4px;border-bottom:1px solid var(--border);">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:600;">${p.name} <span style="font-size:11px;color:${qualityColor(p.quality)};">${p.quality}</span></span>
                <span style="font-size:11px;color:${p.proficiency >= 100 ? 'var(--gold)' : p.proficiency >= 50 ? 'var(--green)' : 'var(--text2)'};">${p.masteryLevel} ${p.proficiency}/100</span>
              </div>
              <div style="height:4px;background:var(--border);border-radius:2px;margin-top:4px;">
                <div style="height:100%;width:${p.proficiency}%;background:${p.proficiency >= 100 ? 'var(--gold)' : p.proficiency >= 50 ? 'var(--green)' : 'var(--blue)'};border-radius:2px;"></div>
              </div>
            </div>
          `).join('')}
        `;
      } catch (e) { container.innerHTML = '<p style="font-size:12px;color:var(--red);">加载失败</p>'; }
      break;
    }
    case 'info': {
      try {
        const data = await api.getAlchemyInfo();
        container.innerHTML = `
          <div style="font-size:13px;font-weight:600;margin-bottom:8px;">丹炉信息</div>
          <div class="stats-grid" style="margin-bottom:12px;">
            <div class="stat-item"><div class="stat-label">炼丹等级</div><div class="stat-value">${data.alchemyLevel || 1}</div></div>
            <div class="stat-item"><div class="stat-label">经验</div><div class="stat-value">${data.alchemyExp || 0}/${data.expNeeded || 100}</div></div>
            <div class="stat-item"><div class="stat-label">今日炼制</div><div class="stat-value">${data.dailyCraft || 0}/${data.dailyLimit || 20}</div></div>
            <div class="stat-item"><div class="stat-label">总炼制</div><div class="stat-value">${data.craftCount || 0}</div></div>
          </div>
          <div style="font-size:12px;margin-bottom:4px;">当前丹炉: <span style="color:var(--gold);">${data.furnace?.name || '石炉'}</span></div>
          <div style="font-size:11px;color:var(--text2);margin-bottom:8px;">成功率+${Math.floor((data.furnace?.successBonus||0)*100)}% | 最大产出${data.furnace?.maxOutput || 2}颗 | 最高品质${data.furnace?.maxQuality || '凡品'}</div>
          ${data.furnaceLevel < data.maxFurnaceLevel ? `<button class="btn small primary" onclick="handleUpgradeFurnace()">升级丹炉 (${data.furnaceLevel * 300}灵石)</button>` : '<span style="font-size:12px;color:var(--gold);">已达最高品阶</span>'}
        `;
      } catch (e) { container.innerHTML = '<p style="font-size:12px;color:var(--red);">加载失败</p>'; }
      break;
    }
  }
}

async function handleCraftPillNew(recipeId) {
  const useAux = document.getElementById(`aux-${recipeId}`)?.checked || false;
  const useCatalyst = document.getElementById(`cat-${recipeId}`)?.checked || false;
  ui.showConfirm('炼丹', '确定要炼制该丹药吗？', async () => {
    try {
      const result = await api.craftPill(recipeId, useAux, useCatalyst);
      if (result.success) {
        const critMsg = result.crit ? '【暴击！】' : '';
        ui.showToast(`${critMsg}获得${result.quantity || 1}颗${result.quality || ''}${result.item?.name || '丹药'}`);
      } else {
        ui.showToast(result.message || '炼丹失败');
      }
      await loadCharacter();
      loadAlchemistSub('craft');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleCraftPill(recipeId) {
  return handleCraftPillNew(recipeId);
}

async function handlePracticeAlch(recipeId, hours) {
  ui.showConfirm('练习', `确定练习${hours}小时吗？`, async () => {
    try {
      const result = await api.practiceAlchemy(recipeId, hours);
      ui.showToast(result.message || `练习完成，经验+${result.expGained || 0}`);
      loadAlchemistSub('practice');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleRefinePill(itemId) {
  ui.showConfirm('重炼', '确定要重炼该丹药吗？', async () => {
    try {
      const result = await api.refinePill(itemId);
      ui.showToast(result.message || '重炼完成');
      loadAlchemistSub('refine');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleDissolvePill(itemId) {
  ui.showConfirm('溶解', '确定要溶解该丹药为原液吗？', async () => {
    try {
      const result = await api.dissolvePill(itemId);
      ui.showToast(result.message || '溶解完成');
      loadAlchemistSub('refine');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleUpgradeFurnace() {
  ui.showConfirm('升级丹炉', '确定要升级丹炉吗？', async () => {
    try {
      const result = await api.upgradeFurnace();
      ui.showToast(result.message || '升级成功');
      loadAlchemistSub('info');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleUnlockTalent(talentId) {
  ui.showConfirm('解锁天赋', '确定要解锁该天赋吗？', async () => {
    try {
      const result = await api.unlockAlchemyTalent(talentId);
      ui.showToast(result.message || '解锁成功');
      loadAlchemistSub('talent');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function loadGatheringTab() {
  const content = document.getElementById('tab-content');
  try {
    const maps = await api.getGatheringMaps();
    content.innerHTML = `
      <div class="char-panel">
        <div class="char-panel-header">
          <div class="char-panel-title">采集</div>
        </div>
        <p style="font-size:12px;color:var(--text2);margin-bottom:16px;">在不同地图采集材料或狩猎怪物</p>
        <div id="gathering-list">
          ${maps.map(m => `
            <div class="shop-item" style="padding:12px;margin-bottom:8px;">
              <div class="shop-item-info" style="flex:1;">
                <div class="shop-item-name">${m.name}</div>
                <div class="shop-item-desc">等级：${m.min_level}-${m.max_level}</div>
                <div class="shop-item-desc" style="font-size:11px;">资源：${m.resources?.join(', ') || '未知'}</div>
              </div>
              <div style="display:flex;gap:6px;">
                <button class="btn small primary" onclick="handleGather(${m.id})">采集</button>
                <button class="btn small" onclick="handleHunt(${m.id})">狩猎</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (error) {
    content.innerHTML = '<div class="char-panel"><p>加载失败</p></div>';
  }
}

async function handleGather(mapId) {
  try {
    const result = await api.gather(mapId);
    ui.showToast(`采集成功，获得经验${result.expGained || 0}`);
    await loadCharacter();
  } catch (error) {
    ui.showToast(error.message);
  }
}

async function handleHunt(mapId) {
  ui.showConfirm('狩猎', '确定要狩猎该地图的怪物吗？', async () => {
    try {
      const result = await api.huntMonster(mapId);
      ui.showBattleResult(result);
      await loadCharacter();
    } catch (error) { ui.showToast(error.message); }
  });
}

async function loadWeaponsTab() {
  const content = document.getElementById('tab-content');
  try {
    const weapons = await api.getWeapons();
    const myWeapons = await api.getMyWeapons();

    content.innerHTML = `
      <div class="char-panel">
        <div class="char-panel-header">
          <div class="char-panel-title">法器</div>
        </div>
        <div style="margin-bottom:16px;">
          <div style="font-size:13px;font-weight:600;margin-bottom:8px;">我的法器</div>
          ${myWeapons.length === 0 ? '<p style="font-size:12px;color:var(--text2);">暂无法器</p>' : myWeapons.map(w => `
            <div class="shop-item" style="padding:8px;margin-bottom:4px;">
              <div class="shop-item-info">
                <div class="shop-item-name" style="font-size:12px;">${w.name}</div>
                <div class="shop-item-desc" style="font-size:11px;">${w.subtype || ''} | ${w.quality || ''} | 数量:${w.quantity || 1}</div>
              </div>
              <div style="display:flex;gap:4px;">
                <button class="btn small primary" onclick="handleEquipWeaponItem(${w.itemId})">装备</button>
                <button class="btn small danger" onclick="handleSellItem(${w.inventoryId || w.id})">出售</button>
              </div>
            </div>
          `).join('')}
        </div>
        <div>
          <div style="font-size:13px;font-weight:600;margin-bottom:8px;">法器图鉴</div>
          ${weapons.map(w => `
            <div class="shop-item" style="padding:8px;margin-bottom:4px;">
              <div class="shop-item-info">
                <div class="shop-item-name" style="font-size:12px;">${w.name}</div>
                <div class="shop-item-desc" style="font-size:11px;">${w.subtype || ''} | ${w.quality || ''} | ${w.realm || ''}</div>
                <div class="shop-item-desc" style="font-size:10px;">${w.description || ''}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (error) {
    content.innerHTML = '<div class="char-panel"><p>加载失败</p></div>';
  }
}

async function handleEquipWeaponItem(itemId) {
  const slots = ['weapon','head','armor','legs','boots','ring','necklace','cloak'];
  const slotNames = {'weapon':'武器','head':'头盔','armor':'护甲','legs':'护腿','boots':'鞋子','ring':'戒指','necklace':'项链','cloak':'披风'};
  const slot = prompt('装备到哪个槽位？\\n' + slots.map((s,i) => `${i+1}.${slotNames[s]}`).join('  '), '1');
  if (!slot) return;
  const slotIndex = parseInt(slot) - 1;
  if (slotIndex < 0 || slotIndex >= slots.length) { ui.showToast('无效槽位'); return; }
  try {
    await api.equipWeapon(itemId, slots[slotIndex]);
    ui.showToast('装备成功');
    await loadCharacter();
    loadTabContent('weapons');
  } catch (error) { ui.showToast(error.message); }
}

async function handleSellItem(inventoryId) {
  ui.showConfirm('出售物品', '确定要出售该物品吗？', async () => {
    try {
      const result = await api.sellItem(inventoryId);
      ui.showToast(`出售成功，获得灵石${result?.spiritStone || 0}`);
      await loadCharacter();
      loadTabContent('weapons');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleEnhanceItem(itemId) {
  ui.showConfirm('强化装备', '确定要强化该装备吗？', async () => {
    try {
      const result = await api.enhanceEquipment(itemId);
      ui.showToast(`强化成功，当前+${result?.enhance || 0}`);
      await loadCharacter();
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleUnequip(slot) {
  try {
    await api.unequipItem(slot);
    ui.showToast('装备已卸下');
    await loadCharacter();
    loadTabContent('character');
  } catch (error) { ui.showToast(error.message); }
}

async function loadPillsTab() {
  const content = document.getElementById('tab-content');
  try {
    const pills = await api.getPills();
    const myPills = await api.getMyPills();

    content.innerHTML = `
      <div class="char-panel">
        <div class="char-panel-header">
          <div class="char-panel-title">丹药</div>
        </div>
        <div style="margin-bottom:16px;">
          <div style="font-size:13px;font-weight:600;margin-bottom:8px;">我的丹药</div>
          ${myPills.length === 0 ? '<p style="font-size:12px;color:var(--text2);">暂无丹药</p>' : myPills.map(p => `
            <div class="shop-item" style="padding:8px;margin-bottom:4px;">
              <div class="shop-item-info">
                <div class="shop-item-name" style="font-size:12px;">${p.name}</div>
                <div class="shop-item-desc" style="font-size:11px;">${p.subtype} | ${p.quality} | 数量:${p.quantity}</div>
              </div>
              <button class="btn small primary" onclick="handleUsePill(${p.itemId})">使用</button>
            </div>
          `).join('')}
        </div>
        <div>
          <div style="font-size:13px;font-weight:600;margin-bottom:8px;">丹药图鉴</div>
          ${pills.map(p => `
            <div class="shop-item" style="padding:8px;margin-bottom:4px;">
              <div class="shop-item-info">
                <div class="shop-item-name" style="font-size:12px;">${p.name}</div>
                <div class="shop-item-desc" style="font-size:11px;">${p.subtype} | ${p.quality} | ${p.realm}</div>
                <div class="shop-item-desc" style="font-size:10px;">${p.description}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (error) {
    content.innerHTML = '<div class="char-panel"><p>加载失败</p></div>';
  }
}

async function handleUsePill(itemId) {
  ui.showConfirm('使用丹药', '确定要使用该丹药吗？', async () => {
    try {
      const result = await api.usePill(itemId);
      ui.showToast(result.effect || '使用成功');
      await loadCharacter();
      loadTabContent('pills');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function loadTalismansTab() {
  const content = document.getElementById('tab-content');
  try {
    const data = await api.request('GET', '/talismans');
    const list = data.talismans || [];
    content.innerHTML = `
      <div class="char-panel">
        <div class="char-panel-header">
          <div class="char-panel-title">符箓</div>
          <button class="btn small" onclick="craftTalisman()">制作符箓</button>
        </div>
        ${list.length === 0 ? '<div class="empty-state">暂无符箓，点击上方按钮制作</div>' :
          list.map(t => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid var(--border);">
              <div>
                <div style="font-weight:600;font-size:13px;">${t.name}</div>
                <div style="font-size:11px;color:var(--text2);">${t.type} ×${t.quantity || 1}</div>
              </div>
              <button class="btn small" onclick="useTalisman(${t.id})">使用</button>
            </div>
          `).join('')}
      </div>
    `;
  } catch (e) { content.innerHTML = '<div class="empty-state">加载失败</div>'; }
}

async function craftTalisman() {
  const name = prompt('输入要制作的符箓名称：\n可选：雷击符/护盾符/加速符/治愈符/传送符');
  if (!name) return;
  try {
    await api.request('POST', '/talismans/craft', { name });
    ui.showToast('制作成功');
    loadTalismansTab();
  } catch (e) { ui.showToast(e.message); }
}

async function useTalisman(id) {
  try {
    const result = await api.request('POST', '/talismans/use', { talismanId: id });
    ui.showToast(result.message || '使用成功');
    loadTalismansTab();
  } catch (e) { ui.showToast(e.message); }
}

async function loadFormationsTab() {
  const content = document.getElementById('tab-content');
  try {
    const data = await api.request('GET', '/formations');
    const formations = data.formations || [];
    const active = formations.find(f => f.active);
    content.innerHTML = `
      <div class="char-panel">
        <div class="char-panel-header">
          <div class="char-panel-title">阵法</div>
        </div>
        <div style="margin-bottom:12px;font-size:12px;color:var(--text2);">
          当前阵法：${active ? active.name : '未激活'}
        </div>
        ${formations.length === 0 ? '<div class="empty-state">暂无阵法</div>' :
          formations.map(f => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid var(--border);${f.active ? 'background:var(--bg2);' : ''}">
              <div>
                <div style="font-weight:600;font-size:13px;">${f.name}</div>
                <div style="font-size:11px;color:var(--text2);">
                  攻${f.bonus_attack ? '+'+f.bonus_attack+'%' : ''} 
                  防${f.bonus_defense ? '+'+f.bonus_defense+'%' : ''} 
                  ${f.bonus_speed ? '速+'+f.bonus_speed+'%' : ''}
                </div>
              </div>
              <button class="btn small ${f.active ? '' : 'primary'}" onclick="${f.active ? 'deactivateFormation()' : 'activateFormation('+f.id+')'}">
                ${f.active ? '取消' : '激活'}
              </button>
            </div>
          `).join('')}
      </div>
    `;
  } catch (e) { content.innerHTML = '<div class="empty-state">加载失败</div>'; }
}

async function activateFormation(id) {
  try {
    await api.request('POST', '/formations/activate', { formationId: id });
    ui.showToast('阵法已激活');
    loadFormationsTab();
  } catch (e) { ui.showToast(e.message); }
}

async function deactivateFormation() {
  try {
    await api.request('POST', '/formations/deactivate');
    ui.showToast('阵法已取消');
    loadFormationsTab();
  } catch (e) { ui.showToast(e.message); }
}

async function loadChatTab() {
  const content = document.getElementById('tab-content');
  content.innerHTML = `
    <div class="char-panel">
      <div class="char-panel-header">
        <div class="char-panel-title">聊天频道</div>
      </div>
      <p style="font-size:12px;color:var(--text2);margin-bottom:12px;">与其他道友实时交流</p>
      <div style="margin-bottom:12px;">
        <div style="display:flex;gap:6px;margin-bottom:8px;">
          <button class="btn small active" onclick="switchChatChannel('world', this)">世界频道</button>
          <button class="btn small" onclick="switchChatChannel('guild', this)">仙盟频道</button>
          <button class="btn small" onclick="switchChatChannel('system', this)">系统公告</button>
        </div>
      </div>
      <div id="chat-tab-messages" style="height:300px;overflow-y:auto;padding:8px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg2);margin-bottom:12px;"></div>
      <div style="display:flex;gap:6px;">
        <input id="chat-tab-input" type="text" class="input-field" placeholder="输入消息..." style="flex:1;margin:0;" maxlength="200" onkeypress="if(event.key==='Enter')sendChatTabMessage()">
        <button class="btn primary" onclick="sendChatTabMessage()">发送</button>
      </div>
      <div style="margin-top:12px;">
        <button class="btn" onclick="toggleChatPanel()" style="width:100%;">打开浮动聊天窗口</button>
      </div>
    </div>
  `;
  loadChatHistory('world');
}

function sendChatTabMessage() {
  const input = document.getElementById('chat-tab-input');
  if (!input || !input.value.trim()) return;
  const content = input.value.trim();
  input.value = '';
  if (chatWs && chatWs.readyState === WebSocket.OPEN) {
    chatWs.send(JSON.stringify({ type: 'chat', channel: currentChatChannel, content }));
  }
}

async function loadSettingsTab() {
  const content = document.getElementById('tab-content');
  try {
    const data = await api.getSettings();
    const s = data.settings || data || {};
    content.innerHTML = `
      <div class="char-panel">
        <div class="char-panel-header">
          <div class="char-panel-title">设置</div>
        </div>
        <div style="margin-bottom:16px;">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px;">主题</label>
          <div style="display:flex;gap:8px;">
            <button class="btn ${s.theme==='ink'?'primary':''}" onclick="updateSetting('theme','ink')">水墨风格</button>
            <button class="btn ${s.theme==='dark'?'primary':''}" onclick="updateSetting('theme','dark')">暗黑风格</button>
          </div>
        </div>
        <div style="margin-bottom:16px;">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px;">战斗速度</label>
          <div style="display:flex;gap:8px;">
            <button class="btn ${s.battleSpeed===1?'primary':''}" onclick="updateSetting('battleSpeed',1)">1x</button>
            <button class="btn ${s.battleSpeed===2?'primary':''}" onclick="updateSetting('battleSpeed',2)">2x</button>
            <button class="btn ${s.battleSpeed===3?'primary':''}" onclick="updateSetting('battleSpeed',3)">3x</button>
          </div>
        </div>
        <div style="margin-bottom:16px;">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px;">聊天</label>
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="btn ${s.chatEnabled!==false?'primary':''}" onclick="updateSetting('chatEnabled',${!s.chatEnabled})">
              ${s.chatEnabled!==false?'开启':'关闭'}
            </button>
            <button class="btn ${s.showOnlineStatus!==false?'primary':''}" onclick="updateSetting('showOnlineStatus',${!s.showOnlineStatus})">
              显示在线状态
            </button>
          </div>
        </div>
        <div style="margin-bottom:16px;">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px;">通知</label>
          <button class="btn ${s.pushNotifications!==false?'primary':''}" onclick="updateSetting('pushNotifications',${!s.pushNotifications})">
            ${s.pushNotifications!==false?'开启推送':'关闭推送'}
          </button>
        </div>
        <div style="margin-bottom:16px;">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px;">账号安全</label>
          <button class="btn" onclick="handleChangePassword()">修改密码</button>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:16px;">
          <button class="btn danger" onclick="handleLogout()" style="width:100%;">退出登录</button>
        </div>
      </div>
    `;
  } catch (error) {
    content.innerHTML = '<div class="char-panel"><p>加载失败</p></div>';
  }
}

async function updateSetting(key, value) {
  try {
    await api.updateSettings({ [key]: value });
    if (key === 'theme') applyTheme(value);
    ui.showToast('设置已保存');
    loadSettingsTab();
  } catch (error) { ui.showToast(error.message); }
}

function handleChangePassword() {
  const oldPwd = prompt('请输入旧密码：');
  const newPwd = prompt('请输入新密码（至少6位）：');
  if (!oldPwd || !newPwd) return;
  if (newPwd.length < 6) { ui.showToast('密码至少6位'); return; }
  api.request('POST', '/auth/change-password', { oldPassword: oldPwd, newPassword: newPwd })
    .then(() => ui.showToast('密码修改成功'))
    .catch(e => ui.showToast(e.message));
}

async function loadInviteTab() {
  const content = document.getElementById('tab-content');
  try {
    const [codeData, statsData] = await Promise.all([
      api.getInviteCode(),
      api.getInviteStats()
    ]);
    const code = codeData.code || '加载中...';
    const stats = statsData.stats || statsData || {};
    const milestones = [
      { count: 5, reward: 500, label: '5人' },
      { count: 10, reward: 1000, label: '10人' },
      { count: 20, reward: 2000, label: '20人' },
      { count: 50, reward: 5000, label: '50人' }
    ];
    content.innerHTML = `
      <div class="char-panel">
        <div class="char-panel-header">
          <div class="char-panel-title">邀请好友</div>
        </div>
        <div style="text-align:center;margin-bottom:16px;">
          <div style="font-size:12px;color:var(--text2);margin-bottom:8px;">你的邀请码</div>
          <div style="font-size:24px;font-weight:700;color:var(--gold);letter-spacing:4px;font-family:monospace;">${code}</div>
          <button class="btn small" onclick="copyInviteCode('${code}')" style="margin-top:8px;">复制邀请码</button>
        </div>
        <div class="stats-grid" style="margin-bottom:16px;">
          <div class="stat-item"><span class="stat-label">已邀请</span><span class="stat-value">${stats.count || 0}人</span></div>
          <div class="stat-item"><span class="stat-label">获得奖励</span><span class="stat-value">${stats.totalReward || 0}灵石</span></div>
        </div>
        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:600;margin-bottom:8px;">里程碑奖励</div>
          ${milestones.map(m => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px;border-bottom:1px solid var(--border);font-size:12px;">
              <span>邀请${m.label}人</span>
              <span style="color:var(--gold);">${m.reward}灵石</span>
              <span style="color:${(stats.count||0) >= m.count ? 'var(--green)' : 'var(--text2)'};">${(stats.count||0) >= m.count ? '已达成' : '未达成'}</span>
            </div>
          `).join('')}
        </div>
        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:600;margin-bottom:8px;">使用邀请码</div>
          <div style="display:flex;gap:6px;">
            <input id="invite-code-input" type="text" class="input-field" placeholder="输入好友邀请码" style="flex:1;margin:0;">
            <button class="btn primary" onclick="handleUseInviteCode()">使用</button>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    content.innerHTML = '<div class="char-panel"><p>加载失败</p></div>';
  }
}

function copyInviteCode(code) {
  navigator.clipboard.writeText(code).then(() => {
    ui.showToast('邀请码已复制');
  }).catch(() => {
    ui.showToast('复制失败，请手动复制: ' + code);
  });
}

async function handleUseInviteCode() {
  const input = document.getElementById('invite-code-input');
  if (!input || !input.value.trim()) { ui.showToast('请输入邀请码'); return; }
  try {
    await api.useInviteCode(input.value.trim());
    ui.showToast('邀请码使用成功，获得奖励！');
    await loadCharacter();
    loadInviteTab();
  } catch (error) { ui.showToast(error.message); }
}

// Theme Management
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme || 'ink');
  localStorage.setItem('theme', theme || 'ink');
}

function initTheme() {
  const saved = localStorage.getItem('theme') || 'ink';
  applyTheme(saved);
}

// VIP Visual Effects System
function applyVipEffects() {
  const char = gameState.character;
  if (!char || !char.vip_level) return;

  const vipLevel = char.vip_level;
  const gameView = document.getElementById('game-view');

  gameView.classList.remove('vip-level-5', 'vip-level-7', 'vip-level-10');

  if (vipLevel >= 10) gameView.classList.add('vip-level-10');
  else if (vipLevel >= 7) gameView.classList.add('vip-level-7');
  else if (vipLevel >= 5) gameView.classList.add('vip-level-5');

  const charNameEl = document.querySelector('.char-name');
  if (charNameEl) {
    charNameEl.classList.remove('vip-rainbow-name', 'vip-shine');
    if (vipLevel >= 10) charNameEl.classList.add('vip-rainbow-name');
    else if (vipLevel >= 7) charNameEl.classList.add('vip-shine');
    else if (vipLevel >= 5) charNameEl.classList.add('vip-float');
  }

  const header = document.querySelector('.char-header');
  if (header && vipLevel >= 5) {
    header.classList.add('vip-login-glow');
  }
}

function spawnVipParticles(container, count) {
  if (!container) return;
  const particleContainer = document.createElement('div');
  particleContainer.className = 'vip-particles';
  container.style.position = 'relative';
  container.appendChild(particleContainer);

  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = 'vip-particle';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.bottom = '0';
    particle.style.animationDelay = Math.random() * 2 + 's';
    particle.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
    particleContainer.appendChild(particle);
  }

  setTimeout(() => particleContainer.remove(), 4000);
}

function playBattleVictoryEffect() {
  const char = gameState.character;
  if (!char || char.vip_level < 3) return;

  const battleArea = document.getElementById('tab-content');
  if (battleArea) {
    battleArea.classList.add('vip-battle-victory');
    setTimeout(() => battleArea.classList.remove('vip-battle-victory'), 3000);
  }
}

// 阶段9：剧情记年页——开局传记 + 按游戏年编年史 + AI 润色
async function loadChronicleTab() {
  const content = document.getElementById('tab-content');
  content.innerHTML = `
    <div class="char-panel">
      <div class="char-panel-header">
        <div class="char-panel-title">剧情记年</div>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:16px;">
        <button class="btn small active" onclick="loadChronicleSub('biography', this)">开局传记</button>
        <button class="btn small" onclick="loadChronicleSub('events', this)">编年史</button>
      </div>
      <div id="chronicle-sub"></div>
    </div>`;
  await loadChronicleSub('biography', document.querySelector('#tab-content .btn.small'));
}

async function loadChronicleSub(sub, btn) {
  if (btn) {
    document.querySelectorAll('#tab-content .char-panel .btn.small').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  const box = document.getElementById('chronicle-sub');
  box.innerHTML = '<div style="color:var(--text2);font-size:12px;">加载中…</div>';
  try {
    if (sub === 'biography') {
      const bio = await api.getBiography();
      const paras = [...(bio.paragraphs || []), ...(bio.aiParagraphs || [])];
      box.innerHTML = `
        <div style="padding:12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg2);">
          <div style="font-size:13px;font-weight:600;margin-bottom:8px;">${bio.origin} ${bio.constitution ? `<span style="color:#c9a227;font-size:11px;">【${bio.constitution}】</span>` : ''}</div>
          ${paras.map(p => `<p style="font-size:12px;line-height:1.8;color:var(--text);margin:0 0 8px;">${p}</p>`).join('')}
          <button class="btn small" onclick="enhanceBiography(this)">AI 润色传记</button>
          <span id="bio-enhance-msg" style="font-size:11px;color:var(--text2);margin-left:6px;"></span>
        </div>`;
    } else {
      const data = await api.getChronicle();
      box.innerHTML = `
        <div style="font-size:11px;color:var(--text2);margin-bottom:8px;">当前 ${data.character.reincarnationCount} 世 · 现龄 ${data.currentAge} 岁</div>
        <div style="border-left:2px solid var(--border);padding-left:12px;">
          ${(data.events || []).map(e => `
            <div style="margin-bottom:10px;">
              <div style="font-size:11px;color:var(--text2);">${e.age} 岁 · ${e.typeTitle}</div>
              <div style="font-size:12px;font-weight:600;">${e.title || ''}</div>
              <div style="font-size:12px;color:var(--text);line-height:1.6;">${e.content || ''}</div>
            </div>`).join('') || '<div style="font-size:12px;color:var(--text2);">尚无记年事件</div>'}
        </div>`;
    }
  } catch (e) {
    box.innerHTML = `<div style="color:#e74c3c;font-size:12px;">${e.message}</div>`;
  }
}

async function enhanceBiography(btn) {
  const msg = document.getElementById('bio-enhance-msg');
  btn.disabled = true;
  try {
    const r = await api.enhanceBiography();
    msg.textContent = r.message || '已提交';
    if (r.status === 'approved') await loadChronicleSub('biography', document.querySelector('#tab-content .btn.small.active'));
  } catch (e) {
    msg.textContent = e.message;
  } finally {
    btn.disabled = false;
  }
}

// 阶段10：拍卖行页（阶段6 后端）
async function loadMarketTab() {
  const content = document.getElementById('tab-content');
  content.innerHTML = `
    <div class="char-panel">
      <div class="char-panel-header"><div class="char-panel-title">拍卖行</div></div>
      <div id="market-listings">加载中…</div>
      <div style="margin-top:14px;font-size:12px;font-weight:600;">我的挂单</div>
      <div id="market-my">加载中…</div>
    </div>`;
  await refreshMarket();
}

async function refreshMarket() {
  try {
    const [list, my] = await Promise.all([api.getMarketListings(), api.getMarketMy()]);
    const rows = (list.listings || []).map(l => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:6px;background:var(--bg2);">
        <div>
          <div style="font-size:12px;font-weight:600;">${l.item ? l.item.name : '未知物品'} ×${l.quantity} <span style="color:#c9a227;font-size:10px;">${l.item ? l.item.quality : ''}</span></div>
          <div style="font-size:11px;color:var(--text2);">单价 ${l.unitNow}（挂 ${l.priceEach} × 供需 ${l.marketRate}） · 卖家 ${l.seller}</div>
        </div>
        <button class="btn small" onclick="marketBuy(${l.id})">购买</button>
      </div>`).join('');
    document.getElementById('market-listings').innerHTML = rows || '<div style="font-size:12px;color:var(--text2);">暂无在售挂单</div>';
    const mine = (my.listings || []).map(l => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px;border-bottom:1px solid var(--border);font-size:11px;">
        <span>${l.item} ×${l.quantity} @${l.priceEach} <span style="color:var(--text2);">[${l.status}]</span></span>
        ${l.status === 'open' ? `<button class="btn small danger" onclick="marketCancel(${l.id})">下架</button>` : ''}
      </div>`).join('');
    document.getElementById('market-my').innerHTML = mine || '<div style="font-size:12px;color:var(--text2);">暂无挂单</div>';
  } catch (e) {
    document.getElementById('market-listings').innerHTML = `<div style="color:#e74c3c;font-size:12px;">${e.message}</div>`;
  }
}

async function marketBuy(id) {
  try { await api.marketBuy(id); ui.toast ? ui.toast('购买成功') : null; } catch (e) { alert(e.message); }
  await refreshMarket();
}

async function marketCancel(id) {
  try { await api.marketCancel(id); } catch (e) { alert(e.message); }
  await refreshMarket();
}

// 阶段10：灵石兑换页（四级灵石 + 2% 手续费）
async function loadEconomyTab() {
  const content = document.getElementById('tab-content');
  content.innerHTML = `
    <div class="char-panel">
      <div class="char-panel-header"><div class="char-panel-title">灵石钱包</div></div>
      <div id="wallet-box">加载中…</div>
      <div style="margin-top:14px;font-size:12px;font-weight:600;">双向兑换（2% 手续费）</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:12px;">
        <select id="ex-from" class="input-field" style="width:auto;"><option value="lower">下品</option><option value="middle">中品</option><option value="upper">上品</option><option value="extreme">极品</option></select>
        <span>→</span>
        <select id="ex-to" class="input-field" style="width:auto;"><option value="middle" selected>中品</option><option value="lower">下品</option><option value="upper">上品</option><option value="extreme">极品</option></select>
        <input id="ex-amount" class="input-field" type="number" min="1" placeholder="数量" style="width:90px;">
        <button class="btn small" onclick="doExchange()">兑换</button>
      </div>
      <div id="ex-msg" style="font-size:11px;color:var(--text2);margin-top:6px;"></div>
    </div>`;
  await refreshWallet();
}

async function refreshWallet() {
  try {
    const w = await api.getWallet();
    document.getElementById('wallet-box').innerHTML = `
      <div style="font-size:20px;font-weight:700;color:#c9a227;">${w.display} <span style="font-size:11px;color:var(--text2);">下品基准（精确 ${w.base}）</span></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;font-size:11px;color:var(--text2);">
        ${Object.values(w.tiers).map(t => `<span>${t.name} ×${t.count}</span>`).join('')}
        <span>点券 ${w.jade}</span>
      </div>`;
  } catch (e) {
    document.getElementById('wallet-box').innerHTML = `<div style="color:#e74c3c;font-size:12px;">${e.message}</div>`;
  }
}

async function doExchange() {
  const msg = document.getElementById('ex-msg');
  try {
    const r = await api.exchange(document.getElementById('ex-from').value, document.getElementById('ex-to').value, Number(document.getElementById('ex-amount').value));
    msg.textContent = `成功：费 ${r.fee.display}，得 ${r.received.display}，余额 ${r.balanceDisplay}`;
    await refreshWallet();
  } catch (e) {
    msg.textContent = e.message;
  }
}

// 阶段10：宗门页（阶段4 后端）
async function loadSectTab() {
  const content = document.getElementById('tab-content');
  content.innerHTML = `
    <div class="char-panel">
      <div class="char-panel-header"><div class="char-panel-title">宗门</div></div>
      <div id="sect-box">加载中…</div>
    </div>`;
  try {
    const [my, list] = await Promise.all([api.getSectMy().catch(() => null), api.getSectList()]);
    const sects = (list.sects || list || []).map(s => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:6px;background:var(--bg2);">
        <div>
          <div style="font-size:12px;font-weight:600;">${s.name} <span style="color:#c9a227;font-size:10px;">${s.gongfa_focus || ''}</span></div>
          <div style="font-size:11px;color:var(--text2);">弟子 ${s.member_count ?? '—'} · 上限 ${s.member_cap ?? '—'}</div>
        </div>
        <button class="btn small" onclick="sectJoin(${s.id})">拜入</button>
      </div>`).join('');
    document.getElementById('sect-box').innerHTML = (my && my.sect)
      ? `<div style="font-size:13px;font-weight:600;margin-bottom:6px;">当前宗门：${my.sect.name}</div>
         <div style="font-size:12px;color:var(--text2);">贡献 ${my.contribution || 0} · 职位 ${my.post || '外门弟子'}</div>`
      : `${sects || '<div style="font-size:12px;color:var(--text2);">暂无宗门</div>'}`;
  } catch (e) {
    document.getElementById('sect-box').innerHTML = `<div style="color:#e74c3c;font-size:12px;">${e.message}</div>`;
  }
}

async function sectJoin(key) {
  try { await api.sectJoin(key); ui.toast ? ui.toast('拜入成功') : null; await loadSectTab(); } catch (e) { alert(e.message); }
}

async function loadQuestsTab() {
  const content = document.getElementById('tab-content');
  content.innerHTML = `
    <div class="char-panel">
      <div class="char-panel-header">
        <div class="char-panel-title">任务</div>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:16px;">
        <button class="btn small active" onclick="loadQuestSub('active', this)">进行中</button>
        <button class="btn small" onclick="loadQuestSub('available', this)">可接取</button>
        <button class="btn small" onclick="loadQuestSub('completed', this)">已完成</button>
      </div>
      <div id="quest-content"></div>
    </div>
  `;
  await loadQuestSub('active');
}

async function loadQuestSub(sub, btn) {
  if (btn) {
    btn.parentElement.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  const container = document.getElementById('quest-content');
  if (!container) return;

  const typeNames = { main: '主线', daily: '日常', side: '支线' };

  try {
    if (sub === 'available') {
      const data = await api.request('GET', '/quests/available');
      const quests = data.quests || [];
      container.innerHTML = `
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;">可接取的任务</div>
        ${quests.length === 0 ? '<p style="font-size:12px;color:var(--text2);">暂无可用任务</p>' : quests.map(q => `
          <div style="padding:10px;margin-bottom:8px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg2);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <span style="font-weight:600;">${q.name}</span>
              <span style="font-size:10px;padding:2px 6px;border-radius:3px;background:var(--border);">${typeNames[q.type] || q.type}</span>
            </div>
            <div style="font-size:11px;color:var(--text2);margin-bottom:6px;">${q.description}</div>
            <div style="font-size:10px;color:var(--gold);margin-bottom:6px;">奖励: ${q.rewards?.exp || 0}经验, ${q.rewards?.spirit_stone || 0}灵石</div>
            <button class="btn small primary" onclick="handleAcceptQuest(${q.id})">接取</button>
          </div>
        `).join('')}
      `;
    } else {
      const data = await api.request('GET', '/quests');
      const allQuests = data.quests || [];
      const filtered = allQuests.filter(q => q.status === (sub === 'active' ? 'active' : 'completed'));
      container.innerHTML = `
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;">${sub === 'active' ? '进行中的任务' : '已完成的任务'}</div>
        ${filtered.length === 0 ? `<p style="font-size:12px;color:var(--text2);">暂无${sub === 'active' ? '进行中' : '已完成'}的任务</p>` : filtered.map(q => `
          <div style="padding:10px;margin-bottom:8px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg2);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <span style="font-weight:600;">${q.name}</span>
              <span style="font-size:10px;padding:2px 6px;border-radius:3px;background:var(--border);">${typeNames[q.type] || q.type}</span>
            </div>
            <div style="font-size:11px;color:var(--text2);margin-bottom:6px;">${q.description}</div>
            ${(q.objectives || []).map(obj => `
              <div style="font-size:11px;margin-bottom:4px;">
                <span style="color:${obj.current >= obj.required ? 'var(--green)' : 'var(--text2)'};">
                  ${obj.current >= obj.required ? '✓' : '○'} ${obj.type}: ${obj.current}/${obj.required}
                </span>
              </div>
            `).join('')}
            <div style="font-size:10px;color:var(--gold);margin-top:6px;">奖励: ${q.rewards?.exp || 0}经验, ${q.rewards?.spirit_stone || 0}灵石</div>
            ${sub === 'active' && (q.objectives || []).every(o => o.current >= o.required) ? `
              <button class="btn small primary" onclick="handleCompleteQuest(${q.id})" style="margin-top:6px;">完成任务</button>
            ` : ''}
          </div>
        `).join('')}
      `;
    }
  } catch (error) {
    container.innerHTML = '<p style="font-size:12px;color:var(--red);">加载失败</p>';
  }
}

async function handleAcceptQuest(questId) {
  ui.showConfirm('接取任务', '确定要接取该任务吗？', async () => {
    try {
      await api.request('POST', '/quests/accept', { questId });
      ui.showToast('任务已接取');
      loadQuestSub('active');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleCompleteQuest(questId) {
  ui.showConfirm('完成任务', '确定要完成该任务并领取奖励吗？', async () => {
    try {
      const result = await api.request('POST', '/quests/complete', { questId });
      ui.showToast(`任务完成！获得${result.rewards?.exp || 0}经验，${result.rewards?.spirit_stone || 0}灵石`);
      if (result.levelUp) ui.showToast('恭喜升级！');
      await loadCharacter();
      loadQuestSub('completed');
    } catch (error) { ui.showToast(error.message); }
  });
}

// ========== Announcements System ==========
async function checkAnnouncements() {
  try {
    const data = await api.getUnreadAnnouncements();
    if (data.count > 0) {
      showAnnouncementPopup(data.announcements);
    }
  } catch (e) {}
}

function showAnnouncementPopup(announcements) {
  const popup = document.getElementById('announcement-popup');
  const title = document.getElementById('announcement-title');
  const body = document.getElementById('announcement-body');
  if (!popup || !announcements || announcements.length === 0) return;
  title.textContent = announcements.length > 1 ? `系统公告 (${announcements.length})` : announcements[0].title;
  body.innerHTML = announcements.map(a => `
    <div style="margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border);">
      <div style="font-weight:600;color:var(--red);margin-bottom:4px;">
        ${a.pinned ? '[置顶] ' : ''}${a.title}
      </div>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">
        ${a.type === 'event' ? '活动公告' : a.type === 'update' ? '更新公告' : '系统公告'} · ${new Date(a.created_at).toLocaleDateString()}
      </div>
      <div style="font-size:13px;line-height:1.6;">${a.content}</div>
    </div>
  `).join('');
  popup.classList.remove('hidden');
  api.markAnnouncementsRead().catch(() => {});
}

function closeAnnouncement() {
  document.getElementById('announcement-popup')?.classList.add('hidden');
}

// ========== Ad / Promotion System ==========
async function checkAds() {
  try {
    const data = await api.getAds();
    if (data.ads && data.ads.length > 0) {
      const lastShown = localStorage.getItem('ad_last_shown');
      const now = Date.now();
      if (!lastShown || now - parseInt(lastShown) > 300000) {
        showAdPopup(data.ads[0]);
      }
    }
  } catch (e) {}
}

function showAdPopup(ad) {
  const popup = document.getElementById('ad-popup');
  const title = document.getElementById('ad-title');
  const body = document.getElementById('ad-body');
  if (!popup || !ad) return;
  title.textContent = ad.title;
  body.innerHTML = `
    <div style="margin-bottom:16px;font-size:13px;color:var(--text-secondary);">${ad.description}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      ${(ad.packages || []).map(pkg => `
        <div style="border:1px solid var(--border);border-radius:var(--radius);padding:12px;text-align:center;cursor:pointer;transition:all 0.2s;"
             onclick="handleRecharge(${pkg.id})" onmouseover="this.style.borderColor='var(--red)'" onmouseout="this.style.borderColor='var(--border)'">
          ${pkg.badge ? `<div style="background:var(--red);color:#fff;font-size:10px;padding:2px 6px;border-radius:3px;display:inline-block;margin-bottom:6px;">${pkg.badge}</div>` : ''}
          <div style="font-weight:600;margin-bottom:4px;">${pkg.name}</div>
          <div style="font-size:20px;font-weight:700;color:var(--red);">¥${pkg.price}</div>
          <div style="font-size:11px;color:var(--gold);">${pkg.jade}仙玉${pkg.bonus_jade ? `+${pkg.bonus_jade}赠` : ''}</div>
        </div>
      `).join('')}
    </div>
  `;
  popup.classList.remove('hidden');
  localStorage.setItem('ad_last_shown', Date.now().toString());
}

function closeAdPopup() {
  document.getElementById('ad-popup')?.classList.add('hidden');
}

async function handleRecharge(packageId) {
  ui.showConfirm('确认充值', '确定要充值该套餐吗？', async () => {
    try {
      const result = await api.rechargePackage(packageId);
      ui.showToast(result.message || '充值成功');
      await loadCharacter();
      closeAdPopup();
    } catch (error) { ui.showToast(error.message); }
  });
}

// ========== Quest Tracker ==========
let questTrackerVisible = false;

function toggleQuestTracker() {
  const tracker = document.getElementById('quest-tracker');
  if (!tracker) return;
  questTrackerVisible = !questTrackerVisible;
  tracker.style.display = questTrackerVisible ? 'block' : 'none';
  if (questTrackerVisible) refreshQuestTracker();
}

async function refreshQuestTracker() {
  try {
    const data = await api.getQuests();
    const list = document.getElementById('quest-tracker-list');
    if (!list) return;
    const active = (data.quests || []).filter(q => q.status === 'active');
    if (active.length === 0) {
      list.innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:8px;">暂无进行中的任务</div>';
      return;
    }
    list.innerHTML = active.slice(0, 5).map(q => {
      const progress = (q.objectives || []).map(o => `${o.current}/${o.required}`).join(', ');
      const allDone = (q.objectives || []).every(o => o.current >= o.required);
      return `
        <div style="padding:6px;border-bottom:1px solid var(--border);${allDone ? 'background:rgba(76,175,80,0.1);' : ''}">
          <div style="font-weight:600;font-size:11px;${allDone ? 'color:var(--green);' : ''}">${allDone ? '✓ ' : ''}${q.name}</div>
          <div style="font-size:10px;color:var(--text-secondary);">${progress}</div>
        </div>
      `;
    }).join('');
  } catch (e) {}
}

function showQuestCompletePopup(quest, rewards) {
  const popup = document.getElementById('quest-complete-popup');
  const name = document.getElementById('quest-complete-name');
  const rewardsEl = document.getElementById('quest-complete-rewards');
  if (!popup) return;
  name.textContent = quest.name;
  rewardsEl.innerHTML = `
    <div style="font-size:14px;margin-bottom:4px;">经验 +${rewards?.exp || 0}</div>
    <div style="font-size:14px;">灵石 +${rewards?.spirit_stone || 0}</div>
  `;
  popup.classList.remove('hidden');
}

// ========== Admin Panel ==========
async function loadAdminTab() {
  const content = document.getElementById('tab-content');
  try {
    const [dashboard, usersData] = await Promise.all([
      api.getAdminDashboard(),
      api.getAdminUsers(1)
    ]);
    const s = dashboard.stats;
    content.innerHTML = `
      <div style="padding:16px;">
        <h2 style="font-family:'Ma Shan Zheng',cursive;font-size:24px;color:var(--red);margin-bottom:16px;">管理面板</h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:16px;">
          <div class="stat-card"><div class="stat-value">${s.totalUsers}</div><div class="stat-label">用户</div></div>
          <div class="stat-card"><div class="stat-value">${s.totalCharacters}</div><div class="stat-label">角色</div></div>
          <div class="stat-card"><div class="stat-value">${s.onlineToday}</div><div class="stat-label">今日活跃</div></div>
          <div class="stat-card"><div class="stat-value">${s.totalGuilds}</div><div class="stat-label">仙盟</div></div>
          <div class="stat-card"><div class="stat-value">${s.totalBattles}</div><div class="stat-label">战斗次数</div></div>
          <div class="stat-card"><div class="stat-value">${s.totalJade || 0}</div><div class="stat-label">仙玉流通</div></div>
          <div class="stat-card"><div class="stat-value">${s.totalRecharged || 0}</div><div class="stat-label">充值总额</div></div>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;">
          <button class="btn small active" onclick="loadAdminSub('users', this)">用户管理</button>
          <button class="btn small" onclick="loadAdminSub('recharges', this)">充值记录</button>
          <button class="btn small" onclick="loadAdminSub('broadcast', this)">系统广播</button>
          <button class="btn small" onclick="loadAdminSub('realms', this)">境界分布</button>
        </div>
        <div id="admin-sub-content"></div>
      </div>
    `;
    await loadAdminSub('users');
  } catch (error) {
    content.innerHTML = '<div class="empty-state">无管理员权限或加载失败</div>';
  }
}

async function loadAdminSub(sub, btn) {
  if (btn) {
    btn.parentElement.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  const container = document.getElementById('admin-sub-content');
  if (!container) return;

  switch (sub) {
    case 'users': {
      try {
        const data = await api.getAdminUsers(1);
        container.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-size:12px;color:var(--text2);">共${data.total}个用户</span>
            <input id="admin-user-search" class="input-field" placeholder="搜索用户..." style="width:160px;padding:4px 8px;font-size:11px;" onkeyup="searchAdminUsers(this.value)">
          </div>
          <div id="admin-users-list"></div>
        `;
        renderAdminUsers(data.users);
      } catch (e) { container.innerHTML = '<p style="font-size:12px;color:var(--red);">加载失败</p>'; }
      break;
    }
    case 'recharges': {
      try {
        const data = await api.getAdminRechargeLogs();
        const logs = data.logs || [];
        container.innerHTML = `
          <div style="font-size:12px;color:var(--text2);margin-bottom:8px;">共${data.total}条充值记录</div>
          ${logs.length === 0 ? '<p style="font-size:12px;color:var(--text2);">暂无记录</p>' : logs.map(l => `
            <div style="display:flex;justify-content:space-between;padding:6px;border-bottom:1px solid var(--border);font-size:12px;">
              <span>${l.username || 'UID:'+l.user_id}</span>
              <span>${l.packageName} ¥${l.price}</span>
              <span style="color:var(--gold);">+${l.jade}仙玉</span>
              <span style="color:var(--text2);">${new Date(l.timestamp).toLocaleString()}</span>
            </div>
          `).join('')}
        `;
      } catch (e) { container.innerHTML = '<p style="font-size:12px;color:var(--red);">加载失败</p>'; }
      break;
    }
    case 'broadcast': {
      container.innerHTML = `
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;">系统广播</div>
        <div style="display:flex;gap:8px;">
          <input id="admin-broadcast-input" class="input-field" placeholder="输入广播内容..." style="flex:1;padding:6px 8px;font-size:12px;">
          <button class="btn small primary" onclick="handleAdminBroadcast()">发送</button>
        </div>
      `;
      break;
    }
    case 'realms': {
      try {
        const dashboard = await api.getAdminDashboard();
        container.innerHTML = `
          <div style="font-size:13px;font-weight:600;margin-bottom:8px;">境界分布</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${Object.entries(dashboard.realmDistribution || {}).map(([k, v]) => `
              <span style="padding:4px 10px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);font-size:12px;">${k}: ${v}人</span>
            `).join('')}
          </div>
        `;
      } catch (e) { container.innerHTML = '<p style="font-size:12px;color:var(--red);">加载失败</p>'; }
      break;
    }
  }
}

function renderAdminUsers(users) {
  const list = document.getElementById('admin-users-list');
  if (!list) return;
  list.innerHTML = `
    <div style="max-height:400px;overflow-y:auto;">
      ${(users || []).map(u => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid var(--border);">
          <div style="flex:1;">
            <div style="font-weight:600;font-size:12px;">${u.username} ${u.locked ? '<span style="color:var(--red);font-size:10px;">封禁中</span>' : ''} ${u.role !== 'user' ? `<span style="color:var(--gold);font-size:10px;">${u.role}</span>` : ''}</div>
            <div style="font-size:11px;color:var(--text2);">Lv.${u.character?.level || '-'} ${u.character?.realm || ''} | 灵石:${u.character?.spirit_stone || 0} 仙玉:${u.character?.jade || 0}</div>
          </div>
          <div style="display:flex;gap:3px;">
            <button class="btn small" onclick="showAdminUserDetail(${u.id})">详情</button>
            <button class="btn small" onclick="handleAdminAddStones(${u.id})">加灵石</button>
            <button class="btn small" onclick="handleAdminAddJade(${u.id})">加仙玉</button>
            <button class="btn small" onclick="handleAdminBan(${u.id})">${u.locked ? '解封' : '封禁'}</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function searchAdminUsers(query) {
  try {
    const data = await api.getAdminUsers(1, query);
    renderAdminUsers(data.users);
  } catch (e) {}
}

async function showAdminUserDetail(userId) {
  try {
    const data = await api.getAdminUserDetail(userId);
    const u = data.user;
    const c = data.character;
    const popup = document.getElementById('modal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    if (!popup) return;
    title.textContent = `${u.username} 详情`;
    body.innerHTML = `
      <div style="font-size:12px;">
        <div style="margin-bottom:8px;"><b>ID:</b> ${u.id} | <b>角色:</b> ${u.role} | <b>封禁:</b> ${u.locked ? '是' : '否'}</div>
        ${c ? `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px;">
            <div>等级: ${c.level}</div><div>境界: ${c.realm}</div>
            <div>攻击: ${c.attack}</div><div>防御: ${c.defense}</div>
            <div>生命: ${c.hp}</div><div>战力: ${c.combat_power || 0}</div>
            <div>灵石: ${c.spirit_stone}</div><div>仙玉: ${c.jade || 0}</div>
            <div>VIP: ${c.vip_level || 0}</div><div>战斗: ${c.total_battles || 0}</div>
          </div>
          <div style="margin-bottom:8px;">
            <div style="font-weight:600;margin-bottom:4px;">快捷操作</div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;">
              <button class="btn small" onclick="handleAdminSetLevel(${u.id})">改等级</button>
              <button class="btn small" onclick="handleAdminAddItem(${u.id})">发物品</button>
              <button class="btn small" onclick="handleAdminAddStones(${u.id})">加灵石</button>
              <button class="btn small" onclick="handleAdminAddJade(${u.id})">加仙玉</button>
              <button class="btn small" onclick="handleAdminSetRole(${u.id})">设管理员</button>
              <button class="btn small danger" onclick="handleAdminResetChar(${u.id})">重置角色</button>
            </div>
          </div>
        ` : '<div style="color:var(--text2);">无角色数据</div>'}
        ${data.recharges && data.recharges.length > 0 ? `
          <div style="margin-bottom:8px;">
            <div style="font-weight:600;margin-bottom:4px;">充值记录</div>
            ${data.recharges.map(r => `<div style="font-size:11px;border-bottom:1px solid var(--border);padding:2px 0;">${r.packageName} ¥${r.price} +${r.jade}仙玉 ${new Date(r.timestamp).toLocaleDateString()}</div>`).join('')}
          </div>
        ` : ''}
        ${data.guild ? `<div>仙盟: ${data.guild.name} Lv.${data.guild.level}</div>` : ''}
      </div>
    `;
    popup.classList.remove('hidden');
  } catch (e) { ui.showToast('加载详情失败'); }
}

async function handleAdminSetRole(userId) {
  ui.showConfirm('设置管理员', '确定要将该用户设为管理员吗？', async () => {
    try {
      await api.setAdminUserRole(userId, 'admin');
      ui.showToast('已设为管理员');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleAdminBan(userId) {
  ui.showConfirm('封禁/解封', '确定要操作该用户吗？', async () => {
    try {
      const result = await api.banUser(userId);
      ui.showToast(result.message);
      loadAdminSub('users');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleAdminAddStones(userId) {
  const amount = prompt('输入灵石数量：', '1000');
  if (!amount) return;
  try {
    const result = await api.addStones(userId, parseInt(amount));
    ui.showToast(`已发送${amount}灵石`);
  } catch (error) { ui.showToast(error.message); }
}

async function handleAdminAddJade(userId) {
  const amount = prompt('输入仙玉数量：', '100');
  if (!amount) return;
  try {
    const result = await api.addJade(userId, parseInt(amount));
    ui.showToast(`已发送${amount}仙玉`);
  } catch (error) { ui.showToast(error.message); }
}

async function handleAdminSetLevel(userId) {
  const level = prompt('输入新等级：', '10');
  if (!level) return;
  try {
    const result = await api.setAdminLevel(userId, parseInt(level));
    ui.showToast(`等级已设为${result.level}`);
    loadAdminSub('users');
  } catch (error) { ui.showToast(error.message); }
}

async function handleAdminAddItem(userId) {
  const itemId = prompt('输入物品ID：', '38');
  if (!itemId) return;
  const qty = prompt('输入数量：', '10');
  if (!qty) return;
  try {
    const result = await api.adminAddItem(userId, parseInt(itemId), parseInt(qty));
    ui.showToast(result.message || '发送成功');
  } catch (error) { ui.showToast(error.message); }
}

async function handleAdminResetChar(userId) {
  ui.showConfirm('重置角色', '确定要重置该角色吗？所有数据将清零！', async () => {
    try {
      const result = await api.resetCharacter(userId);
      ui.showToast(result.message);
      loadAdminSub('users');
    } catch (error) { ui.showToast(error.message); }
  });
}

async function handleAdminBroadcast() {
  const input = document.getElementById('admin-broadcast-input');
  if (!input || !input.value.trim()) return;
  ui.showConfirm('发送广播', '确定要向全服发送广播吗？', async () => {
    try {
      await api.broadcastMessage(input.value.trim());
      ui.showToast('广播已发送');
      input.value = '';
    } catch (error) { ui.showToast(error.message); }
  });
}

// ========== Init Hooks ==========
async function loadGameEnhanced() {
  const token = localStorage.getItem('token');
  if (token) {
    try {
      await loadGame();
      setTimeout(() => {
        checkAnnouncements();
        checkAds();
        refreshQuestTracker();
      }, 1000);
    } catch (e) {
      localStorage.removeItem('token');
      ui.showView('login-view');
    }
  }
}

init();
