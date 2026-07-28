# -*- coding: utf-8 -*-
import re

path = r'G:\皮皮\编程项目\艾德尔机器人\工单系统\pages-frontend\docs\ider_skin_full.user.js'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Insert GUZHENRENWASH before 'const SKINS = {'
gzw = '''
// ═══════════════════════════════════════════════════════════
// 蛊真人 — 残章禁卷，蛊界法则
// ═══════════════════════════════════════════════════════════

const GUZHENREN_CLASS = 'theme-guzhenren';

const GUZHENRENWASH = {
  active: false, decorEl: null, observer: null,

  SIGIL_SVG: '<svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="100" cy="100" r="95" stroke="#8B7355" stroke-width="0.4" stroke-dasharray="8 4" opacity="0.25"/><circle cx="100" cy="100" r="75" stroke="#8B7355" stroke-width="0.2" opacity="0.15"/><circle cx="100" cy="100" r="55" stroke="#8B7355" stroke-width="0.2" stroke-dasharray="4 8" opacity="0.2"/><path d="M100 5 L100 35 M100 165 L100 195 M5 100 L35 100 M165 100 L195 100" stroke="#8B7355" stroke-width="0.3" opacity="0.15"/><path d="M35 35 L55 55 M145 145 L165 165 M165 35 L145 55 M55 145 L35 165" stroke="#8B7355" stroke-width="0.3" opacity="0.12"/><rect x="85" y="85" width="30" height="30" stroke="#8B7355" stroke-width="0.3" opacity="0.15" transform="rotate(45 100 100)"/></svg>',

  apply() {
    if (this.active) return;
    this.active = true;
    document.querySelectorAll('link[rel="stylesheet"][href*="inkwash.css"],link[rel="stylesheet"][href*="wabi.css"]').forEach(function(el) { el.remove(); });
    document.documentElement.classList.add(GUZHENREN_CLASS);
    this.createDecor();
    this.startObserver();
  },

  remove() {
    this.active = false;
    document.documentElement.classList.remove(GUZHENREN_CLASS);
    if (this.decorEl) { this.decorEl.remove(); this.decorEl = null; }
    this.stopObserver();
  },

  createDecor() {
    if (this.decorEl) return;
    var w = document.createElement('div');
    w.id = 'guzhenren-decor';
    w.style.cssText = 'position:fixed;inset:0;z-index:-2;pointer-events:none;overflow:hidden';

    var bg = document.createElement('div');
    bg.style.cssText = 'position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%, rgba(139,115,85,0.03) 0%, transparent 60%)';
    w.appendChild(bg);

    var sigil = document.createElement('div');
    sigil.innerHTML = this.SIGIL_SVG;
    sigil.style.cssText = 'position:absolute;top:50%;left:50%;width:500px;height:500px;margin:-250px 0 0 -250px;opacity:0.5;animation:gzrSigilSpin 120s linear infinite';
    w.appendChild(sigil);

    var chars = ['蛊','虫','禁','残','蚀','腐','骨','噬','影','咒','蛹','蜕'];
    for (var i = 0; i < 16; i++) {
      var g = document.createElement('div');
      g.textContent = chars[i % chars.length];
      var gx = 5 + Math.random() * 90;
      var gy = 5 + Math.random() * 90;
      var gs = 10 + Math.random() * 16;
      var gd = Math.random() * 20;
      var gdur = 15 + Math.random() * 25;
      g.style.cssText = 'position:absolute;left:' + gx + '%;top:' + gy + '%;font-size:' + gs + 'px;color:rgba(139,115,85,0.035);font-family:"Noto Serif SC",serif;font-weight:900;pointer-events:none;animation:gzrFloat ' + gdur + 's ease-in-out ' + gd + 's infinite';
      w.appendChild(g);
    }

    document.body.prepend(w);
    this.decorEl = w;
  },

  startObserver() {
  },

  stopObserver() {
  },
};
'''

c = c.replace('const SKINS = {', gzw + '\nconst SKINS = {', 1)

