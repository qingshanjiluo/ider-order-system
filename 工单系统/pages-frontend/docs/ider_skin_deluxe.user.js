// ==UserScript==
// @name         艾德尔修仙传 - 豪华皮肤系统 Deluxe
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  全功能皮肤系统：水墨/侘寂/极简/玻璃/粗野/奢华/杂志 + JS布局引擎
// @author       Ider
// @match        https://idlexiuxianzhuan.cn/*
// @match        http://idlexiuxianzhuan.cn/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function() {
'use strict';

/* ═══════════════════════════════════════
   皮肤引擎
   ═══════════════════════════════════════ */
const SKIN_KEY = 'ider_skin_deluxe_v1';
const CONFIG_KEY = 'ider_skin_deluxe_cfg';
let _activeSkin = '';
let _styleEl = null;
let _observer = null;
let _observerTarget = null;

/* ═══════════════════════════════════════
   内嵌 CSS 变量覆盖（短小精悍）
   ═══════════════════════════════════════ */
const FALLBACK_CSS = {
  ink: `:root{--paper:#F5F0E6;--paper-warm:#F0EBE0;--ink-deep:#1a1a1a;--ink-mid:rgba(26,26,26,0.55);--ink-light:rgba(26,26,26,0.18);--ink-faint:rgba(26,26,26,0.06);--ink-ghost:rgba(26,26,26,0.025);--cinnabar:#C43A2B;--cinnabar-soft:rgba(196,58,43,0.85);--cinnabar-faint:rgba(196,58,43,0.08);--gold-seal:#8B7355;--bg:var(--paper)!important;--bg2:var(--paper-warm)!important;--bg3:#E8E0D0!important;--bg4:#DDD4C0!important;--border:var(--ink-light)!important;--text:var(--ink-deep)!important;--text2:var(--ink-mid)!important;--gold:var(--cinnabar)!important;--gold2:#8B2818!important;--accent:var(--gold-seal)!important;--red:var(--cinnabar)!important;--green:#5A7A3A!important;--radius:4px!important;--shadow:none!important}
@keyframes inkwashIn{0%{opacity:0;clip-path:inset(0 50% 0 50%)}60%{clip-path:inset(0 0 0 0)}100%{opacity:1}}
@keyframes inkSpread{from{background-size:0% 100%}to{background-size:100% 100%}}
@keyframes inkPour{0%{background-position:100% 0}100%{background-position:0% 0}}
@keyframes mistDrift{0%,100%{transform:translateX(0)}50%{transform:translateX(15%)}}
@keyframes inkFloat{0%,100%{transform:translateY(0) scale(1);opacity:0.03}50%{transform:translateY(-6px) scale(1.1);opacity:0.06}}
@keyframes inkHoverLine{from{transform:scaleY(0)}to{transform:scaleY(1)}}
body{font-family:'Noto Serif SC','STKaiti','KaiTi','FangSong',serif!important;background:var(--paper)!important;letter-spacing:0.04em!important}
body::before{content:''!important;position:fixed!important;inset:0!important;z-index:-3!important;pointer-events:none!important;background-image:repeating-linear-gradient(90deg,transparent,transparent 60px,rgba(60,50,30,0.008) 60px,rgba(60,50,30,0.008) 61px),repeating-linear-gradient(0deg,transparent,transparent 60px,rgba(60,50,30,0.008) 60px,rgba(60,50,30,0.008) 61px)!important}
/* 淡墨远山 */ .ider-ink-mountains{position:fixed!important;bottom:0!important;left:0!important;right:0!important;height:40vh!important;z-index:-2!important;pointer-events:none!important;opacity:0.04!important}
/* 云雾 */ .ider-ink-mist{position:fixed!important;inset:0!important;z-index:-2!important;pointer-events:none!important;overflow:hidden!important}
.ider-ink-mist::before,.ider-ink-mist::after{content:''!important;position:absolute!important;inset:-50%!important;background:radial-gradient(ellipse at 30% 70%,rgba(200,190,180,0.15),transparent 50%)!important;filter:blur(40px)!important;animation:mistDrift 25s ease-in-out infinite!important}
.ider-ink-mist::after{animation-delay:-12s!important;opacity:0.6!important;background:radial-gradient(ellipse at 70% 30%,rgba(200,190,180,0.1),transparent 50%)!important}
/* 墨角 */ .ider-ink-corner{position:fixed!important;width:120px!important;height:120px!important;z-index:-2!important;pointer-events:none!important;border-radius:50%!important;filter:blur(30px)!important;background:radial-gradient(circle,rgba(26,26,26,0.04),transparent 70%)!important}
.ider-ink-corner.tl{top:-30px!important;left:-30px!important}
.ider-ink-corner.br{bottom:-30px!important;right:-30px!important}
/* 墨点 */ .ider-ink-splash{position:fixed!important;border-radius:50%!important;z-index:-2!important;pointer-events:none!important;background:var(--ink-deep)!important;animation:inkFloat 8s ease-in-out infinite!important}
/* 飞鸟 */ .ider-ink-birds{position:fixed!important;bottom:30vh!important;left:0!important;right:0!important;z-index:-2!important;pointer-events:none!important;opacity:0.06!important;height:40px!important}
/* Header */ .game-header{display:flex!important;flex-direction:column!important;align-items:center!important;padding:24px 0 16px!important;background:transparent!important;border:none!important;position:relative!important}
.inkwash-header-line{position:absolute!important;top:8px!important;left:50%!important;margin-left:-1px!important;width:2px!important;height:28px!important;background:var(--ink-deep)!important;opacity:0.12!important;pointer-events:none!important}
.inkwash-seal{width:90px!important;height:90px!important;border:2px solid var(--cinnabar)!important;display:flex!important;align-items:center!important;justify-content:center!important;transform:rotate(-4deg)!important;background:radial-gradient(circle at 30% 30%,var(--cinnabar-faint) 0%,transparent 60%)!important;box-shadow:inset 0 0 30px var(--cinnabar-faint),0 0 0 1px rgba(196,58,43,0.08)!important;transition:transform 0.8s ease!important}
.inkwash-seal:hover{transform:rotate(-2deg) scale(1.02)!important}
.inkwash-seal-text{color:var(--cinnabar)!important;font-family:'Ma Shan Zheng','STKaiti',serif!important;font-size:22px!important;letter-spacing:4px!important;opacity:0.85!important}
.inkwash-realm{font-family:'Noto Serif SC','STKaiti',serif!important;font-weight:200!important;letter-spacing:0.3em!important;font-size:0.75rem!important;color:var(--ink-mid)!important;margin-top:8px!important}
.inkwash-divider{width:60%!important;height:1px!important;background:var(--ink-deep)!important;opacity:0.1!important;margin:10px auto!important}
.inkwash-resources{display:flex!important;gap:16px!important;color:var(--ink-mid)!important;font-size:0.85rem!important;font-family:'Noto Serif SC',serif!important;letter-spacing:0.1em!important;margin:4px 0!important}
.inkwash-actions{display:flex!important;gap:8px!important;margin-top:6px!important}
.inkwash-actions button{background:none!important;border:none!important;cursor:pointer!important;padding:6px!important;width:30px!important;height:30px!important;color:var(--ink-mid)!important;transition:color 0.3s!important}
.inkwash-actions button:hover{color:var(--cinnabar)!important}
/* 导航 */ .inkwash-nav{position:fixed!important;left:0!important;top:50%!important;transform:translateY(-50%)!important;z-index:40!important;display:flex!important;flex-direction:column!important;gap:2px!important;padding:8px!important;animation:inkwashIn 1.2s ease!important}
.inkwash-nav .tab-btn{writing-mode:vertical-rl!important;text-orientation:mixed!important;display:flex!important;flex-direction:column!important;align-items:center!important;padding:10px 6px!important;min-width:44px!important;background:transparent!important;border:none!important;color:var(--ink-mid)!important;font-family:'Noto Serif SC',serif!important;font-size:12px!important;letter-spacing:4px!important;cursor:pointer!important;position:relative!important;transition:all 0.4s ease!important}
.inkwash-nav .tab-btn .ider-nav-icon{width:16px!important;height:16px!important;margin-bottom:6px!important;opacity:0.5!important;display:block!important}
.inkwash-nav .tab-btn::after{content:''!important;position:absolute!important;left:0!important;top:10%!important;bottom:10%!important;width:2px!important;background:var(--cinnabar)!important;transform:scaleY(0)!important;transition:transform 0.4s ease!important}
.inkwash-nav .tab-btn.active{color:var(--cinnabar)!important}
.inkwash-nav .tab-btn.active::after{transform:scaleY(1)!important}
.inkwash-nav .tab-btn:hover{background:linear-gradient(90deg,transparent 50%,var(--cinnabar-faint) 100%)!important;background-size:200% 100%!important;animation:inkSpread 0.4s ease forwards!important;color:var(--ink-deep)!important}
.inkwash-nav .tab-btn+.tab-divider{width:20px!important;height:1px!important;background:var(--ink-light)!important;margin:2px auto!important}
/* 侧栏 */ .battle-sidebar{width:160px!important;padding:20px!important;background:var(--paper-warm)!important;border-left:1px solid var(--ink-light)!important;border-right:none!important;position:relative!important}
.sidebar-char-name{font-family:'Ma Shan Zheng','STKaiti',serif!important;writing-mode:vertical-rl!important;text-orientation:mixed!important;letter-spacing:6px!important;color:var(--ink-deep)!important;font-size:18px!important}
/* 墨染数值条 */ .inkwash-bar-wrapper{position:relative!important;height:8px!important;background:var(--ink-faint)!important;border:none!important;margin:6px 0!important;overflow:hidden!important}
.inkwash-bar-fill{height:100%!important;background:linear-gradient(90deg,var(--ink-deep),var(--ink-mid))!important;background-size:200% 100%!important;animation:inkPour 0.8s ease forwards!important;transition:width 0.6s cubic-bezier(0.22,1,0.36,1)!important}
.inkwash-bar-fill.low{background:linear-gradient(90deg,var(--cinnabar),var(--cinnabar-soft))!important}
/* 卡片 */ .stat-card,.skill-card,.modal-panel,.battle-status-panel,.battle-log-box{background:var(--paper)!important;border:1px solid var(--ink-light)!important;padding:16px 20px!important;position:relative!important;transition:all 0.6s ease!important;overflow:hidden!important}
.stat-card::before,.skill-card::before{content:''!important;position:absolute!important;left:0!important;top:0!important;bottom:0!important;width:2px!important;background:var(--cinnabar)!important;transform:scaleY(0)!important;transition:transform 0.4s ease!important;transform-origin:center!important}
.stat-card:hover::before,.skill-card:hover::before{transform:scaleY(1)!important}
/* 对战页 */ .battle-status-panel{display:grid!important;grid-template-columns:1fr 1fr!important;gap:20px!important}
.inkwash-battle-log{font-family:'Noto Serif SC',serif!important;font-size:0.85rem!important;color:var(--ink-mid)!important;line-height:1.8!important;letter-spacing:0.06em!important;border-left:1px solid var(--ink-light)!important;padding-left:12px!important;margin-top:12px!important}
.hp-bar,.mp-bar,.exp-bar,.sr-bar,.bar-track{height:8px!important;background:var(--ink-faint)!important;border:none!important;border-radius:0!important;overflow:hidden!important}
.hp-bar-fill,.hp-bar-red{background:linear-gradient(90deg,var(--ink-deep),var(--ink-mid))!important}
.hp-bar-fill.low,.hp-bar-red.low{background:linear-gradient(90deg,var(--cinnabar),var(--cinnabar-soft))!important}
.mp-bar-fill,.mp-bar-blue{background:linear-gradient(90deg,var(--ink-mid),var(--ink-light))!important}
.exp-fill{background:var(--ink-deep)!important}
/* 弹窗 */ .modal-overlay{background:rgba(245,240,230,0.88)!important}
.modal-panel{border-radius:8px!important;border:1px solid var(--ink-light)!important;box-shadow:0 4px 24px rgba(26,26,26,0.06)!important}
.modal-title{border-bottom:1px solid var(--cinnabar)!important;color:var(--cinnabar)!important;font-family:'Noto Serif SC',serif!important;letter-spacing:4px!important;padding-bottom:8px!important}
/* 命途纵卷 */ .inkwash-realm-card{background:var(--paper)!important;border:1px solid var(--ink-light)!important;padding:20px 24px!important;position:relative!important;margin:8px 0!important;transition:all 0.6s ease!important}
.inkwash-realm-card::before{content:''!important;position:absolute!important;left:0!important;top:8px!important;bottom:8px!important;width:1px!important;background:var(--ink-deep)!important;opacity:0.08!important}
.inkwash-realm-card.locked{opacity:0.4!important;background:repeating-linear-gradient(45deg,transparent,transparent 4px,var(--ink-ghost) 4px,var(--ink-ghost) 8px)!important}
.inkwash-realm-card .realm-seal{position:absolute!important;top:-6px!important;left:-6px!important;width:24px!important;height:24px!important;border:1px solid var(--cinnabar)!important;display:flex!important;align-items:center!important;justify-content:center!important;font-size:9px!important;color:var(--cinnabar)!important;transform:rotate(-8deg)!important;background:var(--paper)!important}
/* 命途卡分隔 */ .inkwash-realm-card+.inkwash-realm-card{border-top:none!important}
.inkwash-realm-card+.inkwash-realm-card::after{content:'╻'!important;position:absolute!important;top:-10px!important;left:20px!important;color:var(--ink-light)!important;font-size:10px!important}
/* 滚动条 */ ::-webkit-scrollbar{width:4px!important}
::-webkit-scrollbar-thumb{background:var(--ink-light)!important;border-radius:2px!important}
::-webkit-scrollbar-track{background:var(--paper)!important}
/* 面板入场 */ .panel{animation:inkwashIn 0.6s ease!important}
/* 印章奖样式 */ .inkwash-trophy{color:var(--cinnabar)!important;font-family:'Ma Shan Zheng',serif!important}
/* 通用墨色 */ .hdr-name{font-family:'Ma Shan Zheng','STKaiti',serif!important;letter-spacing:4px!important;color:var(--ink-deep)!important}
.realm-badge{background:var(--paper-warm)!important;border:1px solid var(--ink-light)!important;color:var(--cinnabar)!important;letter-spacing:0.15em!important}
.game-title{font-family:'Ma Shan Zheng','STKaiti',serif!important;letter-spacing:12px!important;color:var(--ink-deep)!important;font-weight:400!important}
.sub-tab button,.sub-tab-item{border-bottom:1px solid var(--ink-faint)!important;color:var(--ink-mid)!important;letter-spacing:1px!important;font-size:12px!important}
.sub-tab button.active{color:var(--cinnabar)!important;border-bottom:2px solid var(--cinnabar)!important}
input,select,textarea{background:var(--paper)!important;border-color:var(--ink-light)!important;color:var(--ink-deep)!important;border-radius:4px!important}
input:focus{border-color:var(--ink-deep)!important}
.btn-action{background:var(--paper-warm)!important;border:1px solid var(--ink-light)!important;color:var(--ink-deep)!important;border-radius:4px!important}
.btn-action.gold{background:var(--cinnabar)!important;border-color:#8B2818!important;color:#fff!important}
.btn-primary{background:var(--ink-deep)!important;border:none!important;color:var(--paper)!important;border-radius:4px!important}
.equip-slot,.opt-item,.inv-slot{background:var(--paper)!important;border:1px solid var(--ink-light)!important;border-radius:4px!important}
.inv-slot.occupied:hover{border-color:var(--cinnabar)!important}
.map-card{background:var(--paper)!important;border:1px solid var(--ink-light)!important;border-radius:4px!important}
.map-card.active{border-color:var(--cinnabar)!important;background:var(--paper-warm)!important}
.toast{background:rgba(250,246,240,0.95)!important;border:1px solid var(--ink-deep)!important;color:var(--ink-deep)!important;border-radius:4px!important}
.skill-card.equipped{border-left:3px solid var(--cinnabar)!important;background:var(--paper-warm)!important}
.section-title{color:var(--cinnabar)!important;border-bottom:1px solid var(--ink-light)!important;letter-spacing:4px!important;padding-bottom:8px!important}
/* 命途纵卷 */ .inkwash-char-scroll .stat-card{background:var(--paper)!important;border:1px solid var(--ink-light)!important;padding:16px 20px!important;position:relative!important;margin:4px 0!important;transition:all 0.6s ease!important}
.inkwash-char-scroll .stat-card:hover{border-color:var(--cinnabar)!important}
.inkwash-char-scroll .stat-label{color:var(--ink-mid)!important;font-family:'Noto Serif SC',serif!important;font-size:0.8rem!important;letter-spacing:0.1em!important}
.inkwash-char-scroll .stat-value{color:var(--ink-deep)!important;font-family:'Noto Serif SC',serif!important;font-size:1rem!important}
.inkwash-mt-styled .mingtu-node.unlocked,.inkwash-mt-styled .mingtu-node.maxed{border-color:var(--cinnabar)!important;background:var(--paper-warm)!important}
.inkwash-mt-styled .mingtu-node.locked{opacity:0.5!important}
.inkwash-mt-styled .mingtu-name{color:var(--ink-deep)!important;font-family:'Noto Serif SC',serif!important;font-size:12px!important;letter-spacing:0.1em!important}
.inkwash-mt-styled .mingtu-level{color:var(--cinnabar)!important;font-size:10px!important}
.inkwash-mt-styled .mingtu-desc{color:var(--ink-mid)!important;font-size:11px!important}
.mingtu-tabs button{border:1px solid var(--ink-light)!important;background:var(--paper)!important;color:var(--ink-mid)!important;padding:4px 12px!important;cursor:pointer!important;letter-spacing:2px!important;font-size:12px!important}
.mingtu-tabs button.gold{border-color:var(--cinnabar)!important;color:var(--cinnabar)!important;background:var(--paper-warm)!important}`,
  wabi: `:root{--bg:#F5F0E8!important;--bg2:#EDE4D8!important;--bg3:#E0D5C8!important;--bg4:#D4C8B8!important;--border:rgba(44,44,44,0.12)!important;--text:#2C2C2C!important;--text2:rgba(44,44,44,0.5)!important;--gold:#B7413E!important;--gold2:#8A3028!important;--accent:#6B8E6B!important;--red:#B7413E!important;--green:#5A7A4A!important;--radius:0!important;--shadow:0 1px 0 rgba(44,44,44,0.06)!important}body{font-family:'Noto Serif JP','STSong','Yu Mincho','游明朝',serif!important;font-weight:300!important}
@keyframes wabiFade{0%{opacity:0}100%{opacity:1}}@keyframes ensoDraw{0%{stroke-dashoffset:314}100%{stroke-dashoffset:0}}@keyframes sumiSpread{from{width:0}to{width:100%}}body::after{content:''!important;position:fixed!important;inset:0!important;z-index:-3!important;pointer-events:none!important;background-image:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(180,160,140,0.02) 2px,rgba(180,160,140,0.02) 3px)!important}.ider-wabi-enso{position:fixed!important;top:10px!important;right:20px!important;width:80px!important;height:80px!important;z-index:-1!important;pointer-events:none!important;opacity:0.07!important;animation:wabiFade 2s ease!important}.ider-wabi-branch{position:fixed!important;top:60px!important;left:0!important;width:120px!important;height:200px!important;z-index:-2!important;pointer-events:none!important;opacity:0.04!important}.ider-wabi-kintsugi{background:linear-gradient(135deg,transparent 30%,rgba(183,65,62,0.08) 30%,rgba(183,65,62,0.08) 32%,transparent 32%)!important}.wabi-card-line{position:absolute!important;left:0!important;top:0!important;bottom:0!important;width:1px!important;background:rgba(44,44,44,0.08)!important;transform:scaleY(0)!important;transition:transform 0.8s ease!important}.stat-card:hover .wabi-card-line,.skill-card:hover .wabi-card-line{transform:scaleY(1)!important}.wabi-sumi-line{position:absolute!important;bottom:-1px!important;left:10%!important;width:0!important;height:1px!important;background:rgba(44,44,44,0.15)!important;transition:width 0.6s ease!important}.stat-card:hover .wabi-sumi-line,.skill-card:hover .wabi-sumi-line{width:80%!important}.wabi-vert-text{writing-mode:vertical-rl!important;text-orientation:upright!important;letter-spacing:6px!important;color:var(--text2)!important}.ider-wabi-kare{position:fixed!important;bottom:0!important;right:0!important;width:300px!important;height:100px!important;z-index:-2!important;pointer-events:none!important;opacity:0.015!important;background:repeating-linear-gradient(0deg,transparent,transparent 6px,rgba(140,120,100,0.3) 6px,rgba(140,120,100,0.3) 7px)!important;mask-image:radial-gradient(ellipse 120% 80% at 100% 100%,#000,transparent)!important;-webkit-mask-image:radial-gradient(ellipse 120% 80% at 100% 100%,#000,transparent)!important;overflow:hidden!important}
.stat-card,.skill-card,.modal-panel,.battle-status-panel,.battle-log-box{background:var(--bg2)!important;border:1px solid var(--border)!important;transition:background 0.4s ease!important}.stat-card:hover,.skill-card:hover{background:var(--bg3)!important}.modal-overlay{background:rgba(240,235,225,0.85)!important}.modal-panel{background:var(--bg)!important}.modal-title{color:var(--text)!important;border-bottom:1px solid var(--border)!important;font-weight:300!important}.btn-action{background:var(--bg2)!important;border:1px solid var(--border)!important}.btn-action.gold{background:var(--gold)!important;border-color:var(--gold2)!important;color:var(--bg)!important}.btn-primary{background:var(--text)!important;color:var(--bg)!important;border:none!important}.toast{background:rgba(245,240,232,0.95)!important;border:1px solid var(--border)!important;color:var(--text)!important}.section-title{color:var(--text)!important;border-bottom:1px solid var(--border)!important;letter-spacing:0.15em!important;font-weight:300!important}.game-title{font-weight:300!important;letter-spacing:0.3em!important}.hdr-name{font-weight:300!important}.tab-btn{letter-spacing:0.2em!important;color:var(--text2)!important;transition:opacity 0.4s!important}.tab-btn:hover{opacity:0.6!important}.tab-btn.active{color:var(--text)!important;border-bottom:1px solid var(--text)!important}.panel{animation:wabiFade 0.8s ease!important}
input,select,textarea{border:1px solid var(--border)!important;background:var(--bg)!important;border-radius:0!important;padding:8px 12px!important;color:var(--text)!important}input:focus{border-color:var(--text)!important}::placeholder{color:var(--text2)!important;opacity:0.5!important}::-webkit-scrollbar{width:3px!important;height:3px!important}::-webkit-scrollbar-thumb{background:rgba(44,44,44,0.2)!important}::-webkit-scrollbar-track{background:transparent!important}`,
  minimal: `:root{--bg:#FFFFFF!important;--bg2:#F8F8F8!important;--bg3:#F0F0F0!important;--bg4:#E8E8E8!important;--border:rgba(0,0,0,0.08)!important;--text:#000000!important;--text2:rgba(0,0,0,0.55)!important;--gold:#000000!important;--gold2:#666666!important;--accent:#888888!important;--red:#000000!important;--green:#000000!important;--radius:0!important;--shadow:none!important}body{font-family:'Inter','Noto Sans SC',-apple-system,BlinkMacSystemFont,sans-serif!important;font-weight:300!important;letter-spacing:-0.01em!important}
@keyframes minFade{0%{opacity:0}100%{opacity:1}}body::after{content:''!important;position:fixed!important;inset:0!important;z-index:-1!important;pointer-events:none!important;background-image:repeating-linear-gradient(90deg,transparent 60px,rgba(0,0,0,0.015) 60px,rgba(0,0,0,0.015) 61px),repeating-linear-gradient(0deg,transparent 40px,rgba(0,0,0,0.01) 40px,rgba(0,0,0,0.01) 41px)!important}
.stat-card,.skill-card,.modal-panel,.battle-status-panel,.battle-log-box{background:var(--bg)!important;border:none!important;border-bottom:1px solid var(--border)!important;border-radius:0!important;padding:12px 0!important;margin:0!important;transition:opacity 0.2s!important}.stat-card:hover,.skill-card:hover{opacity:0.7!important;background:transparent!important}
.modal-overlay{background:rgba(248,248,248,0.92)!important}.modal-panel{background:var(--bg)!important;border:1px solid var(--border)!important;border-radius:0!important;box-shadow:none!important;padding:20px!important}.modal-title{font-weight:300!important;color:var(--text)!important;border-bottom:1px solid var(--border)!important;font-size:13px!important;letter-spacing:0.1em!important}
.btn-action{background:transparent!important;border:1px solid var(--text)!important;color:var(--text)!important;border-radius:0!important;padding:6px 16px!important;font-size:12px!important;font-weight:400!important}.btn-action:hover{background:var(--text)!important;color:var(--bg)!important}.btn-action.gold{background:var(--text)!important;color:var(--bg)!important;border-color:var(--text)!important}.btn-primary{background:var(--text)!important;color:var(--bg)!important;border-radius:0!important;border:none!important;padding:6px 16px!important}
.game-title{font-weight:200!important;letter-spacing:0.15em!important;font-size:20px!important}.hdr-name{font-weight:300!important;font-size:13px!important;letter-spacing:0!important}
.section-title{font-weight:300!important;color:var(--text)!important;border-bottom:1px solid var(--border)!important;padding-bottom:6px!important;font-size:11px!important;letter-spacing:0.15em!important;text-transform:uppercase!important}
.tab-btn{letter-spacing:0.1em!important;font-size:11px!important;color:var(--text2)!important;padding:6px 12px!important;border:none!important;background:transparent!important}.tab-btn.active{color:var(--text)!important;font-weight:400!important}.tab-btn:hover{color:var(--text)!important}
.sub-tab button,.sub-tab-item{border-bottom:1px solid var(--border)!important;color:var(--text2)!important;font-size:11px!important;letter-spacing:0!important;padding:4px 8px!important}.sub-tab button.active{color:var(--text)!important;border-bottom:1px solid var(--text)!important}
.toast{background:var(--bg)!important;border:1px solid var(--border)!important;color:var(--text)!important;border-radius:0!important;font-size:12px!important;padding:8px 20px!important}
.panel{animation:minFade 0.3s ease!important}
input,select,textarea{border:1px solid var(--border)!important;border-radius:0!important;background:var(--bg)!important;color:var(--text)!important;padding:6px 10px!important;font-size:12px!important}input:focus{border-color:var(--text)!important;outline:none!important}
.map-card{background:var(--bg)!important;border:1px solid var(--border)!important;border-radius:0!important}.map-card.active{border-color:var(--text)!important}
.inv-slot{background:var(--bg)!important;border:1px solid var(--border)!important;border-radius:0!important}.inv-slot.occupied:hover{border-color:var(--text)!important}
.equip-slot,.opt-item{background:var(--bg)!important;border:1px solid var(--border)!important;border-radius:0!important}
.skill-card.equipped{border-left:2px solid var(--text)!important}
.realm-badge{background:var(--bg)!important;border:1px solid var(--border)!important;color:var(--text)!important}
.hp-bar,.mp-bar,.exp-bar,.sr-bar,.bar-track{height:2px!important;background:var(--border)!important;border:none!important;border-radius:0!important;overflow:hidden!important;margin:4px 0!important}.bar-fill,.hp-bar-fill,.hp-bar-red,.hp-bar-green{background:var(--text)!important;height:100%!important}.mp-bar-blue{background:var(--text2)!important}
::-webkit-scrollbar{width:1px!important;height:1px!important}::-webkit-scrollbar-thumb{background:rgba(0,0,0,0.2)!important}::-webkit-scrollbar-track{background:transparent!important}.btn-icon{opacity:0.4!important;transition:opacity 0.2s!important}.btn-icon:hover{opacity:1!important}.hdr-info,.hdr-res{color:var(--text2)!important;font-size:11px!important}`,
  frost: `:root{--bg:#020617!important;--bg2:rgba(255,255,255,0.03)!important;--bg3:rgba(255,255,255,0.02)!important;--bg4:rgba(255,255,255,0.01)!important;--border:rgba(255,255,255,0.08)!important;--text:rgba(255,255,255,0.92)!important;--text2:rgba(255,255,255,0.48)!important;--gold:rgba(255,255,255,0.9)!important;--gold2:rgba(255,255,255,0.6)!important;--accent:rgba(255,255,255,0.5)!important;--red:rgba(255,69,58,0.8)!important;--green:rgba(52,199,89,0.8)!important;--radius:16px!important;--shadow:0 8px 32px rgba(0,0,0,0.25)!important}body{font-family:'Inter','Noto Sans SC',-apple-system,BlinkMacSystemFont,sans-serif!important;font-weight:300!important}
@keyframes frostBg{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}@keyframes frostPulse{0%,100%{opacity:0.3}50%{opacity:0.7}}@keyframes frostShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}body::after{content:''!important;position:fixed!important;inset:0!important;z-index:-3!important;pointer-events:none!important;background:linear-gradient(160deg,#020617,#0a1628,#020d1a)!important;animation:frostBg 20s ease infinite!important;background-size:400% 400%!important}
.stat-card,.skill-card,.modal-panel,.battle-status-panel,.battle-log-box{background:rgba(255,255,255,0.04)!important;backdrop-filter:blur(12px)!important;-webkit-backdrop-filter:blur(12px)!important;border:1px solid rgba(255,255,255,0.06)!important;border-radius:16px!important;box-shadow:0 8px 32px rgba(0,0,0,0.2),inset 0 1px 0 rgba(255,255,255,0.05)!important;transition:all 0.3s ease!important;position:relative!important;overflow:hidden!important}.stat-card::before,.skill-card::before{content:''!important;position:absolute!important;inset:0!important;border-radius:inherit!important;background:linear-gradient(135deg,transparent 60%,rgba(255,255,255,0.03) 100%)!important;pointer-events:none!important}.stat-card:hover,.skill-card:hover{background:rgba(255,255,255,0.07)!important;transform:translateY(-1px)!important;box-shadow:0 12px 40px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.08)!important}
.modal-overlay{background:rgba(2,6,23,0.7)!important;backdrop-filter:blur(8px)!important;-webkit-backdrop-filter:blur(8px)!important}.modal-panel{background:rgba(2,6,23,0.85)!important;backdrop-filter:blur(20px)!important;-webkit-backdrop-filter:blur(20px)!important;border:1px solid rgba(255,255,255,0.08)!important;border-radius:20px!important;box-shadow:0 24px 80px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.06)!important}.modal-title{color:var(--text)!important;border-bottom:1px solid rgba(255,255,255,0.08)!important;font-weight:300!important;letter-spacing:0.15em!important}
.btn-action{background:rgba(255,255,255,0.06)!important;backdrop-filter:blur(8px)!important;border:1px solid rgba(255,255,255,0.08)!important;color:var(--text)!important;border-radius:12px!important;transition:all 0.3s!important}.btn-action:hover{background:rgba(255,255,255,0.1)!important}.btn-action.gold{background:rgba(255,255,255,0.12)!important;border-color:rgba(255,255,255,0.15)!important}.btn-primary{background:rgba(255,255,255,0.1)!important;backdrop-filter:blur(8px)!important;border:1px solid rgba(255,255,255,0.1)!important;color:var(--text)!important;border-radius:12px!important}
.game-title{font-weight:200!important;letter-spacing:0.2em!important;color:var(--text)!important}.hdr-name{font-weight:300!important;color:var(--text)!important;letter-spacing:0.1em!important}.hdr-info,.hdr-res{color:var(--text2)!important}
.section-title{color:var(--text)!important;border-bottom:1px solid rgba(255,255,255,0.06)!important;font-weight:300!important;letter-spacing:0.2em!important;font-size:11px!important;text-transform:uppercase!important}
.tab-btn{letter-spacing:0.15em!important;font-size:12px!important;color:var(--text2)!important;padding:8px 16px!important;border:none!important;background:transparent!important;border-radius:10px!important;transition:all 0.3s!important}.tab-btn.active{background:rgba(255,255,255,0.06)!important;backdrop-filter:blur(8px)!important;color:var(--text)!important}.tab-btn:hover{background:rgba(255,255,255,0.04)!important;color:var(--text)!important}
.toast{background:rgba(2,6,23,0.9)!important;backdrop-filter:blur(12px)!important;border:1px solid rgba(255,255,255,0.1)!important;color:var(--text)!important;border-radius:12px!important;box-shadow:0 8px 32px rgba(0,0,0,0.3)!important}
.map-card{background:rgba(255,255,255,0.04)!important;backdrop-filter:blur(8px)!important;border:1px solid rgba(255,255,255,0.06)!important;border-radius:12px!important;transition:all 0.3s!important}.map-card.active{background:rgba(255,255,255,0.08)!important;border-color:rgba(255,255,255,0.15)!important}
.inv-slot{background:rgba(255,255,255,0.04)!important;backdrop-filter:blur(8px)!important;border:1px solid rgba(255,255,255,0.06)!important;border-radius:12px!important}.inv-slot.occupied:hover{border-color:rgba(255,255,255,0.2)!important}
.equip-slot,.opt-item{background:rgba(255,255,255,0.04)!important;backdrop-filter:blur(8px)!important;border:1px solid rgba(255,255,255,0.06)!important;border-radius:12px!important}
.skill-card.equipped{border-left:3px solid rgba(255,255,255,0.3)!important;background:rgba(255,255,255,0.06)!important}
.realm-badge{background:rgba(255,255,255,0.06)!important;backdrop-filter:blur(8px)!important;border:1px solid rgba(255,255,255,0.08)!important;color:var(--text)!important;border-radius:10px!important}
.hp-bar-fill,.hp-bar-red{background:linear-gradient(90deg,rgba(255,255,255,0.6),rgba(255,255,255,0.3))!important;border-radius:4px!important;height:100%!important}.hp-bar-fill.low,.hp-bar-red.low{background:linear-gradient(90deg,rgba(255,69,58,0.8),rgba(255,69,58,0.4))!important}.mp-bar-fill,.mp-bar-blue{background:linear-gradient(90deg,rgba(255,255,255,0.3),rgba(255,255,255,0.15))!important;border-radius:4px!important}
.exp-bar,.sr-bar,.bar-track{height:4px!important;background:rgba(255,255,255,0.04)!important;border-radius:4px!important;overflow:hidden!important;border:none!important;margin:6px 0!important}.bar-fill,.exp-fill,.sr-fill{background:linear-gradient(90deg,rgba(255,255,255,0.5),rgba(255,255,255,0.2))!important;border-radius:4px!important;height:100%!important}
.sub-tab button,.sub-tab-item{border-bottom:1px solid rgba(255,255,255,0.06)!important;color:var(--text2)!important;font-size:11px!important;letter-spacing:0.05em!important;padding:6px 12px!important;border-radius:8px 8px 0 0!important}.sub-tab button.active{color:var(--text)!important;border-bottom:2px solid var(--text)!important;background:rgba(255,255,255,0.04)!important}
.game-header{border-bottom:1px solid rgba(255,255,255,0.04)!important;background:rgba(2,6,23,0.5)!important;backdrop-filter:blur(12px)!important}
.battle-sidebar{background:rgba(255,255,255,0.03)!important;border-left:1px solid rgba(255,255,255,0.04)!important}.sidebar-char-name{color:var(--text)!important;font-weight:300!important;letter-spacing:0.15em!important}
input,select,textarea{background:rgba(255,255,255,0.04)!important;backdrop-filter:blur(8px)!important;border:1px solid rgba(255,255,255,0.08)!important;border-radius:10px!important;color:var(--text)!important;padding:8px 14px!important}input:focus{border-color:rgba(255,255,255,0.2)!important;outline:none!important}::placeholder{color:var(--text2)!important}
::-webkit-scrollbar{width:4px!important;height:4px!important}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1)!important;border-radius:4px!important}::-webkit-scrollbar-track{background:transparent!important}.panel{animation:wabiFade 0.6s ease!important}.btn-icon{transition:all 0.3s!important}.btn-icon:hover{background:rgba(255,255,255,0.06)!important}.battle-log-box{font-family:'Inter','Noto Sans SC',sans-serif!important;font-weight:300!important;color:var(--text2)!important;line-height:1.6!important}`,
  brutal: `:root{--bg:#F0F0F0!important;--bg2:#FFFFFF!important;--bg3:#E0E0E0!important;--bg4:#D0D0D0!important;--border:#0A0A0A!important;--text:#0A0A0A!important;--text2:#444444!important;--gold:#FF3300!important;--gold2:#CC2200!important;--accent:#0044FF!important;--red:#FF0000!important;--green:#00CC00!important;--radius:0!important;--shadow:4px 4px 0 #0A0A0A!important}body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif!important;font-weight:700!important}
@keyframes brutalReveal{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}body::after{content:''!important;position:fixed!important;inset:0!important;z-index:-3!important;pointer-events:none!important;background:repeating-linear-gradient(0deg,transparent,transparent 40px,rgba(0,0,0,0.02) 40px,rgba(0,0,0,0.02) 41px)!important}
.stat-card,.skill-card,.modal-panel,.battle-status-panel,.battle-log-box{background:var(--bg2)!important;border:3px solid var(--border)!important;border-radius:0!important;padding:16px 20px!important;transition:all 0.15s!important;box-shadow:var(--shadow)!important}.stat-card:hover,.skill-card:hover{transform:translate(-2px,-2px)!important;box-shadow:6px 6px 0 var(--border)!important}
.modal-overlay{background:rgba(0,0,0,0.6)!important}.modal-panel{background:var(--bg2)!important;border:3px solid var(--border)!important;border-radius:0!important;box-shadow:8px 8px 0 var(--border)!important;padding:24px!important}.modal-title{color:var(--text)!important;font-size:18px!important;font-weight:900!important;text-transform:uppercase!important;border-bottom:3px solid var(--border)!important;padding-bottom:8px!important;letter-spacing:0.05em!important}.modal-close{width:32px!important;height:32px!important;border:2px solid var(--text)!important;border-radius:0!important;background:var(--bg2)!important;color:var(--text)!important;font-weight:900!important}
.btn-action{background:var(--bg2)!important;border:2px solid var(--border)!important;color:var(--text)!important;border-radius:0!important;font-weight:700!important;padding:8px 20px!important;box-shadow:2px 2px 0 var(--border)!important;transition:all 0.1s!important}.btn-action:hover{transform:translate(-1px,-1px)!important;box-shadow:3px 3px 0 var(--border)!important}.btn-action.gold{background:var(--gold)!important;color:var(--bg)!important;border-color:var(--gold2)!important;box-shadow:2px 2px 0 var(--gold2)!important}.btn-primary{background:var(--text)!important;color:var(--bg)!important;border:none!important;border-radius:0!important;font-weight:700!important;padding:10px 24px!important;text-transform:uppercase!important;letter-spacing:0.1em!important}
.game-title{font-family:'Anton','Impact',sans-serif!important;font-weight:900!important;font-size:36px!important;text-transform:uppercase!important;letter-spacing:0.03em!important;color:var(--text)!important;text-shadow:none!important}
.hdr-name{font-family:'Anton','Impact',sans-serif!important;font-weight:900!important;text-transform:uppercase!important;letter-spacing:0.05em!important;font-size:20px!important;color:var(--text)!important}
.section-title{font-weight:900!important;text-transform:uppercase!important;color:var(--text)!important;border-bottom:3px solid var(--border)!important;padding-bottom:4px!important;font-size:14px!important;letter-spacing:0.05em!important}
.tab-btn{font-weight:700!important;text-transform:uppercase!important;letter-spacing:0.08em!important;font-size:11px!important;color:var(--text2)!important;padding:8px 16px!important;border:2px solid transparent!important;background:transparent!important;transition:all 0.1s!important}.tab-btn.active{border:2px solid var(--border)!important;background:var(--bg2)!important;color:var(--text)!important}.tab-btn:hover{border:2px solid var(--border)!important}
.toast{background:var(--bg2)!important;border:3px solid var(--border)!important;color:var(--text)!important;border-radius:0!important;font-weight:700!important;padding:10px 24px!important;box-shadow:4px 4px 0 var(--border)!important}
.map-card{background:var(--bg2)!important;border:2px solid var(--border)!important;border-radius:0!important;transition:all 0.1s!important;box-shadow:2px 2px 0 var(--border)!important}.map-card.active{border-color:var(--gold)!important;background:var(--bg)!important}.map-card:hover{transform:translate(-1px,-1px)!important;box-shadow:3px 3px 0 var(--border)!important}
.inv-slot{background:var(--bg2)!important;border:2px solid var(--border)!important;border-radius:0!important;box-shadow:2px 2px 0 var(--border)!important}.inv-slot.occupied:hover{border-color:var(--gold)!important}
.equip-slot,.opt-item{background:var(--bg2)!important;border:2px solid var(--border)!important;border-radius:0!important}
.skill-card.equipped{border-left:6px solid var(--gold)!important}
.realm-badge{background:var(--bg2)!important;border:2px solid var(--border)!important;color:var(--text)!important;border-radius:0!important;font-weight:700!important}
.hp-bar,.mp-bar,.exp-bar,.sr-bar,.bar-track{height:8px!important;background:var(--bg)!important;border:2px solid var(--border)!important;border-radius:0!important;overflow:hidden!important;margin:6px 0!important}.bar-fill,.hp-bar-fill,.hp-bar-red{background:var(--text)!important!important;border-radius:0!important;height:100%!important}.hp-bar-fill.low,.hp-bar-red.low{background:var(--red)!important}.mp-bar-fill,.mp-bar-blue{background:var(--text2)!important}
.battle-sidebar{background:var(--bg2)!important;border-left:3px solid var(--border)!important;border-right:none!important}
.sidebar-char-name{font-family:'Anton','Impact',sans-serif!important;font-weight:900!important;text-transform:uppercase!important;letter-spacing:0.08em!important;font-size:22px!important;color:var(--text)!important;writing-mode:vertical-rl!important}
.sub-tab button,.sub-tab-item{border-bottom:2px solid var(--border)!important;color:var(--text2)!important;font-weight:700!important;font-size:11px!important;padding:6px 12px!important}.sub-tab button.active{color:var(--text)!important;border-bottom:3px solid var(--text)!important}
.game-header{border-bottom:3px solid var(--border)!important;padding:16px 20px!important}.hdr-info,.hdr-res{color:var(--text2)!important;font-weight:700!important;font-size:12px!important}
input,select,textarea{border:2px solid var(--border)!important;border-radius:0!important;background:var(--bg2)!important;color:var(--text)!important;font-weight:700!important;padding:8px 12px!important}input:focus{border-color:var(--accent)!important;outline:none!important}::placeholder{color:var(--text2)!important;font-weight:400!important}
::-webkit-scrollbar{width:6px!important;height:6px!important}::-webkit-scrollbar-thumb{background:var(--text)!important;border-radius:0!important}::-webkit-scrollbar-track{background:var(--bg)!important}.panel{animation:brutalReveal 0.3s ease!important}.btn-icon:hover{transform:scale(1.2)!important}`,
  luxe: `:root{--bg:#0D0B08!important;--bg2:#1A1612!important;--bg3:#28221C!important;--bg4:#3A322A!important;--border:#4A3F35!important;--text:#E8DDD0!important;--text2:#A09080!important;--gold:#D4A844!important;--gold2:#B8860B!important;--accent:#C0C0C0!important;--red:#C04040!important;--green:#40A060!important;--radius:4px!important;--shadow:0 4px 20px rgba(0,0,0,0.2)!important}body{font-family:'Playfair Display','Noto Serif SC',serif!important}
@keyframes luxeShimmer{0%{background-position:-400% 0}100%{background-position:400% 0}}@keyframes luxePulse{0%,100%{opacity:0.15}50%{opacity:0.35}}@keyframes luxeGlow{0%,100%{box-shadow:0 0 8px rgba(212,168,68,0.05)}50%{box-shadow:0 0 24px rgba(212,168,68,0.12)}}body::before{content:''!important;position:fixed!important;inset:0!important;z-index:-4!important;pointer-events:none!important;background:linear-gradient(180deg,rgba(212,168,68,0.02) 0%,transparent 30%,transparent 70%,rgba(212,168,68,0.02) 100%)!important}
body::after{content:''!important;position:fixed!important;inset:0!important;z-index:-3!important;pointer-events:none!important;background-image:repeating-linear-gradient(90deg,transparent,transparent 40px,rgba(212,168,68,0.008) 40px,rgba(212,168,68,0.008) 41px),repeating-linear-gradient(0deg,transparent,transparent 40px,rgba(212,168,68,0.008) 40px,rgba(212,168,68,0.008) 41px)!important}
.stat-card,.skill-card,.modal-panel,.battle-status-panel,.battle-log-box{background:linear-gradient(135deg,var(--bg2),var(--bg))!important;border:1px solid var(--border)!important;border-radius:4px!important;box-shadow:inset 0 1px 0 rgba(200,180,160,0.04),var(--shadow)!important;transition:all 0.4s ease!important;position:relative!important}.stat-card::after,.skill-card::after{content:''!important;position:absolute!important;bottom:0!important;left:10%!important;right:10%!important;height:1px!important;background:linear-gradient(90deg,transparent,rgba(212,168,68,0.15),transparent)!important;opacity:0!important;transition:opacity 0.4s!important}.stat-card:hover::after,.skill-card:hover::after{opacity:1!important}.stat-card:hover,.skill-card:hover{background:linear-gradient(135deg,var(--bg3),var(--bg2))!important;border-color:var(--gold)!important;box-shadow:inset 0 1px 0 rgba(200,180,160,0.06),0 8px 30px rgba(0,0,0,0.3),0 0 20px rgba(212,168,68,0.04)!important;transform:translateY(-1px)!important}
.modal-overlay{background:rgba(13,11,8,0.8)!important}.modal-panel{background:linear-gradient(160deg,var(--bg2),var(--bg))!important;border:1px solid var(--border)!important;border-radius:8px!important;box-shadow:0 20px 60px rgba(0,0,0,0.5),inset 0 1px 0 rgba(200,180,160,0.04)!important;position:relative!important;overflow:hidden!important}.modal-panel::before{content:''!important;position:absolute!important;top:0!important;left:10%!important;right:10%!important;height:1px!important;background:linear-gradient(90deg,transparent,rgba(212,168,68,0.2),transparent)!important}
.modal-title{color:var(--gold)!important;border-bottom:1px solid var(--border)!important;font-weight:400!important;letter-spacing:0.15em!important;font-size:15px!important;text-shadow:0 0 20px rgba(212,168,68,0.08)!important}
.btn-action{background:linear-gradient(135deg,var(--bg3),var(--bg2))!important;border:1px solid var(--border)!important;color:var(--text)!important;border-radius:4px!important;transition:all 0.3s!important}.btn-action:hover{background:linear-gradient(135deg,var(--bg4),var(--bg3))!important;border-color:var(--gold)!important;color:var(--gold)!important}.btn-action.gold{background:linear-gradient(135deg,var(--gold),var(--gold2))!important;border-color:var(--gold2)!important;color:var(--bg)!important;box-shadow:0 2px 12px rgba(212,168,68,0.15)!important}.btn-primary{background:linear-gradient(135deg,var(--gold),var(--gold2))!important;border:none!important;color:var(--bg)!important;border-radius:4px!important;box-shadow:0 2px 16px rgba(212,168,68,0.15)!important}
.game-title{font-weight:700!important;letter-spacing:0.15em!important;color:var(--gold)!important;text-shadow:0 1px 4px rgba(0,0,0,0.4),0 0 30px rgba(212,168,68,0.06)!important}
.hdr-name{font-weight:400!important;color:var(--gold)!important;letter-spacing:0.1em!important;text-shadow:0 1px 4px rgba(0,0,0,0.3)!important}.hdr-info,.hdr-res{color:var(--text2)!important;font-size:12px!important}
.luxe-corner{position:fixed!important;z-index:-2!important;pointer-events:none!important;width:60px!important;height:60px!important;opacity:0.04!important}
.luxe-corner.tl{top:8px!important;left:8px!important;border-left:1px solid var(--gold)!important;border-top:1px solid var(--gold)!important;animation:luxePulse 4s ease-in-out infinite!important}
.luxe-corner.tr{top:8px!important;right:8px!important;border-right:1px solid var(--gold)!important;border-top:1px solid var(--gold)!important;animation:luxePulse 4s ease-in-out infinite 1s!important}
.luxe-corner.bl{bottom:8px!important;left:8px!important;border-left:1px solid var(--gold)!important;border-bottom:1px solid var(--gold)!important;animation:luxePulse 4s ease-in-out infinite 2s!important}
.luxe-corner.br{bottom:8px!important;right:8px!important;border-right:1px solid var(--gold)!important;border-bottom:1px solid var(--gold)!important;animation:luxePulse 4s ease-in-out infinite 3s!important}
.section-title{color:var(--gold)!important;border-bottom:1px solid var(--border)!important;font-weight:400!important;letter-spacing:0.2em!important;font-size:12px!important;padding-bottom:8px!important}
.tab-btn{letter-spacing:0.15em!important;font-size:12px!important;color:var(--text2)!important;padding:8px 16px!important;border:none!important;background:transparent!important;transition:all 0.3s!important;position:relative!important}.tab-btn.active{color:var(--gold)!important;text-shadow:0 0 20px rgba(212,168,68,0.08)!important}.tab-btn.active::after{content:''!important;position:absolute!important;bottom:0!important;left:20%!important;right:20%!important;height:1px!important;background:linear-gradient(90deg,transparent,var(--gold),transparent)!important}.tab-btn:hover{color:var(--text)!important}
.toast{background:linear-gradient(135deg,var(--bg2),var(--bg))!important;border:1px solid var(--gold)!important;color:var(--gold)!important;border-radius:4px!important;box-shadow:0 4px 20px rgba(0,0,0,0.3)!important;padding:10px 28px!important}
.map-card{background:linear-gradient(135deg,var(--bg2),var(--bg))!important;border:1px solid var(--border)!important;border-radius:4px!important;box-shadow:inset 0 1px 0 rgba(200,180,160,0.03)!important;transition:all 0.3s!important}.map-card.active{background:linear-gradient(135deg,var(--bg3),var(--bg2))!important;border-color:var(--gold)!important;box-shadow:inset 0 1px 0 rgba(200,180,160,0.05),0 0 20px rgba(212,168,68,0.04)!important}
.inv-slot{background:var(--bg2)!important;border:1px solid var(--border)!important;border-radius:4px!important;transition:all 0.3s!important}.inv-slot.occupied:hover{background:var(--bg3)!important;border-color:var(--gold)!important}
.equip-slot,.opt-item{background:var(--bg2)!important;border:1px solid var(--border)!important;border-radius:4px!important}
.skill-card.equipped{border-left:3px solid var(--gold)!important;background:linear-gradient(135deg,var(--bg3),var(--bg2))!important}
.realm-badge{background:linear-gradient(135deg,var(--bg2),var(--bg))!important;border:1px solid var(--border)!important;color:var(--gold)!important;border-radius:4px!important;font-weight:400!important;letter-spacing:0.1em!important}
.hp-bar,.mp-bar,.exp-bar,.sr-bar,.bar-track{height:6px!important;background:var(--bg3)!important;border-radius:3px!important;border:none!important;overflow:hidden!important;margin:6px 0!important}.bar-fill,.hp-bar-fill,.hp-bar-red{background:linear-gradient(90deg,var(--gold),var(--gold2))!important;border-radius:3px!important;height:100%!important;background-size:200% 100%!important;animation:luxeShimmer 3s linear infinite!important}.hp-bar-fill.low,.hp-bar-red.low{background:linear-gradient(90deg,var(--red),#8a2020)!important}.mp-bar-fill,.mp-bar-blue{background:linear-gradient(90deg,var(--accent),rgba(192,192,192,0.5))!important}
.battle-sidebar{background:linear-gradient(180deg,var(--bg2),var(--bg))!important;border-left:1px solid var(--border)!important}.sidebar-char-name{color:var(--gold)!important;font-weight:400!important;letter-spacing:0.15em!important}
.sub-tab button,.sub-tab-item{border-bottom:1px solid var(--border)!important;color:var(--text2)!important;font-size:11px!important;padding:6px 12px!important}.sub-tab button.active{color:var(--gold)!important;border-bottom:1px solid var(--gold)!important}
.game-header{border-bottom:1px solid var(--border)!important;padding:16px 20px!important;background:linear-gradient(180deg,var(--bg2),transparent)!important}
input,select,textarea{background:var(--bg2)!important;border:1px solid var(--border)!important;border-radius:4px!important;color:var(--text)!important;padding:8px 14px!important;transition:all 0.3s!important}input:focus{border-color:var(--gold)!important;box-shadow:0 0 12px rgba(212,168,68,0.06)!important;outline:none!important}::placeholder{color:var(--text2)!important}
::-webkit-scrollbar{width:4px!important;height:4px!important}::-webkit-scrollbar-thumb{background:var(--gold)!important;border-radius:4px!important;box-shadow:0 0 8px rgba(212,168,68,0.1)!important}::-webkit-scrollbar-track{background:transparent!important}.btn-icon{transition:all 0.3s!important}.btn-icon:hover{color:var(--gold)!important;filter:drop-shadow(0 0 6px rgba(212,168,68,0.2))!important}.battle-log-box{font-family:'Noto Serif SC','Georgia',serif!important;color:var(--text2)!important;line-height:1.8!important;font-size:13px!important}`,
  magazine: `:root{--bg:#F8F6F2!important;--bg2:#F0ECE6!important;--bg3:#E8E2DA!important;--bg4:#DDD6CC!important;--border:#D0C8BC!important;--text:#2A2520!important;--text2:#8A8078!important;--gold:#C49A6C!important;--gold2:#A07850!important;--accent:#6A7A8A!important;--red:#B04A3A!important;--green:#5A8A5A!important;--radius:0!important;--shadow:0 2px 8px rgba(0,0,0,0.02)!important}body{font-family:'Noto Serif SC','Georgia',serif!important}
@keyframes magFadeIn{0%{opacity:0;transform:translateY(4px)}100%{opacity:1;transform:translateY(0)}}body::after{content:''!important;position:fixed!important;inset:0!important;z-index:-3!important;pointer-events:none!important;background:repeating-linear-gradient(90deg,transparent 0,transparent 100px,rgba(200,190,180,0.05) 100px,rgba(200,190,180,0.05) 101px)!important}
.stat-card,.skill-card,.modal-panel,.battle-status-panel,.battle-log-box{background:var(--bg)!important;border:1px solid var(--border)!important;border-radius:0!important;padding:16px 24px!important;transition:all 0.6s ease!important;position:relative!important}.stat-card::before{content:'¶'!important;position:absolute!important;top:12px!important;right:16px!important;color:var(--gold)!important;font-size:10px!important;opacity:0.15!important}.stat-card:nth-child(even),.skill-card:nth-child(even){background:var(--bg2)!important}.stat-card:hover,.skill-card:hover{background:var(--bg3)!important;border-color:var(--gold)!important}
.modal-overlay{background:rgba(200,190,180,0.5)!important}.modal-panel{background:var(--bg)!important;border:1px solid var(--border)!important;border-radius:0!important;box-shadow:0 8px 40px rgba(0,0,0,0.04)!important;padding:28px!important}.modal-title{color:var(--text)!important;font-weight:400!important;font-size:18px!important;letter-spacing:0.05em!important;border-bottom:1px solid var(--border)!important;padding-bottom:12px!important;position:relative!important}.modal-title::after{content:'✦'!important;position:absolute!important;bottom:-10px!important;left:0!important;color:var(--gold)!important;font-size:8px!important;opacity:0.3!important}
.btn-action{background:var(--bg)!important;border:1px solid var(--border)!important;color:var(--text)!important;border-radius:0!important;transition:all 0.3s!important;font-size:12px!important;letter-spacing:0.05em!important}.btn-action:hover{background:var(--border)!important;color:var(--bg)!important}.btn-action.gold{background:var(--gold)!important;color:var(--bg)!important;border-color:var(--gold2)!important}.btn-primary{background:var(--text)!important;color:var(--bg)!important;border:none!important;border-radius:0!important;letter-spacing:0.1em!important}
.game-title{font-weight:300!important;letter-spacing:0.25em!important;font-size:22px!important;color:var(--text)!important}.hdr-name{font-weight:400!important;color:var(--text)!important;letter-spacing:0.08em!important;font-size:13px!important}.hdr-info,.hdr-res{color:var(--text2)!important;font-size:11px!important}
.section-title{font-weight:400!important;color:var(--text)!important;font-family:'Noto Serif SC','Georgia',serif!important;font-size:16px!important;letter-spacing:0.15em!important;border-bottom:none!important;position:relative!important;padding-bottom:16px!important}.section-title::after{content:''!important;position:absolute!important;bottom:8px!important;left:0!important;width:40px!important;height:1px!important;background:var(--gold)!important}
.tab-btn{letter-spacing:0.15em!important;font-size:11px!important;color:var(--text2)!important;padding:8px 14px!important;border:none!important;background:transparent!important;transition:all 0.3s!important;text-transform:uppercase!important;font-weight:400!important}.tab-btn.active{color:var(--text)!important;background:var(--bg2)!important;border-bottom:2px solid var(--text)!important}.tab-btn:hover{color:var(--text)!important;background:var(--bg2)!important}
.toast{background:var(--bg2)!important;border:1px solid var(--border)!important;color:var(--text)!important;border-radius:0!important;font-size:13px!important;box-shadow:0 4px 12px rgba(0,0,0,0.02)!important}
.map-card{background:var(--bg)!important;border:1px solid var(--border)!important;border-radius:0!important;transition:all 0.3s!important}.map-card.active{background:var(--bg2)!important;border-color:var(--text)!important;border-left:3px solid var(--gold)!important}
.inv-slot{background:var(--bg)!important;border:1px solid var(--border)!important;border-radius:0!important;transition:all 0.3s!important}.inv-slot.occupied:hover{background:var(--bg2)!important;border-color:var(--text)!important}
.equip-slot,.opt-item{background:var(--bg)!important;border:1px solid var(--border)!important;border-radius:0!important}
.skill-card.equipped{border-left:3px solid var(--gold)!important;background:var(--bg2)!important}
.realm-badge{background:var(--bg)!important;border:1px solid var(--border)!important;color:var(--gold)!important;border-radius:0!important;letter-spacing:0.1em!important}
.hp-bar,.mp-bar,.exp-bar,.sr-bar,.bar-track{height:3px!important;background:var(--border)!important;border-radius:0!important;border:none!important;overflow:hidden!important;margin:5px 0!important}.bar-fill,.hp-bar-fill,.hp-bar-red{background:var(--text)!important;border-radius:0!important;height:100%!important}.mp-bar-fill,.mp-bar-blue{background:var(--text2)!important}.hp-bar-fill.low,.hp-bar-red.low{background:var(--red)!important}
.battle-sidebar{background:var(--bg)!important;border-left:1px solid var(--border)!important}.sidebar-char-name{color:var(--text)!important;font-weight:400!important;letter-spacing:0.15em!important;font-size:16px!important;writing-mode:vertical-rl!important}
.sub-tab button,.sub-tab-item{border-bottom:1px solid var(--border)!important;color:var(--text2)!important;font-size:11px!important;padding:6px 12px!important;letter-spacing:0.05em!important}.sub-tab button.active{color:var(--text)!important;border-bottom:1px solid var(--text)!important}
.game-header{border-bottom:0.5px solid var(--border)!important;padding:16px 20px!important}.mag-dash{color:var(--gold)!important;opacity:0.3!important;padding:0 8px!important}
input,select,textarea{background:var(--bg)!important;border:1px solid var(--border)!important;border-radius:0!important;color:var(--text)!important;padding:8px 14px!important;font-size:13px!important}input:focus{border-color:var(--text)!important;outline:none!important}::placeholder{color:var(--text2)!important}
::-webkit-scrollbar{width:3px!important;height:3px!important}::-webkit-scrollbar-thumb{background:var(--border)!important}::-webkit-scrollbar-track{background:transparent!important}.btn-icon{transition:all 0.3s!important}.btn-icon:hover{color:var(--text)!important}.battle-log-box{font-family:'Noto Serif SC','Georgia',serif!important;color:var(--text2)!important;line-height:1.9!important;font-size:13px!important}.panel{animation:magFadeIn 0.5s ease!important}.stat-card:first-child::before,.map-card:first-child::before{content:'❧'!important;position:absolute!important;top:8px!important;right:12px!important;color:var(--gold)!important;font-size:8px!important;opacity:0.12!important}.mag-divider{text-align:center!important;color:var(--border)!important;font-size:10px!important;margin:16px 0!important;letter-spacing:0.3em!important}`,
  cyber: `:root{--bg:#03030A!important;--bg2:#070718!important;--bg3:#0C0C28!important;--bg4:#11113A!important;--border:#1A1A4A!important;--text:#C4D0E0!important;--text2:#4A5A7A!important;--gold:#00F0FF!important;--gold2:#0090FF!important;--accent:#FF00AA!important;--red:#FF0044!important;--green:#00FF88!important;--radius:2px!important;--shadow:0 0 30px rgba(0,240,255,0.05)!important}body{font-family:'Rajdhani','Noto Sans SC',sans-serif!important}
@keyframes cyberScan{0%{transform:translateY(-100%)}100%{transform:translateY(100vh)}}@keyframes cyberPulse{0%,100%{opacity:0.6}50%{opacity:1}}@keyframes cyberGlow{0%,100%{box-shadow:0 0 8px rgba(0,240,255,0.03)}50%{box-shadow:0 0 20px rgba(0,240,255,0.08)}}@keyframes cyberGrid{0%{background-position:0 0}100%{background-position:40px 40px}}@keyframes cyberTextFlicker{0%,100%{opacity:1}92%{opacity:1}93%{opacity:0.3}94%{opacity:0.8}96%{opacity:0.2}97%{opacity:0.9}}body::before{content:''!important;position:fixed!important;inset:0!important;z-index:-4!important;pointer-events:none!important;background-image:linear-gradient(rgba(0,240,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,240,255,0.02) 1px,transparent 1px)!important;background-size:40px 40px!important;animation:cyberGrid 4s linear infinite!important}
body::after{content:''!important;position:fixed!important;inset:0!important;z-index:99997!important;pointer-events:none!important;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.03) 2px,rgba(0,0,0,0.03) 4px)!important;animation:cyberScan 8s linear infinite!important}
.stat-card,.skill-card,.modal-panel,.battle-status-panel,.battle-log-box{background:linear-gradient(135deg,rgba(7,7,24,0.95),rgba(3,3,10,0.95))!important;border:1px solid var(--border)!important;border-radius:4px!important;box-shadow:0 0 20px rgba(0,240,255,0.02),inset 0 0 20px rgba(0,240,255,0.01)!important;transition:all 0.3s ease!important;position:relative!important;overflow:hidden!important}.stat-card::before,.skill-card::before{content:''!important;position:absolute!important;top:0!important;left:-100%!important;width:100%!important;height:1px!important;background:linear-gradient(90deg,transparent,var(--gold),transparent)!important;opacity:0!important;transition:opacity 0.5s!important}.stat-card:hover::before,.skill-card:hover::before{left:0!important;opacity:0.5!important;animation:cyberGlow 1.5s ease-in-out infinite!important}.stat-card:hover,.skill-card:hover{border-color:var(--gold)!important;box-shadow:0 0 30px rgba(0,240,255,0.06),inset 0 0 30px rgba(0,240,255,0.02)!important;transform:translateY(-1px)!important}
.modal-overlay{background:rgba(3,3,10,0.85)!important;backdrop-filter:blur(4px)!important}.modal-panel{background:linear-gradient(160deg,rgba(7,7,24,0.98),rgba(3,3,10,0.98))!important;border:1px solid var(--border)!important;border-radius:8px!important;box-shadow:0 0 40px rgba(0,240,255,0.03),inset 0 0 40px rgba(0,240,255,0.01)!important}.modal-title{color:var(--gold)!important;font-weight:600!important;letter-spacing:0.15em!important;text-transform:uppercase!important;border-bottom:1px solid var(--border)!important;padding-bottom:8px!important;text-shadow:0 0 20px rgba(0,240,255,0.15)!important}
.btn-action{background:linear-gradient(135deg,rgba(7,7,24,0.95),rgba(3,3,10,0.95))!important;border:1px solid var(--border)!important;color:var(--text)!important;border-radius:2px!important;transition:all 0.3s!important;text-transform:uppercase!important;letter-spacing:0.1em!important;font-size:12px!important}.btn-action:hover{border-color:var(--gold)!important;color:var(--gold)!important;box-shadow:0 0 20px rgba(0,240,255,0.06)!important}.btn-action.gold{background:linear-gradient(135deg,rgba(0,240,255,0.15),rgba(0,144,255,0.1))!important;border-color:var(--gold)!important;color:var(--gold)!important;text-shadow:0 0 10px rgba(0,240,255,0.2)!important}.btn-primary{background:linear-gradient(135deg,var(--gold),var(--gold2))!important;color:var(--bg)!important;border:none!important;border-radius:2px!important;text-transform:uppercase!important;letter-spacing:0.1em!important;font-weight:600!important;box-shadow:0 0 20px rgba(0,240,255,0.1)!important}
.game-title{font-weight:600!important;letter-spacing:0.2em!important;color:var(--gold)!important;text-transform:uppercase!important;text-shadow:0 0 30px rgba(0,240,255,0.15),0 0 60px rgba(0,240,255,0.05)!important;animation:cyberTextFlicker 5s linear infinite!important}
.hdr-name{font-weight:500!important;color:var(--text)!important;letter-spacing:0.15em!important;text-transform:uppercase!important;text-shadow:0 0 10px rgba(0,240,255,0.05)!important}.hdr-info,.hdr-res{color:var(--text2)!important;font-size:12px!important}
.section-title{color:var(--gold)!important;font-weight:600!important;text-transform:uppercase!important;letter-spacing:0.2em!important;border-bottom:1px solid var(--border)!important;padding-bottom:6px!important;font-size:11px!important;text-shadow:0 0 10px rgba(0,240,255,0.08)!important}
.tab-btn{letter-spacing:0.2em!important;font-size:10px!important;color:var(--text2)!important;padding:8px 14px!important;border:1px solid transparent!important;background:transparent!important;transition:all 0.3s!important;text-transform:uppercase!important;font-weight:500!important}.tab-btn.active{border-color:var(--gold)!important;color:var(--gold)!important;background:rgba(0,240,255,0.03)!important;box-shadow:inset 0 0 20px rgba(0,240,255,0.03)!important;text-shadow:0 0 10px rgba(0,240,255,0.1)!important}.tab-btn:hover{border-color:rgba(0,240,255,0.3)!important;color:var(--gold)!important}
.toast{background:rgba(3,3,10,0.95)!important;border:1px solid var(--gold)!important;color:var(--gold)!important;border-radius:2px!important;text-shadow:0 0 10px rgba(0,240,255,0.1)!important;box-shadow:0 0 20px rgba(0,240,255,0.03)!important;font-size:13px!important}
.map-card{background:linear-gradient(135deg,rgba(7,7,24,0.95),rgba(3,3,10,0.95))!important;border:1px solid var(--border)!important;border-radius:4px!important;transition:all 0.3s!important}.map-card.active{background:linear-gradient(135deg,rgba(12,12,40,0.95),rgba(7,7,24,0.95))!important;border-color:var(--gold)!important;box-shadow:0 0 20px rgba(0,240,255,0.04)!important}
.inv-slot{background:linear-gradient(135deg,rgba(7,7,24,0.95),rgba(3,3,10,0.95))!important;border:1px solid var(--border)!important;border-radius:2px!important;transition:all 0.3s!important}.inv-slot.occupied:hover{border-color:var(--gold)!important;box-shadow:0 0 15px rgba(0,240,255,0.04)!important}
.equip-slot,.opt-item{background:linear-gradient(135deg,rgba(7,7,24,0.95),rgba(3,3,10,0.95))!important;border:1px solid var(--border)!important;border-radius:2px!important}
.skill-card.equipped{border-left:3px solid var(--gold)!important;background:linear-gradient(135deg,rgba(12,12,40,0.95),rgba(7,7,24,0.95))!important;box-shadow:inset 0 0 20px rgba(0,240,255,0.02)!important}
.realm-badge{background:linear-gradient(135deg,rgba(7,7,24,0.95),rgba(3,3,10,0.95))!important;border:1px solid var(--border)!important;color:var(--gold)!important;border-radius:2px!important;text-transform:uppercase!important;letter-spacing:0.15em!important;font-size:10px!important}
.hp-bar,.mp-bar,.exp-bar,.sr-bar,.bar-track{height:4px!important;background:rgba(26,26,74,0.5)!important;border-radius:2px!important;border:none!important;overflow:hidden!important;margin:6px 0!important}.bar-fill,.hp-bar-fill,.hp-bar-red{background:linear-gradient(90deg,var(--gold),var(--gold2))!important;border-radius:2px!important;height:100%!important;box-shadow:0 0 6px rgba(0,240,255,0.15)!important}.hp-bar-fill.low,.hp-bar-red.low{background:linear-gradient(90deg,var(--red),#aa0033)!important;box-shadow:0 0 8px rgba(255,0,68,0.2)!important}.mp-bar-fill,.mp-bar-blue{background:linear-gradient(90deg,var(--accent),rgba(255,0,170,0.4))!important;box-shadow:0 0 6px rgba(255,0,170,0.1)!important}
.battle-sidebar{background:linear-gradient(180deg,rgba(7,7,24,0.98),rgba(3,3,10,0.98))!important;border-left:1px solid var(--border)!important}.sidebar-char-name{color:var(--text)!important;font-weight:500!important;text-transform:uppercase!important;letter-spacing:0.2em!important;text-shadow:0 0 10px rgba(0,240,255,0.03)!important}
.sub-tab button,.sub-tab-item{border-bottom:1px solid var(--border)!important;color:var(--text2)!important;font-size:10px!important;text-transform:uppercase!important;letter-spacing:0.1em!important;padding:6px 12px!important}.sub-tab button.active{color:var(--gold)!important;border-bottom:1px solid var(--gold)!important;text-shadow:0 0 10px rgba(0,240,255,0.08)!important}
.game-header{border-bottom:1px solid var(--border)!important;position:relative!important;overflow:hidden!important}.game-header::after{content:''!important;position:absolute!important;bottom:0!important;left:0!important;right:0!important;height:1px!important;background:linear-gradient(90deg,transparent,rgba(0,240,255,0.15),transparent)!important;animation:cyberTextFlicker 3s linear infinite!important}
input,select,textarea{background:rgba(7,7,24,0.95)!important;border:1px solid var(--border)!important;border-radius:2px!important;color:var(--text)!important;padding:8px 14px!important;transition:all 0.3s!important;font-size:12px!important}input:focus{border-color:var(--gold)!important;box-shadow:0 0 15px rgba(0,240,255,0.04)!important;outline:none!important}::placeholder{color:var(--text2)!important}
::-webkit-scrollbar{width:3px!important;height:3px!important}::-webkit-scrollbar-thumb{background:var(--gold)!important;box-shadow:0 0 6px rgba(0,240,255,0.08)!important}::-webkit-scrollbar-track{background:transparent!important}.btn-icon{transition:all 0.3s!important}.btn-icon:hover{filter:drop-shadow(0 0 6px rgba(0,240,255,0.15))!important}.battle-log-box{font-family:'Rajdhani','Noto Sans SC',sans-serif!important;color:var(--text2)!important;line-height:1.7!important;font-size:13px!important;letter-spacing:0.05em!important}.panel{animation:magFadeIn 0.4s ease!important}`,
};
const SKIN_CSS_URL = 'https://ider-order-system.pages.dev/api/skins/css/';

