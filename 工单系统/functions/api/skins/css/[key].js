import { json } from '../../../_utils.js';

const SKIN_CSS = {
  ink: `html.theme-inkwash{--paper:#F5F0E6;--paper-warm:#F0EBE0;--ink-deep:#1a1a1a;--ink-mid:rgba(26,26,26,0.55);--ink-light:rgba(26,26,26,0.18);--ink-faint:rgba(26,26,26,0.06);--ink-ghost:rgba(26,26,26,0.025);--cinnabar:#C43A2B;--cinnabar-soft:rgba(196,58,43,0.85);--cinnabar-faint:rgba(196,58,43,0.08);--gold-seal:#8B7355;--bg:#F5F0E6;--bg2:#F0EBE0;--bg3:#E8E0D0;--bg4:#DDD4C0;--border:rgba(26,26,26,0.18);--text:#1a1a1a;--text2:rgba(26,26,26,0.55);--gold:#C43A2B;--gold2:#C43A2B;--accent:#8B7355;--red:#C43A2B;--green:#5a7a3a;--radius:4px}
@keyframes inkwashIn{0%{opacity:0;clip-path:inset(0 50% 0 50%)}60%{clip-path:inset(0 0 0 0)}100%{opacity:1}}
@keyframes inkwashSpread{from{background-position:100% 0}to{background-position:0% 0}}
@keyframes inkwashPour{0%{background-position:100% 0}100%{background-position:0% 0}}
@keyframes inkwashMist{0%,100%{transform:translateX(0)}50%{transform:translateX(15%)}}
@keyframes inkwashFloat{0%,100%{transform:translateY(0) scale(1);opacity:0.03}50%{transform:translateY(-6px) scale(1.1);opacity:0.06}}
.theme-inkwash body{font-family:'Noto Serif SC','STKaiti','KaiTi','FangSong',serif!important;background:var(--paper)!important;letter-spacing:0.04em!important;color:var(--ink-deep)!important}
.theme-inkwash input,.theme-inkwash button,.theme-inkwash select{font-family:'Noto Serif SC','STKaiti','KaiTi',serif!important}
.theme-inkwash .game-header{display:flex!important;flex-direction:row!important;align-items:center!important;padding:4px 12px!important;background:transparent!important;border-bottom:1px solid var(--border)!important;gap:4px!important;flex-wrap:nowrap!important}
.theme-inkwash .inkwash-header-line{display:none!important}
.theme-inkwash .game-header .hdr-name{font-family:'Ma Shan Zheng',cursive!important;font-size:0.85rem!important;letter-spacing:0.15em!important;color:var(--cinnabar)!important;white-space:nowrap!important}


.theme-inkwash .game-header .hdr-info{font-family:'Noto Serif SC',serif!important;font-weight:200!important;letter-spacing:0.1em!important;color:var(--text2)!important;font-size:0.7rem!important;white-space:nowrap!important}
.theme-inkwash .game-header .hdr-info .realm-badge{background:transparent!important;color:var(--text2)!important;padding:0!important;font-size:inherit!important;border:none!important}
.theme-inkwash .game-header .hdr-qq{display:none!important}
.theme-inkwash .game-header .hdr-res{font-size:11px!important;letter-spacing:0.1em!important;gap:8px!important;white-space:nowrap!important;display:flex!important;align-items:center!important}
.theme-inkwash .inkwash-divider{display:none!important}



.theme-inkwash .game-header .btn-icon{color:var(--text2)!important;font-size:14px!important;padding:2px 6px!important;background:none!important;border:none!important;cursor:pointer!important;width:24px!important;height:24px!important}.theme-inkwash .game-header .hdr-res{margin-right:auto!important}.theme-inkwash .game-header .btn-icon[title*="退出"]{display:none!important}

.theme-inkwash .tab-nav{justify-content:center!important;background:transparent!important;border-bottom:1px solid var(--border)!important;padding:4px 8px!important;gap:2px!important}
.theme-inkwash .tab-btn{font-family:'Noto Serif SC',serif!important;font-weight:300!important;letter-spacing:0.12em!important;padding:6px 12px!important;font-size:12px!important;border-bottom:1px solid transparent!important;transition:all 0.4s ease!important;color:var(--text2)!important}
.theme-inkwash .tab-btn.active{color:var(--cinnabar)!important;border-bottom-color:var(--cinnabar)!important}
.theme-inkwash .tab-btn:hover{background:linear-gradient(90deg,transparent 50%,rgba(196,58,43,0.06) 100%)!important;background-size:200% 100%!important;animation:inkwashSpread 0.4s ease forwards!important}
.theme-inkwash .inkwash-nav-icon{display:inline-block!important;width:16px!important;height:16px!important;vertical-align:middle!important;margin-right:4px!important;flex-shrink:0!important;color:var(--text2)!important;transition:color 0.3s!important}
.theme-inkwash .tab-btn.active .inkwash-nav-icon{color:var(--cinnabar)!important}
.theme-inkwash .tab-btn:hover .inkwash-nav-icon{color:var(--cinnabar-soft)!important}
@media(min-width:1024px){.theme-inkwash .tab-nav{flex-direction:column!important;position:fixed!important;left:0!important;top:50%!important;transform:translateY(-50%)!important;z-index:100!important;background:var(--bg2)!important;border:1px solid var(--border)!important;border-left:none!important;padding:12px 8px!important;gap:4px!important;border-radius:0 8px 8px 0!important;box-shadow:2px 2px 12px rgba(0,0,0,0.04)!important}.theme-inkwash .tab-btn{writing-mode:vertical-rl!important;padding:8px 6px!important;font-size:11px!important;letter-spacing:0.2em!important;border-bottom:none!important;border-right:1px solid transparent!important}.theme-inkwash .tab-btn.active{border-bottom-color:transparent!important;border-right-color:var(--cinnabar)!important}.theme-inkwash .tab-btn[data-tab="character"],.theme-inkwash .tab-btn[data-tab="battle"]{display:block!important}.theme-inkwash .inkwash-nav-icon{width:20px!important;height:20px!important;margin-right:0!important;margin-bottom:2px!important}.theme-inkwash .main-area{margin-left:48px!important}}
@media(min-width:1024px){.theme-inkwash .battle-sidebar{width:240px!important;border-right:none!important;border-left:1px solid var(--border)!important;background:var(--paper-warm)!important;padding:16px 14px!important;position:relative!important}.theme-inkwash .battle-sidebar::before{content:''!important;position:absolute!important;left:8px!important;top:8px!important;bottom:8px!important;width:1px!important;background:var(--ink-ghost)!important;opacity:0.4!important}.theme-inkwash .sidebar-char-header{flex-direction:column!important;align-items:center!important;gap:4px!important;margin-bottom:12px!important;padding-bottom:12px!important;border-bottom:1px solid var(--border)!important}.theme-inkwash .sidebar-char-realm{font-size:10px!important;letter-spacing:0.2em!important;color:var(--text2)!important;text-align:center!important;display:block!important;margin-top:4px!important}.theme-inkwash .sidebar-section-title{font-family:'Noto Serif SC',serif!important;font-weight:200!important;letter-spacing:0.2em!important;font-size:10px!important;color:var(--text2)!important;border-bottom:1px solid var(--border)!important}.theme-inkwash .sidebar-attr-grid .attr-item{background:transparent!important;padding:3px 4px!important;font-size:11px!important}.theme-inkwash .sidebar-stat-cards .stat-card.compact{background:transparent!important;border:1px solid var(--border)!important;padding:6px 8px!important}}
.theme-inkwash .stat-card,.theme-inkwash .skill-card,.theme-inkwash .map-card,.theme-inkwash .sect-card,.theme-inkwash .alliance-card,.theme-inkwash .recipe-card,.theme-inkwash .dungeon-card,.theme-inkwash .listing-card{background:var(--bg3)!important;border:1px solid var(--border)!important;position:relative!important;transition:all 0.6s ease!important}
.theme-inkwash .stat-card::before,.theme-inkwash .skill-card::before,.theme-inkwash .map-card::before{content:''!important;position:absolute!important;left:0!important;top:0!important;bottom:0!important;width:2px!important;background:var(--cinnabar)!important;transform:scaleY(0)!important;transition:transform 0.4s ease!important}
.theme-inkwash .stat-card:hover::before,.theme-inkwash .skill-card:hover::before,.theme-inkwash .map-card:hover::before{transform:scaleY(1)!important}
.theme-inkwash .section-title{font-family:'Noto Serif SC',serif!important;font-weight:300!important;letter-spacing:0.15em!important;color:var(--ink-deep)!important;border-bottom:1px solid var(--border)!important;font-size:14px!important}
.theme-inkwash .skill-card.equipped{border-left:3px solid var(--cinnabar)!important;border-color:var(--border)!important;background:var(--cinnabar-faint)!important}
.theme-inkwash .battle-status-panel{background:var(--bg3)!important;border:1px solid var(--border)!important;border-radius:var(--radius)!important;padding:14px!important}
.theme-inkwash .battle-unit .unit-name{font-family:'Ma Shan Zheng',cursive!important;font-size:1.1rem!important;letter-spacing:0.1em!important}
.theme-inkwash .battle-unit .unit-name.enemy-name{color:var(--cinnabar)!important}
.theme-inkwash .battle-vs{font-family:'Ma Shan Zheng',cursive!important;font-size:1rem!important;color:var(--text2)!important}
.theme-inkwash .battle-log-box{background:var(--bg3)!important;border:1px solid var(--border)!important;font-family:'Noto Serif SC',serif!important;font-size:12px!important;line-height:1.8!important;letter-spacing:0.06em!important}
.theme-inkwash .bar-track{height:8px!important;background:var(--ink-faint)!important;border-radius:0!important;border:none!important}
.theme-inkwash .bar-fill{border-radius:0!important;transition:width 0.8s cubic-bezier(0.22,1,0.36,1)!important}
.theme-inkwash .hp-bar-green{background:linear-gradient(90deg,#1a1a1a,#4a4a4a)!important}
.theme-inkwash .hp-bar-red{background:linear-gradient(90deg,var(--cinnabar),#8a2a1a)!important}
.theme-inkwash .mp-bar-blue{background:linear-gradient(90deg,#3a3a5a,#5a5a8a)!important}
.theme-inkwash .action-bar-yellow{background:linear-gradient(90deg,#5a4a2a,#8a7a3a)!important}
.theme-inkwash .exp-fill,.theme-inkwash .exp-bar-fill{background:linear-gradient(90deg,var(--ink-deep),var(--ink-mid))!important}
.theme-inkwash .modal-overlay{background:rgba(0,0,0,0.3)!important}
.theme-inkwash .modal-panel{background:var(--bg2)!important;border:1px solid var(--ink-light)!important;border-radius:var(--radius)!important;box-shadow:0 4px 24px rgba(0,0,0,0.06)!important}
.theme-inkwash .modal-title{font-family:'Noto Serif SC',serif!important;font-weight:400!important;letter-spacing:0.12em!important;color:var(--ink-deep)!important;border-bottom:1px solid var(--border)!important;padding-bottom:8px!important}
.theme-inkwash .modal-close{color:var(--text2)!important;background:transparent!important;border:1px solid var(--border)!important;border-radius:4px!important}
.theme-inkwash .modal-close:hover{background:var(--cinnabar-faint)!important;color:var(--cinnabar)!important}
.theme-inkwash .btn-primary{background:var(--ink-deep)!important;color:var(--paper)!important;font-family:'Noto Serif SC',serif!important;letter-spacing:0.15em!important;border-radius:var(--radius)!important}
.theme-inkwash .btn-primary:hover{background:var(--cinnabar)!important}
.theme-inkwash .btn-action{background:transparent!important;border:1px solid var(--border)!important;color:var(--text)!important;font-family:'Noto Serif SC',serif!important;letter-spacing:0.1em!important;font-weight:300!important}
.theme-inkwash .btn-action:hover{background:var(--cinnabar-faint)!important;border-color:var(--cinnabar)!important}
.theme-inkwash .btn-action.gold{color:var(--cinnabar)!important;border-color:var(--cinnabar)!important}
.theme-inkwash .btn-sm{background:transparent!important;border:1px solid var(--border)!important;color:var(--text)!important;font-family:'Noto Serif SC',serif!important;letter-spacing:0.08em!important;font-weight:300!important}
.theme-inkwash .btn-sm:hover{background:var(--cinnabar-faint)!important}
.theme-inkwash .view-login{background:var(--paper)!important}
.theme-inkwash .login-card{background:var(--bg2)!important;border:1px solid var(--border)!important;border-radius:var(--radius)!important}
.theme-inkwash .game-title{font-family:'Ma Shan Zheng',cursive!important;letter-spacing:0.25em!important;color:var(--ink-deep)!important;font-weight:400!important;text-shadow:none!important}
.theme-inkwash .login-subtitle{font-family:'Noto Serif SC',serif!important;font-weight:200!important;letter-spacing:0.3em!important}
.theme-inkwash .toast{background:var(--bg2)!important;border:1px solid var(--cinnabar)!important;color:var(--cinnabar)!important;font-family:'Noto Serif SC',serif!important;letter-spacing:0.1em!important;border-radius:var(--radius)!important}
.theme-inkwash .equip-slot,.theme-inkwash .opt-item,.theme-inkwash .inv-slot{background:var(--bg3)!important;border:1px solid var(--border)!important;border-radius:var(--radius)!important}
.theme-inkwash .inv-slot.occupied:hover{border-color:var(--cinnabar)!important}
.theme-inkwash .map-card.active{border-color:var(--cinnabar)!important;background:var(--paper-warm)!important}
.theme-inkwash .sub-tab button,.theme-inkwash .sub-tab-item{border-bottom:1px solid var(--ink-faint)!important;color:var(--ink-mid)!important;letter-spacing:1px!important;font-size:12px!important;background:transparent!important}
.theme-inkwash .sub-tab button.active{color:var(--cinnabar)!important;border-bottom:2px solid var(--cinnabar)!important}
.theme-inkwash .sr-bar{height:6px!important;background:var(--ink-faint)!important;border-radius:0!important}
.theme-inkwash .mingtu-scroll{background:radial-gradient(circle at 10% 10%,rgba(139,115,85,0.12),transparent 36%),radial-gradient(circle at 90% 25%,rgba(196,58,43,0.08),transparent 34%),linear-gradient(165deg,var(--bg2),var(--bg))!important}
.theme-inkwash ::-webkit-scrollbar{width:4px!important}
.theme-inkwash ::-webkit-scrollbar-thumb{background:var(--border)!important}
.theme-inkwash input,.theme-inkwash select,.theme-inkwash textarea{background:var(--paper)!important;border:1px solid var(--border)!important;color:var(--ink-deep)!important;border-radius:4px!important;font-family:'Noto Serif SC',serif!important}
.theme-inkwash input:focus{border-color:var(--ink-deep)!important}
.theme-inkwash .panel{animation:inkwashIn 0.8s cubic-bezier(0.22,1,0.36,1)!important}
.theme-inkwash .bar-fill,.theme-inkwash .exp-fill{background-size:200% 100%!important;animation:inkwashPour 0.8s ease forwards!important}
`,


  cyber: `.tab-btn svg,.ider-nav-icon{display:none!important}:root {
  --bg: #03030a !important; --bg2: #070718 !important; --bg3: #0c0c28 !important;
  --bg4: #11113a !important; --border: #1a1a4a !important;
  --text: #c4d0e0 !important; --text2: #4a5a7a !important;
  --gold: #00f0ff !important; --gold2: #0090ff !important;
  --accent: #ff00aa !important; --red: #ff0044 !important; --green: #00ff88 !important;
  --radius: 2px !important;
}
body { font-family: 'Rajdhani','Noto Sans SC',sans-serif !important; }
body::before{content:''!important;position:fixed!important;inset:0!important;z-index:-3!important;pointer-events:none!important;background-image:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,240,255,0.02) 3px,rgba(0,240,255,0.02) 4px)!important}
body::after{content:''!important;position:fixed!important;inset:0!important;z-index:-3!important;pointer-events:none!important;background:radial-gradient(ellipse at 50% 100%,rgba(0,240,255,0.03),transparent 60%)!important}
.ider-cyber-grid{position:fixed!important;inset:0!important;z-index:-3!important;pointer-events:none!important;background-image:linear-gradient(rgba(0,240,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,240,255,0.03) 1px,transparent 1px)!important;background-size:40px 40px!important}
.view-login { background: linear-gradient(135deg, #03030a, #0a0a20, #03030a) !important; }
.login-card { background: rgba(7,7,24,0.95) !important; border: 1px solid rgba(0,240,255,0.15) !important; box-shadow: 0 0 60px rgba(0,240,255,0.03), inset 0 0 60px rgba(0,240,255,0.02) !important; }
.game-title { font-family: 'Orbitron',sans-serif !important; font-size: 28px !important; color: #00f0ff !important; text-shadow: 0 0 30px rgba(0,240,255,0.3) !important; letter-spacing: 4px !important; text-transform: uppercase !important; }
.game-header { background: linear-gradient(90deg, #03030a, #070718, #03030a) !important; border-bottom: 1px solid rgba(0,240,255,0.1) !important; }
.game-header::after { content: '' !important; position: absolute !important; bottom: -1px !important; left: 0 !important; right: 0 !important; height: 1px !important; background: linear-gradient(90deg, transparent, #00f0ff, #ff00aa, #00f0ff, transparent) !important; background-size: 200% 100% !important; animation: iderScan 2s linear infinite !important; }
@keyframes iderScan { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.hdr-name { font-family: 'Orbitron',sans-serif !important; font-size: 14px !important; color: #00f0ff !important; text-shadow: 0 0 15px rgba(0,240,255,0.4) !important; letter-spacing: 2px !important; text-transform: uppercase !important; }
.realm-badge { background: rgba(255,0,170,0.1) !important; border: 1px solid rgba(255,0,170,0.25) !important; color: #ff00aa !important; text-shadow: 0 0 8px rgba(255,0,170,0.3) !important; border-radius: 2px !important; }
.btn-icon { color: #4a5a7a !important; }
.btn-icon:hover { color: #00f0ff !important; text-shadow: 0 0 15px rgba(0,240,255,0.5) !important; }
.tab-nav { background: #050510 !important; border-bottom: 1px solid #0c0c28 !important; }
.tab-btn { color: #4a5a7a !important; font-family: 'Rajdhani',sans-serif !important; font-size: 13px !important; letter-spacing: 1px !important; padding: 8px 16px !important; text-transform: uppercase !important; }
.tab-btn.active { color: #00f0ff !important; border-bottom: 1px solid #00f0ff !important; text-shadow: 0 0 10px rgba(0,240,255,0.3) !important; }
.battle-sidebar { background: #050510 !important; border-right: 1px solid #0c0c28 !important; }
.sidebar-char-name { font-family: 'Orbitron',sans-serif !important; color: #00f0ff !important; font-size: 12px !important; text-transform: uppercase !important; letter-spacing: 1px !important; }
.sidebar-section-title { color: #ff00aa !important; border-bottom: 1px solid #1a1a4a !important; text-transform: uppercase !important; font-size: 11px !important; letter-spacing: 2px !important; }
.stat-card, .skill-card, .modal-panel, .battle-status-panel, .battle-log-box {
  background: linear-gradient(135deg, #070718, #0c0c28) !important; border: 1px solid #1a1a4a !important;
  padding: 12px 16px !important;
}
.skill-card.equipped { border-color: #00f0ff !important; box-shadow: 0 0 20px rgba(0,240,255,0.05), inset 0 0 20px rgba(0,240,255,0.03) !important; }
.section-title { font-family: 'Orbitron',sans-serif !important; color: #00f0ff !important; border-bottom: 1px solid #1a1a4a !important; text-transform: uppercase !important; font-size: 11px !important; letter-spacing: 2px !important; padding-bottom: 6px !important; }
.btn-action { background: #0c0c28 !important; border: 1px solid #1a1a4a !important; color: #c4d0e0 !important; padding: 6px 14px !important; font-family: 'Rajdhani',sans-serif !important; font-size: 13px !important; text-transform: uppercase !important; letter-spacing: 1px !important; }
.btn-action:hover { border-color: #00f0ff !important; box-shadow: 0 0 15px rgba(0,240,255,0.1) !important; }
.btn-action.gold { border-color: #00f0ff !important; color: #00f0ff !important; text-shadow: 0 0 8px rgba(0,240,255,0.3) !important; }
.btn-sm { background: #0c0c28 !important; border: 1px solid #1a1a4a !important; color: #c4d0e0 !important; }
.btn-sm:hover{background:#1a1a4a!important;color:#00f0ff!important}
.btn-primary { background: linear-gradient(135deg, #ff00aa, #00f0ff) !important; border: none !important; color: #000 !important; font-weight: 700 !important; text-transform: uppercase !important; }
.btn-primary:hover{box-shadow:0 0 30px rgba(0,240,255,0.5),0 0 60px rgba(255,0,170,0.2)!important}
.modal-close{background:rgba(0,240,255,0.04)!important;border:1px solid rgba(0,240,255,0.08)!important;color:#4a5a7a!important;border-radius:2px!important}
.modal-close:hover{background:rgba(0,240,255,0.1)!important;color:#00f0ff!important}
.opt-item:hover{border-color:#00f0ff!important;box-shadow:0 0 15px rgba(0,240,255,0.08)!important}
.bar-track { background: #0c0c28 !important; border: 1px solid #1a1a4a !important; height: 8px !important; }
.hp-bar-red { background: linear-gradient(90deg, #5a0018, #ff0044) !important; }
.hp-bar-green { background: linear-gradient(90deg, #004a2a, #00ff88) !important; }
.mp-bar-blue { background: linear-gradient(90deg, #002a6a, #0090ff) !important; }
.exp-fill { background: linear-gradient(90deg, #6a00aa, #ff00aa) !important; }
.modal-overlay { background: rgba(3,3,10,0.85) !important; backdrop-filter: blur(8px) !important; }
.map-card { background: linear-gradient(135deg, #070718, #0c0c28) !important; border: 1px solid #1a1a4a !important; }
.map-card.active { border-color: #00f0ff !important; box-shadow: 0 0 25px rgba(0,240,255,0.08) !important; }
.inv-slot { background: #0c0c28 !important; border: 1px solid #1a1a4a !important; }
.inv-slot.occupied:hover { border-color: #00f0ff !important; box-shadow: 0 0 12px rgba(0,240,255,0.1) !important; }
.toast { background: rgba(7,7,24,0.95) !important; border: 1px solid #00f0ff !important; color: #00f0ff !important; box-shadow: 0 0 25px rgba(0,240,255,0.1) !important; }
::-webkit-scrollbar-thumb { background: #1a1a4a !important; }
::-webkit-scrollbar-track { background: #03030a !important; }
.panel { animation: iderGlitchIn 0.25s ease !important; }
@keyframes iderGlitchIn { 0% { opacity: 0; clip-path: inset(0 100% 0 0); } 80% { clip-path: inset(0 0 0 0); } 85% { clip-path: inset(2px 0 0 0); } 90% { clip-path: inset(0 0 3px 0); } 100% { opacity: 1; clip-path: inset(0 0 0 0); } }`,

  luxe: `.tab-btn svg,.ider-nav-icon{display:none!important}:root {
  --bg: #0d0b08 !important; --bg2: #1a1612 !important; --bg3: #28221c !important;
  --bg4: #3a322a !important; --border: #4a3f35 !important;
  --text: #e8ddd0 !important; --text2: #a09080 !important;
  --gold: #d4a844 !important; --gold2: #b8860b !important;
  --accent: #c0c0c0 !important; --red: #c04040 !important; --green: #40a060 !important;
  --radius: 4px !important;
}
body { font-family: 'Playfair Display','Noto Serif SC',serif !important; }
body::before{content:''!important;position:fixed!important;inset:0!important;z-index:-3!important;pointer-events:none!important;background:radial-gradient(ellipse at 50% 0%,rgba(212,168,68,0.04),transparent 50%)!important}
body::after{content:''!important;position:fixed!important;inset:0!important;z-index:-3!important;pointer-events:none!important;background:repeating-linear-gradient(90deg,transparent,transparent 80px,rgba(212,168,68,0.008) 80px,rgba(212,168,68,0.008) 81px)!important}
.ider-luxe-ornament{position:fixed!important;bottom:0!important;left:0!important;right:0!important;height:4px!important;z-index:-2!important;pointer-events:none!important;background:linear-gradient(90deg,transparent,rgba(212,168,68,0.15),rgba(212,168,68,0.08) 50%,rgba(212,168,68,0.15),transparent)!important}
.view-login { background: radial-gradient(ellipse at 50% 0%, #1a1612 0%, #0d0b08 60%) !important; }
.login-card { background: linear-gradient(160deg, #1a1612, #221e18) !important; border: 1px solid #4a3f35 !important; box-shadow: 0 8px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(212,168,68,0.05) !important; }
.game-title { font-family: 'Playfair Display',serif !important; font-size: 30px !important; color: #d4a844 !important; text-shadow: 0 0 40px rgba(212,168,68,0.15) !important; letter-spacing: 3px !important; font-weight: 700 !important; }
.game-header { background: linear-gradient(180deg, #1a1612, #0d0b08) !important; border-bottom: 2px solid #4a3f35 !important; }
.game-header::after { content: '' !important; position: absolute !important; bottom: -2px !important; left: 15% !important; right: 15% !important; height: 1px !important; background: linear-gradient(90deg, transparent, #d4a844, transparent) !important; }
.hdr-name { font-family: 'Playfair Display',serif !important; font-size: 16px !important; color: #d4a844 !important; letter-spacing: 2px !important; font-weight: 700 !important; text-shadow: 0 1px 4px rgba(0,0,0,0.3) !important; }
.realm-badge { background: linear-gradient(135deg, #2a2318, #3a3022) !important; border: 1px solid #4a3f35 !important; color: #d4a844 !important; box-shadow: inset 0 1px 0 rgba(212,168,68,0.1) !important; }
.btn-icon { color: #a09080 !important; }
.btn-icon:hover { color: #d4a844 !important; text-shadow: 0 0 10px rgba(212,168,68,0.2) !important; }
.tab-nav { background: #0d0b08 !important; border-bottom: 1px solid #3a322a !important; }
.tab-btn { color: #8a7a6a !important; font-family: 'Playfair Display',serif !important; font-size: 13px !important; letter-spacing: 1px !important; padding: 10px 24px !important; }
.tab-btn.active { color: #d4a844 !important; border-bottom: 1px solid #d4a844 !important; }
.tab-btn:hover { color: #e8ddd0 !important; background: rgba(212,168,68,0.03) !important; }
.battle-sidebar { background: #0d0b08 !important; border-right: 1px solid #3a322a !important; }
.sidebar-char-name { color: #d4a844 !important; font-family: 'Playfair Display',serif !important; font-weight: 700 !important; }
.sidebar-section-title { color: #d4a844 !important; border-bottom: 1px solid #3a322a !important; letter-spacing: 2px !important; text-transform: uppercase !important; font-size: 10px !important; }
.stat-card, .skill-card, .modal-panel, .battle-status-panel, .battle-log-box {
  background: linear-gradient(160deg, #1a1612, #221e18) !important; border: 1px solid #3a322a !important;
  padding: 16px 20px !important; box-shadow: 0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.02) !important;
}
.skill-card.equipped { border-color: #d4a844 !important; background: linear-gradient(160deg, #221a12, #2a2218) !important; }
.section-title { color: #d4a844 !important; border-bottom: 1px solid #4a3f35 !important; font-size: 13px !important; letter-spacing: 3px !important; text-transform: uppercase !important; padding-bottom: 8px !important; }
.btn-action { background: linear-gradient(160deg, #1a1612, #28221c) !important; border: 1px solid #4a3f35 !important; color: #e8ddd0 !important; padding: 8px 18px !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.03) !important; }
.btn-action:hover { border-color: #d4a844 !important; box-shadow: inset 0 1px 0 rgba(212,168,68,0.05), 0 2px 12px rgba(212,168,68,0.08) !important; }
.btn-action.gold { background: linear-gradient(160deg, #3a3022, #4a3f35) !important; border-color: #d4a844 !important; color: #d4a844 !important; }
.btn-sm { background: #1a1612 !important; border: 1px solid #4a3f35 !important; }
.btn-sm:hover{background:#28221c!important;border-color:#d4a844!important}
.btn-primary { background: linear-gradient(135deg, #d4a844, #b8860b) !important; border: none !important; color: #000 !important; box-shadow: 0 2px 12px rgba(212,168,68,0.2) !important; }
.btn-primary:hover{box-shadow:0 4px 30px rgba(212,168,68,0.4)!important}
.modal-close{background:rgba(212,168,68,0.04)!important;border:1px solid #4a3f35!important;color:#a09080!important}
.modal-close:hover{background:rgba(212,168,68,0.1)!important;color:#d4a844!important}
.opt-item:hover{border-color:#d4a844!important;box-shadow:inset 0 0 20px rgba(212,168,68,0.03)!important}
.bar-track { background: #28221c !important; border: 1px solid #4a3f35 !important; height: 8px !important; }
.hp-bar-red { background: linear-gradient(90deg, #6a2020, #c04040) !important; }
.hp-bar-green { background: linear-gradient(90deg, #2a5a3a, #40a060) !important; }
.mp-bar-blue { background: linear-gradient(90deg, #2a3a6a, #4080c0) !important; }
.exp-fill { background: linear-gradient(90deg, #8a6a20, #d4a844) !important; }
.modal-overlay { background: rgba(13,11,8,0.85) !important; backdrop-filter: blur(4px) !important; }
.map-card { background: linear-gradient(160deg, #1a1612, #221e18) !important; border: 1px solid #3a322a !important; }
.map-card.active { border-color: #d4a844 !important; box-shadow: 0 0 20px rgba(212,168,68,0.06) !important; }
.inv-slot { background: #1a1612 !important; border: 1px solid #3a322a !important; }
.inv-slot.occupied:hover { border-color: #d4a844 !important; }
.toast { background: rgba(26,22,18,0.95) !important; border: 1px solid #d4a844 !important; color: #d4a844 !important; box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important; }
::-webkit-scrollbar-thumb { background: #4a3f35 !important; }
::-webkit-scrollbar-track { background: #0d0b08 !important; }
.panel { animation: iderLuxeIn 0.4s ease !important; }
@keyframes iderLuxeIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }`,

  magazine: `.tab-btn svg,.ider-nav-icon{display:none!important}:root {
  --bg: #f8f6f2 !important; --bg2: #f0ece6 !important; --bg3: #e8e2da !important;
  --bg4: #ddd6cc !important; --border: #d0c8bc !important;
  --text: #2a2520 !important; --text2: #8a8078 !important;
  --gold: #c49a6c !important; --gold2: #a07850 !important;
  --accent: #6a7a8a !important; --red: #b04a3a !important; --green: #5a8a5a !important;
  --radius: 0 !important;
}
body { font-family: 'Noto Serif SC','Georgia',serif !important; }
body::before{content:''!important;position:fixed!important;inset:0!important;z-index:-3!important;pointer-events:none!important;background:repeating-linear-gradient(0deg,transparent,transparent 40px,rgba(42,37,32,0.02) 40px,rgba(42,37,32,0.02) 41px)!important}
.ider-magazine-badge{display:inline-flex!important;align-items:center!important;gap:6px!important;font-size:9px!important;text-transform:uppercase!important;letter-spacing:2px!important;color:#c49a6c!important}
.view-login { background: #f8f6f2 !important; }
.login-card { background: #fff !important; border: 1px solid #ddd6cc !important; box-shadow: none !important; }
.game-title { font-family: 'Noto Serif SC',serif !important; font-size: 28px !important; color: #2a2520 !important; letter-spacing: 6px !important; font-weight: 300 !important; }
.game-header { background: #fff !important; border-bottom: 1px solid #ddd6cc !important; padding: 12px 24px !important; }
.hdr-name { font-family: 'Noto Serif SC',serif !important; font-size: 14px !important; color: #c49a6c !important; letter-spacing: 3px !important; font-weight: 400 !important; }
.realm-badge { background: #f0ece6 !important; border: none !important; color: #8a8078 !important; font-size: 11px !important; }
.btn-icon { color: #c4b8ac !important; }
.btn-icon:hover { color: #c49a6c !important; }
.tab-nav { background: #fff !important; border-bottom: 1px solid #e8e2da !important; padding: 0 24px !important; }
.tab-btn { color: #8a8078 !important; font-size: 12px !important; letter-spacing: 2px !important; padding: 12px 20px !important; text-transform: uppercase !important; }
.tab-btn.active { color: #2a2520 !important; border-bottom: 2px solid #2a2520 !important; }
.tab-btn:hover { color: #2a2520 !important; background: rgba(0,0,0,0.01) !important; }
.battle-sidebar { background: #f8f6f2 !important; border-right: 1px solid #e8e2da !important; }
.sidebar-char-name { color: #2a2520 !important; font-family: 'Noto Serif SC',serif !important; font-weight: 400 !important; letter-spacing: 2px !important; }
.sidebar-section-title { color: #c49a6c !important; border-bottom: 1px solid #ddd6cc !important; text-transform: uppercase !important; font-size: 10px !important; letter-spacing: 3px !important; padding-bottom: 8px !important; }
.stat-card, .skill-card, .modal-panel, .battle-status-panel, .battle-log-box {
  background: #fff !important; border: 1px solid #e8e2da !important;
  padding: 20px 24px !important; box-shadow: 0 2px 8px rgba(0,0,0,0.02) !important;
}
.skill-card.equipped { border-left: 3px solid #c49a6c !important; }
.section-title { color: #2a2520 !important; border-bottom: 1px solid #e8e2da !important; font-size: 11px !important; letter-spacing: 4px !important; text-transform: uppercase !important; padding-bottom: 10px !important; margin-bottom: 16px !important; font-weight: 600 !important; }
.btn-action { background: #f8f6f2 !important; border: 1px solid #ddd6cc !important; color: #2a2520 !important; padding: 8px 20px !important; font-size: 12px !important; letter-spacing: 1px !important; }
.btn-action:hover { background: #f0ece6 !important; }
.btn-action.gold { background: #c49a6c !important; border-color: #a07850 !important; color: #fff !important; }
.btn-sm { background: #f8f6f2 !important; border: 1px solid #ddd6cc !important; color: #2a2520 !important; }
.btn-sm:hover{background:#f0ece6!important}
.btn-primary { background: #2a2520 !important; border: none !important; color: #fff !important; letter-spacing: 2px !important; text-transform: uppercase !important; font-size: 11px !important; padding: 10px 24px !important; }
.btn-primary:hover{background:#3a3530!important}
.modal-close{background:#f8f6f2!important;border:1px solid #ddd6cc!important;color:#8a8078!important}
.modal-close:hover{background:#f0ece6!important;color:#c49a6c!important}
.bar-track { background: #e8e2da !important; border: none !important; height: 4px !important; }
.hp-bar-red { background: #b04a3a !important; }
.hp-bar-green { background: #5a8a5a !important; }
.mp-bar-blue { background: #6a7a8a !important; }
.exp-fill { background: #c49a6c !important; }
.modal-overlay { background: rgba(248,246,242,0.9) !important; }
.map-card { background: #fff !important; border: 1px solid #e8e2da !important; }
.map-card.active { border-color: #c49a6c !important; background: #f8f6f2 !important; }
.inv-slot { background: #f8f6f2 !important; border: 1px solid #e8e2da !important; }
.inv-slot.occupied:hover { border-color: #c49a6c !important; }
.toast { background: rgba(255,255,255,0.95) !important; border: 1px solid #ddd6cc !important; color: #2a2520 !important; box-shadow: 0 4px 12px rgba(0,0,0,0.05) !important; }
::-webkit-scrollbar-thumb { background: #ddd6cc !important; }
::-webkit-scrollbar-track { background: #f8f6f2 !important; }
input, select, textarea { background: #fff !important; border: 1px solid #ddd6cc !important; color: #2a2520 !important; padding: 8px 12px !important; }
input:focus { border-color: #2a2520 !important; }
.panel { animation: iderMagIn 0.35s ease !important; }
@keyframes iderMagIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`,

  wabi: `.tab-btn svg,.ider-nav-icon{display:none!important}:root{--bg:#F5F0E8!important;--bg2:#EDE4D8!important;--bg3:#E0D5C8!important;--bg4:#D4C8B8!important;--border:rgba(44,44,44,0.12)!important;--text:#2C2C2C!important;--text2:rgba(44,44,44,0.5)!important;--gold:#B7413E!important;--gold2:#8A3028!important;--accent:#6B8E6B!important;--red:#B7413E!important;--green:#5A7A4A!important;--radius:0!important;--shadow:0 1px 0 rgba(44,44,44,0.06)!important}
body{font-family:'Noto Serif JP','STSong','Yu Mincho',serif!important;color:#2C2C2C!important;font-weight:300!important}
.view-login{background:linear-gradient(170deg,#f5f0e8,#ede4d8)!important}
.login-card{background:rgba(245,240,232,0.95)!important;border:1px solid rgba(44,44,44,0.12)!important}
.game-title{font-family:'Noto Serif JP',serif!important;font-size:28px!important;color:#2C2C2C!important;letter-spacing:8px!important;font-weight:300!important}
.game-header{background:#ede4d8!important;border-bottom:1px solid rgba(44,44,44,0.10)!important;position:relative!important}
.game-header::before{content:''!important;position:absolute!important;top:0!important;left:12px!important;right:12px!important;height:1px!important;background:rgba(44,44,44,0.08)!important}
.game-header::after{content:'◇'!important;position:absolute!important;bottom:-8px!important;left:50%!important;transform:translateX(-50%)!important;color:rgba(44,44,44,0.12)!important;font-size:10px!important;font-family:serif!important;pointer-events:none!important}
.hdr-name{font-family:'Noto Serif JP',serif!important;font-size:15px!important;color:#2C2C2C!important;letter-spacing:4px!important;font-weight:400!important}
.hdr-info{color:rgba(44,44,44,0.5)!important;font-size:11px!important}
.hdr-res{color:rgba(44,44,44,0.5)!important;font-size:11px!important}
.realm-badge{background:#e0d5c8!important;border:1px solid rgba(44,44,44,0.10)!important;color:#2C2C2C!important}
.btn-icon{color:rgba(44,44,44,0.35)!important}
.btn-icon:hover{color:#2C2C2C!important}
.tab-nav{background:#ede4d8!important;border-bottom:1px solid rgba(44,44,44,0.08)!important}
.tab-btn{color:rgba(44,44,44,0.4)!important;letter-spacing:2px!important;padding:8px 20px!important;font-size:12px!important;border-bottom:1px solid transparent!important}
.tab-btn.active{color:#2C2C2C!important;border-bottom-color:#2C2C2C!important}
.tab-btn:hover{background:rgba(0,0,0,0.02)!important}
.battle-sidebar{background:#ede4d8!important;border-right:1px solid rgba(44,44,44,0.08)!important}
.sidebar-char-name{color:#2C2C2C!important;font-size:16px!important;letter-spacing:2px!important;writing-mode:vertical-rl!important;text-orientation:upright!important}
.sidebar-section-title{color:#2C2C2C!important;border-bottom:1px solid rgba(44,44,44,0.08)!important;letter-spacing:2px!important;padding-bottom:6px!important;font-size:11px!important}
.stat-card,.skill-card,.modal-panel,.battle-status-panel,.battle-log-box{background:#f0e8dc!important;border:1px solid rgba(44,44,44,0.10)!important;padding:16px!important;border-radius:0!important}
.skill-card.equipped{border-left:2px solid #B7413E!important;background:#ede4d8!important}
.section-title{color:#2C2C2C!important;border-bottom:1px solid rgba(44,44,44,0.10)!important;font-size:12px!important;letter-spacing:3px!important;padding-bottom:6px!important;margin-bottom:10px!important;font-weight:300!important}
.btn-action{background:#e0d5c8!important;border:1px solid rgba(44,44,44,0.10)!important;color:#2C2C2C!important;padding:6px 16px!important;border-radius:0!important}
.btn-action:hover{background:#d4c8b8!important}
.btn-action.gold{background:#B7413E!important;border-color:#8A3028!important;color:#f0e8dc!important}
.btn-sm{background:#e0d5c8!important;border:1px solid rgba(44,44,44,0.10)!important;border-radius:0!important}
.btn-sm:hover{background:#d4c8b8!important}
.btn-primary{background:#2C2C2C!important;border:none!important;color:#f0e8dc!important;border-radius:0!important}
.btn-primary:hover{background:#444!important}
.modal-close{background:#e0d5c8!important;border:1px solid rgba(44,44,44,0.10)!important;color:rgba(44,44,44,0.4)!important;border-radius:0!important}
.modal-close:hover{background:#d4c8b8!important;color:#2C2C2C!important}
.opt-item:hover{border-color:#B7413E!important}
.bar-track{background:#d4c8b8!important;height:4px!important;border:none!important;border-radius:0!important}
.hp-bar-red{background:#B7413E!important}
.hp-bar-green{background:#5A7A4A!important}
.mp-bar-blue{background:#6A7A8A!important}
.exp-fill{background:#2C2C2C!important}
.modal-overlay{background:rgba(245,240,232,0.85)!important}
.modal-panel{background:#f0e8dc!important;border:1px solid rgba(44,44,44,0.12)!important;border-radius:0!important}
.map-card{background:#f0e8dc!important;border:1px solid rgba(44,44,44,0.10)!important;padding:12px!important;border-radius:0!important}
.map-card.active{border-color:#B7413E!important;background:#ede4d8!important}
.inv-slot{background:#f0e8dc!important;border:1px solid rgba(44,44,44,0.10)!important;border-radius:0!important}
.inv-slot.occupied:hover{border-color:#B7413E!important}
.toast{background:rgba(240,232,220,0.95)!important;border:1px solid rgba(44,44,44,0.5)!important;color:#2C2C2C!important;border-radius:0!important}
.sub-tab button,.sub-tab-item{border-bottom:1px solid rgba(44,44,44,0.06)!important;color:rgba(44,44,44,0.4)!important;font-size:11px!important}
.sub-tab button.active{color:#2C2C2C!important}
::-webkit-scrollbar-thumb{background:rgba(44,44,44,0.15)!important}
::-webkit-scrollbar-track{background:#f5f0e8!important}
input,select,textarea{background:#f0e8dc!important;border-color:rgba(44,44,44,0.12)!important;color:#2C2C2C!important;border-radius:0!important}
input:focus{border-color:#2C2C2C!important}
.equip-slot{background:#f0e8dc!important;border:1px solid rgba(44,44,44,0.10)!important;border-radius:0!important}
.opt-item{background:#f0e8dc!important;border:1px solid rgba(44,44,44,0.10)!important}
.panel{animation:iderZenIn 0.4s ease!important}
@keyframes iderZenIn{from{opacity:0;transform:scale(0.98)}to{opacity:1;transform:scale(1)}}`,

  minimal: `.tab-btn svg,.ider-nav-icon{display:none!important}:root{--bg:#FFFFFF!important;--bg2:#F8F8F8!important;--bg3:#F0F0F0!important;--bg4:#E8E8E8!important;--border:rgba(0,0,0,0.08)!important;--text:#000000!important;--text2:rgba(0,0,0,0.55)!important;--gold:#000000!important;--gold2:#666666!important;--accent:#888888!important;--red:#000000!important;--green:#000000!important;--radius:0!important;--shadow:none!important}
body{font-family:'Inter','Noto Sans SC',-apple-system,BlinkMacSystemFont,sans-serif!important;color:#000!important;font-weight:300!important;letter-spacing:-0.01em!important;line-height:1.6!important}
.view-login{background:#fff!important}
.login-card{background:#fff!important;border:1px solid rgba(0,0,0,0.08)!important;box-shadow:none!important}
.game-title{font-size:24px!important;color:#000!important;letter-spacing:2px!important;font-weight:200!important}
.game-header{background:#fff!important;border-bottom:1px solid rgba(0,0,0,0.06)!important;padding:6px 16px!important}
.hdr-name{font-size:14px!important;color:#000!important;font-weight:400!important;letter-spacing:-0.01em!important}
.hdr-info{color:rgba(0,0,0,0.55)!important;font-size:11px!important;font-weight:300!important}
.hdr-res{color:rgba(0,0,0,0.55)!important;font-size:11px!important;font-weight:300!important}
.realm-badge{background:#f8f8f8!important;border:none!important;color:#000!important}
.btn-icon{color:rgba(0,0,0,0.3)!important}
.btn-icon:hover{color:#000!important}
.tab-nav{background:#fff!important;border-bottom:1px solid rgba(0,0,0,0.06)!important}
.tab-btn{color:rgba(0,0,0,0.35)!important;padding:8px 14px!important;font-size:12px!important;border-bottom:1px solid transparent!important;font-weight:300!important;letter-spacing:0.01em!important}
.tab-btn.active{color:#000!important;border-bottom-color:#000!important;font-weight:400!important}
.tab-btn:hover{color:#000!important;background:rgba(0,0,0,0.02)!important}
.battle-sidebar{background:#fafafa!important;border-right:1px solid rgba(0,0,0,0.06)!important;padding:20px 16px!important}
.sidebar-char-name{color:#000!important;font-weight:300!important;font-size:16px!important;letter-spacing:-0.02em!important}
.sidebar-section-title{color:rgba(0,0,0,0.55)!important;border-bottom:1px solid rgba(0,0,0,0.06)!important;font-size:10px!important;letter-spacing:2px!important;padding-bottom:6px!important;font-weight:400!important;text-transform:uppercase!important}
.stat-card,.skill-card,.modal-panel,.battle-status-panel,.battle-log-box{background:#fff!important;border:1px solid rgba(0,0,0,0.06)!important;padding:16px!important;box-shadow:none!important;border-radius:0!important}
.skill-card.equipped{border:1px solid #000!important}
.section-title{color:#000!important;border-bottom:1px solid rgba(0,0,0,0.06)!important;font-size:11px!important;letter-spacing:2px!important;padding-bottom:6px!important;font-weight:400!important;text-transform:uppercase!important}
.btn-action{background:#fff!important;border:1px solid rgba(0,0,0,0.08)!important;color:#000!important;padding:6px 16px!important;font-size:12px!important;border-radius:0!important;font-weight:300!important}
.btn-action:hover{background:#f8f8f8!important;border-color:rgba(0,0,0,0.15)!important}
.btn-action.gold{background:#000!important;border-color:#000!important;color:#fff!important}
.btn-sm{background:#fff!important;border:1px solid rgba(0,0,0,0.08)!important;color:#000!important;border-radius:0!important;font-weight:300!important}
.btn-sm:hover{background:#f8f8f8!important}
.btn-primary{background:#000!important;border:none!important;color:#fff!important;border-radius:0!important;letter-spacing:0.02em!important;font-weight:400!important;padding:8px 20px!important}
.btn-primary:hover{background:#333!important}
.modal-close{background:#fff!important;border:1px solid rgba(0,0,0,0.08)!important;color:rgba(0,0,0,0.4)!important;border-radius:0!important}
.modal-close:hover{border-color:#000!important;color:#000!important}
.bar-track{background:rgba(0,0,0,0.06)!important;border:none!important;height:2px!important;border-radius:0!important}
.hp-bar-red{background:#000!important}
.hp-bar-green{background:#000!important}
.mp-bar-blue{background:#000!important;opacity:0.6!important}
.exp-fill{background:#000!important}
.modal-overlay{background:rgba(255,255,255,0.8)!important}
.modal-panel{background:#fff!important;border:1px solid #000!important;border-radius:0!important;box-shadow:none!important;padding:24px!important}
.map-card{background:#fff!important;border:1px solid rgba(0,0,0,0.06)!important;padding:12px!important;border-radius:0!important}
.map-card.active{border-color:#000!important;background:#fafafa!important}
.inv-slot{background:#fafafa!important;border:1px solid rgba(0,0,0,0.06)!important;border-radius:0!important}
.inv-slot.occupied:hover{border-color:#000!important}
.toast{background:#000!important;border:none!important;color:#fff!important;border-radius:0!important;font-weight:300!important}
.sub-tab button,.sub-tab-item{border-bottom:1px solid rgba(0,0,0,0.06)!important;color:rgba(0,0,0,0.35)!important;font-size:11px!important;font-weight:300!important}
.sub-tab button.active{color:#000!important;border-bottom:1px solid #000!important}
::-webkit-scrollbar-thumb{background:rgba(0,0,0,0.12)!important}
::-webkit-scrollbar-track{background:#fff!important}
input,select,textarea{background:#fff!important;border:1px solid rgba(0,0,0,0.08)!important;color:#000!important;border-radius:0!important;font-weight:300!important;padding:6px 10px!important;font-size:13px!important}
input:focus{border-color:#000!important}
.equip-slot{background:#fff!important;border:1px solid rgba(0,0,0,0.08)!important;border-radius:0!important}
.opt-item{background:#fff!important;border:1px solid rgba(0,0,0,0.08)!important;border-radius:0!important}
.panel{animation:iderMinIn 0.3s ease!important}
@keyframes iderMinIn{from{opacity:0}to{opacity:1}}`,

  frost: `.tab-btn svg,.ider-nav-icon{display:none!important}:root{--bg:#020617!important;--bg2:rgba(255,255,255,0.03)!important;--bg3:rgba(255,255,255,0.02)!important;--bg4:rgba(255,255,255,0.01)!important;--border:rgba(255,255,255,0.08)!important;--text:rgba(255,255,255,0.92)!important;--text2:rgba(255,255,255,0.48)!important;--gold:rgba(255,255,255,0.9)!important;--gold2:rgba(255,255,255,0.6)!important;--accent:rgba(255,255,255,0.5)!important;--red:rgba(255,69,58,0.8)!important;--green:rgba(52,199,89,0.8)!important;--radius:16px!important;--shadow:0 8px 32px rgba(0,0,0,0.25)!important}
body{font-family:'Inter','Noto Sans SC',-apple-system,BlinkMacSystemFont,sans-serif!important;color:rgba(255,255,255,0.92)!important;font-weight:300!important;background:#020617!important}
body::after{content:''!important;position:fixed!important;inset:0!important;z-index:-3!important;pointer-events:none!important;background:radial-gradient(ellipse at 50% 0%,rgba(255,255,255,0.015),transparent 60%)!important;animation:frostGlow 6s ease-in-out infinite!important}
@keyframes frostGlow{0%,100%{opacity:0.5}50%{opacity:1}}
.view-login{background:#020617!important}
.login-card{background:rgba(255,255,255,0.03)!important;backdrop-filter:blur(24px) saturate(150%)!important;-webkit-backdrop-filter:blur(24px) saturate(150%)!important;border:1px solid rgba(255,255,255,0.08)!important;border-radius:24px!important}
.game-title{font-weight:300!important;font-size:28px!important;color:rgba(255,255,255,0.92)!important;text-shadow:0 2px 20px rgba(0,0,0,0.3)!important;letter-spacing:-0.03em!important}
.game-header{background:rgba(255,255,255,0.02)!important;backdrop-filter:blur(20px) saturate(140%)!important;-webkit-backdrop-filter:blur(20px) saturate(140%)!important;border-bottom:1px solid rgba(255,255,255,0.06)!important;padding:6px 16px!important;position:sticky!important;top:0!important;z-index:50!important}
.hdr-name{font-weight:400!important;font-size:14px!important;color:rgba(255,255,255,0.92)!important;letter-spacing:-0.01em!important}
.hdr-info{color:rgba(255,255,255,0.4)!important;font-size:11px!important;font-weight:300!important}
.hdr-res{color:rgba(255,255,255,0.4)!important;font-size:11px!important;font-weight:300!important}
.realm-badge{background:rgba(255,255,255,0.04)!important;border:1px solid rgba(255,255,255,0.08)!important;color:rgba(255,255,255,0.8)!important;border-radius:12px!important}
.btn-icon{color:rgba(255,255,255,0.3)!important;border-radius:10px!important}
.btn-icon:hover{background:rgba(255,255,255,0.06)!important;color:rgba(255,255,255,0.8)!important}
.tab-nav{background:rgba(255,255,255,0.015)!important;backdrop-filter:blur(16px) saturate(140%)!important;-webkit-backdrop-filter:blur(16px) saturate(140%)!important;border-bottom:1px solid rgba(255,255,255,0.04)!important}
.tab-btn{color:rgba(255,255,255,0.35)!important;padding:10px 16px!important;font-size:12px!important;font-weight:300!important;letter-spacing:0.02em!important;border-radius:0!important}
.tab-btn.active{color:rgba(255,255,255,0.92)!important;font-weight:400!important;background:rgba(255,255,255,0.04)!important}
.tab-btn:hover{color:rgba(255,255,255,0.8)!important;background:rgba(255,255,255,0.02)!important}
.battle-sidebar{background:rgba(255,255,255,0.02)!important;backdrop-filter:blur(16px) saturate(140%)!important;-webkit-backdrop-filter:blur(16px) saturate(140%)!important;border-right:1px solid rgba(255,255,255,0.04)!important;padding:20px 16px!important}
.sidebar-char-name{color:rgba(255,255,255,0.92)!important;font-weight:400!important;font-size:15px!important;text-shadow:0 0 20px rgba(255,255,255,0.08)!important}
.sidebar-section-title{color:rgba(255,255,255,0.5)!important;border-bottom:1px solid rgba(255,255,255,0.04)!important;font-size:10px!important;letter-spacing:1px!important;padding-bottom:6px!important}
.stat-card,.skill-card,.modal-panel,.battle-status-panel,.battle-log-box{background:rgba(255,255,255,0.03)!important;backdrop-filter:blur(20px) saturate(150%)!important;-webkit-backdrop-filter:blur(20px) saturate(150%)!important;border:1px solid rgba(255,255,255,0.06)!important;padding:14px!important;border-radius:16px!important;box-shadow:0 8px 32px rgba(0,0,0,0.2),inset 0 1px 0 rgba(255,255,255,0.05)!important}
.skill-card.equipped{border-left:2px solid rgba(255,255,255,0.4)!important}
.section-title{color:rgba(255,255,255,0.92)!important;border-bottom:1px solid rgba(255,255,255,0.04)!important;font-size:12px!important;font-weight:400!important;padding-bottom:8px!important;margin-bottom:12px!important}
.btn-action{background:rgba(255,255,255,0.04)!important;backdrop-filter:blur(8px)!important;-webkit-backdrop-filter:blur(8px)!important;border:1px solid rgba(255,255,255,0.06)!important;color:rgba(255,255,255,0.8)!important;padding:6px 16px!important;border-radius:12px!important;font-weight:300!important}
.btn-action:hover{background:rgba(255,255,255,0.08)!important}
.btn-action.gold{background:rgba(255,255,255,0.08)!important;border-color:rgba(255,255,255,0.15)!important;color:rgba(255,255,255,0.92)!important}
.btn-sm{background:rgba(255,255,255,0.04)!important;backdrop-filter:blur(8px)!important;-webkit-backdrop-filter:blur(8px)!important;border:1px solid rgba(255,255,255,0.06)!important;color:rgba(255,255,255,0.6)!important;border-radius:10px!important;font-weight:300!important}
.btn-primary{background:rgba(255,255,255,0.08)!important;backdrop-filter:blur(8px)!important;-webkit-backdrop-filter:blur(8px)!important;border:1px solid rgba(255,255,255,0.08)!important;color:rgba(255,255,255,0.92)!important;border-radius:12px!important;padding:8px 20px!important;font-weight:400!important}
.bar-track{background:rgba(255,255,255,0.06)!important;border:none!important;height:4px!important;border-radius:4px!important}
.hp-bar-red{background:linear-gradient(90deg,rgba(255,69,58,0.5),rgba(255,69,58,0.8))!important;border-radius:4px!important}
.hp-bar-green{background:linear-gradient(90deg,rgba(52,199,89,0.5),rgba(52,199,89,0.8))!important}
.mp-bar-blue{background:linear-gradient(90deg,rgba(0,122,255,0.5),rgba(0,122,255,0.8))!important}
.exp-fill{background:rgba(255,255,255,0.6)!important;border-radius:4px!important}
.modal-overlay{background:rgba(2,6,23,0.6)!important;backdrop-filter:blur(4px)!important;-webkit-backdrop-filter:blur(4px)!important}
.modal-panel{background:rgba(255,255,255,0.035)!important;backdrop-filter:blur(32px) saturate(160%)!important;-webkit-backdrop-filter:blur(32px) saturate(160%)!important;border:1px solid rgba(255,255,255,0.08)!important;border-radius:24px!important;box-shadow:0 16px 64px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.08)!important;padding:28px!important}
.modal-title{font-weight:300!important;font-size:18px!important;letter-spacing:-0.02em!important;border-bottom:1px solid rgba(255,255,255,0.06)!important;padding-bottom:14px!important;margin-bottom:18px!important}
.modal-close{background:rgba(255,255,255,0.04)!important;border:1px solid rgba(255,255,255,0.08)!important;border-radius:10px!important;color:rgba(255,255,255,0.6)!important}
.modal-close:hover{background:rgba(255,255,255,0.08)!important;color:rgba(255,255,255,0.92)!important}
.map-card{background:rgba(255,255,255,0.03)!important;backdrop-filter:blur(16px)!important;-webkit-backdrop-filter:blur(16px)!important;border:1px solid rgba(255,255,255,0.06)!important;border-radius:16px!important;padding:14px!important}
.map-card.active{border-color:rgba(255,255,255,0.2)!important}
.inv-slot{background:rgba(255,255,255,0.03)!important;border:1px solid rgba(255,255,255,0.04)!important;border-radius:12px!important}
.inv-slot.occupied:hover{border-color:rgba(255,255,255,0.15)!important}
.toast{background:rgba(30,32,52,0.7)!important;backdrop-filter:blur(30px)!important;-webkit-backdrop-filter:blur(30px)!important;border:1px solid rgba(255,255,255,0.06)!important;color:rgba(255,255,255,0.92)!important;border-radius:14px!important}
.sub-tab button,.sub-tab-item{background:rgba(255,255,255,0.03)!important;backdrop-filter:blur(8px)!important;border:1px solid rgba(255,255,255,0.06)!important;border-radius:12px!important;color:rgba(255,255,255,0.5)!important;font-size:11px!important;font-weight:300!important;padding:6px 14px!important}
.sub-tab button.active{background:rgba(255,255,255,0.08)!important;border-color:rgba(255,255,255,0.15)!important;color:rgba(255,255,255,0.92)!important}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08)!important;border-radius:4px!important}
::-webkit-scrollbar-track{background:transparent!important}
input,select,textarea{background:rgba(255,255,255,0.04)!important;backdrop-filter:blur(8px)!important;-webkit-backdrop-filter:blur(8px)!important;border:1px solid rgba(255,255,255,0.08)!important;color:rgba(255,255,255,0.92)!important;border-radius:12px!important;font-weight:300!important;padding:8px 14px!important}
input:focus{border-color:rgba(255,255,255,0.2)!important;box-shadow:0 0 0 3px rgba(255,255,255,0.04)!important}
.equip-slot{background:rgba(255,255,255,0.03)!important;backdrop-filter:blur(8px)!important;border:1px solid rgba(255,255,255,0.04)!important;border-radius:14px!important}
.opt-item{background:rgba(255,255,255,0.03)!important;backdrop-filter:blur(12px)!important;border:1px solid rgba(255,255,255,0.06)!important;border-radius:14px!important}
.panel{animation:iderFrostIn 0.4s ease!important}
@keyframes iderFrostIn{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}`,

  brutal: `.tab-btn svg,.ider-nav-icon{display:none!important}:root{--bg:#F0F0F0!important;--bg2:#FFFFFF!important;--bg3:#E0E0E0!important;--bg4:#D0D0D0!important;--border:#0A0A0A!important;--text:#0A0A0A!important;--text2:#444444!important;--gold:#FF3300!important;--gold2:#CC2200!important;--accent:#0044FF!important;--red:#FF0000!important;--green:#00CC00!important;--radius:0!important;--shadow:4px 4px 0 #0A0A0A!important}
body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif!important;color:#0A0A0A!important;font-weight:700!important;background:#F0F0F0!important}
::selection{background:#FF3300!important;color:#FFF!important}
.view-login{background:#F0F0F0!important}
.login-card{background:#FFF!important;border:4px solid #0A0A0A!important;box-shadow:8px 8px 0 #0A0A0A!important}
.game-title{font-family:'Anton',Impact,Haettenschweiler,sans-serif!important;font-size:32px!important;color:#0A0A0A!important;text-transform:uppercase!important;letter-spacing:0!important;text-shadow:4px 4px 0 rgba(0,0,0,0.1)!important}
.game-header{background:#0A0A0A!important;border-bottom:4px solid #0A0A0A!important;padding:6px 16px!important;position:sticky!important;top:0!important;z-index:50!important}
.hdr-name{font-family:'Anton',Impact,Haettenschweiler,sans-serif!important;font-size:18px!important;color:#FFF!important;text-transform:uppercase!important;letter-spacing:2px!important}
.hdr-info{color:#AAA!important;font-size:11px!important;font-weight:700!important}
.hdr-res{color:#AAA!important;font-size:11px!important;font-weight:700!important}
.realm-badge{background:#FF3300!important;border:2px solid #FFF!important;color:#FFF!important;font-size:11px!important;border-radius:0!important}
.btn-icon{color:rgba(255,255,255,0.4)!important;border:2px solid transparent!important}
.btn-icon:hover{color:#FF3300!important;border-color:#FF3300!important}
.tab-nav{background:#C8C8C8!important;border-bottom:4px solid #0A0A0A!important}
.tab-btn{color:#555!important;font-weight:700!important;font-size:12px!important;text-transform:uppercase!important;padding:10px 16px!important;border-right:2px solid #0A0A0A!important;letter-spacing:1px!important;border-radius:0!important}
.tab-btn.active{background:#0A0A0A!important;color:#FFF!important}
.tab-btn:hover{background:#FF3300!important;color:#FFF!important}
.battle-sidebar{background:#C8C8C8!important;border-right:4px solid #0A0A0A!important;padding:20px 16px!important}
.sidebar-char-name{font-family:'Anton',Impact,Haettenschweiler,sans-serif!important;color:#0A0A0A!important;font-size:20px!important;text-transform:uppercase!important;letter-spacing:2px!important}
.sidebar-section-title{color:#0A0A0A!important;border-bottom:2px solid #0A0A0A!important;font-size:11px!important;text-transform:uppercase!important;padding-bottom:4px!important}
.stat-card,.skill-card,.modal-panel,.battle-status-panel,.battle-log-box{background:#FFF!important;border:3px solid #0A0A0A!important;padding:12px!important;box-shadow:4px 4px 0 #0A0A0A!important;border-radius:0!important}
.stat-card:hover,.skill-card:hover{background:#0A0A0A!important;color:#FFF!important}
.stat-card:hover *,.skill-card:hover *{color:#FFF!important}
.skill-card.equipped{border-left:6px solid #FF3300!important}
.section-title{font-family:'Anton',Impact,Haettenschweiler,sans-serif!important;color:#FF3300!important;border-bottom:2px solid #0A0A0A!important;font-size:13px!important;text-transform:uppercase!important;padding-bottom:4px!important;letter-spacing:1px!important}
.btn-action{background:#FFF!important;border:3px solid #0A0A0A!important;color:#0A0A0A!important;padding:8px 16px!important;font-weight:700!important;text-transform:uppercase!important;border-radius:0!important;font-size:12px!important}
.btn-action:hover{background:#0A0A0A!important;color:#FFF!important}
.btn-action.gold{background:#FF3300!important;border-color:#CC2200!important;color:#FFF!important}
.btn-sm{background:#FFF!important;border:2px solid #0A0A0A!important;color:#0A0A0A!important;border-radius:0!important;font-weight:700!important;text-transform:uppercase!important}
.btn-primary{background:#0A0A0A!important;border:3px solid #0A0A0A!important;color:#FFF!important;border-radius:0!important;font-weight:700!important;text-transform:uppercase!important;padding:10px 24px!important}
.bar-track{background:#D0D0D0!important;border:2px solid #0A0A0A!important;height:8px!important;border-radius:0!important}
.hp-bar-red{background:#FF0000!important}
.hp-bar-green{background:#00CC00!important}
.mp-bar-blue{background:#0044FF!important}
.exp-fill{background:#FF3300!important}
.modal-overlay{background:rgba(240,240,240,0.9)!important}
.modal-panel{background:#FFF!important;border:4px solid #0A0A0A!important;border-radius:0!important;box-shadow:8px 8px 0 #0A0A0A!important;padding:28px!important}
.modal-title{font-family:'Anton',Impact,Haettenschweiler,sans-serif!important;font-size:20px!important;text-transform:uppercase!important;border-bottom:3px solid #0A0A0A!important;padding-bottom:12px!important;margin-bottom:16px!important}
.modal-close{background:#0A0A0A!important;border:none!important;color:#FFF!important;border-radius:0!important;padding:6px 12px!important}
.map-card{background:#FFF!important;border:3px solid #0A0A0A!important;box-shadow:4px 4px 0 #0A0A0A!important;padding:12px!important;border-radius:0!important}
.map-card.active{border-color:#FF3300!important;background:#FFF5F0!important}
.inv-slot{background:#FFF!important;border:2px solid #0A0A0A!important;border-radius:0!important}
.inv-slot.occupied:hover{border-color:#FF3300!important}
.toast{background:#0A0A0A!important;border:2px solid #FF3300!important;color:#FFF!important;border-radius:0!important;text-transform:uppercase!important;letter-spacing:1px!important}
.sub-tab button,.sub-tab-item{background:#C8C8C8!important;border:none!important;border-right:2px solid #0A0A0A!important;color:#555!important;font-weight:700!important;text-transform:uppercase!important;font-size:11px!important;padding:8px 14px!important;border-radius:0!important}
.sub-tab button.active{background:#0A0A0A!important;color:#FFF!important}
.sub-tab button:hover{background:#FF3300!important;color:#FFF!important}
::-webkit-scrollbar{width:12px!important;height:12px!important}
::-webkit-scrollbar-thumb{background:#0A0A0A!important;border:2px solid #C8C8C8!important}
::-webkit-scrollbar-track{background:#C8C8C8!important;border-left:2px solid #0A0A0A!important}
input,select,textarea{background:#FFF!important;border:3px solid #0A0A0A!important;color:#0A0A0A!important;border-radius:0!important;font-weight:700!important;padding:10px 14px!important}
input:focus{border-color:#FF3300!important;background:#FFDD00!important}
.equip-slot{background:#FFF!important;border:3px solid #0A0A0A!important;border-radius:0!important}
.opt-item{background:#FFF!important;border:3px solid #0A0A0A!important;border-radius:0!important}
.opt-item:hover{background:#0A0A0A!important;color:#FFF!important}
.key-badge{background:#FFDD00!important;border:2px solid #0A0A0A!important;color:#0A0A0A!important;border-radius:0!important;font-weight:700!important}
.pagination .page-btn{background:#FFF!important;border:2px solid #0A0A0A!important;color:#0A0A0A!important;border-radius:0!important;font-weight:700!important}
.pagination .page-btn.active{background:#0A0A0A!important;color:#FFF!important}
.panel{animation:iderBrutIn 0.2s ease!important}
@keyframes iderBrutIn{from{opacity:0;transform:rotate(-1deg)}to{opacity:1;transform:rotate(0)}}`,
  dunhuang: `html.theme-dunhuang{--sand:#F0E6D3;--sand-dark:#E0D0B8;--ochre:#C49B5E;--vermilion:#D4432A;--turquoise:#2AA8A8;--gold:#D4A844;--gold-soft:rgba(212,168,68,0.15);--bg:var(--sand)!important;--bg2:var(--sand-dark)!important;--bg3:#E8DCC8!important;--bg4:#DDD0B8!important;--border:rgba(196,155,94,0.25)!important;--text:#3D2B1A!important;--text2:rgba(61,43,26,0.55)!important;--gold:var(--gold)!important;--gold2:#B8923A!important;--accent:var(--vermilion)!important;--red:var(--vermilion)!important;--green:#5A7A3A!important;--radius:4px!important}.theme-dunhuang body{font-family:'Noto Serif SC','STSong','SimSun',serif!important;background:var(--sand)!important;color:var(--text)!important;letter-spacing:0.04em!important}.theme-dunhuang .game-header{display:flex!important;flex-direction:row!important;align-items:center!important;padding:4px 12px!important;background:linear-gradient(90deg,var(--sand-dark),transparent,var(--sand-dark))!important;border-bottom:1px solid var(--border)!important;gap:4px!important;flex-wrap:nowrap!important}.theme-dunhuang .game-header::after{content:''!important;position:absolute!important;bottom:-1px!important;left:10%!important;right:10%!important;height:1px!important;background:linear-gradient(90deg,transparent,var(--gold),var(--vermilion),var(--gold),transparent)!important;opacity:0.3!important}.theme-dunhuang .game-header .hdr-name{font-family:'Noto Serif SC','STSong',serif!important;font-size:0.85rem!important;letter-spacing:0.2em!important;color:var(--vermilion)!important}.theme-dunhuang .tab-nav{background:var(--sand-dark)!important;border-bottom:1px solid var(--border)!important}.theme-dunhuang .tab-btn{font-family:'Noto Serif SC',serif!important;font-weight:300!important;letter-spacing:0.12em!important;padding:6px 12px!important;font-size:12px!important;color:var(--text2)!important;border-bottom:1px solid transparent!important;transition:all 0.3s!important}.theme-dunhuang .tab-btn.active{color:var(--vermilion)!important;border-bottom-color:var(--gold)!important}.theme-dunhuang .stat-card,.theme-dunhuang .skill-card,.theme-dunhuang .modal-panel{background:var(--sand)!important;border:1px solid var(--border)!important}.theme-dunhuang .section-title{font-family:'Noto Serif SC',serif!important;color:var(--ochre)!important;border-bottom:1px solid var(--border)!important;font-size:13px!important;letter-spacing:0.15em!important}.theme-dunhuang .btn-primary{background:var(--vermilion)!important;color:#fff!important}.theme-dunhuang .btn-action{background:transparent!important;border:1px solid var(--border)!important;color:var(--text)!important}.theme-dunhuang .btn-action:hover{background:var(--gold-soft)!important;border-color:var(--gold)!important}.theme-dunhuang .bar-track{height:6px!important;background:var(--sand-dark)!important;border:none!important}.theme-dunhuang .hp-bar-red{background:linear-gradient(90deg,var(--vermilion),#8A2A1A)!important}.theme-dunhuang .hp-bar-green{background:linear-gradient(90deg,var(--turquoise),#1A7A7A)!important}.theme-dunhuang .toast{border:1px solid var(--gold)!important;color:var(--vermilion)!important}.theme-dunhuang .game-title{font-family:'Noto Serif SC','STSong',serif!important;color:var(--vermilion)!important;letter-spacing:0.25em!important;text-shadow:none!important}.theme-dunhuang .login-card{border:1px solid var(--border)!important}.theme-dunhuang .panel{animation:inkwashIn 0.6s ease!important}.tab-btn svg,.ider-nav-icon{display:none!important}`,
  taiji: `html.theme-taiji{--ink-deep:#0A0A0A;--paper-pure:#F8F8F8;--paper-warm:#F0F0F0;--gray-mid:#888;--gray-light:#CCC;--bg:var(--paper-pure)!important;--bg2:var(--paper-warm)!important;--bg3:#E8E8E8!important;--bg4:#DDD!important;--border:rgba(10,10,10,0.12)!important;--text:var(--ink-deep)!important;--text2:rgba(10,10,10,0.5)!important;--gold:var(--ink-deep)!important;--accent:var(--gray-mid)!important;--red:#0A0A0A!important;--green:#4A4A4A!important;--radius:0!important;--shadow:none!important}.theme-taiji body{font-family:'Noto Sans SC','Helvetica Neue',Arial,sans-serif!important;background:var(--paper-pure)!important;color:var(--ink-deep)!important}.theme-taiji .game-header{display:flex!important;flex-direction:row!important;align-items:center!important;padding:4px 16px!important;background:var(--ink-deep)!important;border-bottom:2px solid var(--ink-deep)!important;gap:6px!important;flex-wrap:nowrap!important}.theme-taiji .game-header .hdr-name{font-weight:600!important;font-size:0.8rem!important;letter-spacing:0.15em!important;color:#fff!important}.theme-taiji .game-header .hdr-info{color:rgba(255,255,255,0.5)!important;font-size:0.7rem!important}.theme-taiji .game-header .hdr-res{color:rgba(255,255,255,0.6)!important;font-size:11px!important;margin-right:auto!important}.theme-taiji .game-header .btn-icon{color:rgba(255,255,255,0.4)!important}.theme-taiji .game-header .btn-icon:hover{color:#fff!important}.theme-taiji .tab-nav{background:#fff!important;border-bottom:2px solid var(--ink-deep)!important}.theme-taiji .tab-btn{font-weight:400!important;padding:8px 16px!important;font-size:12px!important;color:var(--text2)!important;border-bottom:2px solid transparent!important;margin-bottom:-2px!important}.theme-taiji .tab-btn.active{color:var(--ink-deep)!important;border-bottom-color:var(--ink-deep)!important;font-weight:600!important}.theme-taiji .stat-card,.theme-taiji .skill-card,.theme-taiji .modal-panel{background:#fff!important;border:1px solid var(--border)!important}.theme-taiji .skill-card.equipped{border-left:3px solid var(--ink-deep)!important}.theme-taiji .section-title{font-weight:600!important;font-size:12px!important;color:var(--ink-deep)!important;border-bottom:1px solid var(--border)!important;text-transform:uppercase!important}.theme-taiji .btn-primary{background:var(--ink-deep)!important;color:#fff!important;border-radius:0!important}.theme-taiji .btn-action{background:transparent!important;border:1px solid var(--border)!important;border-radius:0!important}.theme-taiji .btn-action:hover{background:var(--ink-deep)!important;color:#fff!important}.theme-taiji .modal-panel{background:#fff!important;border:2px solid var(--ink-deep)!important;border-radius:0!important}.theme-taiji .bar-track{height:4px!important;background:rgba(10,10,10,0.04)!important;border:none!important}.theme-taiji .hp-bar-red{background:var(--ink-deep)!important}.theme-taiji .hp-bar-green{background:var(--gray-mid)!important}.theme-taiji .toast{background:var(--ink-deep)!important;color:#fff!important;border-radius:0!important}.theme-taiji .login-card{border:2px solid var(--ink-deep)!important;border-radius:0!important;box-shadow:8px 8px 0 rgba(10,10,10,0.05)!important}.theme-taiji .game-title{font-weight:700!important;color:var(--ink-deep)!important;text-shadow:none!important}.theme-taiji .panel{animation:iderFrostIn 0.3s ease!important}.tab-btn svg,.ider-nav-icon{display:none!important}`,
  guzhenren: `

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
`,
  golden: `:root{--bg:#2A1E0E!important;--bg2:#352613!important;--bg3:#402E18!important;--bg4:#4A361E!important;--border:rgba(212,168,68,0.28)!important;--text:#F5E6C4!important;--text2:rgba(245,230,196,0.6)!important;--gold:#E8B84B!important;--gold2:#C9992F!important;--accent:#8B6914!important;--red:#C04040!important;--green:#6A9B4A!important;--radius:4px!important;--shadow:0 4px 20px rgba(0,0,0,0.3)!important}
html.theme-golden body{font-family:'Playfair Display','Noto Serif SC',serif!important;background:var(--bg)!important;color:var(--text)!important}
html.theme-golden .view-login{background:radial-gradient(ellipse at 50% 0%,#352613,#2A1E0E)!important}
html.theme-golden .login-card,.theme-golden .modal-panel{background:linear-gradient(160deg,#352613,#402E18)!important;border:1px solid var(--border)!important;box-shadow:var(--shadow)!important}
html.theme-golden .game-title{font-family:'Playfair Display',serif!important;color:var(--gold)!important;text-shadow:0 0 30px rgba(232,184,75,0.2)!important;letter-spacing:2px!important}
html.theme-golden .game-header{background:linear-gradient(180deg,#352613,#2A1E0E)!important;border-bottom:1px solid var(--border)!important}
html.theme-golden .hdr-name{font-family:'Playfair Display',serif!important;color:var(--gold)!important;letter-spacing:1px!important}
html.theme-golden .tab-btn{color:var(--text2)!important}
html.theme-golden .tab-btn.active{color:var(--gold)!important;border-bottom-color:var(--gold)!important}
html.theme-golden .stat-card,.theme-golden .skill-card,.theme-golden .map-card,.theme-golden .dungeon-card{background:linear-gradient(160deg,#352613,#402E18)!important;border:1px solid var(--border)!important;color:var(--text)!important}
html.theme-golden .section-title{color:var(--gold)!important;border-bottom:1px solid var(--border)!important}
html.theme-golden .btn-primary{background:linear-gradient(135deg,var(--gold),var(--gold2))!important;color:#2A1E0E!important}
html.theme-golden .btn-action{background:#352613!important;border:1px solid var(--border)!important;color:var(--text)!important}
html.theme-golden .btn-action.gold{color:var(--gold)!important;border-color:var(--gold)!important}
html.theme-golden .bar-track{background:rgba(0,0,0,0.3)!important;border:1px solid var(--border)!important}
html.theme-golden .hp-bar-red{background:linear-gradient(90deg,#6a1a1a,var(--red))!important}
html.theme-golden .hp-bar-green{background:linear-gradient(90deg,#2a4a2a,var(--green))!important}
html.theme-golden .exp-fill{background:linear-gradient(90deg,var(--gold2),var(--gold))!important}
html.theme-golden .modal-overlay{background:rgba(42,30,14,0.85)!important}
html.theme-golden ::-webkit-scrollbar-thumb{background:var(--border)!important}
html.theme-golden input,.theme-golden select,.theme-golden textarea{background:#2A1E0E!important;border:1px solid var(--border)!important;color:var(--text)!important}
html.theme-golden input:focus{border-color:var(--gold)!important}`,
  glass: `:root{--bg:#12141c!important;--bg2:rgba(20,22,32,0.7)!important;--bg3:rgba(20,22,32,0.5)!important;--bg4:rgba(20,22,32,0.35)!important;--border:rgba(255,255,255,0.08)!important;--text:rgba(255,255,255,0.9)!important;--text2:rgba(255,255,255,0.5)!important;--gold:rgba(212,168,68,0.9)!important;--gold2:rgba(212,168,68,0.6)!important;--accent:rgba(99,102,241,0.7)!important;--red:rgba(255,69,58,0.8)!important;--green:rgba(52,199,89,0.8)!important;--radius:14px!important;--shadow:0 8px 32px rgba(0,0,0,0.25)!important}
html.theme-glass body{font-family:'Inter','Noto Sans SC',sans-serif!important;background:#12141c!important;color:var(--text)!important}
html.theme-glass .view-login{background:radial-gradient(ellipse at 50% 0%,rgba(99,102,241,0.06),transparent 60%),#12141c!important}
html.theme-glass .login-card,.theme-glass .modal-panel{background:var(--bg2)!important;backdrop-filter:blur(20px) saturate(150%)!important;-webkit-backdrop-filter:blur(20px) saturate(150%)!important;border:1px solid var(--border)!important;border-radius:20px!important;box-shadow:var(--shadow)!important}
html.theme-glass .game-title{font-weight:300!important;color:var(--text)!important;letter-spacing:-0.03em!important}
html.theme-glass .game-header{background:var(--bg2)!important;backdrop-filter:blur(20px) saturate(140%)!important;-webkit-backdrop-filter:blur(20px) saturate(140%)!important;border-bottom:1px solid var(--border)!important;position:sticky!important;top:0!important;z-index:50!important}
html.theme-glass .hdr-name{font-weight:400!important;color:rgba(255,255,255,0.9)!important}
html.theme-glass .realm-badge{background:rgba(212,168,68,0.1)!important;border:1px solid rgba(212,168,68,0.2)!important;color:rgba(212,168,68,0.9)!important;border-radius:12px!important}
html.theme-glass .tab-btn{color:var(--text2)!important;font-weight:300!important}
html.theme-glass .tab-btn.active{color:rgba(255,255,255,0.9)!important;font-weight:400!important;background:rgba(255,255,255,0.04)!important;border-radius:12px!important}
html.theme-glass .stat-card,.theme-glass .skill-card,.theme-glass .map-card,.theme-glass .dungeon-card{background:var(--bg2)!important;backdrop-filter:blur(20px) saturate(150%)!important;-webkit-backdrop-filter:blur(20px) saturate(150%)!important;border:1px solid var(--border)!important;border-radius:16px!important;box-shadow:var(--shadow)!important;color:var(--text)!important}
html.theme-glass .section-title{color:var(--text)!important;font-weight:400!important}
html.theme-glass .btn-primary{background:rgba(255,255,255,0.1)!important;backdrop-filter:blur(8px)!important;border:1px solid var(--border)!important;color:var(--text)!important;border-radius:12px!important}
html.theme-glass .btn-action{background:rgba(255,255,255,0.04)!important;border:1px solid var(--border)!important;color:var(--text)!important;border-radius:12px!important}
html.theme-glass .btn-action.gold{color:var(--gold)!important;border-color:rgba(212,168,68,0.3)!important}
html.theme-glass .bar-track{background:rgba(255,255,255,0.08)!important;border-radius:12px!important}
html.theme-glass .hp-bar-red{background:var(--red)!important;border-radius:12px!important}
html.theme-glass .hp-bar-green{background:var(--green)!important;border-radius:12px!important}
html.theme-glass .exp-fill{background:linear-gradient(90deg,rgba(212,168,68,0.6),rgba(212,168,68,0.9))!important;border-radius:12px!important}
html.theme-glass .modal-overlay{background:rgba(18,20,28,0.7)!important;backdrop-filter:blur(8px)!important}
html.theme-glass ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15)!important;border-radius:8px!important}
html.theme-glass input,.theme-glass select,.theme-glass textarea{background:rgba(20,22,32,0.7)!important;border:1px solid var(--border)!important;color:var(--text)!important;border-radius:12px!important}
html.theme-glass input:focus{border-color:rgba(255,255,255,0.4)!important}`,
  rune: `.tab-btn svg,.ider-nav-icon{display:none!important}:root{--bg:#0A0A12!important;--bg2:#0E0E18!important;--bg3:#14121F!important;--bg4:#1A1726!important;--border:rgba(99,102,241,0.18)!important;--text:#D8D6E8!important;--text2:rgba(216,214,232,0.55)!important;--gold:#6366F1!important;--gold2:#8B5CF6!important;--accent:#FF3366!important;--red:#FF2244!important;--green:#34D399!important;--radius:2px!important;--shadow:0 0 30px rgba(99,102,241,0.08)!important}
:root{--bg:#0A0A12!important;--bg2:#0E0E18!important;--bg3:#14121F!important;--bg4:#1A1726!important;--border:rgba(99,102,241,0.18)!important;--text:#D8D6E8!important;--text2:rgba(216,214,232,0.55)!important;--gold:#6366F1!important;--gold2:#8B5CF6!important;--accent:#FF3366!important;--red:#FF2244!important;--green:#34D399!important;--radius:2px!important}
html.theme-rune body{font-family:'Cormorant Garamond','Noto Serif SC',serif!important;background:var(--bg)!important;color:var(--text)!important;position:relative!important}
html.theme-rune body::before{content:''!important;position:fixed!important;inset:0!important;z-index:-3!important;pointer-events:none!important;background:radial-gradient(ellipse at 50% 100%,rgba(99,102,241,0.06),transparent 60%)!important}
html.theme-rune .view-login{background:radial-gradient(ellipse at 50% 50%,#0E0E18,#0A0A12)!important}
html.theme-rune .login-card,.theme-rune .modal-panel{background:linear-gradient(160deg,#0E0E18,#14121F)!important;border:1px solid var(--border)!important;box-shadow:var(--shadow)!important;border-radius:2px!important}
html.theme-rune .game-title{font-family:'Cormorant Garamond',serif!important;color:var(--gold)!important;text-shadow:0 0 20px rgba(99,102,241,0.25)!important;letter-spacing:0.1em!important;font-weight:600!important}
html.theme-rune .game-header{background:#0E0E18!important;border-bottom:1px solid var(--border)!important;position:relative!important}
html.theme-rune .game-header::after{content:'✦'!important;position:absolute!important;bottom:0!important;left:0!important;right:0!important;text-align:center!important;color:rgba(99,102,241,0.2)!important;font-size:12px!important;letter-spacing:8px!important}
html.theme-rune .hdr-name{font-family:'Cormorant Garamond',serif!important;letter-spacing:0.15em!important;color:var(--text)!important;text-shadow:0 0 12px rgba(99,102,241,0.2)!important}
html.theme-rune .realm-badge{background:rgba(99,102,241,0.08)!important;border:1px solid rgba(99,102,241,0.2)!important;color:var(--gold)!important}
html.theme-rune .tab-btn{color:var(--text2)!important;letter-spacing:0.08em!important}
html.theme-rune .tab-btn.active{color:var(--gold)!important;border-bottom-color:var(--gold)!important;text-shadow:0 0 10px rgba(99,102,241,0.3)!important}
html.theme-rune .stat-card,.theme-rune .skill-card,.theme-rune .map-card,.theme-rune .dungeon-card{background:linear-gradient(160deg,#0E0E18,#14121F)!important;border:1px solid var(--border)!important;box-shadow:var(--shadow)!important;color:var(--text)!important}
html.theme-rune .section-title{color:var(--gold)!important;border-bottom:1px solid var(--border)!important;letter-spacing:0.15em!important}
html.theme-rune .btn-primary{background:linear-gradient(135deg,var(--gold),var(--gold2))!important;color:#0A0A12!important}
html.theme-rune .btn-action{background:#0E0E18!important;border:1px solid var(--border)!important;color:var(--text)!important}
html.theme-rune .btn-action.gold{color:var(--gold)!important;border-color:var(--gold)!important;text-shadow:0 0 8px rgba(99,102,241,0.3)!important}
html.theme-rune .bar-track{background:rgba(0,0,0,0.3)!important;border:1px solid var(--border)!important}
html.theme-rune .hp-bar-red{background:linear-gradient(90deg,#5a1020,var(--red))!important}
html.theme-rune .hp-bar-green{background:linear-gradient(90deg,#14453a,var(--green))!important}
html.theme-rune .exp-fill{background:linear-gradient(90deg,var(--gold2),var(--gold))!important}
html.theme-rune .modal-overlay{background:rgba(10,10,18,0.85)!important;backdrop-filter:blur(4px)!important}
html.theme-rune ::-webkit-scrollbar-thumb{background:var(--border)!important}
html.theme-rune input,.theme-rune select,.theme-rune textarea{background:#0E0E18!important;border:1px solid var(--border)!important;color:var(--text)!important}
html.theme-rune input:focus{border-color:var(--gold)!important;box-shadow:0 0 10px rgba(99,102,241,0.08)!important}`
};

