import { json } from '../../../_utils.js';

const SKIN_CSS = {
  ink: `:root{--paper:#F5F0E6;--paper-warm:#F0EBE0;--ink-deep:#1a1a1a;--ink-mid:rgba(26,26,26,0.55);--ink-light:rgba(26,26,26,0.18);--ink-faint:rgba(26,26,26,0.06);--ink-ghost:rgba(26,26,26,0.025);--cinnabar:#C43A2B;--cinnabar-soft:rgba(196,58,43,0.85);--cinnabar-faint:rgba(196,58,43,0.08);--gold-seal:#8B7355;--bg:var(--paper)!important;--bg2:var(--paper-warm)!important;--bg3:#E8E0D0!important;--bg4:#DDD4C0!important;--border:var(--ink-light)!important;--text:var(--ink-deep)!important;--text2:var(--ink-mid)!important;--gold:var(--cinnabar)!important;--gold2:#8B2818!important;--accent:var(--gold-seal)!important;--red:var(--cinnabar)!important;--green:#5A7A3A!important;--radius:4px!important;--shadow:none!important}
@keyframes inkwashIn{0%{opacity:0;clip-path:inset(0 50% 0 50%)}60%{clip-path:inset(0 0 0 0)}100%{opacity:1}}
@keyframes inkSpread{from{background-size:0% 100%}to{background-size:100% 100%}}
@keyframes inkPour{0%{background-position:100% 0}100%{background-position:0% 0}}
@keyframes mistDrift{0%,100%{transform:translateX(0)}50%{transform:translateX(15%)}}
@keyframes inkFloat{0%,100%{transform:translateY(0) scale(1);opacity:0.03}50%{transform:translateY(-6px) scale(1.1);opacity:0.06}}
body{font-family:'Noto Serif SC','STKaiti','KaiTi','FangSong',serif!important;color:var(--ink-deep)!important;background:var(--paper)!important;letter-spacing:0.04em!important}
body::before{content:''!important;position:fixed!important;inset:0!important;z-index:-3!important;pointer-events:none!important;background-image:repeating-linear-gradient(90deg,transparent,transparent 60px,rgba(60,50,30,0.008) 60px,rgba(60,50,30,0.008) 61px),repeating-linear-gradient(0deg,transparent,transparent 60px,rgba(60,50,30,0.008) 60px,rgba(60,50,30,0.008) 61px)!important}
.ider-ink-mountains{position:fixed!important;bottom:0!important;left:0!important;right:0!important;height:40vh!important;z-index:-2!important;pointer-events:none!important;opacity:0.04!important}
.ider-ink-mist{position:fixed!important;inset:0!important;z-index:-2!important;pointer-events:none!important;overflow:hidden!important}
.ider-ink-mist::before,.ider-ink-mist::after{content:''!important;position:absolute!important;inset:-50%!important;background:radial-gradient(ellipse at 30% 70%,rgba(200,190,180,0.15),transparent 50%)!important;filter:blur(40px)!important;animation:mistDrift 25s ease-in-out infinite!important}
.ider-ink-mist::after{animation-delay:-12s!important;opacity:0.6!important;background:radial-gradient(ellipse at 70% 30%,rgba(200,190,180,0.1),transparent 50%)!important}
.ider-ink-corner{position:fixed!important;width:120px!important;height:120px!important;z-index:-2!important;pointer-events:none!important;border-radius:50%!important;filter:blur(30px)!important;background:radial-gradient(circle,rgba(26,26,26,0.04),transparent 70%)!important}
.ider-ink-corner.tl{top:-30px!important;left:-30px!important}
.ider-ink-corner.br{bottom:-30px!important;right:-30px!important}
.ider-ink-splash{position:fixed!important;border-radius:50%!important;z-index:-2!important;pointer-events:none!important;background:var(--ink-deep)!important;animation:inkFloat 8s ease-in-out infinite!important}
.ider-ink-birds{position:fixed!important;bottom:30vh!important;left:0!important;right:0!important;z-index:-2!important;pointer-events:none!important;opacity:0.06!important;height:40px!important}
.game-header{display:flex!important;flex-direction:column!important;align-items:center!important;padding:24px 0 16px!important;background:transparent!important;border:none!important;position:relative!important}
.inkwash-header-line{position:absolute!important;top:8px!important;left:50%!important;margin-left:-1px!important;width:2px!important;height:28px!important;background:var(--ink-deep)!important;opacity:0.12!important;pointer-events:none!important}
.inkwash-seal{width:90px!important;height:90px!important;border:2px solid var(--cinnabar)!important;display:flex!important;align-items:center!important;justify-content:center!important;transform:rotate(-4deg)!important;background:radial-gradient(circle at 30% 30%,var(--cinnabar-faint) 0%,transparent 60%)!important;transition:transform 0.8s ease!important}.inkwash-seal:hover{transform:rotate(-2deg) scale(1.02)!important}
.inkwash-seal-text{color:var(--cinnabar)!important;font-family:'Ma Shan Zheng','STKaiti',serif!important;font-size:22px!important;letter-spacing:4px!important;opacity:0.85!important}
.inkwash-realm{font-family:'Noto Serif SC','STKaiti',serif!important;font-weight:200!important;letter-spacing:0.3em!important;font-size:0.75rem!important;color:var(--ink-mid)!important;margin-top:8px!important}
.inkwash-divider{width:60%!important;height:1px!important;background:var(--ink-deep)!important;opacity:0.1!important;margin:10px auto!important}
.inkwash-resources{display:flex!important;gap:16px!important;color:var(--ink-mid)!important;font-size:0.85rem!important;letter-spacing:0.1em!important;margin:4px 0!important}
.inkwash-actions{display:flex!important;gap:8px!important;margin-top:6px!important}
.inkwash-actions button{background:none!important;border:none!important;cursor:pointer!important;padding:6px!important;width:30px!important;height:30px!important;color:var(--ink-mid)!important;transition:color 0.3s!important}.inkwash-actions button:hover{color:var(--cinnabar)!important}
.inkwash-nav{position:fixed!important;left:0!important;top:50%!important;transform:translateY(-50%)!important;z-index:40!important;display:flex!important;flex-direction:column!important;gap:2px!important;padding:8px!important;animation:inkwashIn 1.2s ease!important}
.inkwash-nav .tab-btn{writing-mode:vertical-rl!important;text-orientation:mixed!important;display:flex!important;flex-direction:column!important;align-items:center!important;padding:10px 6px!important;min-width:44px!important;background:transparent!important;border:none!important;color:var(--ink-mid)!important;font-family:'Noto Serif SC',serif!important;font-size:12px!important;letter-spacing:4px!important;cursor:pointer!important;position:relative!important;transition:all 0.4s ease!important}
.inkwash-nav .tab-btn .ider-nav-icon{width:16px!important;height:16px!important;margin-bottom:6px!important;opacity:0.5!important;display:block!important}
.inkwash-nav .tab-btn::after{content:''!important;position:absolute!important;left:0!important;top:10%!important;bottom:10%!important;width:2px!important;background:var(--cinnabar)!important;transform:scaleY(0)!important;transition:transform 0.4s ease!important}
.inkwash-nav .tab-btn.active{color:var(--cinnabar)!important}.inkwash-nav .tab-btn.active::after{transform:scaleY(1)!important}
.inkwash-nav .tab-btn:hover{background:linear-gradient(90deg,transparent 50%,var(--cinnabar-faint) 100%)!important;background-size:200% 100%!important;animation:inkSpread 0.4s ease forwards!important;color:var(--ink-deep)!important}
.inkwash-nav .tab-btn+.tab-divider{width:20px!important;height:1px!important;background:var(--ink-light)!important;margin:2px auto!important}
.battle-sidebar{width:160px!important;padding:20px!important;background:var(--paper-warm)!important;border-left:1px solid var(--ink-light)!important;border-right:none!important;position:relative!important}
.sidebar-char-name{font-family:'Ma Shan Zheng','STKaiti',serif!important;writing-mode:vertical-rl!important;text-orientation:mixed!important;letter-spacing:6px!important;color:var(--ink-deep)!important;font-size:18px!important}
.inkwash-bar-wrapper{position:relative!important;height:8px!important;background:var(--ink-faint)!important;border:none!important;margin:6px 0!important;overflow:hidden!important}
.inkwash-bar-fill{height:100%!important;background:linear-gradient(90deg,var(--ink-deep),var(--ink-mid))!important;background-size:200% 100%!important;animation:inkPour 0.8s ease forwards!important;transition:width 0.6s cubic-bezier(0.22,1,0.36,1)!important}
.inkwash-bar-fill.low{background:linear-gradient(90deg,var(--cinnabar),var(--cinnabar-soft))!important}
.stat-card,.skill-card,.modal-panel,.battle-status-panel,.battle-log-box{background:var(--paper)!important;border:1px solid var(--ink-light)!important;padding:16px 20px!important;position:relative!important;transition:all 0.6s ease!important;overflow:hidden!important}
.stat-card::before,.skill-card::before{content:''!important;position:absolute!important;left:0!important;top:0!important;bottom:0!important;width:2px!important;background:var(--cinnabar)!important;transform:scaleY(0)!important;transition:transform 0.4s ease!important;transform-origin:center!important}
.stat-card:hover::before,.skill-card:hover::before{transform:scaleY(1)!important}
.battle-status-panel{display:grid!important;grid-template-columns:1fr 1fr!important;gap:20px!important}
.inkwash-battle-log{font-family:'Noto Serif SC',serif!important;font-size:0.85rem!important;color:var(--ink-mid)!important;line-height:1.8!important;letter-spacing:0.06em!important;border-left:1px solid var(--ink-light)!important;padding-left:12px!important;margin-top:12px!important}
.hp-bar,.mp-bar,.exp-bar,.sr-bar,.bar-track{height:8px!important;background:var(--ink-faint)!important;border:none!important;border-radius:0!important;overflow:hidden!important}
.hp-bar-fill,.hp-bar-red{background:linear-gradient(90deg,var(--ink-deep),var(--ink-mid))!important;background-size:200% 100%!important;transition:width 0.6s cubic-bezier(0.22,1,0.36,1)!important}
.hp-bar-fill.low,.hp-bar-red.low{background:linear-gradient(90deg,var(--cinnabar),var(--cinnabar-soft))!important}
.mp-bar-fill,.mp-bar-blue{background:linear-gradient(90deg,var(--ink-mid),var(--ink-light))!important}
.exp-fill{background:var(--ink-deep)!important}
.modal-overlay{background:rgba(245,240,230,0.88)!important}
.modal-panel{border-radius:8px!important;border:1px solid var(--ink-light)!important;box-shadow:0 4px 24px rgba(26,26,26,0.06)!important}
.modal-title{border-bottom:1px solid var(--cinnabar)!important;color:var(--cinnabar)!important;font-family:'Noto Serif SC',serif!important;letter-spacing:4px!important;padding-bottom:8px!important}
.inkwash-realm-card{background:var(--paper)!important;border:1px solid var(--ink-light)!important;padding:20px 24px!important;position:relative!important;margin:8px 0!important;transition:all 0.6s ease!important}
.inkwash-realm-card::before{content:''!important;position:absolute!important;left:0!important;top:8px!important;bottom:8px!important;width:1px!important;background:var(--ink-deep)!important;opacity:0.08!important}
.inkwash-realm-card .realm-seal{position:absolute!important;top:-6px!important;left:-6px!important;width:24px!important;height:24px!important;border:1px solid var(--cinnabar)!important;display:flex!important;align-items:center!important;justify-content:center!important;font-size:9px!important;color:var(--cinnabar)!important;transform:rotate(-8deg)!important;background:var(--paper)!important}
.inkwash-realm-card+.inkwash-realm-card{border-top:none!important}.inkwash-realm-card+.inkwash-realm-card::after{content:'╻'!important;position:absolute!important;top:-10px!important;left:20px!important;color:var(--ink-light)!important;font-size:10px!important}
::-webkit-scrollbar{width:4px!important}::-webkit-scrollbar-thumb{background:var(--ink-light)!important;border-radius:2px!important}::-webkit-scrollbar-track{background:var(--paper)!important}
.panel{animation:inkwashIn 0.6s ease!important}
.hdr-name{font-family:'Ma Shan Zheng','STKaiti',serif!important;letter-spacing:4px!important;color:var(--ink-deep)!important}
.realm-badge{background:var(--paper-warm)!important;border:1px solid var(--ink-light)!important;color:var(--cinnabar)!important;letter-spacing:0.15em!important}
.game-title{font-family:'Ma Shan Zheng','STKaiti',serif!important;letter-spacing:12px!important;color:var(--ink-deep)!important;font-weight:400!important}
.sub-tab button,.sub-tab-item{border-bottom:1px solid var(--ink-faint)!important;color:var(--ink-mid)!important;letter-spacing:1px!important;font-size:12px!important}
.sub-tab button.active{color:var(--cinnabar)!important;border-bottom:2px solid var(--cinnabar)!important}
input,select,textarea{background:var(--paper)!important;border-color:var(--ink-light)!important;color:var(--ink-deep)!important;border-radius:4px!important}input:focus{border-color:var(--ink-deep)!important}
.btn-action{background:var(--paper-warm)!important;border:1px solid var(--ink-light)!important;color:var(--ink-deep)!important;border-radius:4px!important}
.btn-action.gold{background:var(--cinnabar)!important;border-color:#8B2818!important;color:#fff!important}
.btn-primary{background:var(--ink-deep)!important;border:none!important;color:var(--paper)!important;border-radius:4px!important}
.equip-slot,.opt-item,.inv-slot{background:var(--paper)!important;border:1px solid var(--ink-light)!important;border-radius:4px!important}.inv-slot.occupied:hover{border-color:var(--cinnabar)!important}
.map-card{background:var(--paper)!important;border:1px solid var(--ink-light)!important;border-radius:4px!important}.map-card.active{border-color:var(--cinnabar)!important;background:var(--paper-warm)!important}
.toast{background:rgba(250,246,240,0.95)!important;border:1px solid var(--ink-deep)!important;color:var(--ink-deep)!important;border-radius:4px!important}
.skill-card.equipped{border-left:3px solid var(--cinnabar)!important;background:var(--paper-warm)!important}
.section-title{color:var(--cinnabar)!important;border-bottom:1px solid var(--ink-light)!important;letter-spacing:4px!important;padding-bottom:8px!important}
.inkwash-char-scroll .stat-card{background:var(--paper)!important;border:1px solid var(--ink-light)!important;padding:16px 20px!important;position:relative!important;margin:4px 0!important;transition:all 0.6s ease!important}
.inkwash-char-scroll .stat-card:hover{border-color:var(--cinnabar)!important}
.inkwash-char-scroll .stat-label{color:var(--ink-mid)!important;font-family:'Noto Serif SC',serif!important;font-size:0.8rem!important;letter-spacing:0.1em!important}
.inkwash-char-scroll .stat-value{color:var(--ink-deep)!important;font-family:'Noto Serif SC',serif!important;font-size:1rem!important}
.inkwash-mt-styled .mingtu-node.unlocked,.inkwash-mt-styled .mingtu-node.maxed{border-color:var(--cinnabar)!important;background:var(--paper-warm)!important}
.inkwash-mt-styled .mingtu-node.locked{opacity:0.5!important}
.inkwash-mt-styled .mingtu-name{color:var(--ink-deep)!important;font-size:12px!important;letter-spacing:0.1em!important}
.inkwash-mt-styled .mingtu-level{color:var(--cinnabar)!important;font-size:10px!important}
.inkwash-mt-styled .mingtu-desc{color:var(--ink-mid)!important;font-size:11px!important}
.mingtu-tabs button{border:1px solid var(--ink-light)!important;background:var(--paper)!important;color:var(--ink-mid)!important;padding:4px 12px!important;cursor:pointer!important;letter-spacing:2px!important;font-size:12px!important}
.mingtu-tabs button.gold{border-color:var(--cinnabar)!important;color:var(--cinnabar)!important;background:var(--paper-warm)!important}`,

  cyber: `:root {
  --bg: #03030a !important; --bg2: #070718 !important; --bg3: #0c0c28 !important;
  --bg4: #11113a !important; --border: #1a1a4a !important;
  --text: #c4d0e0 !important; --text2: #4a5a7a !important;
  --gold: #00f0ff !important; --gold2: #0090ff !important;
  --accent: #ff00aa !important; --red: #ff0044 !important; --green: #00ff88 !important;
  --radius: 2px !important;
}
body { font-family: 'Rajdhani','Noto Sans SC',sans-serif !important; }
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
.btn-primary { background: linear-gradient(135deg, #ff00aa, #00f0ff) !important; border: none !important; color: #000 !important; font-weight: 700 !important; text-transform: uppercase !important; }
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

  luxe: `:root {
  --bg: #0d0b08 !important; --bg2: #1a1612 !important; --bg3: #28221c !important;
  --bg4: #3a322a !important; --border: #4a3f35 !important;
  --text: #e8ddd0 !important; --text2: #a09080 !important;
  --gold: #d4a844 !important; --gold2: #b8860b !important;
  --accent: #c0c0c0 !important; --red: #c04040 !important; --green: #40a060 !important;
  --radius: 4px !important;
}
body { font-family: 'Playfair Display','Noto Serif SC',serif !important; }
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
.btn-primary { background: linear-gradient(135deg, #d4a844, #b8860b) !important; border: none !important; color: #000 !important; box-shadow: 0 2px 12px rgba(212,168,68,0.2) !important; }
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

  magazine: `:root {
  --bg: #f8f6f2 !important; --bg2: #f0ece6 !important; --bg3: #e8e2da !important;
  --bg4: #ddd6cc !important; --border: #d0c8bc !important;
  --text: #2a2520 !important; --text2: #8a8078 !important;
  --gold: #c49a6c !important; --gold2: #a07850 !important;
  --accent: #6a7a8a !important; --red: #b04a3a !important; --green: #5a8a5a !important;
  --radius: 0 !important;
}
body { font-family: 'Noto Serif SC','Georgia',serif !important; }
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
.btn-primary { background: #2a2520 !important; border: none !important; color: #fff !important; letter-spacing: 2px !important; text-transform: uppercase !important; font-size: 11px !important; padding: 10px 24px !important; }
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

  wabi: `:root{--bg:#F5F0E8!important;--bg2:#EDE4D8!important;--bg3:#E0D5C8!important;--bg4:#D4C8B8!important;--border:rgba(44,44,44,0.12)!important;--text:#2C2C2C!important;--text2:rgba(44,44,44,0.5)!important;--gold:#B7413E!important;--gold2:#8A3028!important;--accent:#6B8E6B!important;--red:#B7413E!important;--green:#5A7A4A!important;--radius:0!important;--shadow:0 1px 0 rgba(44,44,44,0.06)!important}
body{font-family:'Noto Serif JP','STSong','Yu Mincho',serif!important;color:#2C2C2C!important;font-weight:300!important}
.view-login{background:linear-gradient(170deg,#f5f0e8,#ede4d8)!important}
.login-card{background:rgba(245,240,232,0.95)!important;border:1px solid rgba(44,44,44,0.12)!important}
.game-title{font-family:'Noto Serif JP',serif!important;font-size:28px!important;color:#2C2C2C!important;letter-spacing:8px!important;font-weight:300!important}
.game-header{background:#ede4d8!important;border-bottom:1px solid rgba(44,44,44,0.10)!important;position:relative!important}
.game-header::before{content:''!important;position:absolute!important;top:0!important;left:12px!important;right:12px!important;height:1px!important;background:rgba(44,44,44,0.08)!important}
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
.btn-primary{background:#2C2C2C!important;border:none!important;color:#f0e8dc!important;border-radius:0!important}
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

  minimal: `:root{--bg:#FFFFFF!important;--bg2:#F8F8F8!important;--bg3:#F0F0F0!important;--bg4:#E8E8E8!important;--border:rgba(0,0,0,0.08)!important;--text:#000000!important;--text2:rgba(0,0,0,0.55)!important;--gold:#000000!important;--gold2:#666666!important;--accent:#888888!important;--red:#000000!important;--green:#000000!important;--radius:0!important;--shadow:none!important}
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
.btn-primary{background:#000!important;border:none!important;color:#fff!important;border-radius:0!important;letter-spacing:0.02em!important;font-weight:400!important;padding:8px 20px!important}
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

  frost: `:root{--bg:#020617!important;--bg2:rgba(255,255,255,0.03)!important;--bg3:rgba(255,255,255,0.02)!important;--bg4:rgba(255,255,255,0.01)!important;--border:rgba(255,255,255,0.08)!important;--text:rgba(255,255,255,0.92)!important;--text2:rgba(255,255,255,0.48)!important;--gold:rgba(255,255,255,0.9)!important;--gold2:rgba(255,255,255,0.6)!important;--accent:rgba(255,255,255,0.5)!important;--red:rgba(255,69,58,0.8)!important;--green:rgba(52,199,89,0.8)!important;--radius:16px!important;--shadow:0 8px 32px rgba(0,0,0,0.25)!important}
body{font-family:'Inter','Noto Sans SC',-apple-system,BlinkMacSystemFont,sans-serif!important;color:rgba(255,255,255,0.92)!important;font-weight:300!important;background:#020617!important}
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

  brutal: `:root{--bg:#F0F0F0!important;--bg2:#FFFFFF!important;--bg3:#E0E0E0!important;--bg4:#D0D0D0!important;--border:#0A0A0A!important;--text:#0A0A0A!important;--text2:#444444!important;--gold:#FF3300!important;--gold2:#CC2200!important;--accent:#0044FF!important;--red:#FF0000!important;--green:#00CC00!important;--radius:0!important;--shadow:4px 4px 0 #0A0A0A!important}
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
};

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const key = params.key;
  if (!key) return json({ error: 'Missing skin key' }, 400);

  const skin = await env.DB.prepare(
    'SELECT id, name, key, css_url FROM skins WHERE key = ? AND is_active = 1'
  ).bind(key).first();

  if (!skin) return json({ error: 'Skin not found' }, 404);

  const css = SKIN_CSS[key];
  if (!css) return json({ error: 'CSS not available' }, 404);

  return new Response(css, {
    status: 200,
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
