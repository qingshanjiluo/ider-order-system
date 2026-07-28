# -*- coding: utf-8 -*-
path = r'G:\皮皮\编程项目\艾德尔机器人\工单系统\pages-frontend\docs\ider_skin_full.user.js'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

# The new CSS with image references
new_css = '''css: `
html.theme-guzhenren{--void:#07070A;--abyss:#0A0A0F;--deep:#0F0F14;--ink:#141019;--miasma:#1A0A1A;--bone:#E8DCC4;--ash:#A09888;--dust:#5A5548;--gold:#8B7355;--gold-bright:#A0826D;--gold-dim:#5C4033;--rust:#6B4423;--silver:#7A7A7A;--verdigris:#2F4538;--crimson-deep:#2A1010;--line:rgba(139,115,85,0.25);--line-faint:rgba(139,115,85,0.12);--bg:var(--abyss)!important;--bg2:var(--deep)!important;--bg3:var(--ink)!important;--bg4:#1A1620!important;--border:var(--line)!important;--text:var(--bone)!important;--text2:var(--ash)!important;--gold:var(--gold)!important;--gold2:var(--gold-dim)!important;--accent:var(--verdigris)!important;--red:#6B2020!important;--green:#2F4538!important;--radius:0!important}
@keyframes gzrFadeIn{from{opacity:0}to{opacity:1}}
@keyframes gzrFadeInUp{from{opacity:0;transform:translateY(15px)}to{opacity:1;transform:translateY(0)}}
@keyframes gzrSigilSpin{from{transform:translate(-50%,-50%) rotate(0deg)}to{transform:translate(-50%,-50%) rotate(360deg)}}
@keyframes gzrFloat{0%,100%{transform:translateY(0) rotate(0deg);opacity:0.02}25%{opacity:0.05}50%{transform:translateY(-15px) rotate(5deg);opacity:0.035}75%{opacity:0.04}100%{transform:translateY(0) rotate(0deg);opacity:0.02}}
@keyframes gzrPulse{0%,100%{opacity:0.3}50%{opacity:0.6}}
@keyframes gzrGlow{0%,100%{box-shadow:0 0 5px rgba(139,115,85,0.05)}50%{box-shadow:0 0 20px rgba(139,115,85,0.12)}}
@keyframes gzrReveal{0%{opacity:0;clip-path:inset(0 100% 0 0)}100%{opacity:1;clip-path:inset(0 0 0 0)}}
@keyframes gzrBgPan{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
@keyframes gzrWatermarkFloat{0%,100%{transform:translateY(0) rotate(-3deg);opacity:0.04}50%{transform:translateY(-10px) rotate(-2deg);opacity:0.06}}
@keyframes gzrPortraitGlow{0%,100%{opacity:0.15;filter:brightness(0.6) sepia(0.3)}50%{opacity:0.25;filter:brightness(0.8) sepia(0.2)}}
.theme-guzhenren body{font-family:'Noto Serif SC','Songti SC','SimSun',serif!important;background:var(--abyss)!important;color:var(--bone)!important;letter-spacing:0.06em!important;line-height:2!important}
.theme-guzhenren .view-game{position:relative!important}
.theme-guzhenren .view-game::before{content:''!important;position:fixed!important;inset:0!important;z-index:-1!important;pointer-events:none!important;background-image:url("https://ider-order-system.pages.dev/docs/guzhenren/%E8%83%8C%E6%99%AF1.png")!important;background-size:cover!important;background-position:center!important;opacity:0.06!important;animation:gzrBgPan 30s ease-in-out infinite!important}
.theme-guzhenren .view-game::after{content:''!important;position:fixed!important;inset:0!important;z-index:0!important;pointer-events:none!important;background-image:url("https://ider-order-system.pages.dev/docs/guzhenren/%E8%9B%8A%E7%9C%9F%E4%BA%BA%E4%B9%A6%E6%B3%95%E5%AD%97.png")!important;background-repeat:no-repeat!important;background-position:50% 50%!important;background-size:clamp(200px,40vw,500px)!important;opacity:0.035!important;animation:gzrWatermarkFloat 20s ease-in-out infinite!important}
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
.theme-guzhenren .view-login{background:var(--abyss)!important;position:relative!important;overflow:hidden!important}
.theme-guzhenren .view-login::before{content:''!important;position:fixed!important;inset:0!important;z-index:0!important;background-image:url("https://ider-order-system.pages.dev/docs/guzhenren/%E5%A3%81%E7%BA%B88.png"),url("https://ider-order-system.pages.dev/docs/guzhenren/%E5%A3%81%E7%BA%B87.png")!important;background-size:cover,cover!important;background-position:center,center!important;opacity:0.04,0.03!important;pointer-events:none!important;animation:gzrBgPan 40s ease-in-out infinite!important}
.theme-guzhenren .login-card{background:var(--deep)!important;border:1px solid var(--line)!important;border-radius:0!important;box-shadow:0 4px 40px rgba(0,0,0,0.3)!important;position:relative!important;z-index:1!important}
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
`'''

# Find the current guzhenren css and replace it
old_start = c.find('css: `\nhtml.theme-guzhenren')
if old_start < 0:
    old_start = c.find('css: `\nhtml.theme-guzhenren{--void:')
if old_start < 0:
    old_start = c.find('css: `')
    # find the one closest to guzhenren
    idx = c.find('guzhenren:', old_start - 200)
    if idx > 0:
        old_start = c.find('css: `', idx)
        
if old_start > 0:
    old_end = c.find('\n`\n},', old_start)
    if old_end > 0:
        old_end += 5  # include the closing `\n`\n},
        c = c[:old_start] + new_css + c[old_end:]
        print('CSS replaced successfully')
    else:
        print('Could not find closing backtick')
else:
    print('Could not find start of guzhenren CSS')

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