/* ═══════════════════════════════════════
   内嵌 SVG 图标
   ═══════════════════════════════════════ */
const ICONS = {
  ink: {
    mountain: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 18L9 8l4 6 5-8 3 4"/><path d="M3 18h18"/><path d="M7 18V6"/><path d="M4 6l3 2 5-3 4 2 5-2"/><path d="M8 5Q9 3 10 5" stroke-width="1"/><path d="M11 4Q12 2 13 4" stroke-width="1"/></svg>`,
    sword: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M10 14L3 21M21 3l-9 9M5 5l3 3M16 16l3 3"/><path d="M14 4l6 6" opacity="0.4"/><path d="M4 14l6 6" opacity="0.4"/><path d="M12 12l-2 8" stroke-width="1" opacity="0.3"/></svg>`,
    pouch: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 10h12v10a2 2 0 01-2 2H8a2 2 0 01-2-2V10z"/><path d="M8 10V6a4 4 0 018 0v4"/><path d="M12 14v4"/><path d="M10 16h4"/><path d="M7 10l5 3 5-3" stroke-width="1" opacity="0.5"/></svg>`,
    bamboo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="4" y="2" width="16" height="20" rx="1"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="14" y2="14"/><line x1="8" y1="18" x2="12" y2="18"/><path d="M4 4l-2 1" stroke-width="1"/><path d="M20 4l2 1" stroke-width="1"/></svg>`,
    talisman: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 20l4-10 4 6 4-8 4 12"/><circle cx="7" cy="6" r="1.5" fill="#C43A2B" stroke="none"/><circle cx="17" cy="5" r="1" fill="#1a1a1a" opacity="0.3" stroke="none"/></svg>`,
    scroll: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="13" y2="11"/></svg>`,
    logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
    heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 20l-7-7a4.5 4.5 0 016-6l1 1 1-1a4.5 4.5 0 016 6l-7 7z"/><path d="M3 12h4l1-3 2 6 3-9 1 3 2-1 5 4" stroke-width="1" opacity="0.3"/></svg>`,
    heartPulse: `<svg viewBox="0 0 24 24" fill="none" stroke="#C43A2B" stroke-width="1.5" stroke-linecap="round"><path d="M12 20l-7-7a4.5 4.5 0 016-6l1 1 1-1a4.5 4.5 0 016 6l-7 7z"/><path d="M3 12h4l1-3 2 6 3-9 1 3 2-1 5 4" stroke-width="1.2" opacity="0.6"/></svg>`,
    dantian: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"><circle cx="12" cy="12" r="8" stroke-dasharray="2 3"/><circle cx="12" cy="12" r="5" stroke-dasharray="1 4"/><circle cx="12" cy="12" r="2" fill="#1a1a1a" fill-opacity="0.15"/><path d="M12 2l1 3-1 1-1-1z" fill="currentColor" opacity="0.3"/></svg>`,
    scrollExp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="13" y2="11"/><line x1="8" y1="15" x2="11" y2="15"/><circle cx="17" cy="15" r="3" fill="none" opacity="0.3"/></svg>`,
    inkBrush: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 20l4-10 4 6 4-8 4 12"/><circle cx="7" cy="6" r="1.5" fill="#C43A2B" stroke="none"/><circle cx="17" cy="5" r="1" fill="currentColor" opacity="0.3" stroke="none"/><path d="M9 18l3-4 3 2" opacity="0.4"/></svg>`,
    inkstone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="4" y="14" width="16" height="6" rx="1"/><rect x="6" y="16" width="12" height="2" rx="0.5" fill="currentColor" opacity="0.15"/><path d="M8 4l2 10M12 4l2 10M16 4l2 10"/><line x1="3" y1="14" x2="21" y2="14"/></svg>`,
    inkX: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6l-12 12"/></svg>`,
    inkArrow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 12H5"/><path d="M12 5l-7 7 7 7"/></svg>`,
    coinSeal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><rect x="9" y="6" width="6" height="12" rx="1" opacity="0.3" fill="currentColor"/><text x="12" y="16" text-anchor="middle" font-size="10" fill="currentColor" stroke="none" font-family="serif">钱</text></svg>`,
    pillOrb: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.1"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3" opacity="0.3"/></svg>`,
    swordInk: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 3L4 11l3 3 8-8"/><path d="M16 7l-3 3"/><path d="M7 14l-3 3 1 1 3-3"/><path d="M12 3l-2 10" stroke-width="1" opacity="0.3"/><path d="M6 16l-1 4" stroke-width="0.8" opacity="0.25"/></svg>`,
    scrollQuest: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="12" y2="15"/><circle cx="17" cy="16" r="4" fill="none" stroke="#C43A2B" opacity="0.6"/></svg>`,
    speechInk: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>`,
    figures: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="9" cy="7" r="3"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><circle cx="17" cy="9" r="2.5"/><path d="M15 21v-1.5a3.5 3.5 0 013.5-3.5h0a3.5 3.5 0 013.5 3.5V21"/></svg>`,
    trophySeal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 9H4a2 2 0 01-2-2V5a2 2 0 012-2h2"/><path d="M18 9h2a2 2 0 002-2V5a2 2 0 00-2-2h-2"/><path d="M6 9v2a6 6 0 0011.38 3"/><path d="M12 12v6"/><path d="M8 21h8"/><rect x="9" y="17" width="6" height="4" rx="1" fill="currentColor" opacity="0.08"/></svg>`,
    bellAncient: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/><line x1="6" y1="3" x2="8" y2="5" opacity="0.3"/><line x1="18" y1="3" x2="16" y2="5" opacity="0.3"/></svg>`,
    cycleInk: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>`,
    lightningInk: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/><path d="M8 10l4-3" opacity="0.3" stroke-width="1"/><path d="M16 14l-4 3" opacity="0.3" stroke-width="1"/></svg>`,
  },
  minimal: {
    mountain: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><path d="M1 14l4-8 3 5 4-7 3 10"/></svg>`,
    sword: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><path d="M13 3L8 8"/><path d="M14 2l-6 6"/></svg>`,
    pouch: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><rect x="4" y="6" width="8" height="9" rx="1"/></svg>`,
    bamboo: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><line x1="4" y1="2" x2="4" y2="14"/><line x1="12" y1="2" x2="12" y2="14"/></svg>`,
    talisman: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><path d="M5 3l-3 10h12L11 3"/></svg>`,
    scroll: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><path d="M4.5 2H13v12H4.5A1.5 1.5 0 013 12.5v-9A1.5 1.5 0 014.5 2z"/></svg>`,
    logout: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3"/><polyline points="11 11 14 8 11 5"/><line x1="14" y1="8" x2="6" y2="8"/></svg>`,
    heart: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1"><path d="M8 13l-4-4a3 3 0 014-4 3 3 0 014 4l-4 4z"/></svg>`,
    circle: `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1"><circle cx="6" cy="6" r="4.5"/></svg>`,
    square: `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1"><rect x="1.5" y="1.5" width="9" height="9"/></svg>`,
    triangle: `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1"><path d="M6 1.5L11 10.5H1z"/></svg>`,
    cross: `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1"><path d="M3 6h6M6 3v6"/></svg>`,
    dot: `<svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="1.5" fill="currentColor"/></svg>`,
    minus: `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1"><path d="M2 6h8"/></svg>`,
    arrow: `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1"><path d="M9 6H3"/><path d="M6 3L3 6l3 3"/></svg>`,
  },
  wabi: {
    mountain: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1"><path d="M3 16l4-6 3 4 4-7 6 9"/></svg>`,
    sword: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1"><path d="M14 4L8 10"/><path d="M10 10l-2 2"/><path d="M16 3l-5 5"/></svg>`,
    pouch: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1"><rect x="5" y="8" width="10" height="10" rx="1"/><path d="M7 8V5a3 3 0 016 0v3"/></svg>`,
    bamboo: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1"><line x1="5" y1="2" x2="5" y2="18"/><line x1="15" y1="2" x2="15" y2="18"/></svg>`,
    talisman: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1"><path d="M6 4l-4 12h16L14 4"/><circle cx="10" cy="9" r="1" fill="currentColor" opacity="0.3"/></svg>`,
    scroll: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1"><path d="M4 16.5A1.5 1.5 0 015.5 15H16"/><path d="M5.5 3H16v14H5.5A1.5 1.5 0 014 15.5v-11A1.5 1.5 0 015.5 3z"/></svg>`,
    logout: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1"><path d="M7 17H4a1 1 0 01-1-1V4a1 1 0 011-1h3"/><polyline points="13 14 17 10 13 6"/><line x1="17" y1="10" x2="8" y2="10"/></svg>`,
    heart: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1"><path d="M10 16l-5-5a3.5 3.5 0 015-5 3.5 3.5 0 015 5l-5 5z"/></svg>`,
    enso: `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.5"><circle cx="20" cy="20" r="16" stroke-dasharray="100" stroke-dashoffset="0"/><path d="M7 20c0-3 4-5 6-3s3 4 5 4 4-2 4-5-2-6-5-7" stroke-width="0.3" opacity="0.3"/></svg>`,
    bambooLeaf: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="0.8"><path d="M8 14c0-4 3-8 6-10"/><path d="M4 12c1-3 4-6 7-8"/><path d="M10 13c1-3 3-5 5-6"/></svg>`,
    wave: `<svg viewBox="0 0 40 12" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.3"><path d="M0 6Q5 0 10 6T20 6T30 6T40 6"/></svg>`,
    crane: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.8"><path d="M12 22V8M12 8l-4 4M12 8l4 4"/><path d="M18 5c-2 2-4 3-6 3s-4-1-6-3"/><circle cx="12" cy="4" r="1.5" opacity="0.3"/></svg>`,
    tea: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="0.8"><path d="M3 6h10l-1 8H4z"/><path d="M10 6V4a2 2 0 00-4 0v2"/><circle cx="10" cy="3" r="1" opacity="0.3"/></svg>`,
  },
  luxe: {
    mountain: `<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"><path d="M3 17l5-9 4 6 5-8 5 11"/><path d="M3 17h18"/></svg>`,
    sword: `<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"><path d="M12 3L4 11l3 3 8-8"/><path d="M16 7l-3 3"/><path d="M7 14l-3 3 1 1 3-3"/></svg>`,
    pouch: `<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"><rect x="5" y="8" width="12" height="12" rx="2"/><path d="M7 8V5a4 4 0 018 0v3"/><circle cx="11" cy="14" r="1.5"/></svg>`,
    bamboo: `<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"><rect x="5" y="3" width="12" height="16" rx="1"/><line x1="8" y1="7" x2="14" y2="7"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="8" y1="15" x2="12" y2="15"/></svg>`,
    talisman: `<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="0.8"><path d="M5 4l-3 14h18L17 4"/><circle cx="11" cy="10" r="1.5" fill="currentColor" opacity="0.25"/></svg>`,
    scroll: `<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"><path d="M4 17.5A1.5 1.5 0 015.5 16H18"/><path d="M5.5 3H18v16H5.5A1.5 1.5 0 014 17.5v-14A1.5 1.5 0 015.5 3z"/><line x1="7" y1="7" x2="14" y2="7"/><line x1="7" y1="11" x2="12" y2="11"/></svg>`,
    logout: `<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"><path d="M8 18H5a1 1 0 01-1-1V5a1 1 0 011-1h3"/><polyline points="15 15 19 11 15 7"/><line x1="19" y1="11" x2="9" y2="11"/></svg>`,
    heart: `<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="0.8"><path d="M11 18l-6.5-6.5a4 4 0 015.5-5.5l1 1 1-1a4 4 0 015.5 5.5L11 18z"/></svg>`,
    diamond: `<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="0.8"><path d="M11 2l7 8-7 12-7-12z"/><path d="M11 2l-7 8h14z" opacity="0.12" fill="currentColor"/></svg>`,
    crown: `<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"><path d="M2 16l4-8 5 4 5-4 4 8"/><path d="M2 16h18"/><circle cx="6" cy="6" r="1.2" opacity="0.4"/><circle cx="11" cy="8" r="1.2" opacity="0.4"/><circle cx="16" cy="6" r="1.2" opacity="0.4"/></svg>`,
    starGold: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="0.6"><path d="M8 1l2 5h5l-4 3 1 5-4-3-4 3 1-5-4-3h5z" opacity="0.5"/></svg>`,
    fleur: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="0.6"><path d="M10 3c-2 2-1 5 0 6 1-1 2-4 0-6zM10 9v8"/><path d="M5 14c2-1 3-3 3-5 0 2 1 4 2 5"/><path d="M15 14c-2-1-3-3-3-5 0 2-1 4-2 5"/></svg>`,
    wreath: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="0.5"><path d="M10 3C6 3 3 6 3 10s3 7 7 7 7-3 7-7-3-7-7-7z"/><path d="M6 8c1-2 3-3 4-2M14 8c-1-2-3-3-4-2" opacity="0.4"/></svg>`,
  },
  magazine: {
    mountain: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="0.5" stroke-linecap="round"><path d="M2 15l4-7 3 5 4-8 4 10"/></svg>`,
    sword: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="0.5" stroke-linecap="round"><path d="M14 4L9 9"/><path d="M9 9l-2 2"/><path d="M16 3l-5 5"/></svg>`,
    pouch: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="0.5" stroke-linecap="round"><rect x="4" y="7" width="10" height="10" rx="1"/><path d="M6 7V4.5a3 3 0 016 0V7"/></svg>`,
    bamboo: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="0.5" stroke-linecap="round"><line x1="5" y1="2" x2="5" y2="16"/><line x1="13" y1="2" x2="13" y2="16"/><line x1="3" y1="7" x2="15" y2="7"/><line x1="3" y1="11" x2="15" y2="11"/></svg>`,
    talisman: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="0.5"><path d="M6 4l-4 12h14L12 4"/><circle cx="9" cy="9" r="0.8" fill="currentColor" opacity="0.3"/></svg>`,
    scroll: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="0.5" stroke-linecap="round"><path d="M3 15.5A1.5 1.5 0 014.5 14H15"/><path d="M4.5 3H15v13H4.5A1.5 1.5 0 013 14.5v-11A1.5 1.5 0 014.5 3z"/><line x1="6" y1="6" x2="12" y2="6"/></svg>`,
    logout: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="0.5" stroke-linecap="round"><path d="M6 15H4a1 1 0 01-1-1V4a1 1 0 011-1h2"/><polyline points="12 12 15 9 12 6"/><line x1="15" y1="9" x2="7" y2="9"/></svg>`,
    heart: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="0.5"><path d="M9 15l-5-5a3.5 3.5 0 015-5 3.5 3.5 0 015 5l-5 5z"/></svg>`,
    fleuron: `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="0.5"><path d="M6 2c-2 1-1 4 0 5 1-1 2-4 0-5z"/><circle cx="6" cy="8" r="1.5" opacity="0.2"/></svg>`,
    paragraph: `<svg viewBox="0 0 10 14" fill="none" stroke="currentColor" stroke-width="0.5"><path d="M3 2v10M3 2h3a3 3 0 010 6H3"/></svg>`,
    asterism: `<svg viewBox="0 0 16 8" fill="none" stroke="currentColor" stroke-width="0.5"><circle cx="3" cy="4" r="1"/><circle cx="8" cy="4" r="1"/><circle cx="13" cy="4" r="1"/></svg>`,
    dinkus: `<svg viewBox="0 0 16 8" fill="none" stroke="currentColor" stroke-width="0.5"><path d="M-4 4h4M6 4h4M16 4h4"/><circle cx="-2" cy="4" r="0.8" opacity="0.3"/><circle cx="8" cy="4" r="0.8"/><circle cx="18" cy="4" r="0.8" opacity="0.3"/></svg>`,
    leaf: `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="0.5"><path d="M7 2C5 5 2 9 2 12c0 0 4-2 7-2s4 0 7 2c0-3-3-7-5-10"/><path d="M7 2v10" opacity="0.3"/></svg>`,
    ornament: `<svg viewBox="0 0 24 6" fill="none" stroke="currentColor" stroke-width="0.4"><path d="M0 3h8M12 3h8"/><circle cx="10" cy="3" r="1.2" opacity="0.3"/><circle cx="14" cy="3" r="1.2" opacity="0.3"/></svg>`,
  },
  frost: {
    mountain: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="0.6"><path d="M3 17l4-7 3 4 4-8 6 11"/><path d="M3 17h18"/></svg>`,
    sword: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="0.6"><path d="M14 4L8 10"/><path d="M10 10l-2 2"/><path d="M16 3l-5 5"/></svg>`,
    pouch: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="0.6"><rect x="5" y="8" width="10" height="10" rx="1"/><path d="M7 8V5a3 3 0 016 0v3"/></svg>`,
    bamboo: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="0.6"><line x1="5" y1="2" x2="5" y2="18"/><line x1="15" y1="2" x2="15" y2="18"/></svg>`,
    talisman: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="0.6"><path d="M6 4l-4 12h16L14 4"/><circle cx="10" cy="9" r="1" fill="currentColor" opacity="0.15"/></svg>`,
    scroll: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="0.6"><path d="M4 16.5A1.5 1.5 0 015.5 15H16"/><path d="M5.5 3H16v14H5.5A1.5 1.5 0 014 15.5v-11A1.5 1.5 0 015.5 3z"/></svg>`,
    logout: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="0.6"><path d="M7 17H4a1 1 0 01-1-1V4a1 1 0 011-1h3"/><polyline points="13 14 17 10 13 6"/><line x1="17" y1="10" x2="8" y2="10"/></svg>`,
    heart: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="0.6"><path d="M10 16l-5-5a3.5 3.5 0 015-5 3.5 3.5 0 015 5l-5 5z"/></svg>`,
    snowflake: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.6"><path d="M8 1v14M1 8h14"/><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>`,
    crystal: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="0.5"><path d="M8 1l6 4v6l-6 4-6-4V5z"/><path d="M8 1v14M2 5l12 6M14 5L2 11" opacity="0.2"/></svg>`,
    star: `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="0.5"><path d="M7 1v12M1 7h12"/><path d="M3.5 3.5l7 7M10.5 3.5l-7 7"/></svg>`,
    droplet: `<svg viewBox="0 0 10 14" fill="none" stroke="currentColor" stroke-width="0.5"><path d="M5 1c0 0-4 5-4 8a4 4 0 008 0c0-3-4-8-4-8z"/></svg>`,
    glow: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="0.3"><circle cx="10" cy="10" r="8" opacity="0.15"/><circle cx="10" cy="10" r="4" opacity="0.3"/><circle cx="10" cy="10" r="1.5" opacity="0.6"/></svg>`,
  },
  brutal: {
    mountain: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 16l5-9 3 5 4-8 5 12"/><path d="M1 16h16"/></svg>`,
    sword: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 3L7 9"/><path d="M9 9L7 11"/><path d="M15 2l-5 5"/></svg>`,
    pouch: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="4" y="7" width="10" height="10" rx="0"/><path d="M6 7V4a3 3 0 016 0v3"/></svg>`,
    bamboo: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="4" y1="2" x2="4" y2="16"/><line x1="14" y1="2" x2="14" y2="16"/><line x1="1" y1="6" x2="17" y2="6"/></svg>`,
    talisman: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 4l-4 12h16L13 4"/><circle cx="9" cy="9" r="1.5" fill="currentColor"/></svg>`,
    scroll: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 15.5A1.5 1.5 0 014.5 14H15"/><path d="M4.5 3H15v13H4.5A1.5 1.5 0 013 14.5v-11A1.5 1.5 0 014.5 3z"/></svg>`,
    logout: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 15H4a1 1 0 01-1-1V4a1 1 0 011-1h2"/><polyline points="12 12 15 9 12 6"/><line x1="15" y1="9" x2="7" y2="9"/></svg>`,
    heart: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 15l-5-5a3.5 3.5 0 015-5 3.5 3.5 0 015 5l-5 5z"/></svg>`,
    arrowR: `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M2 7h10M8 3l4 4-4 4"/></svg>`,
    arrowL: `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 7H2M6 3l-4 4 4 4"/></svg>`,
    plus: `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M2 7h10M7 2v10"/></svg>`,
    minus: `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M2 7h10"/></svg>`,
    x: `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 3l8 8M11 3l-8 8"/></svg>`,
    slash: `<svg viewBox="0 0 10 14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 1L3 13"/></svg>`,
  },
  cyber: {
    mountain: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M3 17l4-7 3 4 4-8 6 11"/><path d="M3 17h18"/></svg>`,
    sword: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M14 4L8 10"/><path d="M10 10l-2 2"/><path d="M16 3l-5 5"/></svg>`,
    pouch: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="5" y="8" width="10" height="10" rx="1"/><path d="M7 8V5a3 3 0 016 0v3"/></svg>`,
    bamboo: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.2"><line x1="5" y1="2" x2="5" y2="18"/><line x1="15" y1="2" x2="15" y2="18"/></svg>`,
    talisman: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M6 4l-4 12h16L14 4"/><circle cx="10" cy="9" r="1" fill="currentColor" opacity="0.3"/></svg>`,
    scroll: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M4 16.5A1.5 1.5 0 015.5 15H16"/><path d="M5.5 3H16v14H5.5A1.5 1.5 0 014 15.5v-11A1.5 1.5 0 015.5 3z"/></svg>`,
    logout: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M7 17H4a1 1 0 01-1-1V4a1 1 0 011-1h3"/><polyline points="13 14 17 10 13 6"/><line x1="17" y1="10" x2="8" y2="10"/></svg>`,
    heart: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M10 16l-5-5a3.5 3.5 0 015-5 3.5 3.5 0 015 5l-5 5z"/></svg>`,
    hexagon: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1"><path d="M9 1l7 4v8l-7 4-7-4V5z"/></svg>`,
    triangle: `<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1"><path d="M7 1l6 11H1z"/></svg>`,
    circuit: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="0.8"><circle cx="4" cy="4" r="2"/><circle cx="14" cy="14" r="2"/><path d="M4 4v3h5v5h3v2"/><circle cx="9" cy="7" r="1" opacity="0.4"/></svg>`,
    node: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="0.8"><circle cx="8" cy="8" r="3"/><path d="M8 3V1M8 15v-2M3 8H1M15 8h-2M4.5 4.5L3 3M13 13l-1.5-1.5M11.5 4.5L13 3M3 13l1.5-1.5"/></svg>`,
    pulse: `<svg viewBox="0 0 20 8" fill="none" stroke="currentColor" stroke-width="1"><path d="M0 4h3l2-3 2 6 2-6 2 6 2-3 2 3h3"/></svg>`,
    crosshair: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="0.8"><circle cx="8" cy="8" r="4"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2"/></svg>`,
  },
};