// ═══════════════════════════════════════════════════════════════
// 工单系统换肤层：将游戏皮肤同款配色映射到工单系统（艾德尔工单系统）
// 通过 html.theme-{key} 作用域，注入后仅在该皮肤激活时生效
// ═══════════════════════════════════════════════════════════════

function buildSystemCss(p) {
  return `
/* ═══ 工单系统皮肤: ${p.label} ═══ */
html.theme-${p.key}{
  --bg-base: ${p.bg} !important;
  --bg-card: ${p.card} !important;
  --bg-card-hover: ${p.cardHover} !important;
  --bg-sidebar: ${p.sidebar} !important;
  --bg-sidebar-hover: ${p.sidebarHover} !important;
  --bg-sidebar-active: ${p.sidebarActive} !important;
  --bg-input: ${p.input} !important;
  --bg-overlay: ${p.overlay} !important;
  --text-primary: ${p.text} !important;
  --text-secondary: ${p.text2} !important;
  --text-tertiary: ${p.text3} !important;
  --text-inverse: ${p.textInverse} !important;
  --text-sidebar: ${p.sidebarText} !important;
  --text-sidebar-active: ${p.sidebarTextActive} !important;
  --accent-green: ${p.green} !important;
  --accent-green-light: ${p.greenLight} !important;
  --accent-green-dark: ${p.greenDark} !important;
  --accent-amber: ${p.amber} !important;
  --accent-amber-light: ${p.amberLight} !important;
  --accent-blue: ${p.blue} !important;
  --accent-blue-light: ${p.blueLight} !important;
  --accent-red: ${p.red} !important;
  --accent-red-light: ${p.redLight} !important;
  --border-default: ${p.border} !important;
  --border-light: ${p.borderLight} !important;
  --border-focus: ${p.borderFocus} !important;
  ${p.font ? `--font-sans: ${p.font} !important;` : ''}
  --radius-sm: ${p.radiusSm} !important;
  --radius-md: ${p.radiusMd} !important;
  --radius-lg: ${p.radiusLg} !important;
  --shadow-sm: ${p.shadow} !important;
  --shadow-md: ${p.shadow} !important;
}
html.theme-${p.key} body{background:${p.bg} !important;color:${p.text} !important}
html.theme-${p.key} .sidebar{background:${p.sidebar} !important}
html.theme-${p.key} .sidebar-brand{background:${p.sidebar} !important;border-bottom-color:${p.border} !important}
html.theme-${p.key} .sidebar-brand h1{color:${p.sidebarTextActive} !important}
html.theme-${p.key} .nav-item{color:${p.sidebarText} !important}
html.theme-${p.key} .nav-item:hover{background:${p.sidebarHover} !important}
html.theme-${p.key} .nav-item.active{background:${p.sidebarActive} !important;color:${p.sidebarTextActive} !important}
html.theme-${p.key} .sidebar-section-trigger{color:${p.text3} !important}
html.theme-${p.key} .topbar{background:${p.card} !important;border-bottom-color:${p.border} !important}
html.theme-${p.key} .topbar-title{color:${p.text} !important}
html.theme-${p.key} .content-area{background:${p.bg} !important}
html.theme-${p.key} .page-header h2{color:${p.text} !important}
html.theme-${p.key} .page-header p{color:${p.text2} !important}
html.theme-${p.key} .card{background:${p.card} !important;border-color:${p.border} !important;box-shadow:${p.shadow} !important}
html.theme-${p.key} .table-wrap{background:${p.card} !important;border-color:${p.border} !important}
html.theme-${p.key} table th{color:${p.text2} !important;border-bottom-color:${p.border} !important;background:${p.cardHover} !important}
html.theme-${p.key} table td{border-bottom-color:${p.borderLight} !important;color:${p.text} !important}
html.theme-${p.key} .form-input,html.theme-${p.key} .form-select,html.theme-${p.key} .form-textarea{background:${p.input} !important;border-color:${p.border} !important;color:${p.text} !important}
html.theme-${p.key} .form-input:focus,html.theme-${p.key} .form-select:focus{border-color:${p.borderFocus} !important}
html.theme-${p.key} .form-input::placeholder{color:${p.text3} !important}
html.theme-${p.key} .btn-primary{background:${p.text} !important;color:${p.textInverse} !important;border-color:${p.text} !important}
html.theme-${p.key} .btn-primary:hover:not(:disabled){background:${p.blue} !important}
html.theme-${p.key} .btn-secondary{background:${p.card} !important;color:${p.text} !important;border-color:${p.border} !important}
html.theme-${p.key} .btn-ghost{color:${p.text2} !important}
html.theme-${p.key} .btn-ghost:hover{background:${p.cardHover} !important;color:${p.text} !important}
html.theme-${p.key} .badge{background:${p.cardHover} !important;color:${p.text2} !important}
html.theme-${p.key} .badge-pending{background:${p.amberLight} !important;color:${p.amber} !important}
html.theme-${p.key} .badge-approved{background:${p.blueLight} !important;color:${p.blue} !important}
html.theme-${p.key} .badge-completed{background:${p.greenLight} !important;color:${p.greenDark} !important}
html.theme-${p.key} .badge-rejected{background:${p.redLight} !important;color:${p.red} !important}
html.theme-${p.key} .modal-overlay{background:${p.overlay} !important}
html.theme-${p.key} .modal{background:${p.card} !important;border-color:${p.border} !important}
html.theme-${p.key} .modal-header{background:${p.card} !important;border-bottom-color:${p.border} !important}
html.theme-${p.key} .modal-header h3{color:${p.text} !important}
html.theme-${p.key} .modal-body{background:${p.card} !important;color:${p.text} !important}
html.theme-${p.key} .modal-footer{background:${p.card} !important;border-top-color:${p.border} !important}
html.theme-${p.key} .tab{color:${p.text2} !important}
html.theme-${p.key} .tab.active{color:${p.text} !important;border-bottom-color:${p.text} !important}
html.theme-${p.key} .empty-state{color:${p.text2} !important}
html.theme-${p.key} .scrolling-announcement{background:${p.sidebar} !important}
html.theme-${p.key} .scrolling-text{color:${p.amber} !important}
html.theme-${p.key} .filter-bar .form-select{background:${p.input} !important;color:${p.text} !important;border-color:${p.border} !important}
html.theme-${p.key} .order-card{background:${p.card} !important;border-color:${p.border} !important}
html.theme-${p.key} .oc-label{color:${p.text3} !important}
html.theme-${p.key} .oc-value{color:${p.text} !important}
html.theme-${p.key} .skeleton-block{background:linear-gradient(90deg,${p.cardHover} 25%,${p.borderLight} 50%,${p.cardHover} 75%) !important}
html.theme-${p.key} .skeleton-card{background:${p.card} !important;border-color:${p.border} !important}
html.theme-${p.key} .text-muted{color:${p.text2} !important}
html.theme-${p.key} a{color:${p.blue} !important}
html.theme-${p.key} a:hover{color:${p.amber} !important}
html.theme-${p.key} ::-webkit-scrollbar-thumb{background:${p.border} !important}
`;
}

