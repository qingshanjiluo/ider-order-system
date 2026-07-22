// pages/level.js — 个人等级页面

import { api } from '../api.js';
import { store } from '../store.js';

// 等级名称和所需经验值
const LEVEL_DATA = [
  { level: 1, title: '凡人', xp_needed: 0, desc: '初入修仙界' },
  { level: 2, title: '练气', xp_needed: 100, desc: '感应天地灵气' },
  { level: 3, title: '筑基', xp_needed: 300, desc: '奠定修仙根基' },
  { level: 4, title: '金丹', xp_needed: 600, desc: '凝聚金丹大道' },
  { level: 5, title: '元婴', xp_needed: 1000, desc: '元婴出窍' },
  { level: 6, title: '化神', xp_needed: 1500, desc: '化凡为神' },
  { level: 7, title: '炼虚', xp_needed: 2200, desc: '炼虚合道' },
  { level: 8, title: '合体', xp_needed: 3000, desc: '天人合一' },
  { level: 9, title: '大乘', xp_needed: 4000, desc: '大乘圆满' },
  { level: 10, title: '渡劫', xp_needed: 5500, desc: '渡劫飞升' },
  { level: 11, title: '真仙', xp_needed: 7500, desc: '位列仙班' },
  { level: 12, title: '金仙', xp_needed: 10000, desc: '金身不灭' },
];

function getLevelInfo(level) {
  return LEVEL_DATA.find(l => l.level === level) || LEVEL_DATA[LEVEL_DATA.length - 1];
}

function getNextLevel(level) {
  return LEVEL_DATA.find(l => l.level === level + 1) || null;
}