const TAB_MAP = {
  announcement:'scroll',character:'heart',inventory:'pouch',equipment:'sword',
  skills:'bamboo',techniques:'bamboo',map:'mountain',mail:'scroll',chat:'scroll',
  baiyi:'talisman',cave:'mountain',forge:'talisman',sect:'mountain',
  alliance:'mountain',duel:'sword',league:'sword',dungeon:'mountain',
  exchange:'pouch',help:'scroll',settings:'scroll'
};

/* ═══════════════════════════════════════
   JS 布局引擎
   ═══════════════════════════════════════ */

const LAYOUT = {
  // ═══════════════════════════════════════
  // 水墨修仙 — 完整 8 阶段布局引擎
  // ═══════════════════════════════════════
  ink() {
    document.documentElement.classList.add('theme-inkwash');
    if (document.querySelector('.ider-ink-mountains')) return; // 已渲染

    /* ── Phase 1: 背景层 ── */
    // 1a. 远山 SVG
    const mtnContainer = document.createElement('div');
    mtnContainer.className = 'ider-ink-mountains';
    mtnContainer.innerHTML = `<svg viewBox="0 0 1440 500" preserveAspectRatio="xMidYMax slice" width="100%" height="100%"><path d="M0 500l60-80 80 60 100-120 120 80 140-160 100 60 120-100 160 120 100-140 120 80 140-120 100 100 60-80v200z" fill="#1a1a1a" opacity="0.025"/><path d="M0 500l100-60 120 40 140-100 160 60 100-80 160 80 120-60 140 60 100-40 100 60 60-40v80z" fill="#1a1a1a" opacity="0.015" transform="translate(0,20)"/><path d="M0 500l200-40 180 30 200-80 180 50 180-60 200 40 100-30 120 50 80-20v40z" fill="#1a1a1a" opacity="0.01" transform="translate(0,40)"/><path d="M0 500l300-20 250 15 300-40 250 25 200-30 140 20v30z" fill="#1a1a1a" opacity="0.008" transform="translate(0,55)"/><path d="M0 500l400-10 350 8 350-25 200 15 140 12v20z" fill="#1a1a1a" opacity="0.005" transform="translate(0,65)"/></svg>`;
    document.body.prepend(mtnContainer);

    // 1b. 云雾层
    const mist = document.createElement('div');
    mist.className = 'ider-ink-mist';
    document.body.prepend(mist);

    // 1c. 四角墨晕
    const c1 = document.createElement('div'), c2 = document.createElement('div');
    c1.className = 'ider-ink-corner tl'; c2.className = 'ider-ink-corner br';
    document.body.prepend(c1); document.body.prepend(c2);

    // 1d. 散落墨点 ×8
    const splashPositions = [
      {top:'12%',left:'8%',w:6,o:0.04,d:'0s'},{top:'28%',right:'5%',w:4,o:0.03,d:'-2s'},
      {top:'55%',left:'3%',w:8,o:0.05,d:'-4s'},{top:'70%',right:'8%',w:5,o:0.035,d:'-6s'},
      {top:'40%',left:'12%',w:3,o:0.025,d:'-1s'},{top:'85%',left:'6%',w:7,o:0.045,d:'-3s'},
      {top:'18%',right:'12%',w:4,o:0.03,d:'-5s'},{top:'62%',left:'10%',w:5,o:0.04,d:'-7s'}
    ];
    splashPositions.forEach(p => {
      const dot = document.createElement('div');
      dot.className = 'ider-ink-splash';
      dot.style.cssText = `top:${p.top};left:${p.left};right:${p.right||'auto'};width:${p.w}px;height:${p.w}px;opacity:${p.o};animation-delay:${p.d}`;
      document.body.prepend(dot);
    });

    // 1e. 飞鸟装饰
    const birds = document.createElement('div');
    birds.className = 'ider-ink-birds';
    birds.innerHTML = `<svg viewBox="0 0 120 30" width="100%" height="100%"><path d="M20 15Q25 8 30 15Q35 8 40 15" stroke="#1a1a1a" stroke-width="0.8" fill="none" opacity="0.08"/><path d="M70 12Q74 6 78 12Q82 6 86 12" stroke="#1a1a1a" stroke-width="0.6" fill="none" opacity="0.06"/><path d="M50 18Q53 13 56 18Q59 13 62 18" stroke="#1a1a1a" stroke-width="0.5" fill="none" opacity="0.04"/></svg>`;
    document.body.prepend(birds);

    /* ── Phase 2: Header 改造 ── */
    const h = document.querySelector('.game-header');
    if (h && !h.querySelector('.inkwash-seal')) {
      // 获取角色名
      const nameEl = h.querySelector('.hdr-name');
      const realmEl = h.querySelector('.hdr-info, .realm-badge');
      const resEls = h.querySelectorAll('.hdr-res');
      const charName = nameEl ? nameEl.textContent.trim() : '无名';
      const realmText = realmEl ? realmEl.textContent.trim() : '炼气期';
      const resTexts = [];
      resEls.forEach(r => resTexts.push(r.textContent.trim()));

      h.innerHTML = '';
      h.style.cssText = 'display:flex;flex-direction:column;align-items:center;padding:24px 0 16px;background:transparent;border:none;position:relative;';

      // 引首垂线
      const line = document.createElement('div');
      line.className = 'inkwash-header-line';
      h.appendChild(line);

      // 角色名印章
      const sealDiv = document.createElement('div');
      sealDiv.className = 'inkwash-seal';
      const sealText = document.createElement('span');
      sealText.className = 'inkwash-seal-text';
      sealText.textContent = charName.length > 4 ? charName.slice(0,4) : charName;
      sealDiv.appendChild(sealText);
      h.appendChild(sealDiv);

      // 境界行（含旧体数字风格）
      const realmRow = document.createElement('div');
      realmRow.className = 'inkwash-realm';
      realmRow.textContent = realmText;
      h.appendChild(realmRow);

      // 墨线分割
      const div = document.createElement('div');
      div.className = 'inkwash-divider';
      h.appendChild(div);

      // 资源行
      if (resTexts.length > 0) {
        const resRow = document.createElement('div');
        resRow.className = 'inkwash-resources';
        resTexts.forEach(t => {
          const span = document.createElement('span');
          span.textContent = t;
          resRow.appendChild(span);
        });
        h.appendChild(resRow);
      }

      // 按钮行 (SVG)
      const btnRow = document.createElement('div');
      btnRow.className = 'inkwash-actions';
      const btnConfigs = [
        {title:'皮肤',icon:ICONS.ink.inkBrush},
        {title:'设置',icon:ICONS.ink.inkstone},
        {title:'地图',icon:ICONS.ink.mountain},
      ];
      btnConfigs.forEach(cfg => {
        const btn = document.createElement('button');
        btn.setAttribute('title', cfg.title);
        btn.innerHTML = cfg.icon;
        btnRow.appendChild(btn);
      });
      h.appendChild(btnRow);
    }

    /* ── Phase 3: 导航栏改造 ── */
    const tabNav = document.querySelector('.tab-nav');
    if (tabNav && !document.querySelector('.inkwash-nav')) {
      const oldBtns = tabNav.querySelectorAll('.tab-btn');
      if (oldBtns.length > 0) {
        const navWrap = document.createElement('nav');
        navWrap.className = 'inkwash-nav';
        oldBtns.forEach((btn, i) => {
          const id = btn.getAttribute('data-tab') || '';
          const label = btn.textContent.trim();
          const newBtn = document.createElement('button');
          newBtn.className = 'tab-btn' + (btn.classList.contains('active')?' active':'');
          newBtn.setAttribute('data-tab', id);

          // SVG 图标
          const iconName = TAB_MAP[id] || 'talisman';
          const svg = ICONS.ink[iconName] || ICONS.ink.talisman;
          const sp = document.createElement('span');
          sp.className = 'ider-nav-icon';
          sp.innerHTML = svg;
          newBtn.appendChild(sp);

          // 文字节点（竖排单字？保留原文本）
          const txt = document.createElement('span');
          txt.textContent = label;
          newBtn.appendChild(txt);

          // 分隔线（除最后一个）
          if (i < oldBtns.length - 1) {
            const sep = document.createElement('div');
            sep.className = 'tab-divider';
            newBtn.after(sep);
          }
          navWrap.appendChild(newBtn);
        });
        // 将原 tab-nav 的 data 事件监听迁移（克隆事件无法复制，通过 observer 重新绑定）
        tabNav.parentNode.replaceChild(navWrap, tabNav);
        // 保留 tab-nav 类供游戏 JS 选择器使用
        navWrap.classList.add('tab-nav');

        // 点击事件代理
        navWrap.addEventListener('click', e => {
          const tb = e.target.closest('.tab-btn');
          if (!tb) return;
          const tid = tb.getAttribute('data-tab');
          if (!tid) return;
          navWrap.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          tb.classList.add('active');
          // 触发游戏原有 tab 切换
          const gameTabs = document.querySelectorAll('.tab-content');
          gameTabs.forEach(tc => tc.style.display = tc.getAttribute('data-tab') === tid ? 'block' : 'none');
        });
      }
    }

    /* ── Phase 4: 侧边栏改造 ── */
    const sb = document.querySelector('.battle-sidebar');
    if (sb) {
      sb.style.cssText = 'width:160px;padding:20px;background:var(--paper-warm);border-left:1px solid var(--ink-light);border-right:none;position:relative;';
      const nm = sb.querySelector('.sidebar-char-name');
      if (nm) {
        nm.style.writingMode = 'vertical-rl';
        nm.style.textOrientation = 'mixed';
        nm.style.letterSpacing = '6px';
        nm.style.fontFamily = "'Ma Shan Zheng','STKaiti',serif";
      }
      // 墨染数值条改造
      sb.querySelectorAll('.bar-track, .sr-bar, .exp-bar').forEach(bar => {
        bar.style.cssText = 'height:8px;background:var(--ink-faint);border:none;overflow:hidden;margin:6px 0;position:relative';
        const fill = bar.querySelector('.bar-fill, .sr-fill, .exp-fill');
        if (fill) {
          fill.style.cssText = 'height:100%;background:linear-gradient(90deg,var(--ink-deep),var(--ink-mid));background-size:200% 100%';
        }
      });
      // 侧面印章装饰
      if (!sb.querySelector('.inkwash-sb-seal')) {
        const seal = document.createElement('div');
        seal.className = 'inkwash-sb-seal';
        seal.style.cssText = 'position:absolute;bottom:12px;left:50%;transform:translateX(-50%);width:28px;height:28px;border:1px solid var(--cinnabar);opacity:0.25;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--cinnabar);font-family:\"Ma Shan Zheng\",serif;letter-spacing:2px;transform-origin:center';
        seal.textContent = '印';
        sb.appendChild(seal);
      }
    }

    /* ── Phase 5: 卡片悬停朱砂线 ── */
    document.querySelectorAll('.stat-card, .skill-card').forEach(card => {
      if (card.querySelector('.inkwash-card-line')) return;
      const line = document.createElement('div');
      line.className = 'inkwash-card-line';
      line.style.cssText = 'content:\"\";position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--cinnabar);transform:scaleY(0);transition:transform 0.4s ease;transform-origin:center';
      card.style.position = 'relative';
      card.appendChild(line);
      card.addEventListener('mouseenter', () => line.style.transform = 'scaleY(1)');
      card.addEventListener('mouseleave', () => line.style.transform = 'scaleY(0)');
    });

    /* ── Phase 6: 对战页改造 ── */
    const battlePanel = document.querySelector('.battle-status-panel');
    if (battlePanel) {
      battlePanel.style.display = 'grid';
      battlePanel.style.gridTemplateColumns = '1fr 1fr';
      battlePanel.style.gap = '20px';
      // 血条转墨染
      battlePanel.querySelectorAll('.hp-bar, .hp-bar-red, .hp-bar-green').forEach(bar => {
        bar.style.cssText = 'height:8px;background:var(--ink-faint);border:none;overflow:hidden;border-radius:0;background-size:200% 100%';
        // 低血量变朱砂检测
        const fillEl = bar.querySelector('.hp-bar-fill') || bar;
        const w = parseFloat(fillEl.style.width) || 0;
        if (w > 0 && w < 30) {
          fillEl.style.background = 'linear-gradient(90deg,var(--cinnabar),var(--cinnabar-soft))';
        } else {
          fillEl.style.background = 'linear-gradient(90deg,var(--ink-deep),var(--ink-mid))';
        }
      });
    }
    const battleLog = document.querySelector('.battle-log-box');
    if (battleLog) {
      battleLog.style.cssText = 'font-family:\"Noto Serif SC\",serif;font-size:0.85rem;color:var(--ink-mid);line-height:1.8;letter-spacing:0.06em;border-left:1px solid var(--ink-light);padding-left:12px;margin-top:12px';
    }

    /* ── Phase 7: 弹窗改造 ── */
    const overlay = document.querySelector('.modal-overlay');
    if (overlay) overlay.style.cssText = 'background:rgba(245,240,230,0.88);backdrop-filter:blur(2px)';
    document.querySelectorAll('.modal-panel').forEach(p => {
      p.style.cssText = 'background:var(--paper);border:1px solid var(--ink-light);border-radius:8px;box-shadow:0 4px 24px rgba(26,26,26,0.06);padding:24px';
      const title = p.querySelector('.modal-title');
      if (title) {
        title.style.cssText = 'border-bottom:1px solid var(--cinnabar);color:var(--cinnabar);font-family:\"Noto Serif SC\",serif;letter-spacing:4px;padding-bottom:8px;margin-bottom:16px;font-size:14px';
      }
    });
    // 关闭按钮墨叉
    document.querySelectorAll('.modal-close, .btn-close, .close-btn, .ider-close').forEach(btn => {
      if (btn.querySelector('svg')) return;
      const isClose = (btn.textContent||'').trim() === '✕' || (btn.textContent||'').trim() === '×' || btn.classList.contains('modal-close');
      if (isClose) {
        btn.innerHTML = ICONS.ink.inkX;
        btn.style.cssText = 'background:none;border:none;cursor:pointer;width:24px;height:24px;color:var(--ink-mid);position:absolute;top:12px;right:12px';
      }
    });

    /* ── Phase 8: emoji 统一替换 ── */
    const emojiMap = {
      '❤️': ICONS.ink.heart, '💠': ICONS.ink.dantian, '⚡': ICONS.ink.lightningInk,
      '📖': ICONS.ink.scrollExp, '💰': ICONS.ink.coinSeal, '💊': ICONS.ink.pillOrb,
      '🗡️': ICONS.ink.swordInk, '📋': ICONS.ink.scrollQuest, '💬': ICONS.ink.speechInk,
      '👥': ICONS.ink.figures, '🏆': ICONS.ink.trophySeal, '🔔': ICONS.ink.bellAncient,
      '🔄': ICONS.ink.cycleInk, '🗺️': ICONS.ink.mountain, '🎒': ICONS.ink.pouch,
      '📜': ICONS.ink.bamboo, '⚙️': ICONS.ink.inkstone,
    };
    document.querySelectorAll('.battle-sidebar, .modal-panel, .stat-card, .skill-card, .map-card, .toast, .game-header').forEach(container => {
      if (!container || container.closest('.ider-deluxe-panel')) return;
      let html = container.innerHTML;
      let changed = false;
      for (const [emoji, svg] of Object.entries(emojiMap)) {
        if (html.includes(emoji)) {
          html = html.replace(new RegExp(emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
            `<span class="ider-emoji-svg" style="display:inline-block;width:16px;height:16px;vertical-align:middle;margin:0 2px">${svg}</span>`);
          changed = true;
        }
      }
      if (changed) container.innerHTML = html;
    });

    // 特殊处理皮肤面板的按钮图标（已在 Phase 2 的 btnRow 处理）
    // 重新处理退出按钮等
    document.querySelectorAll('.btn-icon:not(.ider-deluxe-btn)').forEach(b => {
      if (b.closest('.inkwash-actions')) return;
      const t = (b.getAttribute('title')||'').toLowerCase();
      let svg = null;
      if (t.includes('退出')||t.includes('logout')||t.includes('exit')) svg = ICONS.ink.logout;
      else if (t.includes('设置')||t.includes('setting')) svg = ICONS.ink.inkstone;
      else if (t.includes('地图')||t.includes('map')) svg = ICONS.ink.mountain;
      else if (t.includes('刷新')||t.includes('refresh')) svg = ICONS.ink.cycleInk;
      else if (t.includes('通知')||t.includes('notice')) svg = ICONS.ink.bellAncient;
      if (svg) { b.innerHTML = svg; b.style.cssText = 'background:none;border:none;cursor:pointer;padding:4px;color:var(--ink-mid);width:28px;height:28px'; }
    });

    /* ── Phase 9: 命途/角色页 → 纵向卷轴 ── */
    // 9a. 角色 tab 面板 → 竖幅卷轴式
    if (!document.querySelector('.inkwash-char-scroll')) {
        const cp = document.querySelector('.char-stats');
        if (cp && !cp.querySelector('.inkwash-char-scroll')) {
          cp.classList.add('inkwash-char-scroll');
          cp.style.cssText = 'display:flex;flex-direction:column;gap:10px;padding:16px;position:relative';
          // 境界 stat-card → 卷轴卡片
          const statCards = cp.querySelectorAll('.stat-card');
          statCards.forEach(card => {
            card.classList.add('inkwash-realm-card');
            card.style.cssText = 'background:var(--paper);border:1px solid var(--ink-light);padding:16px 20px;position:relative;margin:2px 0;transition:all 0.6s ease';
            const label = card.querySelector('.stat-label');
            const value = card.querySelector('.stat-value');
            if (label && label.textContent.includes('境界')) {
              card.style.cssText += ';border-left:2px solid var(--cinnabar);background:var(--paper-warm)';
              const seal = document.createElement('div');
              seal.className = 'realm-seal';
              seal.style.cssText = 'position:absolute;top:-6px;left:-6px;width:24px;height:24px;border:1px solid var(--cinnabar);display:flex;align-items:center;justify-content:center;font-size:9px;color:var(--cinnabar);transform:rotate(-8deg);background:var(--paper)';
              seal.textContent = '境';
              card.appendChild(seal);
            }
            // 添加悬停分隔线装饰
            if (!card.querySelector('.inkwash-card-line')) {
              const line = document.createElement('div');
              line.style.cssText = 'position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--cinnabar);transform:scaleY(0);transition:transform 0.4s ease;transform-origin:center';
              card.appendChild(line);
              card.addEventListener('mouseenter', () => line.style.transform = 'scaleY(1)');
              card.addEventListener('mouseleave', () => line.style.transform = 'scaleY(0)');
            }
          });
          // 引首垂线装饰
          const headerLine = document.createElement('div');
          headerLine.style.cssText = 'position:absolute;top:-8px;left:16px;width:1px;height:12px;background:var(--ink-deep);opacity:0.1';
          cp.prepend(headerLine);
          // 底部收尾
          const footerLine = document.createElement('div');
          footerLine.style.cssText = 'position:absolute;bottom:-8px;right:16px;width:1px;height:12px;background:var(--ink-deep);opacity:0.1';
          cp.appendChild(footerLine);
        }
      }
    }
    // 9b. 六维 + 战斗属性 → 卷轴卡片群
    document.querySelectorAll('.attr-grid, .sr-display').forEach(grid => {
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px;padding:8px 0;position:relative';
      grid.querySelectorAll('.attr-item, .sr-bar-wrap').forEach(item => {
        item.style.cssText = 'background:var(--paper);border:1px solid var(--ink-faint);padding:8px 12px;transition:all 0.3s';
        item.addEventListener('mouseenter', () => item.style.borderColor = 'var(--cinnabar)');
        item.addEventListener('mouseleave', () => item.style.borderColor = 'var(--ink-faint)');
      });
    });
    // 9c. 命途 modal → 宣纸卷轴
    const mingtuScroll = document.querySelector('.mingtu-scroll');
    if (mingtuScroll && !mingtuScroll.querySelector('.inkwash-mt-styled')) {
      mingtuScroll.classList.add('inkwash-mt-styled');
      mingtuScroll.style.cssText = 'background:var(--paper);border:1px solid var(--ink-light);padding:16px;position:relative';
      // 命途节点 → 墨色边框
      mingtuScroll.querySelectorAll('.mingtu-node').forEach(node => {
        node.style.cssText = 'background:var(--paper);border:1px solid var(--ink-light);border-radius:4px;padding:8px;transition:all 0.3s';
        if (node.classList.contains('unlocked') || node.classList.contains('maxed')) {
          node.style.borderColor = 'var(--cinnabar)';
          node.style.background = 'var(--paper-warm)';
        }
        if (node.classList.contains('locked')) {
          node.style.opacity = '0.5';
        }
      });
      // 命途连线
      mingtuScroll.querySelectorAll('.mingtu-link').forEach(link => {
        link.style.stroke = 'var(--ink-light)';
      });
      // modal overlay
      const mtOverlay = mingtuScroll.closest('.modal-overlay');
      if (mtOverlay) mtOverlay.style.cssText = 'background:rgba(245,240,230,0.9);backdrop-filter:blur(4px)';
    }
    // 9d. 命途 tab 页切换按钮改造
    document.querySelectorAll('.mingtu-tabs button, .mingtu-tabs .tab-btn').forEach(tab => {
      tab.style.cssText = 'background:var(--paper);border:1px solid var(--ink-light);color:var(--ink-mid);padding:4px 12px;font-size:12px;cursor:pointer;transition:all 0.3s;letter-spacing:2px';
      if (tab.classList.contains('gold')) {
        tab.style.cssText += ';border-color:var(--cinnabar);color:var(--cinnabar);background:var(--paper-warm)';
      }
      tab.addEventListener('mouseenter', () => tab.style.borderColor = 'var(--cinnabar)');
      tab.addEventListener('mouseleave', () => {
        if (!tab.classList.contains('gold')) tab.style.borderColor = 'var(--ink-light)';
      });
    });

    /* ── Phase 10: 返回箭头 + 残存 emoji 替换 ── */
    document.querySelectorAll('.btn-icon, .btn-sm, .btn-action, .btn-close, .back-btn, a[href]').forEach(el => {
      const t = el.textContent || '';
      const title = (el.getAttribute('title') || '').toLowerCase();
      if ((t.includes('←') || t.includes('◀') || title.includes('返回') || title.includes('back')) && !el.querySelector('svg')) {
        el.innerHTML = el.innerHTML.replace(/←|◀/g, `<span class="ider-emoji-svg" style="display:inline-block;width:14px;height:14px;vertical-align:middle">${ICONS.ink.inkArrow}</span>`);
      }
    });
    // 额外 emoji 兜底替换（页面任何位置）
    const extraEmoji = {
      '←': ICONS.ink.inkArrow, '◀': ICONS.ink.inkArrow,
      '🏆': ICONS.ink.trophySeal, '🔔': ICONS.ink.bellAncient,
    };
    document.querySelectorAll('.panel, .modal-panel, .toast, .section-title, h3, h2').forEach(container => {
      if (!container || container.closest('.ider-deluxe-panel')) return;
      let html = container.innerHTML;
      let ch = false;
      for (const [emoji, svg] of Object.entries(extraEmoji)) {
        if (html.includes(emoji)) {
          html = html.replace(new RegExp(emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
            `<span class="ider-emoji-svg" style="display:inline-block;width:14px;height:14px;vertical-align:middle">${svg}</span>`);
          ch = true;
        }
      }
      if (ch) container.innerHTML = html;
    });
  },
  // 极简：仅几何 + 黑白 + 负空间最大化
  minimal() {
    document.documentElement.classList.add('theme-minimal');
    // 1. 压缩间距 + 扁平化
    document.querySelectorAll('.stat-card, .skill-card, .map-card, .modal-panel, .battle-status-panel').forEach(el => {
      el.style.cssText += ';margin:0;padding:8px 0;border:none;background:transparent;box-shadow:none';
    });
    document.querySelectorAll('.panel').forEach(el => { el.style.padding = '8px 0'; });
    document.querySelectorAll('.section-title').forEach(el => { el.style.margin = '0 0 4px 0'; });
    // 2. 图标 → 几何符号替换
    document.querySelectorAll('.btn-icon').forEach(b => {
      const t = (b.getAttribute('title')||'').toLowerCase();
      let svg = null;
      if (t.includes('退出')) svg = ICONS.minimal.logout;
      else if (t.includes('设置')) svg = ICONS.minimal.circle;
      else if (t.includes('刷新')) svg = ICONS.minimal.cross;
      else if (t.includes('通知')) svg = ICONS.minimal.dot;
      else if (t.includes('地图')) svg = ICONS.minimal.square;
      if (svg) { b.innerHTML = svg; b.style.cssText = 'background:none;border:none;cursor:pointer;padding:2px;color:var(--text2);width:18px;height:18px;opacity:0.35;transition:opacity 0.15s'; }
    });
    document.querySelectorAll('.tab-btn').forEach(b => {
      const id = b.getAttribute('data-tab');
      if (!id || b.querySelector('.ider-nav-icon')) return;
      const s = ICONS.minimal[TAB_MAP[id]];
      if (s) {
        const sp = document.createElement('span'); sp.className = 'ider-nav-icon'; sp.innerHTML = s;
        sp.style.cssText = 'display:inline-block;width:10px;height:10px;vertical-align:middle;margin-right:2px;flex-shrink:0;opacity:0.25';
        b.prepend(sp);
      }
      b.style.cssText = 'padding:4px 8px;font-size:10px;letter-spacing:0.08em;color:var(--text2);background:transparent;border:none;cursor:pointer;transition:opacity 0.15s';
      b.addEventListener('mouseenter', () => { b.style.opacity = '0.6'; });
      b.addEventListener('mouseleave', () => { if (!b.classList.contains('active')) b.style.opacity = '1'; });
    });
    // 3. 数值条：1px 细线
    document.querySelectorAll('.exp-bar,.sr-bar,.bar-track,.hp-bar,.mp-bar').forEach(bar => {
      bar.style.cssText = 'height:1px!important;background:var(--border)!important;border-radius:0!important;overflow:hidden;border:none!important;margin:3px 0';
      const f = bar.querySelector('.exp-fill,.sr-fill,.bar-fill,.hp-bar-fill,.hp-bar-red,.mp-bar-fill,.mp-bar-blue');
      if (f) f.style.cssText = 'height:100%;border-radius:0;background:var(--text)';
    });
    // 4. Header 极简
    const h = document.querySelector('.game-header');
    if (h) {
      const nm = h.querySelector('.hdr-name');
      if (nm) { nm.style.fontWeight = '200'; nm.style.fontSize = '12px'; nm.style.letterSpacing = '0'; nm.style.color = 'var(--text)'; }
      h.querySelectorAll('.hdr-info, .hdr-res').forEach(el => { el.style.fontSize = '10px'; el.style.color = 'var(--text2)'; });
      h.style.borderBottom = '1px solid var(--border)';
      h.style.padding = '8px 12px';
    }
    // 5. emoji → 基础几何替换
    const geoMap = {
      '❤️': ICONS.minimal.heart, '💰': ICONS.minimal.square, '💠': ICONS.minimal.circle,
      '⚡': ICONS.minimal.triangle, '🔔': ICONS.minimal.dot, '🔄': ICONS.minimal.cross,
      '📖': ICONS.minimal.minus, '🏆': ICONS.minimal.square, '🗡️': ICONS.minimal.cross,
      '💊': ICONS.minimal.circle, '📜': ICONS.minimal.minus, '🗺️': ICONS.minimal.square,
      '🎒': ICONS.minimal.pouch, '⚙️': ICONS.minimal.circle, '💬': ICONS.minimal.dot,
      '←': ICONS.minimal.arrow, '◀': ICONS.minimal.arrow,
    };
    document.querySelectorAll('.panel, .modal-panel, .stat-card, .skill-card, .battle-sidebar, .toast').forEach(container => {
      if (!container || container.closest('.ider-deluxe-panel')) return;
      let html = container.innerHTML; let ch = false;
      for (const [emoji, svg] of Object.entries(geoMap)) {
        if (html.includes(emoji)) {
          html = html.replace(new RegExp(emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), `<span class="ider-emoji-svg" style="display:inline-block;width:10px;height:10px;vertical-align:middle;opacity:0.35">${svg}</span>`);
          ch = true;
        }
      }
      if (ch) container.innerHTML = html;
    });
  },
  // 磨砂玻璃：毛玻璃 × 光影追踪 × 冰晶光泽
  frost() {
    document.documentElement.classList.add('theme-glass');
    // 1. 聚光灯（鼠标追踪）
    if (!document.querySelector('.ider-spotlight')) {
      const sp = document.createElement('div'); sp.className = 'ider-spotlight';
      sp.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(700px circle at var(--mx,50%) var(--my,50%),rgba(255,255,255,0.045),transparent 50%);transition:background 0.1s';
      document.body.appendChild(sp);
      document.addEventListener('mousemove', e => { sp.style.setProperty('--mx', (e.clientX / window.innerWidth * 100) + '%'); sp.style.setProperty('--my', (e.clientY / window.innerHeight * 100) + '%'); });
    }
    // 2. 冰晶装饰
    if (!document.querySelector('.ider-frost-crystal')) {
      const cry = document.createElement('div');
      cry.className = 'ider-frost-crystal';
      cry.innerHTML = ICONS.frost.snowflake + ICONS.frost.crystal + ICONS.frost.star;
      cry.style.cssText = 'position:fixed;top:10%;right:5%;z-index:-2;pointer-events:none;opacity:0.04;display:flex;gap:12px;transform:rotate(15deg)';
      document.body.appendChild(cry);
      const cry2 = document.createElement('div');
      cry2.innerHTML = ICONS.frost.star + ICONS.frost.snowflake;
      cry2.style.cssText = 'position:fixed;bottom:15%;left:5%;z-index:-2;pointer-events:none;opacity:0.03;display:flex;gap:8px;transform:rotate(-10deg)';
      document.body.appendChild(cry2);
    }
    // 3. Header：发光顶线 + 毛玻璃header
    const h = document.querySelector('.game-header');
    if (h) {
      h.style.cssText = 'border-bottom:1px solid rgba(255,255,255,0.04);background:rgba(2,6,23,0.4);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);padding:16px 20px;position:relative';
      if (!h.querySelector('.glass-header-glow')) {
        const g = document.createElement('div');
        g.style.cssText = 'position:absolute;top:0;left:8%;right:8%;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.25) 30%,rgba(255,255,255,0.25) 70%,transparent);pointer-events:none';
        h.appendChild(g);
        const g2 = document.createElement('div');
        g2.style.cssText = 'position:absolute;bottom:0;left:15%;right:15%;height:0.5px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.06),transparent);pointer-events:none';
        h.appendChild(g2);
      }
    }
    // 4. 图标按钮：毛玻璃态
    document.querySelectorAll('.btn-icon').forEach(b => {
      const t = (b.getAttribute('title') || '').toLowerCase();
      let svg = null;
      if (t.includes('退出')) svg = ICONS.frost.logout;
      else if (t.includes('设置')) svg = ICONS.frost.crystal;
      else if (t.includes('刷新')) svg = ICONS.frost.snowflake;
      else if (t.includes('地图')) svg = ICONS.frost.mountain;
      else if (t.includes('通知')) svg = ICONS.frost.glow;
      if (svg) { b.innerHTML = svg; b.style.cssText = 'background:rgba(255,255,255,0.04);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.06);cursor:pointer;padding:6px;color:rgba(255,255,255,0.5);width:32px;height:32px;border-radius:10px;transition:all 0.3s'; }
    });
    // 5. 导航栏：玻璃片
    document.querySelectorAll('.tab-btn').forEach(b => {
      const id = b.getAttribute('data-tab');
      if (!id || b.querySelector('.ider-nav-icon')) return;
      const s = ICONS.frost[TAB_MAP[id]];
      if (s) {
        const sp = document.createElement('span'); sp.className = 'ider-nav-icon'; sp.innerHTML = s;
        sp.style.cssText = 'display:inline-block;width:14px;height:14px;vertical-align:middle;margin-right:6px;opacity:0.5;flex-shrink:0';
        b.prepend(sp);
      }
      b.style.cssText = 'letter-spacing:0.15em;font-size:11px;color:rgba(255,255,255,0.5);padding:8px 16px;border:none;background:transparent;border-radius:10px;transition:all 0.3s;cursor:pointer;text-transform:uppercase';
      b.addEventListener('mouseenter', () => { b.style.background = 'rgba(255,255,255,0.04)'; b.style.color = 'rgba(255,255,255,0.8)'; });
      b.addEventListener('mouseleave', () => { if (!b.classList.contains('active')) { b.style.background = 'transparent'; b.style.color = 'rgba(255,255,255,0.5)'; } });
      if (b.classList.contains('active')) { b.style.background = 'rgba(255,255,255,0.06)'; b.style.color = 'rgba(255,255,255,0.9)'; }
    });
    // 6. 数值条：发光渐变
    document.querySelectorAll('.exp-bar,.sr-bar,.bar-track,.hp-bar,.mp-bar').forEach(bar => {
      bar.style.cssText = 'height:4px;background:rgba(255,255,255,0.04);border-radius:4px;overflow:hidden;border:none;margin:6px 0';
      const f = bar.querySelector('.exp-fill,.sr-fill,.bar-fill,.hp-bar-fill,.hp-bar-red,.mp-bar-fill,.mp-bar-blue');
      if (f) { f.style.cssText = 'height:100%;border-radius:4px;transition:width 0.6s cubic-bezier(0.22,1,0.36,1)'; f.style.background = 'linear-gradient(90deg,rgba(255,255,255,0.5),rgba(255,255,255,0.2))'; }
    });
    // 7. 卡片悬停：上浮 + 亮边
    document.querySelectorAll('.stat-card,.skill-card').forEach(card => {
      card.style.cssText += ';backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);transition:all 0.3s ease';
    });
    // 8. 弹窗：强玻璃
    document.querySelectorAll('.modal-panel').forEach(p => {
      p.style.cssText = 'background:rgba(2,6,23,0.85);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:24px';
      const title = p.querySelector('.modal-title');
      if (title) { title.style.color = 'rgba(255,255,255,0.9)'; title.style.borderBottom = '1px solid rgba(255,255,255,0.06)'; title.style.fontWeight = '300'; }
    });
    // 9. 侧边栏玻璃化
    const sb = document.querySelector('.battle-sidebar');
    if (sb) {
      sb.style.cssText = 'background:rgba(255,255,255,0.02);backdrop-filter:blur(8px);border-left:1px solid rgba(255,255,255,0.04);padding:16px';
      const nm = sb.querySelector('.sidebar-char-name');
      if (nm) { nm.style.color = 'rgba(255,255,255,0.7)'; nm.style.fontWeight = '300'; nm.style.letterSpacing = '0.15em'; }
    }
    // 10. emoji → 冰晶光泽图标
    const frostEmoji = {
      '❤️': ICONS.frost.heart, '💠': ICONS.frost.crystal, '💰': ICONS.frost.star,
      '⚡': ICONS.frost.snowflake, '🔔': ICONS.frost.glow, '🏆': ICONS.frost.star,
      '🔄': ICONS.frost.snowflake, '🗡️': ICONS.frost.crystal, '💊': ICONS.frost.droplet,
    };
    document.querySelectorAll('.panel, .modal-panel, .stat-card, .battle-sidebar, .toast').forEach(container => {
      if (!container || container.closest('.ider-deluxe-panel')) return;
      let html = container.innerHTML; let ch = false;
      for (const [emoji, svg] of Object.entries(frostEmoji)) {
        if (html.includes(emoji)) {
          html = html.replace(new RegExp(emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), `<span class="ider-emoji-svg" style="display:inline-block;width:14px;height:14px;vertical-align:middle;opacity:0.6">${svg}</span>`);
          ch = true;
        }
      }
      if (ch) container.innerHTML = html;
    });
  },
  // 粗野主义：结构裸露 × 重阴影 × 高对比
  brutal() {
    document.documentElement.classList.add('theme-brutal');
    // 1. 全局粗框 + Uppercase
    document.querySelectorAll('.hdr-name').forEach(el => {
      el.style.fontFamily = "'Anton',Impact,sans-serif"; el.style.textTransform = 'uppercase'; el.style.letterSpacing = '0.05em'; el.style.fontSize = '20px'; el.style.color = '#0A0A0A';
    });
    document.querySelectorAll('.game-title').forEach(el => {
      el.style.fontFamily = "'Anton',Impact,sans-serif"; el.style.textTransform = 'uppercase'; el.style.letterSpacing = '0.03em'; el.style.fontWeight = '900'; el.style.color = '#0A0A0A'; el.style.fontSize = '36px';
    });
    // 2. Header：3px底框
    const h = document.querySelector('.game-header');
    if (h) {
      h.style.cssText = 'border-bottom:4px solid #0A0A0A;padding:16px 20px;background:#F0F0F0;margin:0';
      const line = document.createElement('div');
      line.style.cssText = 'position:absolute;bottom:-8px;left:0;right:0;height:2px;background:#0A0A0A;opacity:0.15;pointer-events:none';
      h.appendChild(line);
    }
    // 3. 图标：粗+sans
    document.querySelectorAll('.btn-icon').forEach(b => {
      const t = (b.getAttribute('title') || '').toLowerCase();
      let svg = null;
      if (t.includes('退出')) svg = ICONS.brutal.logout;
      else if (t.includes('返回') || t.includes('back')) svg = ICONS.brutal.arrowL;
      else if (t.includes('设置')) svg = ICONS.brutal.plus;
      else if (t.includes('刷新')) svg = ICONS.brutal.x;
      if (svg) { b.innerHTML = svg; b.style.cssText = 'background:#FFFFFF;border:2px solid #0A0A0A;cursor:pointer;padding:4px;color:#0A0A0A;width:30px;height:30px;border-radius:0;transition:all 0.1s'; }
    });
    // 4. 导航：边框+背景切换
    document.querySelectorAll('.tab-btn').forEach(b => {
      const id = b.getAttribute('data-tab');
      if (!id || b.querySelector('.ider-nav-icon')) return;
      const s = ICONS.brutal[TAB_MAP[id]];
      if (s) {
        const sp = document.createElement('span'); sp.className = 'ider-nav-icon'; sp.innerHTML = s;
        sp.style.cssText = 'display:inline-block;width:14px;height:14px;vertical-align:middle;margin-right:6px;flex-shrink:0';
        b.prepend(sp);
      }
      b.style.cssText = 'font-weight:700;text-transform:uppercase;letter-spacing:0.08em;font-size:11px;color:#444;padding:8px 16px;border:2px solid transparent;background:transparent;cursor:pointer;transition:all 0.1s';
      b.addEventListener('mouseenter', () => { b.style.border = '2px solid #0A0A0A'; });
      b.addEventListener('mouseleave', () => { if (!b.classList.contains('active')) b.style.border = '2px solid transparent'; });
      if (b.classList.contains('active')) { b.style.border = '2px solid #0A0A0A'; b.style.background = '#FFFFFF'; b.style.color = '#0A0A0A'; }
    });
    // 5. 数值条：实心粗条
    document.querySelectorAll('.exp-bar,.sr-bar,.bar-track,.hp-bar,.mp-bar').forEach(bar => {
      bar.style.cssText = 'height:8px;background:#D0D0D0;border:2px solid #0A0A0A;border-radius:0;overflow:hidden;margin:8px 0';
      const f = bar.querySelector('.exp-fill,.sr-fill,.bar-fill,.hp-bar-fill,.hp-bar-red,.mp-bar-fill,.mp-bar-blue');
      if (f) f.style.cssText = 'height:100%;background:#0A0A0A;border-radius:0';
    });
    // 6. 侧边栏：粗左边框
    const sb = document.querySelector('.battle-sidebar');
    if (sb) {
      sb.style.cssText = 'background:#FFFFFF;border-left:4px solid #0A0A0A;border-right:none;padding:20px';
      const nm2 = sb.querySelector('.sidebar-char-name');
      if (nm2) { nm2.style.fontFamily = "'Anton',Impact,sans-serif"; nm2.style.textTransform = 'uppercase'; nm2.style.fontSize = '1.4rem'; nm2.style.letterSpacing = '0.06em'; nm2.style.color = '#0A0A0A'; nm2.style.writingMode = 'vertical-rl'; }
    }
    // 7. 卡片：粗框重阴影
    document.querySelectorAll('.stat-card,.skill-card,.map-card').forEach(card => {
      if (!card.classList.contains('ider-brutal-shadow')) {
        card.classList.add('ider-brutal-shadow');
        card.style.cssText += ';border:3px solid #0A0A0A;border-radius:0;box-shadow:4px 4px 0 #0A0A0A;transition:all 0.1s';
        card.addEventListener('mouseenter', () => { card.style.transform = 'translate(-2px,-2px)'; card.style.boxShadow = '6px 6px 0 #0A0A0A'; });
        card.addEventListener('mouseleave', () => { card.style.transform = 'translate(0,0)'; card.style.boxShadow = '4px 4px 0 #0A0A0A'; });
      }
    });
    // 8. 弹窗粗框
    document.querySelectorAll('.modal-panel').forEach(p => {
      p.style.cssText = 'background:#FFFFFF;border:4px solid #0A0A0A;border-radius:0;box-shadow:8px 8px 0 #0A0A0A;padding:24px';
      const title = p.querySelector('.modal-title');
      if (title) { title.style.color = '#0A0A0A'; title.style.fontWeight = '900'; title.style.textTransform = 'uppercase'; title.style.borderBottom = '3px solid #0A0A0A'; }
    });
    // 9. emoji → 几何粗体图标
    const brutalEmoji = {
      '❤️': ICONS.brutal.heart, '←': ICONS.brutal.arrowL, '◀': ICONS.brutal.arrowL,
      '💰': ICONS.brutal.plus, '⚡': ICONS.brutal.slash, '🔔': ICONS.brutal.x,
      '🏆': ICONS.brutal.plus, '🔄': ICONS.brutal.x, '🗡️': ICONS.brutal.sword,
      '✕': ICONS.brutal.x, '×': ICONS.brutal.x,
    };
    document.querySelectorAll('.panel, .modal-panel, .stat-card, .battle-sidebar, .toast').forEach(container => {
      if (!container || container.closest('.ider-deluxe-panel')) return;
      let html = container.innerHTML; let ch = false;
      for (const [emoji, svg] of Object.entries(brutalEmoji)) {
        if (html.includes(emoji)) {
          html = html.replace(new RegExp(emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), `<span class="ider-emoji-svg" style="display:inline-block;width:14px;height:14px;vertical-align:middle">${svg}</span>`);
          ch = true;
        }
      }
      if (ch) container.innerHTML = html;
    });
  },
  // 侘寂：和纸肌理 + 円相禅意 + 枯山水波纹
  wabi() {
    document.documentElement.classList.add('theme-wabi');
    // 1. 背景装饰：円相 + 枯山水
    if (!document.querySelector('.ider-wabi-enso')) {
      const enso = document.createElement('div');
      enso.className = 'ider-wabi-enso';
      enso.innerHTML = ICONS.wabi.enso;
      document.body.appendChild(enso);
    }
    if (!document.querySelector('.ider-wabi-branch')) {
      const branch = document.createElement('div');
      branch.className = 'ider-wabi-branch';
      branch.innerHTML = `<svg viewBox="0 0 120 200"><path d="M60 0v160Q30 170 10 180" stroke="currentColor" stroke-width="0.6" fill="none"/><path d="M60 60Q40 50 20 55" stroke="currentColor" stroke-width="0.4" fill="none"/><path d="M60 100Q80 90 100 80" stroke="currentColor" stroke-width="0.4" fill="none"/><path d="M60 130Q45 120 30 125" stroke="currentColor" stroke-width="0.3" fill="none"/></svg>`;
      document.body.appendChild(branch);
    }
    if (!document.querySelector('.ider-wabi-kare')) {
      const kare = document.createElement('div');
      kare.className = 'ider-wabi-kare';
      document.body.appendChild(kare);
    }
    // 2. Header：垂线 + 名前直排
    const h = document.querySelector('.game-header');
    if (h) {
      const nm = h.querySelector('.hdr-name');
      if (nm) { nm.style.writingMode = 'vertical-rl'; nm.style.textOrientation = 'upright'; nm.style.letterSpacing = '8px'; nm.style.fontSize = '14px'; nm.style.margin = '4px 0'; }
      if (!h.querySelector('.ider-wabi-line')) {
        const line = document.createElement('div');
        line.style.cssText = 'position:absolute;top:0;left:12px;right:12px;height:1px;background:rgba(44,44,44,0.08);pointer-events:none';
        h.appendChild(line);
        const line2 = document.createElement('div');
        line2.style.cssText = 'position:absolute;bottom:0;left:12px;right:12px;height:1px;background:rgba(44,44,44,0.04);pointer-events:none';
        h.appendChild(line2);
      }
    }
    // 3. 图标按钮
    document.querySelectorAll('.btn-icon').forEach(b => {
      const t = (b.getAttribute('title')||'').toLowerCase();
      let svg = null;
      if (t.includes('退出')) svg = ICONS.wabi.logout;
      if (svg) { b.innerHTML = svg; b.style.cssText = 'background:none;border:none;cursor:pointer;padding:4px;color:rgba(44,44,44,0.35);width:28px;height:28px;transition:color 0.6s'; }
    });
    // 4. 导航栏：直排文字 + 竹叶图标
    document.querySelectorAll('.tab-btn').forEach(b => {
      const id = b.getAttribute('data-tab');
      if (!id || b.querySelector('.ider-nav-icon')) return;
      const s = ICONS.wabi[TAB_MAP[id]];
      if (s) {
        const sp = document.createElement('span'); sp.className = 'ider-nav-icon'; sp.innerHTML = s;
        sp.style.cssText = 'display:inline-block;width:14px;height:14px;vertical-align:middle;margin-right:4px;flex-shrink:0;opacity:0.35;transition:opacity 0.6s';
        b.prepend(sp);
      }
      b.style.cssText = 'writing-mode:vertical-rl;text-orientation:upright;letter-spacing:6px;font-size:11px;padding:10px 6px;color:rgba(44,44,44,0.5);transition:color 0.6s;background:transparent;border:none;cursor:pointer';
      b.addEventListener('mouseenter', () => { b.style.color = 'rgba(44,44,44,0.8)'; const ic = b.querySelector('.ider-nav-icon'); if (ic) ic.style.opacity = '0.6'; });
      b.addEventListener('mouseleave', () => { if (!b.classList.contains('active')) { b.style.color = 'rgba(44,44,44,0.5)'; const ic = b.querySelector('.ider-nav-icon'); if (ic) ic.style.opacity = '0.35'; } });
    });
    // 5. 侧边栏：竖排 + 茶筅装饰
    const sb = document.querySelector('.battle-sidebar');
    if (sb) {
      const nm2 = sb.querySelector('.sidebar-char-name');
      if (nm2) { nm2.style.writingMode = 'vertical-rl'; nm2.style.textOrientation = 'upright'; nm2.style.fontSize = '1rem'; nm2.style.letterSpacing = '8px'; nm2.style.color = 'rgba(44,44,44,0.6)'; nm2.style.fontWeight = '300'; }
      if (!sb.querySelector('.ider-wabi-tea')) {
        const tea = document.createElement('div');
        tea.className = 'ider-wabi-tea';
        tea.innerHTML = ICONS.wabi.tea;
        tea.style.cssText = 'position:absolute;bottom:16px;left:50%;transform:translateX(-50%);width:20px;height:20px;opacity:0.12;pointer-events:none';
        sb.appendChild(tea);
      }
    }
    // 6. 数值条：和纸薄线
    document.querySelectorAll('.exp-bar,.sr-bar,.bar-track,.hp-bar,.mp-bar').forEach(bar => {
      bar.style.cssText = 'height:3px;background:rgba(44,44,44,0.08);border-radius:0;overflow:hidden;border:none;margin:5px 0;position:relative';
      const f = bar.querySelector('.exp-fill,.sr-fill,.bar-fill,.hp-bar-fill,.hp-bar-red,.mp-bar-fill,.mp-bar-blue');
      if (f) f.style.cssText = 'height:100%;background:rgba(44,44,44,0.5);border-radius:0;transition:width 0.8s ease';
    });
    // 7. 卡片：和纸悬停 + 墨线
    document.querySelectorAll('.stat-card,.skill-card').forEach(card => {
      card.style.position = 'relative';
      if (!card.querySelector('.wabi-card-line')) {
        const line = document.createElement('div');
        line.className = 'wabi-card-line';
        card.appendChild(line);
      }
      if (!card.querySelector('.wabi-sumi-line')) {
        const sLine = document.createElement('div');
        sLine.className = 'wabi-sumi-line';
        card.appendChild(sLine);
      }
    });
    // 8. 金継ぎ：equipped卡 → 金线裂纹
    document.querySelectorAll('.skill-card.equipped').forEach(card => {
      if (!card.querySelector('.ider-wabi-kintsugi')) {
        card.classList.add('ider-wabi-kintsugi');
        const mark = document.createElement('div');
        mark.style.cssText = 'position:absolute;top:0;right:0;width:0;height:0;border-style:solid;border-width:0 20px 20px 0;border-color:transparent rgba(183,65,62,0.12) transparent transparent;pointer-events:none';
        card.appendChild(mark);
      }
    });
    // 9. emoji → 竹叶茶道替换
    const wabiEmoji = { '❤️': ICONS.wabi.heart, '💠': ICONS.wabi.bambooLeaf, '💰': ICONS.wabi.tea, '🔄': ICONS.wabi.wave, '🔔': ICONS.wabi.crane, '🏆': ICONS.wabi.bambooLeaf };
    document.querySelectorAll('.panel, .modal-panel, .stat-card, .battle-sidebar').forEach(container => {
      if (!container || container.closest('.ider-deluxe-panel')) return;
      let html = container.innerHTML; let ch = false;
      for (const [emoji, svg] of Object.entries(wabiEmoji)) {
        if (html.includes(emoji)) {
          html = html.replace(new RegExp(emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), `<span class="ider-emoji-svg" style="display:inline-block;width:12px;height:12px;vertical-align:middle;opacity:0.5">${svg}</span>`);
          ch = true;
        }
      }
      if (ch) container.innerHTML = html;
    });
  },
  // 奢华金属：鎏金 × 浮雕 × 角饰
  luxe() {
    document.documentElement.classList.add('theme-luxe');
    // 1. 四角金饰
    if (!document.querySelector('.luxe-corner')) {
      ['tl', 'tr', 'bl', 'br'].forEach(pos => {
        const c = document.createElement('div');
        c.className = 'luxe-corner ' + pos;
        document.body.appendChild(c);
      });
    }
    // 2. Header：多层金线
    const h = document.querySelector('.game-header');
    if (h) {
      const nm = h.querySelector('.hdr-name');
      if (nm) { nm.style.fontFamily = "'Playfair Display','Noto Serif SC',serif"; nm.style.fontWeight = '700'; nm.style.color = '#D4A844'; nm.style.textShadow = '0 1px 4px rgba(0,0,0,0.3), 0 0 20px rgba(212,168,68,0.1)'; nm.style.letterSpacing = '2px'; nm.style.fontSize = '16px'; }
      h.querySelectorAll('.hdr-info, .hdr-res').forEach(el => { el.style.color = '#A09080'; el.style.fontSize = '11px'; });
      if (!h.querySelector('.ider-luxe-line')) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:absolute;top:0;left:0;right:0;height:2px;pointer-events:none';
        wrap.innerHTML = '<div style="position:absolute;top:0;left:15%;right:15%;height:1px;background:linear-gradient(90deg,transparent,rgba(212,168,68,0.4) 30%,rgba(212,168,68,0.6) 50%,rgba(212,168,68,0.4) 70%,transparent)"></div><div style="position:absolute;top:2px;left:30%;right:30%;height:0.5px;background:linear-gradient(90deg,transparent,rgba(212,168,68,0.15),transparent)"></div>';
        h.appendChild(wrap);
      }
      h.style.cssText += ';border-bottom:1px solid rgba(74,63,53,0.5);padding:16px 20px;background:linear-gradient(180deg,rgba(26,22,18,0.8),transparent)';
    }
    // 3. 图标：金色描边
    document.querySelectorAll('.btn-icon').forEach(b => {
      const t = (b.getAttribute('title') || '').toLowerCase();
      let svg = null;
      if (t.includes('退出')) svg = ICONS.luxe.logout;
      else if (t.includes('设置')) svg = ICONS.luxe.diamond;
      else if (t.includes('刷新')) svg = ICONS.luxe.starGold;
      else if (t.includes('地图')) svg = ICONS.luxe.mountain;
      else if (t.includes('通知')) svg = ICONS.luxe.crown;
      if (svg) { b.innerHTML = svg; b.style.cssText = 'background:none;border:none;cursor:pointer;padding:4px;color:rgba(160,144,128,0.6);width:28px;height:28px;transition:all 0.3s'; b.addEventListener('mouseenter', () => b.style.color = '#D4A844'); b.addEventListener('mouseleave', () => b.style.color = 'rgba(160,144,128,0.6)'); }
    });
    // 4. 导航：金底文字
    document.querySelectorAll('.tab-btn').forEach(b => {
      const id = b.getAttribute('data-tab');
      if (!id || b.querySelector('.ider-nav-icon')) return;
      const s = ICONS.luxe[TAB_MAP[id]];
      if (s) {
        const sp = document.createElement('span'); sp.className = 'ider-nav-icon'; sp.innerHTML = s;
        sp.style.cssText = 'display:inline-block;width:14px;height:14px;vertical-align:middle;margin-right:5px;opacity:0.45;flex-shrink:0';
        b.prepend(sp);
      }
      b.style.cssText = 'letter-spacing:0.15em;font-size:11px;color:#A09080;padding:8px 16px;border:none;background:transparent;cursor:pointer;transition:all 0.3s;position:relative';
      b.addEventListener('mouseenter', () => { b.style.color = '#D4A844'; });
      b.addEventListener('mouseleave', () => { if (!b.classList.contains('active')) b.style.color = '#A09080'; });
      if (b.classList.contains('active')) { b.style.color = '#D4A844'; }
    });
    // 5. 数值条：金纹渐变 + 流光
    document.querySelectorAll('.exp-bar,.sr-bar,.bar-track,.hp-bar,.mp-bar').forEach(bar => {
      bar.style.cssText = 'height:6px;background:rgba(74,63,53,0.4);border-radius:3px;overflow:hidden;border:none;margin:6px 0;position:relative';
      const f = bar.querySelector('.exp-fill,.sr-fill,.bar-fill,.hp-bar-fill,.hp-bar-red,.mp-bar-fill,.mp-bar-blue');
      if (f) { f.style.cssText = 'height:100%;border-radius:3px;background:linear-gradient(90deg,#B8860B,#D4A844,#E8D5A3);background-size:200% 100%;transition:width 0.6s ease'; }
    });
    // 6. 卡片：内发光托底
    document.querySelectorAll('.stat-card,.skill-card').forEach(card => {
      card.style.cssText += ';position:relative;transition:all 0.4s ease';
      if (!card.querySelector('.ider-luxe-card-glow')) {
        const glow = document.createElement('div');
        glow.className = 'ider-luxe-card-glow';
        glow.style.cssText = 'position:absolute;bottom:0;left:10%;right:10%;height:1px;background:linear-gradient(90deg,transparent,rgba(212,168,68,0.15),transparent);opacity:0;transition:opacity 0.4s;pointer-events:none';
        card.appendChild(glow);
        card.addEventListener('mouseenter', () => glow.style.opacity = '1');
        card.addEventListener('mouseleave', () => glow.style.opacity = '0');
      }
    });
    // 7. 弹窗金边
    document.querySelectorAll('.modal-panel').forEach(p => {
      p.style.cssText = 'background:linear-gradient(160deg,rgba(26,22,18,0.98),rgba(13,11,8,0.98));border:1px solid rgba(74,63,53,0.6);border-radius:8px;padding:24px;position:relative;overflow:hidden';
      const title = p.querySelector('.modal-title');
      if (title) { title.style.color = '#D4A844'; title.style.borderBottom = '1px solid rgba(74,63,53,0.4)'; title.style.fontSize = '15px'; title.style.letterSpacing = '0.15em'; }
      if (!p.querySelector('.ider-luxe-modal-line')) {
        const ml = document.createElement('div');
        ml.className = 'ider-luxe-modal-line';
        ml.style.cssText = 'position:absolute;top:0;left:10%;right:10%;height:1px;background:linear-gradient(90deg,transparent,rgba(212,168,68,0.2),transparent);pointer-events:none';
        p.appendChild(ml);
      }
    });
    // 8. 侧边栏：金饰
    const sb = document.querySelector('.battle-sidebar');
    if (sb) {
      sb.style.cssText = 'background:linear-gradient(180deg,rgba(26,22,18,0.95),rgba(13,11,8,0.95));border-left:1px solid rgba(74,63,53,0.4);padding:20px';
      const nm2 = sb.querySelector('.sidebar-char-name');
      if (nm2) { nm2.style.color = '#D4A844'; nm2.style.fontWeight = '400'; nm2.style.letterSpacing = '0.15em'; nm2.style.fontFamily = "'Playfair Display','Noto Serif SC',serif"; }
    }
    // 9. emoji → 金纹替换
    const luxeEmoji = {
      '❤️': ICONS.luxe.heart, '💰': ICONS.luxe.crown, '💠': ICONS.luxe.diamond,
      '🏆': ICONS.luxe.starGold, '🔔': ICONS.luxe.crown, '🗡️': ICONS.luxe.sword,
      '🎒': ICONS.luxe.pouch, '💊': ICONS.luxe.diamond, '🔄': ICONS.luxe.starGold,
      '←': ICONS.luxe.fleur, '◀': ICONS.luxe.fleur,
    };
    document.querySelectorAll('.panel, .modal-panel, .stat-card, .skill-card, .battle-sidebar, .toast').forEach(container => {
      if (!container || container.closest('.ider-deluxe-panel')) return;
      let html = container.innerHTML; let ch = false;
      for (const [emoji, svg] of Object.entries(luxeEmoji)) {
        if (html.includes(emoji)) {
          html = html.replace(new RegExp(emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), `<span class="ider-emoji-svg" style="display:inline-block;width:14px;height:14px;vertical-align:middle">${svg}</span>`);
          ch = true;
        }
      }
      if (ch) container.innerHTML = html;
    });
  },
  // 轻奢杂志：编辑感排版 × 花饰分节 × 交替底色
  magazine() {
    document.documentElement.classList.add('theme-magazine');
    // 1. Header：byline风格 + 花饰分节符
    const h = document.querySelector('.game-header');
    if (h) {
      const nm = h.querySelector('.hdr-name');
      if (nm) { nm.style.fontFamily = "'Noto Serif SC','Georgia',serif"; nm.style.fontWeight = '300'; nm.style.color = '#C49A6C'; nm.style.letterSpacing = '3px'; nm.style.fontSize = '13px'; }
      h.querySelectorAll('.hdr-info, .hdr-res').forEach(el => { el.style.color = '#8A8078'; el.style.fontSize = '10px'; el.style.letterSpacing = '0.08em'; });
      if (!h.querySelector('.ider-mag-line')) {
        const line = document.createElement('div');
        line.style.cssText = 'position:absolute;bottom:0;left:0;right:0;height:0.5px;background:rgba(208,200,188,0.5);pointer-events:none';
        h.appendChild(line);
      }
      h.style.cssText += ';padding:16px 20px;position:relative';
    }
    // 2. 分节花饰
    document.querySelectorAll('.section-title').forEach(el => {
      if (!el.querySelector('.mag-ornament')) {
        const orn = document.createElement('span');
        orn.className = 'mag-ornament';
        orn.innerHTML = ICONS.magazine.fleuron;
        orn.style.cssText = 'display:inline-block;width:14px;height:14px;vertical-align:middle;margin-right:6px;opacity:0.2';
        el.prepend(orn);
      }
    });
    // 3. 图标按钮
    document.querySelectorAll('.btn-icon').forEach(b => {
      const t = (b.getAttribute('title') || '').toLowerCase();
      let svg = null;
      if (t.includes('退出')) svg = ICONS.magazine.logout;
      else if (t.includes('设置')) svg = ICONS.magazine.paragraph;
      else if (t.includes('刷新')) svg = ICONS.magazine.asterism;
      else if (t.includes('通知')) svg = ICONS.magazine.leaf;
      if (svg) { b.innerHTML = svg; b.style.cssText = 'background:none;border:none;cursor:pointer;padding:3px;color:rgba(138,128,120,0.4);width:24px;height:24px;transition:color 0.3s'; b.addEventListener('mouseenter', () => b.style.color = '#C49A6C'); }
    });
    // 4. 导航：小写标签式
    document.querySelectorAll('.tab-btn').forEach(b => {
      const id = b.getAttribute('data-tab');
      if (!id || b.querySelector('.ider-nav-icon')) return;
      const s = ICONS.magazine[TAB_MAP[id]];
      if (s) {
        const sp = document.createElement('span'); sp.className = 'ider-nav-icon'; sp.innerHTML = s;
        sp.style.cssText = 'display:inline-block;width:11px;height:11px;vertical-align:middle;margin-right:4px;opacity:0.25;flex-shrink:0';
        b.prepend(sp);
      }
      b.style.cssText = 'text-transform:uppercase;letter-spacing:0.15em;font-size:10px;color:#8A8078;padding:6px 12px;border:none;background:transparent;cursor:pointer;transition:all 0.3s;font-weight:400';
      b.addEventListener('mouseenter', () => { b.style.color = '#2A2520'; b.style.background = 'rgba(208,200,188,0.15)'; });
      b.addEventListener('mouseleave', () => { if (!b.classList.contains('active')) { b.style.color = '#8A8078'; b.style.background = 'transparent'; } });
      if (b.classList.contains('active')) { b.style.color = '#2A2520'; b.style.borderBottom = '1px solid #2A2520'; b.style.background = 'transparent'; }
    });
    // 5. 卡片交替色 + 花饰标记
    document.querySelectorAll('.stat-card').forEach((card, i) => {
      card.style.cssText += ';transition:all 0.6s ease';
      if (i % 2 === 1) card.style.background = '#F0ECE6';
      if (!card.querySelector('.mag-card-mark')) {
        const mark = document.createElement('span');
        mark.className = 'mag-card-mark';
        mark.innerHTML = ICONS.magazine.fleuron;
        mark.style.cssText = 'position:absolute;top:10px;right:14px;width:12px;height:12px;opacity:0.1;pointer-events:none';
        card.appendChild(mark);
      }
    });
    // 6. 数值条：极细线
    document.querySelectorAll('.exp-bar,.sr-bar,.bar-track,.hp-bar,.mp-bar').forEach(bar => {
      bar.style.cssText = 'height:2px;background:rgba(208,200,188,0.4);border-radius:0;overflow:hidden;border:none;margin:4px 0';
      const f = bar.querySelector('.exp-fill,.sr-fill,.bar-fill,.hp-bar-fill,.hp-bar-red,.mp-bar-fill,.mp-bar-blue');
      if (f) f.style.cssText = 'height:100%;background:#2A2520;border-radius:0;transition:width 0.6s ease';
    });
    // 7. 侧边栏：杂志竖排
    const sb = document.querySelector('.battle-sidebar');
    if (sb) {
      sb.style.cssText = 'background:#F8F6F2;border-left:0.5px solid rgba(208,200,188,0.5);padding:16px';
      const nm2 = sb.querySelector('.sidebar-char-name');
      if (nm2) { nm2.style.writingMode = 'vertical-rl'; nm2.style.color = '#2A2520'; nm2.style.fontWeight = '300'; nm2.style.letterSpacing = '8px'; nm2.style.fontSize = '14px'; }
    }
    // 8. 分节花饰底线
    document.querySelectorAll('.panel').forEach(p => {
      if (!p.querySelector('.mag-divider') && p.querySelectorAll('.section-title').length > 0) {
        const div = document.createElement('div');
        div.className = 'mag-divider';
        div.innerHTML = ICONS.magazine.asterism;
        div.style.cssText = 'text-align:center;padding:12px 0;opacity:0.15;font-size:10px;letter-spacing:0.3em;color:#C49A6C;pointer-events:none';
        p.appendChild(div);
      }
    });
    // 9. emoji → 花体替换
    const magEmoji = {
      '❤️': ICONS.magazine.heart, '💰': ICONS.magazine.fleuron, '💠': ICONS.magazine.paragraph,
      '🔔': ICONS.magazine.leaf, '🏆': ICONS.magazine.fleuron, '🔄': ICONS.magazine.asterism,
      '📖': ICONS.magazine.paragraph, '📜': ICONS.magazine.paragraph, '🗡️': ICONS.magazine.sword,
      '🗺️': ICONS.magazine.mountain, '🎒': ICONS.magazine.pouch, '⚙️': ICONS.magazine.asterism,
      '💊': ICONS.magazine.leaf, '💬': ICONS.magazine.paragraph, '←': ICONS.magazine.ornament, '◀': ICONS.magazine.ornament,
    };
    document.querySelectorAll('.panel, .modal-panel, .stat-card, .skill-card, .battle-sidebar, .toast, h2, h3').forEach(container => {
      if (!container || container.closest('.ider-deluxe-panel')) return;
      let html = container.innerHTML; let ch = false;
      for (const [emoji, svg] of Object.entries(magEmoji)) {
        if (html.includes(emoji)) {
          html = html.replace(new RegExp(emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), `<span class="ider-emoji-svg" style="display:inline-block;width:11px;height:11px;vertical-align:middle;opacity:0.35">${svg}</span>`);
          ch = true;
        }
      }
      if (ch) container.innerHTML = html;
    });
  },
  // 赛博修仙：霓虹 × 网格 × CRT 扫描 × 故障艺术
  cyber() {
    document.documentElement.classList.add('theme-cyber');
    // 1. CRT扫描线 + 网格背景（CSS已有body::before/::after）
    // 2. Header：霓虹标题 + 动态光晕
    const h = document.querySelector('.game-header');
    if (h) {
      const nm = h.querySelector('.hdr-name');
      if (nm) { nm.style.color = '#00F0FF'; nm.style.textShadow = '0 0 10px rgba(0,240,255,0.3),0 0 30px rgba(0,240,255,0.1)'; nm.style.fontWeight = '600'; nm.style.letterSpacing = '0.2em'; nm.style.textTransform = 'uppercase'; nm.style.fontFamily = "'Rajdhani','Noto Sans SC',sans-serif"; }
      h.querySelectorAll('.hdr-info, .hdr-res').forEach(el => { el.style.color = '#4A5A7A'; el.style.fontSize = '11px'; el.style.letterSpacing = '0.1em'; });
      h.style.cssText += ';border-bottom:1px solid rgba(26,26,74,0.5);padding:16px 20px;position:relative;overflow:hidden';
      // 霓虹底光
      if (!h.querySelector('.ider-cyber-glow')) {
        const g = document.createElement('div');
        g.className = 'ider-cyber-glow';
        g.style.cssText = 'position:absolute;bottom:-2px;left:5%;right:5%;height:2px;background:linear-gradient(90deg,transparent,rgba(0,240,255,0.2),transparent);animation:cyberTextFlicker 3s linear infinite;pointer-events:none';
        h.appendChild(g);
      }
    }
    // 3. 图标：霓虹发光
    document.querySelectorAll('.btn-icon').forEach(b => {
      const t = (b.getAttribute('title') || '').toLowerCase();
      let svg = null;
      if (t.includes('退出')) svg = ICONS.cyber.logout;
      else if (t.includes('设置')) svg = ICONS.cyber.hexagon;
      else if (t.includes('刷新')) svg = ICONS.cyber.pulse;
      else if (t.includes('地图')) svg = ICONS.cyber.mountain;
      else if (t.includes('通知')) svg = ICONS.cyber.crosshair;
      if (svg) { b.innerHTML = svg; b.style.cssText = 'background:none;border:none;cursor:pointer;padding:4px;color:#4A5A7A;width:28px;height:28px;transition:all 0.3s'; b.addEventListener('mouseenter', () => b.style.color = '#00F0FF'); b.addEventListener('mouseleave', () => b.style.color = '#4A5A7A'); }
    });
    // 4. 导航：霓虹边框
    document.querySelectorAll('.tab-btn').forEach(b => {
      const id = b.getAttribute('data-tab');
      if (!id || b.querySelector('.ider-nav-icon')) return;
      const s = ICONS.cyber[TAB_MAP[id]];
      if (s) {
        const sp = document.createElement('span'); sp.className = 'ider-nav-icon'; sp.innerHTML = s;
        sp.style.cssText = 'display:inline-block;width:14px;height:14px;vertical-align:middle;margin-right:6px;opacity:0.5;flex-shrink:0';
        b.prepend(sp);
      }
      b.style.cssText = 'text-transform:uppercase;letter-spacing:0.2em;font-size:10px;color:#4A5A7A;padding:8px 14px;border:1px solid transparent;background:transparent;cursor:pointer;transition:all 0.3s;font-weight:500';
      b.addEventListener('mouseenter', () => { b.style.borderColor = 'rgba(0,240,255,0.3)'; b.style.color = '#00F0FF'; b.style.textShadow = '0 0 10px rgba(0,240,255,0.1)'; });
      b.addEventListener('mouseleave', () => { if (!b.classList.contains('active')) { b.style.borderColor = 'transparent'; b.style.color = '#4A5A7A'; b.style.textShadow = 'none'; } });
      if (b.classList.contains('active')) { b.style.borderColor = '#00F0FF'; b.style.color = '#00F0FF'; b.style.background = 'rgba(0,240,255,0.03)'; b.style.boxShadow = 'inset 0 0 20px rgba(0,240,255,0.03)'; b.style.textShadow = '0 0 10px rgba(0,240,255,0.1)'; }
    });
    // 5. 数值条：霓虹渐变
    document.querySelectorAll('.exp-bar,.sr-bar,.bar-track,.hp-bar,.mp-bar').forEach(bar => {
      bar.style.cssText = 'height:4px;background:rgba(26,26,74,0.5);border-radius:2px;overflow:hidden;border:none;margin:6px 0';
      const f = bar.querySelector('.exp-fill,.sr-fill,.bar-fill,.hp-bar-fill,.hp-bar-red,.mp-bar-fill,.mp-bar-blue');
      if (f) { f.style.cssText = 'height:100%;border-radius:2px;transition:width 0.6s ease'; f.style.background = 'linear-gradient(90deg,#00F0FF,#0090FF)'; f.style.boxShadow = '0 0 6px rgba(0,240,255,0.15)'; }
    });
    // 6. 卡片：赛博玻璃 + 上扫光
    document.querySelectorAll('.stat-card,.skill-card').forEach(card => {
      card.style.cssText += ';position:relative;overflow:hidden;transition:all 0.3s ease';
      if (!card.querySelector('.ider-cyber-scan')) {
        const scan = document.createElement('div');
        scan.className = 'ider-cyber-scan';
        scan.style.cssText = 'position:absolute;top:-100%;left:0;right:0;height:30%;background:linear-gradient(180deg,transparent,rgba(0,240,255,0.03),transparent);pointer-events:none;transition:top 0.5s ease';
        card.appendChild(scan);
        card.addEventListener('mouseenter', () => { scan.style.top = '100%'; });
        card.addEventListener('mouseleave', () => { scan.style.top = '-100%'; });
      }
    });
    // 7. 弹窗：强霓虹
    document.querySelectorAll('.modal-panel').forEach(p => {
      p.style.cssText = 'background:linear-gradient(160deg,rgba(7,7,24,0.98),rgba(3,3,10,0.98));border:1px solid rgba(26,26,74,0.6);border-radius:8px;padding:24px;box-shadow:0 0 40px rgba(0,240,255,0.03)';
      const title = p.querySelector('.modal-title');
      if (title) { title.style.color = '#00F0FF'; title.style.textShadow = '0 0 20px rgba(0,240,255,0.15)'; title.style.borderBottom = '1px solid rgba(26,26,74,0.4)'; title.style.fontWeight = '600'; title.style.letterSpacing = '0.15em'; title.style.textTransform = 'uppercase'; }
    });
    // 8. 侧边栏：赛博
    const sb = document.querySelector('.battle-sidebar');
    if (sb) {
      sb.style.cssText = 'background:linear-gradient(180deg,rgba(7,7,24,0.98),rgba(3,3,10,0.98));border-left:1px solid rgba(26,26,74,0.4);padding:20px';
      const nm2 = sb.querySelector('.sidebar-char-name');
      if (nm2) { nm2.style.color = '#C4D0E0'; nm2.style.textTransform = 'uppercase'; nm2.style.letterSpacing = '0.2em'; nm2.style.fontWeight = '500'; nm2.style.textShadow = '0 0 10px rgba(0,240,255,0.03)'; }
    }
    // 9. 六边形装饰
    if (!document.querySelector('.ider-cyber-hex')) {
      const hex = document.createElement('div');
      hex.className = 'ider-cyber-hex';
      hex.innerHTML = ICONS.cyber.hexagon + ICONS.cyber.triangle + ICONS.cyber.node;
      hex.style.cssText = 'position:fixed;top:12%;right:4%;z-index:-2;pointer-events:none;opacity:0.04;display:flex;gap:10px;transform:rotate(20deg)';
      document.body.appendChild(hex);
    }
    // 10. emoji → 霓虹替换
    const cyberEmoji = {
      '❤️': ICONS.cyber.heart, '💰': ICONS.cyber.hexagon, '💠': ICONS.cyber.node,
      '⚡': ICONS.cyber.triangle, '🔔': ICONS.cyber.crosshair, '🏆': ICONS.cyber.pulse,
      '🗡️': ICONS.cyber.sword, '🔄': ICONS.cyber.pulse, '🗺️': ICONS.cyber.mountain,
      '💊': ICONS.cyber.hexagon, '🎒': ICONS.cyber.pouch, '📖': ICONS.cyber.triangle,
      '💬': ICONS.cyber.circuit, '📜': ICONS.cyber.triangle, '⚙️': ICONS.cyber.circuit,
      '←': ICONS.cyber.triangle, '◀': ICONS.cyber.triangle,
    };
    document.querySelectorAll('.panel, .modal-panel, .stat-card, .skill-card, .battle-sidebar, .toast, h2, h3').forEach(container => {
      if (!container || container.closest('.ider-deluxe-panel')) return;
      let html = container.innerHTML; let ch = false;
      for (const [emoji, svg] of Object.entries(cyberEmoji)) {
        if (html.includes(emoji)) {
          html = html.replace(new RegExp(emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), `<span class="ider-emoji-svg" style="display:inline-block;width:13px;height:13px;vertical-align:middle;opacity:0.7">${svg}</span>`);
          ch = true;
        }
      }
      if (ch) container.innerHTML = html;
    });
  },
};