// 各皮肤在工单系统的配色映射（与游戏皮肤同款色系）
const SYSTEM_PALETTES = {
  ink: { key:'ink', label:'水墨丹青',
    bg:'#F5F0E6', card:'#F0EBE0', cardHover:'#E8E0D0', input:'#F0EBE0',
    sidebar:'#1a1a1a', sidebarHover:'#2a2a2a', sidebarActive:'#C43A2B',
    sidebarText:'#D4D4D4', sidebarTextActive:'#F5F0E6',
    text:'#1a1a1a', text2:'rgba(26,26,26,0.55)', text3:'rgba(26,26,26,0.38)', textInverse:'#F5F0E6',
    amber:'#C43A2B', amberLight:'rgba(196,58,43,0.10)',
    blue:'#8B7355', blueLight:'rgba(139,115,85,0.12)',
    green:'#5a7a3a', greenLight:'rgba(90,122,58,0.12)', greenDark:'#4a6a2a',
    red:'#C43A2B', redLight:'rgba(196,58,43,0.10)',
    border:'rgba(26,26,26,0.18)', borderLight:'rgba(26,26,26,0.08)', borderFocus:'#1a1a1a',
    overlay:'rgba(26,26,26,0.5)', radiusSm:'3px', radiusMd:'4px', radiusLg:'6px',
    shadow:'0 1px 2px rgba(0,0,0,0.04)',
    font:'"Noto Serif SC","STKaiti","KaiTi","FangSong",serif',
  },
  cyber: { key:'cyber', label:'赛博修仙',
    bg:'#03030a', card:'#070718', cardHover:'#0c0c28', input:'#0c0c28',
    sidebar:'#050510', sidebarHover:'#0a0a20', sidebarActive:'#00f0ff',
    sidebarText:'#4a5a7a', sidebarTextActive:'#00f0ff',
    text:'#c4d0e0', text2:'#4a5a7a', text3:'#334', textInverse:'#03030a',
    amber:'#ff00aa', amberLight:'rgba(255,0,170,0.10)',
    blue:'#00f0ff', blueLight:'rgba(0,240,255,0.10)',
    green:'#00ff88', greenLight:'rgba(0,255,136,0.10)', greenDark:'#00cc6a',
    red:'#ff0044', redLight:'rgba(255,0,68,0.10)',
    border:'#1a1a4a', borderLight:'rgba(0,240,255,0.06)', borderFocus:'#00f0ff',
    overlay:'rgba(3,3,10,0.85)', radiusSm:'2px', radiusMd:'2px', radiusLg:'2px',
    shadow:'0 0 12px rgba(0,240,255,0.04)',
    font:'"Rajdhani","Noto Sans SC",sans-serif',
  },
  luxe: { key:'luxe', label:'欧式奢华',
    bg:'#0d0b08', card:'#1a1612', cardHover:'#28221c', input:'#1a1612',
    sidebar:'#0d0b08', sidebarHover:'#1a1612', sidebarActive:'#d4a844',
    sidebarText:'#a09080', sidebarTextActive:'#d4a844',
    text:'#e8ddd0', text2:'#a09080', text3:'#6a5f52', textInverse:'#0d0b08',
    amber:'#d4a844', amberLight:'rgba(212,168,68,0.10)',
    blue:'#d4a844', blueLight:'rgba(212,168,68,0.10)',
    green:'#40a060', greenLight:'rgba(64,160,96,0.12)', greenDark:'#2a8a48',
    red:'#c04040', redLight:'rgba(192,64,64,0.10)',
    border:'#4a3f35', borderLight:'rgba(74,63,53,0.4)', borderFocus:'#d4a844',
    overlay:'rgba(13,11,8,0.85)', radiusSm:'4px', radiusMd:'4px', radiusLg:'4px',
    shadow:'0 4px 20px rgba(0,0,0,0.2)',
    font:'"Playfair Display","Noto Serif SC",serif',
  },
  magazine: { key:'magazine', label:'杂志风',
    bg:'#f8f6f2', card:'#ffffff', cardHover:'#f0ece6', input:'#f8f6f2',
    sidebar:'#2a2520', sidebarHover:'#3a3530', sidebarActive:'#c49a6c',
    sidebarText:'#a09080', sidebarTextActive:'#fff',
    text:'#2a2520', text2:'#8a8078', text3:'rgba(42,37,32,0.4)', textInverse:'#fff',
    amber:'#c49a6c', amberLight:'rgba(196,154,108,0.12)',
    blue:'#6a7a8a', blueLight:'rgba(106,122,138,0.12)',
    green:'#5a8a5a', greenLight:'rgba(90,138,90,0.12)', greenDark:'#4a7a4a',
    red:'#b04a3a', redLight:'rgba(176,74,58,0.10)',
    border:'#d0c8bc', borderLight:'rgba(208,200,188,0.4)', borderFocus:'#2a2520',
    overlay:'rgba(248,246,242,0.9)', radiusSm:'0', radiusMd:'0', radiusLg:'0',
    shadow:'0 2px 8px rgba(0,0,0,0.02)',
    font:'"Noto Serif SC","Georgia",serif',
  },
  wabi: { key:'wabi', label:'侘寂',
    bg:'#F5F0E8', card:'#F0E8DC', cardHover:'#EDE4D8', input:'#F0E8DC',
    sidebar:'#EDE4D8', sidebarHover:'#E4D8CA', sidebarActive:'#B7413E',
    sidebarText:'rgba(44,44,44,0.5)', sidebarTextActive:'#B7413E',
    text:'#2C2C2C', text2:'rgba(44,44,44,0.5)', text3:'rgba(44,44,44,0.3)', textInverse:'#F5F0E8',
    amber:'#B7413E', amberLight:'rgba(183,65,62,0.08)',
    blue:'#6B8E6B', blueLight:'rgba(107,142,107,0.12)',
    green:'#5A7A4A', greenLight:'rgba(90,122,74,0.12)', greenDark:'#4a6a3a',
    red:'#B7413E', redLight:'rgba(183,65,62,0.08)',
    border:'rgba(44,44,44,0.12)', borderLight:'rgba(44,44,44,0.06)', borderFocus:'#2C2C2C',
    overlay:'rgba(245,240,232,0.85)', radiusSm:'0', radiusMd:'0', radiusLg:'0',
    shadow:'0 1px 0 rgba(44,44,44,0.06)',
    font:'"Noto Serif JP","STSong","Yu Mincho",serif',
  },
  minimal: { key:'minimal', label:'极简主义',
    bg:'#FFFFFF', card:'#FFFFFF', cardHover:'#F8F8F8', input:'#FFFFFF',
    sidebar:'#F8F8F8', sidebarHover:'#EFEFEF', sidebarActive:'#000000',
    sidebarText:'rgba(0,0,0,0.45)', sidebarTextActive:'#FFFFFF',
    text:'#000000', text2:'rgba(0,0,0,0.55)', text3:'rgba(0,0,0,0.3)', textInverse:'#FFFFFF',
    amber:'#000000', amberLight:'rgba(0,0,0,0.05)',
    blue:'#000000', blueLight:'rgba(0,0,0,0.05)',
    green:'#000000', greenLight:'rgba(0,0,0,0.05)', greenDark:'#333333',
    red:'#000000', redLight:'rgba(0,0,0,0.05)',
    border:'rgba(0,0,0,0.08)', borderLight:'rgba(0,0,0,0.04)', borderFocus:'#000000',
    overlay:'rgba(255,255,255,0.8)', radiusSm:'0', radiusMd:'0', radiusLg:'0',
    shadow:'none',
    font:'"Inter","Noto Sans SC",-apple-system,BlinkMacSystemFont,sans-serif',
  },
  frost: { key:'frost', label:'霜语',
    bg:'#020617', card:'rgba(255,255,255,0.03)', cardHover:'rgba(255,255,255,0.06)', input:'rgba(255,255,255,0.05)',
    sidebar:'#020617', sidebarHover:'rgba(255,255,255,0.06)', sidebarActive:'rgba(255,255,255,0.9)',
    sidebarText:'rgba(255,255,255,0.4)', sidebarTextActive:'#020617',
    text:'rgba(255,255,255,0.92)', text2:'rgba(255,255,255,0.48)', text3:'rgba(255,255,255,0.3)', textInverse:'#020617',
    amber:'rgba(255,255,255,0.9)', amberLight:'rgba(255,255,255,0.08)',
    blue:'rgba(255,255,255,0.8)', blueLight:'rgba(255,255,255,0.08)',
    green:'rgba(52,199,89,0.8)', greenLight:'rgba(52,199,89,0.12)', greenDark:'rgba(52,199,89,0.9)',
    red:'rgba(255,69,58,0.8)', redLight:'rgba(255,69,58,0.12)',
    border:'rgba(255,255,255,0.08)', borderLight:'rgba(255,255,255,0.04)', borderFocus:'rgba(255,255,255,0.9)',
    overlay:'rgba(2,6,23,0.8)', radiusSm:'12px', radiusMd:'14px', radiusLg:'16px',
    shadow:'0 8px 32px rgba(0,0,0,0.25)',
    font:'"Inter","Noto Sans SC",-apple-system,BlinkMacSystemFont,sans-serif',
  },
  brutal: { key:'brutal', label:'粗野主义',
    bg:'#F0F0F0', card:'#FFFFFF', cardHover:'#E8E8E8', input:'#FFFFFF',
    sidebar:'#0A0A0A', sidebarHover:'#2A2A2A', sidebarActive:'#FF3300',
    sidebarText:'#CCCCCC', sidebarTextActive:'#FFFFFF',
    text:'#0A0A0A', text2:'#444444', text3:'rgba(10,10,10,0.35)', textInverse:'#FFFFFF',
    amber:'#FF3300', amberLight:'rgba(255,51,0,0.10)',
    blue:'#0044FF', blueLight:'rgba(0,68,255,0.10)',
    green:'#00CC00', greenLight:'rgba(0,204,0,0.10)', greenDark:'#009a00',
    red:'#FF0000', redLight:'rgba(255,0,0,0.10)',
    border:'#0A0A0A', borderLight:'rgba(10,10,10,0.3)', borderFocus:'#0A0A0A',
    overlay:'rgba(10,10,10,0.6)', radiusSm:'0', radiusMd:'0', radiusLg:'0',
    shadow:'4px 4px 0 #0A0A0A',
    font:'-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif',
  },
  dunhuang: { key:'dunhuang', label:'敦煌飞天',
    bg:'#F0E6D3', card:'#E8DCC8', cardHover:'#E0D0B8', input:'#F0E6D3',
    sidebar:'#3D2B1A', sidebarHover:'#4A3522', sidebarActive:'#D4432A',
    sidebarText:'rgba(232,220,200,0.6)', sidebarTextActive:'#F0E6D3',
    text:'#3D2B1A', text2:'rgba(61,43,26,0.55)', text3:'rgba(61,43,26,0.35)', textInverse:'#F0E6D3',
    amber:'#D4A844', amberLight:'rgba(212,168,68,0.15)',
    blue:'#2AA8A8', blueLight:'rgba(42,168,168,0.12)',
    green:'#2AA8A8', greenLight:'rgba(42,168,168,0.12)', greenDark:'#1a8a8a',
    red:'#D4432A', redLight:'rgba(212,67,42,0.10)',
    border:'rgba(196,155,94,0.25)', borderLight:'rgba(196,155,94,0.12)', borderFocus:'#D4A844',
    overlay:'rgba(61,43,26,0.6)', radiusSm:'4px', radiusMd:'6px', radiusLg:'8px',
    shadow:'0 2px 8px rgba(61,43,26,0.06)',
    font:'"Noto Serif SC","STKaiti",serif',
  },
  taiji: { key:'taiji', label:'阴阳太极',
    bg:'#F8F8F8', card:'#F0F0F0', cardHover:'#E8E8E8', input:'#F8F8F8',
    sidebar:'#0A0A0A', sidebarHover:'#2A2A2A', sidebarActive:'#FFFFFF',
    sidebarText:'#999999', sidebarTextActive:'#0A0A0A',
    text:'#0A0A0A', text2:'rgba(10,10,10,0.5)', text3:'rgba(10,10,10,0.3)', textInverse:'#FFFFFF',
    amber:'#0A0A0A', amberLight:'rgba(10,10,10,0.06)',
    blue:'#888888', blueLight:'rgba(136,136,136,0.12)',
    green:'#4A4A4A', greenLight:'rgba(74,74,74,0.12)', greenDark:'#2a2a2a',
    red:'#0A0A0A', redLight:'rgba(10,10,10,0.06)',
    border:'rgba(10,10,10,0.12)', borderLight:'rgba(10,10,10,0.06)', borderFocus:'#0A0A0A',
    overlay:'rgba(10,10,10,0.4)', radiusSm:'0', radiusMd:'0', radiusLg:'0',
    shadow:'none',
    font:'"Noto Sans SC",-apple-system,BlinkMacSystemFont,sans-serif',
  },
  guzhenren: { key:'guzhenren', label:'蛊真人',
    bg:'#0A0A0F', card:'#0F0F14', cardHover:'#141019', input:'#141019',
    sidebar:'#07070A', sidebarHover:'#141019', sidebarActive:'#8B7355',
    sidebarText:'#A09888', sidebarTextActive:'#E8DCC4',
    text:'#E8DCC4', text2:'#A09888', text3:'#5A5548', textInverse:'#07070A',
    amber:'#8B7355', amberLight:'rgba(139,115,85,0.12)',
    blue:'#8B7355', blueLight:'rgba(139,115,85,0.12)',
    green:'#2F4538', greenLight:'rgba(47,69,56,0.15)', greenDark:'#3a5a48',
    red:'#6B2020', redLight:'rgba(107,32,32,0.12)',
    border:'rgba(139,115,85,0.25)', borderLight:'rgba(139,115,85,0.12)', borderFocus:'#8B7355',
    overlay:'rgba(7,7,10,0.85)', radiusSm:'0', radiusMd:'0', radiusLg:'0',
    shadow:'0 4px 20px rgba(0,0,0,0.3)',
    font:'"Noto Serif SC","STKaiti",serif',
  },
  golden: { key:'golden', label:'金碧辉煌',
    bg:'#2A1E0E', card:'#352613', cardHover:'#402E18', input:'#352613',
    sidebar:'#1E1508', sidebarHover:'#352613', sidebarActive:'#E8B84B',
    sidebarText:'rgba(245,230,196,0.55)', sidebarTextActive:'#2A1E0E',
    text:'#F5E6C4', text2:'rgba(245,230,196,0.6)', text3:'rgba(245,230,196,0.38)', textInverse:'#2A1E0E',
    amber:'#E8B84B', amberLight:'rgba(232,184,75,0.14)',
    blue:'#E8B84B', blueLight:'rgba(232,184,75,0.14)',
    green:'#6A9B4A', greenLight:'rgba(106,155,74,0.14)', greenDark:'#5a8a3a',
    red:'#C04040', redLight:'rgba(192,64,64,0.12)',
    border:'rgba(212,168,68,0.28)', borderLight:'rgba(212,168,68,0.14)', borderFocus:'#E8B84B',
    overlay:'rgba(42,30,14,0.85)', radiusSm:'3px', radiusMd:'4px', radiusLg:'6px',
    shadow:'0 4px 20px rgba(0,0,0,0.3)',
    font:'"Playfair Display","Noto Serif SC",serif',
  },
  glass: { key:'glass', label:'毛玻璃',
    bg:'#12141c', card:'rgba(20,22,32,0.7)', cardHover:'rgba(20,22,32,0.85)', input:'rgba(20,22,32,0.7)',
    sidebar:'#12141c', sidebarHover:'rgba(20,22,32,0.85)', sidebarActive:'rgba(212,168,68,0.9)',
    sidebarText:'rgba(255,255,255,0.45)', sidebarTextActive:'#12141c',
    text:'rgba(255,255,255,0.9)', text2:'rgba(255,255,255,0.5)', text3:'rgba(255,255,255,0.3)', textInverse:'#12141c',
    amber:'rgba(212,168,68,0.9)', amberLight:'rgba(212,168,68,0.14)',
    blue:'rgba(99,102,241,0.8)', blueLight:'rgba(99,102,241,0.14)',
    green:'rgba(52,199,89,0.8)', greenLight:'rgba(52,199,89,0.14)', greenDark:'rgba(52,199,89,0.9)',
    red:'rgba(255,69,58,0.8)', redLight:'rgba(255,69,58,0.14)',
    border:'rgba(255,255,255,0.08)', borderLight:'rgba(255,255,255,0.04)', borderFocus:'rgba(255,255,255,0.4)',
    overlay:'rgba(18,20,28,0.7)', radiusSm:'12px', radiusMd:'14px', radiusLg:'16px',
    shadow:'0 8px 32px rgba(0,0,0,0.25)',
    font:'"Inter","Noto Sans SC",-apple-system,BlinkMacSystemFont,sans-serif',
  },
  rune: { key:'rune', label:'暗黑符文',
    bg:'#0A0A12', card:'#0E0E18', cardHover:'#14121F', input:'#0E0E18',
    sidebar:'#070710', sidebarHover:'#14121F', sidebarActive:'#6366F1',
    sidebarText:'rgba(216,214,232,0.5)', sidebarTextActive:'#0A0A12',
    text:'#D8D6E8', text2:'rgba(216,214,232,0.55)', text3:'rgba(216,214,232,0.35)', textInverse:'#0A0A12',
    amber:'#6366F1', amberLight:'rgba(99,102,241,0.14)',
    blue:'#8B5CF6', blueLight:'rgba(139,92,246,0.14)',
    green:'#34D399', greenLight:'rgba(52,211,153,0.14)', greenDark:'#2aB387',
    red:'#FF2244', redLight:'rgba(255,34,68,0.12)',
    border:'rgba(99,102,241,0.18)', borderLight:'rgba(99,102,241,0.08)', borderFocus:'#6366F1',
    overlay:'rgba(10,10,18,0.85)', radiusSm:'2px', radiusMd:'2px', radiusLg:'2px',
    shadow:'0 0 30px rgba(99,102,241,0.08)',
    font:'"Cormorant Garamond","Noto Serif SC",serif',
  },
};

// 每个皮肤的最终 CSS = 游戏皮肤 CSS + 工单系统换肤层
const FULL_CSS = {};
for (const k of Object.keys(SKIN_CSS)) {
  const pal = SYSTEM_PALETTES[k];
  FULL_CSS[k] = SKIN_CSS[k] + (pal ? buildSystemCss(pal) : '');
}

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const key = params.key;
  if (!key) return json({ error: 'Missing skin key' }, 400);

  const css = FULL_CSS[key];
  if (!css) return json({ error: 'CSS not available' }, 404);

  return new Response(css, {
    status: 200,
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