export async function renderLevel({ container }) {
  container.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;

  try {
    // 刷新用户信息
    const res = await api.getUserInfo();
    const user = res.user || res;
    store.setUser(user);
    localStorage.setItem('ider_user', JSON.stringify(user));

    const currentLevel = user.level || 1;
    const currentXp = user.xp || 0;
    const levelInfo = getLevelInfo(currentLevel);
    const nextLevel = getNextLevel(currentLevel);

    let progressPercent = 100;
    let xpToNext = 0;
    if (nextLevel) {
      const xpInCurrentLevel = currentXp - levelInfo.xp_needed;
      const xpForNextLevel = nextLevel.xp_needed - levelInfo.xp_needed;
      progressPercent = Math.min(100, Math.round((xpInCurrentLevel / xpForNextLevel) * 100));
      xpToNext = nextLevel.xp_needed - currentXp;
    }

    const totalXp = LEVEL_DATA.reduce((sum, l) => sum + (l.xp_needed || 0), 0);
    const overallPercent = totalXp > 0 ? Math.round((currentXp / totalXp) * 100) : 0;

    container.innerHTML = `
      <div class="page-header">
        <h2>修仙等级</h2>
        <p>你的修仙之路</p>
      </div>

      <!-- 当前等级卡片 -->
      <div class="card mb-6" style="border-left:3px solid var(--accent-blue);background:linear-gradient(135deg, rgba(59,130,246,0.05) 0%, rgba(147,51,234,0.05) 100%);">
        <div style="padding:var(--space-6);">
          <div class="flex justify-between items-center mb-4">
            <div>
              <div style="font-size:var(--text-3xl);font-weight:700;color:var(--accent-blue);">Lv.${currentLevel}</div>
              <div style="font-size:var(--text-xl);font-weight:600;margin-top:var(--space-1);">${levelInfo.title}</div>
              <div class="text-sm text-muted mt-1">${levelInfo.desc}</div>
            </div>
            <div style="text-align:right;">
              <div class="text-sm text-muted">累计经验值</div>
              <div style="font-size:var(--text-2xl);font-weight:600;color:var(--accent-amber);">${currentXp.toLocaleString()}</div>
            </div>
          </div>

          ${nextLevel ? `
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span class="text-muted">距离 Lv.${nextLevel.level} ${nextLevel.title}</span>
              <span class="font-semibold">${progressPercent}%（还需 ${xpToNext} XP）</span>
            </div>
            <div style="width:100%;height:12px;background:var(--bg-secondary,#e5e7eb);border-radius:6px;overflow:hidden;">
              <div style="width:${progressPercent}%;height:100%;background:linear-gradient(90deg,var(--accent-blue),var(--accent-purple,#9333ea));border-radius:6px;transition:width 0.5s;"></div>
            </div>
          </div>` : `
          <div class="text-sm" style="color:var(--accent-green);font-weight:600;">🎉 已达最高境界！</div>`}
        </div>
      </div>

      <!-- 等级路线图 -->
      <div class="card mb-6">
        <div class="card-header">
          <h3>等级路线</h3>
          <span class="text-sm text-muted">进度 ${overallPercent}%</span>
        </div>
        <div style="padding:0 var(--space-4) var(--space-4);">
          ${LEVEL_DATA.map(l => {
            const isCurrent = l.level === currentLevel;
            const isUnlocked = l.level <= currentLevel;
            const badgeStyle = isCurrent
              ? 'background:var(--accent-blue);color:white;'
              : isUnlocked
                ? 'background:var(--accent-green);color:white;'
                : 'background:var(--bg-secondary,#e5e7eb);color:var(--text-muted);';
            return `
              <div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3) 0;${isCurrent ? 'background:rgba(59,130,246,0.05);border-radius:var(--radius-sm);padding:var(--space-3) var(--space-2);margin:0 calc(-1 * var(--space-2));' : ''}">
                <div style="width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;${badgeStyle}">
                  ${l.level}
                </div>
                <div style="flex:1;">
                  <div class="flex justify-between items-center">
                    <span class="font-semibold ${isCurrent ? 'text-primary' : isUnlocked ? '' : 'text-muted'}">${l.title}</span>
                    <span class="text-xs text-muted">${l.xp_needed.toLocaleString()} XP</span>
                  </div>
                  <div class="text-xs text-muted">${l.desc}</div>
                </div>
                ${isCurrent ? '<span class="badge badge-approved" style="font-size:11px;">当前</span>' : ''}
                ${isUnlocked && !isCurrent ? '<span class="badge badge-completed" style="font-size:11px;">已达成</span>' : ''}
              </div>`;
          }).join('')}
        </div>
      </div>

      <!-- 等级特权 -->
      <div class="card">
        <div class="card-header">
          <h3>等级特权说明</h3>
        </div>
        <div style="padding:0 var(--space-4) var(--space-4);">
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(250px, 1fr));gap:var(--space-3);">
            <div style="padding:var(--space-3);border:1px solid var(--border-light);border-radius:var(--radius-md);">
              <div class="font-semibold" style="color:var(--accent-blue);">🏷️ 称号</div>
              <div class="text-sm text-muted mt-1">每个等级拥有独特称号</div>
            </div>
            <div style="padding:var(--space-3);border:1px solid var(--border-light);border-radius:var(--radius-md);">
              <div class="font-semibold" style="color:var(--accent-green);">📊 排行榜</div>
              <div class="text-sm text-muted mt-1">等级越高排名越靠前</div>
            </div>
            <div style="padding:var(--space-3);border:1px solid var(--border-light);border-radius:var(--radius-md);">
              <div class="font-semibold" style="color:var(--accent-amber);">💰 返利倍率</div>
              <div class="text-sm text-muted mt-1">高等级用户享受更高返利</div>
            </div>
            <div style="padding:var(--space-3);border:1px solid var(--border-light);border-radius:var(--radius-md);">
              <div class="font-semibold" style="color:var(--accent-purple,#9333ea);">🔓 专属功能</div>
              <div class="text-sm text-muted mt-1">解锁更多平台功能</div>
            </div>
          </div>
        </div>
      </div>`;
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <p>加载失败: ${err.message}</p>
        <a href="#/dashboard" class="btn btn-secondary mt-4">返回控制台</a>
      </div>`;
  }
}