/* ═══════════════════════════════════════
   核心逻辑
   ═══════════════════════════════════════ */
function getSaved(){return GM_getValue(SKIN_KEY,'')}
function setSaved(k){GM_setValue(SKIN_KEY,k)}
function getCfg(){try{return JSON.parse(GM_getValue(CONFIG_KEY,'{}'))}catch{return{}}}
function setCfg(c){GM_setValue(CONFIG_KEY,JSON.stringify(c))}

function clearStyle(){
  if(_styleEl){_styleEl.remove();_styleEl=null}
  document.querySelectorAll('[data-ider-skin-css]').forEach(e=>e.remove());
  // 清理主题类
  ['theme-inkwash','theme-wabi','theme-minimal','theme-glass','theme-brutal','theme-luxe','theme-magazine','theme-cyber'].forEach(c=>document.documentElement.classList.remove(c));
  // 清理装饰元素
  ['.ider-spotlight','.ider-ink-mountains','.ider-ink-mist','.ider-ink-corner','.ider-ink-splash','.ider-ink-birds',
    '.inkwash-nav','.inkwash-sb-seal','.inkwash-card-line','.inkwash-header-line','.inkwash-seal','.inkwash-actions','.inkwash-resources','.inkwash-realm','.inkwash-divider','.inkwash-mt-styled','.realm-seal','.inkwash-char-scroll',
    '.ider-wabi-enso','.ider-wabi-branch','.ider-wabi-kare','.ider-wabi-tea','.ider-wabi-kintsugi','.wabi-card-line','.wabi-sumi-line',
    '.ider-frost-crystal','.glass-header-glow','.ider-cyber-glow','.ider-cyber-hex','.ider-cyber-scan',
    '.luxe-corner','.ider-luxe-card-glow','.ider-luxe-modal-line',
    '.mag-ornament','.mag-divider','.mag-card-mark','.ider-mag-line',
    '.ider-brutal-shadow'].forEach(sel=>{
    document.querySelectorAll(sel).forEach(e=>e.remove());
  });
}