# 2. Insert guzhenren skin entry into SKINS before }; // SKINS end
guzhenren_skin = '''

// ───────────────────────────────────────────────
// ⑪ 蛊真人 — 残章禁卷，蛊界法则
// ───────────────────────────────────────────────
guzhenren: {
name: '蛊真人',
desc: '残章禁卷，蛊界法则 · 天地为炉，万物为蛊',
css: `
html.theme-guzhenren{--void:#07070A;--abyss:#0A0A0F;--deep:#0F0F14;--ink:#141019;--miasma:#1A0A1A;--bone:#E8DCC4;--ash:#A09888;--dust:#5A5548;--gold:#8B7355;--gold-bright:#A0826D;--gold-dim:#5C4033;--rust:#6B4423;--silver:#7A7A7A;--verdigris:#2F4538;--crimson-deep:#2A1010;--line:rgba(139,115,85,0.25);--line-faint:rgba(139,115,85,0.12);--bg:var(--abyss)!important;--bg2:var(--deep)!important;--bg3:var(--ink)!important;--bg4:#1A1620!important;--border:var(--line)!important;--text:var(--bone)!important;--text2:var(--ash)!important;--gold:var(--gold)!important;--gold2:var(--gold-dim)!important;--accent:var(--verdigris)!important;--red:#6B2020!important;--green:#2F4538!important;--radius:0!important}
@keyframes gzrFadeIn{from{opacity:0}to{opacity:1}}
@keyframes gzrFadeInUp{from{opacity:0;transform:translateY(15px)}to{opacity:1;transform:translateY(0)}}
@keyframes gzrSigilSpin{from{transform:translate(-50%,-50%) rotate(0deg)}to{transform:translate(-50%,-50%) rotate(360deg)}}
@keyframes gzrFloat{0%,100%{transform:translateY(0) rotate(0deg);opacity:0.02}25%{opacity:0.05}50%{transform:translateY(-15px) rotate(5deg);opacity:0.035}75%{opacity:0.04}100%{transform:translateY(0) rotate(0deg);opacity:0.02}}
@keyframes gzrPulse{0%,100%{opacity:0.3}50%{opacity:0.6}}
@keyframes gzrGlow{0%,100%{box-shadow:0 0 5px rgba(139,115,85,0.05)}50%{box-shadow:0 0 20px rgba(139,115,85,0.12)}}
@keyframes gzrReveal{0%{opacity:0;clip-path:inset(0 100% 0 0)}100%{opacity:1;clip-path:inset(0 0 0 0)}}
.theme-guzhenren body{font-family:'Noto Serif SC','Songti SC','SimSun',serif!important;background:var(--abyss)!important;color:var(--bone)!important;letter-spacing:0.06em!important;line-height:2!important}
.theme-guzhenren .game-header{display:flex!important;flex-direction:row!important;align-items:center!important;padding:2px 10px!important;background:linear-gradient(180deg,var(--void),var(--abyss))!important;border-bottom:1px solid var(--line)!important;gap:2px!important;flex-wrap:nowrap!important;overflow:hidden!important;min-height:34px!important}
.theme-guzhenren .game-header .hdr-name{font-family:'Noto Serif SC',serif!important;font-size:0.75rem!important;font-weight:700!important;letter-spacing:0.2em!important;color:var(--gold)!important;white-space:nowrap!important;max-width:80px!important;overflow:hidden!important;text-overflow:ellipsis!important;flex-shrink:0!important;text-shadow:0 0 15px rgba(139,115,85,0.15)!important}
.theme-guzhenren .game-header .hdr-info{font-family:'Noto Serif SC',serif!important;font-weight:300!important;letter-spacing:0.08em!important;color:var(--ash)!important;font-size:0.6rem!important;white-space:nowrap!important;flex-shrink:0!important}
.theme-guzhenren .game-header .hdr-info .realm-badge{background:transparent!important;color:var(--gold)!important;padding:0!important;font-size:inherit!important;border:none!important;font-weight:400!important}
.theme-guzhenren .game-header .hdr-qq{display:none!important}
.theme-guzhenren .game-header .hdr-res{font-size:11px!important;letter-spacing:0.1em!important;gap:6px!important;white-space:nowrap!important;display:flex!important;align-items:center!important;color:var(--ash)!important}
.theme-guzhenren .game-header .btn-icon{color:var(--ash)!important;font-size:14px!important;padding:2px 5px!important;background:none!important;border:none!important;cursor:pointer!important;width:24px!important;height:24px!important;border-radius:2px!important;transition:all 0.3s!important}
.theme-guzhenren .game-header .hdr-res{margin-right:auto!important}
.theme-guzhenren .game-header .btn-icon:hover{color:var(--gold-bright)!important;background:rgba(139,115,85,0.08)!important}
.theme-guzhenren .game-header .btn-icon[title*="退出"]{display:none!important}
.theme-guzhenren .tab-nav{justify-content:center!important;background:var(--deep)!important;border-bottom:1px solid var(--line)!important;padding:4px 8px!important;gap:2px!important}
.theme-guzhenren .tab-btn{font-family:'Noto Serif SC',serif!important;font-weight:300!important;letter-spacing:0.15em!important;padding:6px 14px!important;font-size:12px!important;border-bottom:1px solid transparent!important;transition:all 0.5s ease!important;color:var(--ash)!important;position:relative!important}
.theme-guzhenren .tab-btn.active{color:var(--gold)!important;border-bottom-color:var(--gold)!important;text-shadow:0 0 15px rgba(139,115,85,0.15)!important}
.theme-guzhenren .tab-btn:hover{color:var(--gold-bright)!important;background:rgba(139,115,85,0.03)!important}
@media(min-width:1024px){.theme-guzhenren .tab-nav{flex-direction:column!important;position:fixed!important;left:0!important;top:50%!important;transform:translateY(-50%)!important;z-index:100!important;background:var(--deep)!important;border:1px solid var(--line)!important;border-left:none!important;padding:12px 6px!important;gap:3px!important;border-radius:0 8px 8px 0!important}.theme-guzhenren .tab-btn{writing-mode:vertical-rl!important;padding:8px 5px!important;font-size:11px!important;letter-spacing:0.25em!important;border-bottom:none!important;border-right:1px solid transparent!important}.theme-guzhenren .tab-btn.active{border-bottom-color:transparent!important;border-right-color:var(--gold)!important}.theme-guzhenren .main-area{margin-left:44px!important}}
@media(min-width:1024px){.theme-guzhenren .battle-sidebar{width:300px!important;border-right:none!important;border-left:1px solid var(--line)!important;background:var(--deep)!important;padding:16px 14px!important;position:relative!important}.theme-guzhenren .sidebar-char-header{flex-direction:column!important;align-items:flex-start!important;gap:4px!important;margin-bottom:12px!important;padding-bottom:12px!important;border-bottom:1px solid var(--line)!important}.theme-guzhenren .sidebar-char-name{font-family:'Noto Serif SC',serif!important;font-weight:700!important;font-size:15px!important;color:var(--bone)!important;letter-spacing:0.15em!important}.theme-guzhenren .sidebar-char-realm{font-size:10px!important;letter-spacing:0.2em!important;color:var(--dust)!important;display:block!important;margin-top:2px!important}.theme-guzhenren .sidebar-section-title{font-family:'Noto Serif SC',serif!important;font-weight:400!important;letter-spacing:0.2em!important;font-size:10px!important;color:var(--gold)!important;border-bottom:1px solid var(--line)!important;padding-bottom:6px!important;margin-bottom:8px!important;text-shadow:0 0 10px rgba(139,115,85,0.1)!important}.theme-guzhenren .sidebar-attr-grid .attr-item{background:transparent!important;padding:3px 4px!important;font-size:11px!important;color:var(--ash)!important}.theme-guzhenren .sidebar-stat-cards .stat-card.compact{background:rgba(255,255,255,0.02)!important;border:1px solid var(--line)!important;padding:6px 8px!important}}
.theme-guzhenren .stat-card,.theme-guzhenren .skill-card,.theme-guzhenren .map-card,.theme-guzhenren .sect-card,.theme-guzhenren .alliance-card,.theme-guzhenren .recipe-card,.theme-guzhenren .dungeon-card,.theme-guzhenren .listing-card{background:var(--ink)!important;border:1px solid var(--line)!important;position:relative!important;transition:all 0.6s ease!important;animation:gzrFadeIn 0.5s ease!important}
.theme-guzhenren .stat-card:hover,.theme-guzhenren .skill-card:hover,.theme-guzhenren .map-card:hover{border-color:var(--gold)!important;animation:gzrGlow 0.5s ease forwards!important}
.theme-guzhenren .section-title{font-family:'Noto Serif SC',serif!important;font-weight:400!important;letter-spacing:0.2em!important;color:var(--gold)!important;border-bottom:1px solid var(--line)!important;font-size:13px!important;padding-bottom:6px!important;margin-bottom:12px!important;text-shadow:0 0 15px rgba(139,115,85,0.1)!important}
.theme-guzhenren .skill-card.equipped{border-left:2px solid var(--gold)!important;border-color:var(--line)!important;background:rgba(139,115,85,0.04)!important}
.theme-guzhenren .battle-status-panel{background:var(--ink)!important;border:1px solid var(--line)!important;padding:14px!important;animation:gzrFadeIn 0.4s ease!important}
.theme-guzhenren .battle-unit .unit-name{font-family:'Noto Serif SC',serif!important;font-weight:400!important;letter-spacing:0.1em!important;color:var(--bone)!important}
.theme-guzhenren .battle-unit .unit-name.enemy-name{color:var(--gold)!important}
.theme-guzhenren .battle-vs{font-family:'Playfair Display',serif!important;font-size:1rem!important;color:var(--dust)!important;letter-spacing:0.15em!important}
.theme-guzhenren .battle-log-box{background:var(--ink)!important;border:1px solid var(--line)!important;font-family:'Noto Serif SC',serif!important;font-size:12px!important;line-height:2!important;letter-spacing:0.06em!important;color:var(--ash)!important}
.theme-guzhenren .bar-track{height:6px!important;background:var(--ink)!important;border:1px solid var(--line)!important;border-radius:0!important}
.theme-guzhenren .bar-fill{border-radius:0!important;transition:width 0.8s cubic-bezier(0.22,1,0.36,1)!important}
.theme-guzhenren .hp-bar-green{background:linear-gradient(90deg,var(--verdigris),#4A7A5A)!important}
.theme-guzhenren .hp-bar-red{background:linear-gradient(90deg,var(--crimson-deep),#8A3030)!important}
.theme-guzhenren .mp-bar-blue{background:linear-gradient(90deg,#2A2A4A,#5A5A8A)!important}
.theme-guzhenren .action-bar-yellow{background:linear-gradient(90deg,var(--gold-dim),var(--gold))!important}
.theme-guzhenren .exp-fill,.theme-guzhenren .exp-bar-fill{background:linear-gradient(90deg,var(--gold-dim),var(--gold))!important}
.theme-guzhenren .modal-overlay{background:rgba(7,7,10,0.85)!important;backdrop-filter:blur(4px)!important}
.theme-guzhenren .modal-panel{background:var(--deep)!important;border:1px solid var(--line)!important;box-shadow:0 4px 40px rgba(0,0,0,0.5)!important;animation:gzrFadeInUp 0.4s ease!important}
.theme-guzhenren .modal-title{font-family:'Noto Serif SC',serif!important;font-weight:700!important;letter-spacing:0.15em!important;color:var(--gold)!important;border-bottom:1px solid var(--line)!important;padding-bottom:8px!important;margin-bottom:12px!important}
.theme-guzhenren .modal-close{color:var(--ash)!important;background:transparent!important;border:1px solid var(--line)!important;border-radius:2px!important;transition:all 0.3s!important}
.theme-guzhenren .modal-close:hover{background:rgba(139,115,85,0.08)!important;color:var(--gold)!important;border-color:var(--gold)!important}
.theme-guzhenren .btn-primary{background:var(--gold-dim)!important;color:var(--bone)!important;font-family:'Noto Serif SC',serif!important;letter-spacing:0.15em!important;border-radius:0!important;border:1px solid var(--gold)!important;transition:all 0.3s!important}
.theme-guzhenren .btn-primary:hover{background:var(--gold)!important;color:var(--void)!important;box-shadow:0 0 20px rgba(139,115,85,0.2)!important}
.theme-guzhenren .btn-action{background:transparent!important;border:1px solid var(--line)!important;color:var(--ash)!important;font-family:'Noto Serif SC',serif!important;letter-spacing:0.1em!important;font-weight:300!important;transition:all 0.3s!important}
.theme-guzhenren .btn-action:hover{background:rgba(139,115,85,0.05)!important;border-color:var(--gold)!important;color:var(--gold)!important}
.theme-guzhenren .btn-action.gold{color:var(--gold)!important;border-color:var(--gold)!important}
.theme-guzhenren .btn-sm{background:transparent!important;border:1px solid var(--line)!important;color:var(--ash)!important;font-family:'Noto Serif SC',serif!important;letter-spacing:0.08em!important;font-weight:300!important;transition:all 0.3s!important}
.theme-guzhenren .btn-sm:hover{background:rgba(139,115,85,0.05)!important;color:var(--gold)!important}
.theme-guzhenren .btn-sm.gold{color:var(--gold)!important;border-color:var(--gold)!important}
.theme-guzhenren .view-login{background:var(--abyss)!important}
.theme-guzhenren .login-card{background:var(--deep)!important;border:1px solid var(--line)!important;border-radius:0!important;box-shadow:0 4px 40px rgba(0,0,0,0.3)!important}
.theme-guzhenren .game-title{font-family:'Noto Serif SC',serif!important;font-weight:900!important;letter-spacing:0.25em!important;color:var(--bone)!important;text-shadow:0 0 40px rgba(139,115,85,0.15)!important;font-size:clamp(1.5rem,5vw,2.5rem)!important}
.theme-guzhenren .login-subtitle{font-family:'Noto Serif SC',serif!important;font-weight:300!important;letter-spacing:0.4em!important;color:var(--ash)!important}
.theme-guzhenren .toast{background:var(--deep)!important;border:1px solid var(--gold)!important;color:var(--gold)!important;font-family:'Noto Serif SC',serif!important;letter-spacing:0.1em!important;border-radius:0!important;box-shadow:0 4px 20px rgba(0,0,0,0.3)!important}
.theme-guzhenren .item-detail{background:var(--ink)!important;border:1px solid var(--line)!important}
.theme-guzhenren .equip-slot,.theme-guzhenren .opt-item,.theme-guzhenren .inv-slot{background:var(--ink)!important;border:1px solid var(--line)!important;border-radius:0!important;transition:all 0.3s!important}
.theme-guzhenren .inv-slot.occupied:hover{border-color:var(--gold)!important;box-shadow:0 0 10px rgba(139,115,85,0.08)!important}
.theme-guzhenren .map-card.active{border-color:var(--gold)!important;background:rgba(139,115,85,0.04)!important}
.theme-guzhenren .sub-tab button,.theme-guzhenren .sub-tab-item{border-bottom:1px solid var(--line-faint)!important;color:var(--dust)!important;letter-spacing:1px!important;font-size:12px!important;background:transparent!important}
.theme-guzhenren .sub-tab button.active{color:var(--gold)!important;border-bottom:1px solid var(--gold)!important}
.theme-guzhenren .sr-bar{height:4px!important;background:var(--ink)!important;border:1px solid var(--line-faint)!important;border-radius:0!important}
.theme-guzhenren .key-badge{background:var(--gold-dim)!important;color:var(--bone)!important;font-family:'Noto Serif SC',serif!important;border-radius:0!important}
.theme-guzhenren .skill-name{font-family:'Noto Serif SC',serif!important;letter-spacing:0.08em!important;color:var(--bone)!important}
.theme-guzhenren ::-webkit-scrollbar{width:4px!important}
.theme-guzhenren ::-webkit-scrollbar-thumb{background:var(--gold-dim)!important;border-radius:0!important}
.theme-guzhenren ::-webkit-scrollbar-track{background:var(--abyss)!important}
.theme-guzhenren input,.theme-guzhenren select,.theme-guzhenren textarea{background:var(--ink)!important;border:1px solid var(--line)!important;color:var(--bone)!important;border-radius:0!important;font-family:'Noto Serif SC',serif!important}
.theme-guzhenren input:focus{border-color:var(--gold)!important;box-shadow:0 0 10px rgba(139,115,85,0.08)!important}
.theme-guzhenren .panel{animation:gzrFadeIn 0.5s ease!important}
.theme-guzhenren .bar-fill,.theme-guzhenren .exp-fill{animation:gzrFadeIn 0.6s ease!important}
.tab-btn svg,.ider-nav-icon{display:none!important}
`
},
'''

