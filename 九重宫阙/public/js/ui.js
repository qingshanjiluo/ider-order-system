const ui = {
  showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');

    if (viewId === 'game-view') {
      const isMobile = window.innerWidth <= 768;
      const mobileNav = document.getElementById('mobile-tab-nav');
      if (mobileNav) mobileNav.style.display = isMobile ? 'flex' : 'none';
    }
  },

  updateResource(resource, value) {
    const el = document.getElementById(`res-${resource}`);
    if (el) el.textContent = this.formatNumber(value);
  },

  updateCharacterInfo(char) {
    const nameEl = document.getElementById('char-name');
    if (nameEl) nameEl.textContent = char.name;
    const realmEl = document.getElementById('realm-badge');
    if (realmEl) realmEl.textContent = char.realm || '凡人';

    const hpText = document.getElementById('hp-text');
    const hpBar = document.getElementById('hp-bar');
    if (hpText) hpText.textContent = `${char.hp || 0}/${char.maxHp || 0}`;
    if (hpBar) hpBar.style.width = `${((char.hp || 0) / (char.maxHp || 1)) * 100}%`;

    const mpText = document.getElementById('mp-text');
    const mpBar = document.getElementById('mp-bar');
    if (mpText) mpText.textContent = `${char.mp || 0}/${char.maxMp || 0}`;
    if (mpBar) mpBar.style.width = `${((char.mp || 0) / (char.maxMp || 1)) * 100}%`;

    const expText = document.getElementById('exp-text');
    const expBar = document.getElementById('exp-bar');
    if (expText) expText.textContent = `${char.exp || 0}/${char.expToNext || 100}`;
    if (expBar) expBar.style.width = `${((char.exp || 0) / (char.expToNext || 100)) * 100}%`;

    this.updateResource('spirit-stone', char.spirit_stone);
    this.updateResource('jade', char.jade || 0);
  },

  updateEquipGrid(equips) {
    const grid = document.getElementById('equip-grid');
    if (!grid) return;

    const slots = ['weapon', 'head', 'chest', 'legs', 'gloves', 'boots', 'necklace', 'ring'];

    grid.innerHTML = slots.map(slot => {
      const eq = equips[slot];
      if (eq) {
        return `
          <div class="equip-slot equipped" onclick="ui.showEquipDetail('${slot}')">
            <span class="icon">${this.getItemIcon(eq.type, eq.slot || slot)}</span>
            <span class="name">${eq.name}</span>
            <span class="quality quality-${eq.quality}">${eq.quality}</span>
            ${eq.enhance > 0 ? `<span class="enhance">+${eq.enhance}</span>` : ''}
          </div>
        `;
      }
      return `
        <div class="equip-slot empty" onclick="ui.showEquipSelect('${slot}')">
          <span class="icon">${this.getSlotIcon(slot)}</span>
          <span class="name">${this.getSlotName(slot)}</span>
        </div>
      `;
    }).join('');
  },

  showEquipDetail(slot) {
    const equips = window._currentEquips || {};
    const eq = equips[slot];
    if (!eq) return;
    const stats = eq.item ? JSON.parse(eq.item.stats || '{}') : {};
    document.getElementById('modal-title').textContent = eq.name || '装备详情';
    document.getElementById('modal-body').innerHTML = `
      <div style="padding:10px;">
        <div style="margin-bottom:8px;"><span style="color:var(--gold);">${eq.quality || '凡器'}</span> ${this.getSlotName(slot)}</div>
        ${stats.attack ? `<div>攻击：+${stats.attack}</div>` : ''}
        ${stats.defense ? `<div>防御：+${stats.defense}</div>` : ''}
        ${stats.hp ? `<div>生命：+${stats.hp}</div>` : ''}
        ${stats.speed ? `<div>速度：+${stats.speed}</div>` : ''}
        ${eq.enhance > 0 ? `<div>强化：+${eq.enhance}</div>` : ''}
      </div>
    `;
    document.getElementById('modal-footer').innerHTML = `
      <button class="btn" onclick="ui.closeModal()">关闭</button>
      <button class="btn" onclick="ui.closeModal();handleUnequip('${slot}')">卸下</button>
      <button class="btn primary" onclick="ui.closeModal();handleEnhance(${eq.id})">强化</button>
    `;
    document.getElementById('modal').classList.remove('hidden');
  },

  showEquipSelect(slot) {
    if (typeof loadCharacterTab === 'function') loadCharacterTab();
    ui.showToast('请在背包中选择装备');
  },

  updateCultivationProgress(realm) {
    const el = document.getElementById('cultivation-progress');
    if (el && realm) {
      el.innerHTML = `
        <div style="font-size:12px;margin-bottom:4px;">${realm.name}</div>
        <div class="bar-track"><div class="bar-fill exp-fill" style="width:${realm.progress || 0}%"></div></div>
        <div style="font-size:10px;color:var(--text2);margin-top:4px;">突破成功率：${realm.breakthroughChance || 0}%</div>
      `;
    }
  },

  updateDailyTasks(tasks) {
    const el = document.getElementById('daily-tasks');
    if (el) {
      el.innerHTML = tasks.map(t => `
        <div style="padding:6px 0;border-bottom:1px dashed var(--border);display:flex;justify-content:space-between;font-size:12px;">
          <span>${t.name}</span>
          <span style="color:${t.completed ? 'var(--green)' : 'var(--text2)'}">${t.completed ? '已完成' : '进行中'}</span>
        </div>
      `).join('');
    }
  },

  updateInventory(inventory) {
    const el = document.getElementById('inventory-list');
    if (!el) return;
    if (!inventory || inventory.length === 0) {
      el.innerHTML = '<div class="empty-state"><p>背包为空</p></div>';
      return;
    }
    el.innerHTML = inventory.slice(0, 12).map(item => `
      <div class="shop-item" style="padding:8px;margin-bottom:4px;">
        <div class="shop-item-info">
          <div class="shop-item-name" style="font-size:12px;">${item.name || '未知物品'}</div>
          <div class="shop-item-desc">${item.type || ''} ${item.quality || ''}</div>
        </div>
        <span style="font-size:11px;color:var(--text2);">x${item.quantity || 1}</span>
      </div>
    `).join('');
  },

  showConfirm(title, text, onConfirm) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = `<p>${text}</p>`;
    document.getElementById('modal-footer').innerHTML = `
      <button class="btn" onclick="ui.closeModal()">取消</button>
      <button class="btn primary" id="confirm-btn">确定</button>
    `;
    document.getElementById('modal').classList.remove('hidden');
    document.getElementById('confirm-btn').onclick = () => {
      ui.closeModal();
      onConfirm();
    };
  },

  showItemDetail(item, actions) {
    document.getElementById('modal-title').textContent = item.name;
    document.getElementById('modal-body').innerHTML = `
      <div class="item-detail-header">
        <div class="item-detail-icon">${this.getItemIcon(item.type)}</div>
        <div class="item-detail-info">
          <div class="item-detail-name">${item.name}</div>
          <div class="item-detail-desc">${item.description || ''}</div>
          <div class="item-detail-stats">
            ${item.attack ? `<div>攻击：<span class="stat-bonus">+${item.attack}</span></div>` : ''}
            ${item.defense ? `<div>防御：<span class="stat-bonus">+${item.defense}</span></div>` : ''}
            ${item.hp ? `<div>生命：<span class="stat-bonus">+${item.hp}</span></div>` : ''}
            ${item.mp ? `<div>灵气：<span class="stat-bonus">+${item.mp}</span></div>` : ''}
            ${item.speed ? `<div>速度：<span class="stat-bonus">+${item.speed}</span></div>` : ''}
            ${item.critChance ? `<div>暴击：<span class="stat-bonus">+${item.critChance}%</span></div>` : ''}
          </div>
        </div>
      </div>
    `;
    document.getElementById('modal-footer').innerHTML = actions.map(a => `
      <button class="btn ${a.primary ? 'primary' : ''}" onclick="${a.onclick}">${a.text}</button>
    `).join('');
    document.getElementById('modal').classList.remove('hidden');
  },

  showBattleResult(result) {
    const logHtml = result.battleLog ? result.battleLog.map(log => `<div class="log-entry">${log}</div>`).join('') : '';
    document.getElementById('modal-title').textContent = '战斗结束';
    document.getElementById('modal-body').innerHTML = `
      <div class="battle-result">
        <h3 style="color:${result.success && result.winner === 'attacker' ? 'var(--green)' : 'var(--red)'}">${result.success && result.winner === 'attacker' ? '胜利' : '失败'}</h3>
        <div class="reward">经验：+${result.rewards?.exp || 0}</div>
        <div class="reward">灵石：+${result.rewards?.spiritStone || 0}</div>
        ${result.rewards?.items ? result.rewards.items.map(i => `<div class="reward">${i.type} ${i.quality || ''}</div>`).join('') : ''}
        ${logHtml ? `<div class="battle-log">${logHtml}</div>` : ''}
      </div>
    `;
    document.getElementById('modal-footer').innerHTML = `
      <button class="btn primary" onclick="ui.closeModal()">确定</button>
    `;
    document.getElementById('modal').classList.remove('hidden');
  },

  showCultivationResult(result) {
    document.getElementById('modal-title').textContent = '修炼完成';
    document.getElementById('modal-body').innerHTML = `
      <div class="battle-result">
        <h3>修炼完成</h3>
        <div class="reward">经验：+${result.expGained || 0}</div>
        <div class="reward">修炼速度：${result.speed || 1}倍</div>
      </div>
    `;
    document.getElementById('modal-footer').innerHTML = `
      <button class="btn primary" onclick="ui.closeModal()">确定</button>
    `;
    document.getElementById('modal').classList.remove('hidden');
  },

  showCheckinResult(result) {
    document.getElementById('modal-title').textContent = '签到成功';
    document.getElementById('modal-body').innerHTML = `
      <div class="battle-result">
        <h3>签到成功</h3>
        <div class="reward">连续签到：${result.streak || 0}天</div>
        <div class="reward">经验：+${result.reward?.exp || 0}</div>
        <div class="reward">灵石：+${result.reward?.spiritStone || 0}</div>
      </div>
    `;
    document.getElementById('modal-footer').innerHTML = `
      <button class="btn primary" onclick="ui.closeModal()">确定</button>
    `;
    document.getElementById('modal').classList.remove('hidden');
  },

  showAchievementResult(result) {
    document.getElementById('modal-title').textContent = '成就达成';
    document.getElementById('modal-body').innerHTML = `
      <div class="battle-result">
        <h3>成就达成</h3>
        <div class="reward">${result.name || '成就'}</div>
        <div class="reward">经验：+${result.exp || 0}</div>
        <div class="reward">灵石：+${result.spiritStone || 0}</div>
      </div>
    `;
    document.getElementById('modal-footer').innerHTML = `
      <button class="btn primary" onclick="ui.closeModal()">确定</button>
    `;
    document.getElementById('modal').classList.remove('hidden');
  },

  showToast(text) {
    const toast = document.getElementById('toast');
    toast.textContent = text;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2500);
  },

  closeModal() {
    document.getElementById('modal').classList.add('hidden');
  },

  formatNumber(num) {
    if (num >= 100000000) return (num / 100000000).toFixed(2) + '亿';
    if (num >= 10000) return (num / 10000).toFixed(2) + '万';
    return Math.floor(num).toString();
  },

  getItemIcon(type, slot) {
    const slotIcons = {
      weapon: '剑', head: '盔', chest: '甲', legs: '腿',
      gloves: '套', boots: '靴', necklace: '链', ring: '戒'
    };
    if (slot && slotIcons[slot]) return slotIcons[slot];
    const icons = {
      '消耗品': '丹', '材料': '材', '装备': '器', '功法': '书', '灵宠': '兽'
    };
    return icons[type] || '物';
  },

  getSlotIcon(slot) {
    const icons = {
      weapon: '剑', head: '盔', chest: '甲', legs: '腿',
      gloves: '套', boots: '靴', necklace: '链', ring: '戒'
    };
    return icons[slot] || '空';
  },

  getSlotName(slot) {
    const names = {
      weapon: '主武器', head: '头盔', chest: '上身', legs: '裤子',
      gloves: '手套', boots: '鞋子', necklace: '项链', ring: '戒指'
    };
    return names[slot] || '未知';
  },

  getQualityColor(quality) {
    const colors = {
      '凡品': 'var(--text2)', '灵品': 'var(--blue)', '宝品': 'var(--purple)',
      '仙品': 'var(--gold)', '混沌': 'var(--red)'
    };
    return colors[quality] || 'var(--text)';
  },

  showSkeleton(container, type = 'card') {
    if (!container) return;
    const skeletons = {
      card: '<div class="skeleton" style="height:120px;margin-bottom:12px;"></div><div class="skeleton" style="height:20px;width:60%;margin-bottom:8px;"></div><div class="skeleton" style="height:14px;width:80%;"></div>',
      list: Array(5).fill('<div style="display:flex;gap:8px;margin-bottom:8px;"><div class="skeleton" style="width:40px;height:40px;border-radius:50%;flex-shrink:0;"></div><div style="flex:1;"><div class="skeleton" style="height:14px;width:60%;margin-bottom:4px;"></div><div class="skeleton" style="height:12px;width:80%;"></div></div></div>').join(''),
      grid: Array(6).fill('<div class="skeleton" style="height:100px;border-radius:var(--radius);"></div>').join(''),
      stats: '<div class="stats-grid">' + Array(4).fill('<div class="stat-item"><div class="skeleton" style="height:12px;width:40%;margin:0 auto 4px;"></div><div class="skeleton" style="height:20px;width:60%;margin:0 auto;"></div></div>').join('') + '</div>',
      battle: '<div class="skeleton" style="height:200px;margin-bottom:12px;"></div><div class="skeleton" style="height:40px;margin-bottom:8px;"></div><div class="skeleton" style="height:40px;"></div>'
    };
    container.innerHTML = `<div style="padding:16px;">${skeletons[type] || skeletons.card}</div>`;
  },

  hideSkeleton(container) {
    if (container) container.classList.remove('skeleton-loading');
  }
};