function applySkin(skinKey){
  clearStyle();
  _activeSkin=skinKey;
  if(!skinKey||!FALLBACK_CSS[skinKey]){setSaved('');console.log('[皮肤] 已恢复默认');return}

  // 1. 注入 fallback CSS（立即生效，防止白屏）
  const vStyle=document.createElement('style');
  vStyle.textContent=FALLBACK_CSS[skinKey];
  vStyle.setAttribute('data-ider-skin-css','vars');
  document.head.appendChild(vStyle);
  _styleEl=vStyle;

  // 2. 从服务端拉取完整 CSS（异步升级，静默失败则保留 fallback）
  fetch(SKIN_CSS_URL+skinKey)
    .then(r=>{if(r.ok)return r.text();throw new Error()})
    .then(css=>{if(css&&css.length>50){vStyle.textContent=css}})
    .catch(()=>{});

  // 3. 运行布局变换
  if(LAYOUT[skinKey])LAYOUT[skinKey]();

  // 4. 启动 Observer
  startObserver();

  setSaved(skinKey);
  console.log('[皮肤] 已应用:',skinKey);
}

function startObserver(){
  if(_observer&&_observerTarget&&document.body.contains(_observerTarget))return;
  stopObserver();
  _observerTarget=document.body;
  let timer=null;
  _observer=new MutationObserver(()=>{
    clearTimeout(timer);
    timer=setTimeout(()=>{
      if(_activeSkin&&LAYOUT[_activeSkin]&&document.querySelector('.view-game'))LAYOUT[_activeSkin]();
    },150);
  });
  _observer.observe(_observerTarget,{childList:true,subtree:true});
}
function stopObserver(){
  if(_observer){_observer.disconnect();_observer=null;_observerTarget=null}
}