# Insert before }; // SKINS end
skins_end = c.find('}; // SKINS end')
if skins_end > 0:
    c = c[:skins_end] + guzhenren_skin + c[skins_end:]

# 3. Add key mapping to SKIN_KEY_MAP
key_map = '  guzhenren: \'guzhenren\',\n'
key_map_pos = c.find('};', c.find('const SKIN_KEY_MAP'))
if key_map_pos > 0:
    c = c[:key_map_pos] + key_map + c[key_map_pos:]

# 4. Add trigger in applySkin
apply_skin_trigger = '''    } else if (skinName === 'guzhenren') {
      setTimeout(() => GUZHENRENWASH.apply(), 150);'''
apply_skin_pos = c.find("    } else if (skinName === 'taiji')")
if apply_skin_pos > 0:
    c = c[:apply_skin_pos] + apply_skin_trigger + '\n' + c[apply_skin_pos:]

# 5. Add trigger in applyOrderSystemSkin
apply_os_trigger = '''  } else if (skinKey === 'guzhenren') {
    setTimeout(() => GUZHENRENWASH.apply(), 150);'''
apply_os_pos = c.find("  } else if (skinKey === 'taiji')")
if apply_os_pos > 0:
    c = c[:apply_os_pos] + apply_os_trigger + '\n' + c[apply_os_pos:]

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('Done')
