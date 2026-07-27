// functions/api/skins/css/[key].js — GET /api/skins/css/:key
import { json } from '../../../_utils.js';

const SKIN_CSS = {
  golden: `/* 金碧辉煌 - 金色奢华主题 */
:root {
  --gold-primary: #C9A96E;
  --gold-light: #F5E6B8;
  --gold-dark: #8B6914;
  --gold-glow: rgba(201,169,110,0.3);
}
body { background: linear-gradient(135deg, #1a1100 0%, #2d1f00 50%, #1a1100 100%) !important; }
.sidebar { background: linear-gradient(180deg, #1a0f00 0%, #2d1a00 100%) !important; border-right: 1px solid var(--gold-dark) !important; }
.sidebar-brand { border-bottom-color: var(--gold-dark) !important; }
.sidebar-brand h1 { color: var(--gold-primary) !important; text-shadow: 0 0 20px var(--gold-glow); }
.nav-item { color: var(--gold-light) !important; }
.nav-item:hover, .nav-item.active { background: linear-gradient(90deg, rgba(201,169,110,0.15), transparent) !important; color: var(--gold-primary) !important; }
.topbar { background: rgba(26,15,0,0.95) !important; border-bottom: 1px solid var(--gold-dark) !important; backdrop-filter: blur(10px); }
.card, .stat-card, .table-wrap { background: rgba(45,26,0,0.8) !important; border-color: var(--gold-dark) !important; backdrop-filter: blur(5px); }
.card:hover { box-shadow: 0 4px 20px var(--gold-glow) !important; }
h2, h3, .stat-value, .form-label { color: var(--gold-primary) !important; }
.page-header p, .stat-label, .text-muted { color: var(--gold-light) !important; }
.form-input, .form-select, .form-textarea { background: rgba(26,15,0,0.6) !important; border-color: var(--gold-dark) !important; color: var(--gold-light) !important; }
.form-input:focus { border-color: var(--gold-primary) !important; box-shadow: 0 0 8px var(--gold-glow) !important; }
.btn-primary { background: linear-gradient(135deg, var(--gold-primary), var(--gold-dark)) !important; border-color: var(--gold-primary) !important; color: #1a1100 !important; }
.btn-primary:hover { box-shadow: 0 0 15px var(--gold-glow) !important; }
.btn-secondary { border-color: var(--gold-dark) !important; color: var(--gold-light) !important; }
.btn-secondary:hover { background: rgba(201,169,110,0.1) !important; }
.badge-approved { background: rgba(201,169,110,0.2) !important; color: var(--gold-primary) !important; }
.modal { background: rgba(26,15,0,0.98) !important; border: 1px solid var(--gold-dark) !important; }
.modal-header { border-bottom-color: var(--gold-dark) !important; }
.modal-footer { border-top-color: var(--gold-dark) !important; }
::-webkit-scrollbar-thumb { background: var(--gold-dark) !important; }
::-webkit-scrollbar-thumb:hover { background: var(--gold-primary) !important; }
table thead th { background: rgba(201,169,110,0.1) !important; color: var(--gold-primary) !important; border-bottom-color: var(--gold-dark) !important; }
tbody td { border-bottom-color: rgba(201,169,110,0.1) !important; }
tbody tr:hover { background: rgba(201,169,110,0.05) !important; }
.sidebar-section, .sidebar-section-trigger { color: var(--gold-dark) !important; }
.sidebar-section-trigger:hover { color: var(--gold-primary) !important; }
.tab { color: var(--gold-dark) !important; }
.tab.active, .tab:hover { color: var(--gold-primary) !important; border-bottom-color: var(--gold-primary) !important; }
.toast { background: rgba(26,15,0,0.98) !important; border-color: var(--gold-dark) !important; }`,

  ink: `/* 水墨丹青 - 水墨国风主题 */
:root {
  --ink-black: #1a1a2e;
  --ink-gray: #c4c4c4;
  --ink-light: #e8e0d0;
  --ink-accent: #8b7355;
  --ink-wash: rgba(139,115,85,0.1);
}
body { background: linear-gradient(135deg, #0d0d1a 0%, #1a1a2e 50%, #0d0d1a 100%) !important; }
.sidebar { background: linear-gradient(180deg, #0d0d1a 0%, #1a1a2e 100%) !important; border-right: 1px solid rgba(139,115,85,0.3) !important; }
.sidebar-brand { border-bottom-color: rgba(139,115,85,0.2) !important; }
.sidebar-brand h1 { color: var(--ink-light) !important; font-family: 'STKaiti', 'KaiTi', serif !important; letter-spacing: 0.1em !important; }
.nav-item { color: var(--ink-gray) !important; }
.nav-item:hover, .nav-item.active { background: var(--ink-wash) !important; color: var(--ink-light) !important; }
.topbar { background: rgba(13,13,26,0.95) !important; border-bottom: 1px solid rgba(139,115,85,0.2) !important; }
.card, .stat-card, .table-wrap { background: rgba(26,26,46,0.9) !important; border-color: rgba(139,115,85,0.2) !important; }
h2, h3, .stat-value { color: var(--ink-light) !important; font-family: 'STKaiti', 'KaiTi', serif !important; font-weight: 400 !important; }
.page-header p, .stat-label, .text-muted { color: var(--ink-gray) !important; }
.form-input, .form-select, .form-textarea { background: rgba(13,13,26,0.6) !important; border-color: rgba(139,115,85,0.3) !important; color: var(--ink-light) !important; }
.form-input:focus { border-color: var(--ink-accent) !important; }
.btn-primary { background: var(--ink-accent) !important; border-color: var(--ink-accent) !important; color: var(--ink-light) !important; }
.btn-secondary { border-color: rgba(139,115,85,0.3) !important; color: var(--ink-gray) !important; }
.btn-secondary:hover { background: var(--ink-wash) !important; }
.badge-approved { background: var(--ink-wash) !important; color: var(--ink-accent) !important; }
.modal { background: rgba(13,13,26,0.98) !important; border: 1px solid rgba(139,115,85,0.3) !important; }
.modal-header { border-bottom-color: rgba(139,115,85,0.2) !important; }
.modal-footer { border-top-color: rgba(139,115,85,0.2) !important; }
::-webkit-scrollbar-thumb { background: rgba(139,115,85,0.3) !important; }
table thead th { background: rgba(139,115,85,0.08) !important; color: var(--ink-accent) !important; border-bottom-color: rgba(139,115,85,0.2) !important; }
tbody td { border-bottom-color: rgba(139,115,85,0.05) !important; }
tbody tr:hover { background: var(--ink-wash) !important; }
.sidebar-section-trigger:hover { color: var(--ink-light) !important; }
.tab.active { color: var(--ink-light) !important; border-bottom-color: var(--ink-accent) !important; }`,

  cyber: `/* 赛博修仙 - 赛博朋克主题 */
:root {
  --cyber-pink: #ff2d95;
  --cyber-blue: #00d4ff;
  --cyber-purple: #b400ff;
  --cyber-green: #00ff88;
  --cyber-bg: #0a0a1a;
}
body { background: linear-gradient(135deg, #0a0a1a 0%, #1a0033 50%, #0a0a1a 100%) !important; }
.sidebar { background: linear-gradient(180deg, rgba(10,10,26,0.98) 0%, rgba(26,0,51,0.98) 100%) !important; border-right: 1px solid rgba(0,212,255,0.2) !important; }
.sidebar-brand { border-bottom-color: rgba(0,212,255,0.15) !important; }
.sidebar-brand h1 { color: var(--cyber-blue) !important; text-shadow: 0 0 20px rgba(0,212,255,0.5) !important; }
.nav-item { color: rgba(255,255,255,0.6) !important; }
.nav-item:hover, .nav-item.active { background: linear-gradient(90deg, rgba(0,212,255,0.1), transparent) !important; color: var(--cyber-blue) !important; }
.topbar { background: rgba(10,10,26,0.95) !important; border-bottom: 1px solid rgba(0,212,255,0.15) !important; backdrop-filter: blur(10px); }
.card, .stat-card, .table-wrap { background: rgba(20,0,40,0.85) !important; border-color: rgba(0,212,255,0.15) !important; backdrop-filter: blur(5px); }
.card:hover { box-shadow: 0 0 20px rgba(0,212,255,0.15) !important; }
h2, h3, .stat-value { color: var(--cyber-blue) !important; text-shadow: 0 0 10px rgba(0,212,255,0.3) !important; }
.page-header p, .stat-label, .text-muted { color: rgba(255,255,255,0.5) !important; }
.form-input, .form-select, .form-textarea { background: rgba(10,10,26,0.6) !important; border-color: rgba(0,212,255,0.2) !important; color: #fff !important; }
.form-input:focus { border-color: var(--cyber-pink) !important; box-shadow: 0 0 10px rgba(255,45,149,0.3) !important; }
.btn-primary { background: linear-gradient(135deg, var(--cyber-pink), var(--cyber-purple)) !important; border: none !important; color: #fff !important; }
.btn-primary:hover { box-shadow: 0 0 20px rgba(255,45,149,0.4) !important; }
.btn-secondary { border-color: rgba(0,212,255,0.2) !important; color: var(--cyber-blue) !important; }
.btn-secondary:hover { background: rgba(0,212,255,0.1) !important; }
.badge-approved { background: rgba(0,212,255,0.15) !important; color: var(--cyber-blue) !important; }
.badge-pending { background: rgba(255,45,149,0.15) !important; color: var(--cyber-pink) !important; }
.modal { background: rgba(10,10,26,0.98) !important; border: 1px solid rgba(0,212,255,0.2) !important; }
.modal-header { border-bottom-color: rgba(0,212,255,0.15) !important; }
.modal-footer { border-top-color: rgba(0,212,255,0.15) !important; }
::-webkit-scrollbar-thumb { background: var(--cyber-blue) !important; }
::-webkit-scrollbar-thumb:hover { background: var(--cyber-pink) !important; }
table thead th { background: rgba(0,212,255,0.08) !important; color: var(--cyber-blue) !important; border-bottom-color: rgba(0,212,255,0.15) !important; }
tbody td { border-bottom-color: rgba(0,212,255,0.05) !important; }
tbody tr:hover { background: rgba(0,212,255,0.03) !important; }
.sidebar-section-trigger:hover { color: var(--cyber-pink) !important; }
.tab.active { color: var(--cyber-pink) !important; border-bottom-color: var(--cyber-pink) !important; }
.toast { background: rgba(10,10,26,0.98) !important; border-color: rgba(0,212,255,0.2) !important; }
.scrolling-announcement { background: linear-gradient(90deg, #0a0a1a, #1a0033) !important; border-bottom: 1px solid var(--cyber-pink) !important; }
.spinner { border-top-color: var(--cyber-pink) !important; }`,

  glass: `/* 毛玻璃 - 毛玻璃质感主题 */
:root {
  --glass-bg: rgba(255,255,255,0.08);
  --glass-border: rgba(255,255,255,0.12);
  --glass-blur: blur(20px);
  --glass-accent: rgba(255,255,255,0.6);
  --glass-text: rgba(255,255,255,0.9);
}
body { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%) !important; }
.sidebar { background: rgba(26,26,46,0.7) !important; backdrop-filter: blur(30px) !important; -webkit-backdrop-filter: blur(30px) !important; border-right: 1px solid var(--glass-border) !important; }
.sidebar-brand { border-bottom-color: var(--glass-border) !important; }
.sidebar-brand h1 { color: var(--glass-text) !important; }
.nav-item { color: rgba(255,255,255,0.6) !important; }
.nav-item:hover, .nav-item.active { background: var(--glass-bg) !important; color: #fff !important; }
.topbar { background: rgba(26,26,46,0.6) !important; backdrop-filter: blur(20px) !important; -webkit-backdrop-filter: blur(20px) !important; border-bottom: 1px solid var(--glass-border) !important; }
.card, .stat-card, .table-wrap { background: var(--glass-bg) !important; backdrop-filter: blur(15px) !important; -webkit-backdrop-filter: blur(15px) !important; border: 1px solid var(--glass-border) !important; }
.card:hover { box-shadow: 0 8px 32px rgba(0,0,0,0.3) !important; }
h2, h3, .stat-value, .form-label { color: var(--glass-text) !important; }
.page-header p, .stat-label, .text-muted { color: var(--glass-accent) !important; }
.form-input, .form-select, .form-textarea { background: rgba(255,255,255,0.05) !important; border: 1px solid var(--glass-border) !important; color: var(--glass-text) !important; }
.form-input:focus { border-color: rgba(255,255,255,0.3) !important; box-shadow: 0 0 15px rgba(255,255,255,0.05) !important; }
.btn-primary { background: rgba(255,255,255,0.15) !important; backdrop-filter: blur(10px) !important; border: 1px solid var(--glass-border) !important; color: #fff !important; }
.btn-primary:hover { background: rgba(255,255,255,0.25) !important; }
.btn-secondary { background: rgba(255,255,255,0.05) !important; border: 1px solid var(--glass-border) !important; color: var(--glass-text) !important; }
.btn-secondary:hover { background: rgba(255,255,255,0.1) !important; }
.badge-approved { background: rgba(0,255,136,0.15) !important; color: #00ff88 !important; }
.modal { background: rgba(26,26,46,0.85) !important; backdrop-filter: blur(30px) !important; border: 1px solid var(--glass-border) !important; }
.modal-header { border-bottom-color: var(--glass-border) !important; }
.modal-footer { border-top-color: var(--glass-border) !important; }
::-webkit-scrollbar-thumb { background: var(--glass-border) !important; }
table thead th { background: rgba(255,255,255,0.03) !important; color: var(--glass-accent) !important; border-bottom-color: var(--glass-border) !important; }
tbody td { border-bottom-color: rgba(255,255,255,0.03) !important; }
tbody tr:hover { background: rgba(255,255,255,0.03) !important; }
.sidebar-section-trigger:hover { color: var(--glass-text) !important; }
.tab.active { color: #fff !important; border-bottom-color: rgba(255,255,255,0.5) !important; }`,

  rune: `/* 暗黑符文 - 暗黑符文主题 */
:root {
  --rune-red: #cc3300;
  --rune-dark-red: #661100;
  --rune-glow: rgba(204,51,0,0.4);
  --rune-gold: #8B6914;
  --rune-bg: #0a0a0a;
}
body { background: linear-gradient(135deg, #050505 0%, #0f0a05 50%, #050505 100%) !important; }
.sidebar { background: linear-gradient(180deg, #0a0505 0%, #1a0a05 100%) !important; border-right: 1px solid var(--rune-dark-red) !important; }
.sidebar-brand { border-bottom-color: var(--rune-dark-red) !important; }
.sidebar-brand h1 { color: var(--rune-red) !important; text-shadow: 0 0 15px var(--rune-glow) !important; letter-spacing: 0.15em !important; }
.nav-item { color: rgba(255,255,255,0.45) !important; }
.nav-item:hover, .nav-item.active { background: linear-gradient(90deg, rgba(204,51,0,0.1), transparent) !important; color: var(--rune-red) !important; }
.topbar { background: rgba(5,5,5,0.95) !important; border-bottom: 1px solid var(--rune-dark-red) !important; }
.card, .stat-card, .table-wrap { background: rgba(15,10,5,0.9) !important; border-color: var(--rune-dark-red) !important; }
.card:hover { box-shadow: 0 4px 20px rgba(204,51,0,0.15) !important; }
h2, h3, .stat-value { color: var(--rune-red) !important; text-shadow: 0 0 8px var(--rune-glow) !important; }
.page-header p, .stat-label, .text-muted { color: rgba(255,255,255,0.35) !important; }
.form-input, .form-select, .form-textarea { background: rgba(5,5,5,0.6) !important; border-color: var(--rune-dark-red) !important; color: rgba(255,255,255,0.7) !important; }
.form-input:focus { border-color: var(--rune-red) !important; box-shadow: 0 0 10px var(--rune-glow) !important; }
.btn-primary { background: linear-gradient(135deg, var(--rune-red), var(--rune-dark-red)) !important; border: none !important; color: #fff !important; }
.btn-primary:hover { box-shadow: 0 0 20px var(--rune-glow) !important; }
.btn-secondary { border-color: var(--rune-dark-red) !important; color: rgba(255,255,255,0.5) !important; }
.btn-secondary:hover { background: rgba(204,51,0,0.05) !important; }
.badge-approved { background: rgba(204,51,0,0.15) !important; color: var(--rune-red) !important; }
.modal { background: rgba(5,5,5,0.98) !important; border: 1px solid var(--rune-dark-red) !important; }
.modal-header { border-bottom-color: var(--rune-dark-red) !important; }
.modal-footer { border-top-color: var(--rune-dark-red) !important; }
::-webkit-scrollbar-thumb { background: var(--rune-dark-red) !important; }
::-webkit-scrollbar-thumb:hover { background: var(--rune-red) !important; }
table thead th { background: rgba(204,51,0,0.08) !important; color: var(--rune-red) !important; border-bottom-color: var(--rune-dark-red) !important; }
tbody td { border-bottom-color: rgba(204,51,0,0.05) !important; }
tbody tr:hover { background: rgba(204,51,0,0.03) !important; }
.sidebar-section-trigger:hover { color: var(--rune-red) !important; }
.tab.active { color: var(--rune-red) !important; border-bottom-color: var(--rune-red) !important; }
.toast { background: rgba(5,5,5,0.98) !important; border-color: var(--rune-dark-red) !important; }
.scrolling-announcement { background: linear-gradient(90deg, #050505, #0f0a05) !important; border-bottom: 1px solid var(--rune-dark-red) !important; }`,
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