/* ═══════════════════════════════════════
   API 同步
   ═══════════════════════════════════════ */
function getApiUrl(){return getCfg().apiUrl||'https://ider-order-system.pages.dev'}
function getApiToken(){return getCfg().token||''}

function fetchApiSkin(){
  const token=getApiToken(),url=getApiUrl();
  if(!token||!url)return Promise.resolve(null);
  return new Promise(r=>{
    GM_xmlhttpRequest({
      method:'GET',url:url+'/api/skins/mine',
      headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
      onload(res){
        try{
          const d=JSON.parse(res.responseText);
          if(d.ok&&d.active&&d.active.key){
            GM_xmlhttpRequest({
              method:'GET',url:url+'/api/skins/css/'+d.active.key,
              onload(r2){
                const css=r2.responseText;
                if(css&&css.length>50){
                  // 通过 API 获取的 CSS 直接注入
                  clearStyle();
                  const s=document.createElement('style');
                  s.textContent=css;s.setAttribute('data-ider-skin-css','api');
                  document.head.appendChild(s);_styleEl=s;
                  _activeSkin='__os_'+d.active.key;
                  setSaved('__os_'+d.active.key);
                  r({key:d.active.key,css});
                }else r(null);
              },
              onerror:()=>r(null)
            });
          }else r(null);
        }catch{e=>r(null)}
      },
      onerror:()=>r(null)
    });
  });
}

/* ═══════════════════════════════════════
   皮肤选择面板
   ═══════════════════════════════════════ */
const SKIN_INFO={
  ink:{name:'水墨修仙',desc:'泼墨写意，朱砂点睛'},
  wabi:{name:'侘寂和风',desc:'一期一会，世当珍惜'},
  minimal:{name:'极简主义',desc:'减法优先，留白即内容'},
  frost:{name:'磨砂玻璃',desc:'毛玻璃质感，深层空间'},
  brutal:{name:'粗野主义',desc:'裸露结构，拒绝修饰'},
  luxe:{name:'奢华金属',desc:'鎏金质感，浮雕烫金'},
  magazine:{name:'轻奢杂志',desc:'杂志排版，精致留白'},
  cyber:{name:'赛博修仙',desc:'霓虹光影，数字飞升'},
};

function injectSkinBtn(){
  const obs=new MutationObserver(()=>{
    const h=document.querySelector('.game-header');
    if(h&&!document.querySelector('.ider-deluxe-btn')){
      const btn=document.createElement('button');
      btn.className='btn-icon ider-deluxe-btn';
      btn.textContent='🎨';btn.title='豪华皮肤';
      btn.style.cssText='font-size:16px;position:relative;';
      btn.addEventListener('click',showPicker);
      h.appendChild(btn);
      obs.disconnect();
    }
  });
  obs.observe(document.body,{childList:true,subtree:true});
}

function showPicker(){
  const old=document.querySelector('.ider-deluxe-panel');
  if(old){old.remove();return}
  const cur=getSaved();
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99998';
  ov.addEventListener('click',()=>{pn.remove();ov.remove()});

  const pn=document.createElement('div');
  pn.className='ider-deluxe-panel';
  pn.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(20,22,32,0.95);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:24px;z-index:99999;min-width:320px;max-width:90vw;max-height:80vh;overflow-y:auto;backdrop-filter:blur(20px);box-shadow:0 24px 80px rgba(0,0,0,0.6)';
  let html=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><h3 style="margin:0;color:#d4a844;font-size:16px">🎨 豪华皮肤</h3><button class="ider-close" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer">✕</button></div><div style="display:grid;gap:6px">`;
  const isApi=cur.startsWith('__os_');
  html+=`<div class="ider-skin-opt ${!cur||isApi?'':'active'}" data-skin="" style="padding:10px 14px;border-radius:10px;cursor:pointer;border:2px solid ${!cur&&!isApi?'#d4a844':'transparent'};background:rgba(255,255,255,0.03)"><div style="font-weight:600;color:${!cur&&!isApi?'#d4a844':'#ccc'};font-size:14px">默认样式</div><div style="font-size:12px;color:#888;margin-top:2px">游戏原始外观</div></div>`;
  for(const[k,v]of Object.entries(SKIN_INFO)){
    const act=cur===k;
    html+=`<div class="ider-skin-opt ${act?'active':''}" data-skin="${k}" style="padding:10px 14px;border-radius:10px;cursor:pointer;border:2px solid ${act?'#d4a844':'transparent'};background:rgba(255,255,255,0.03)"><div style="font-weight:600;color:${act?'#d4a844':'#ccc'};font-size:14px">${v.name}</div><div style="font-size:12px;color:#888;margin-top:2px">${v.desc}</div></div>`;
  }
  html+=`</div><div id="ider-sync-status" style="margin-top:12px;font-size:11px;color:#666;text-align:center"></div>`;
  pn.innerHTML=html;

  pn.querySelectorAll('.ider-skin-opt').forEach(el=>{
    el.addEventListener('click',()=>{
      const k=el.dataset.skin;
      applySkin(k);
      pn.remove();ov.remove();
      showToast(k?`已切换「${SKIN_INFO[k].name}」`:'已恢复默认');
    });
  });
  pn.querySelector('.ider-close').addEventListener('click',()=>{pn.remove();ov.remove()});

  document.body.appendChild(ov);
  document.body.appendChild(pn);

  // 尝试同步工单系统皮肤
  const token=getApiToken();
  if(token){
    const status=pn.querySelector('#ider-sync-status');
    status.textContent='⏳ 同步工单系统...';
    fetchApiSkin().then(r=>{
      if(r)status.innerHTML='✅ 已同步工单系统皮肤: <strong>'+r.key+'</strong>';
      else status.textContent='ℹ️ 工单系统无激活皮肤';
    });
  }
}

function showToast(msg){
  const t=document.createElement('div');
  t.style.cssText='position:fixed;top:60px;left:50%;transform:translateX(-50%);background:rgba(30,32,52,0.95);border:1px solid #d4a844;color:#d4a844;padding:10px 24px;border-radius:20px;z-index:99999;font-size:14px;max-width:90vw;text-align:center';
  t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity 0.3s';setTimeout(()=>t.remove(),300);},2000);
}

/* ═══════════════════════════════════════
   启动
   ═══════════════════════════════════════ */
setTimeout(()=>{
  injectSkinBtn();
  setTimeout(()=>{
    const saved=getSaved();
    if(saved){
      if(saved.startsWith('__os_')){
        fetchApiSkin();
      }else if(FALLBACK_CSS[saved]){
        applySkin(saved);
      }
    }
  },800);
},1000);

})();
