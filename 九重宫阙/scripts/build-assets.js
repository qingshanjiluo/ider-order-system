/**
 * 九重宫阙 · 美术资产切分与优化管线（P7）
 *
 * 输入：game-assets/_inbox/*.png（原始 14 张）
 * 输出：public/assets/**（web 可用资产）
 *
 * 纪律：
 *   ① 原图永不改动，只读；
 *   ② 输出统一 JPEG(q88) 或 PNG(无损线稿)，单文件体积上限见 MAX_BYTES；
 *   ③ 每张产出登记到 game-assets/manifest.json（含源文件、区域、用途、尺寸、字节），
 *      供 UI 引用与机器判定断言（test-assets.js）双向核对；
 *   ④ 幂等：同输入重复跑，输出字节一致（除 JPEG 编码器非确定性，用 --check 只比尺寸/数量）。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const INBOX = path.join(ROOT, 'game-assets', '_inbox');
const OUT = path.join(ROOT, 'public', 'assets');
const MANIFEST = path.join(ROOT, 'game-assets', 'manifest.json');

const MAX_BYTES = 400 * 1024;   // 单资产上限 400KB（首屏背景另计）
const MAX_BG_BYTES = 700 * 1024; // 背景类上限

// 资产定义：源文件 → 产出（用途、目标尺寸、格式、区域裁剪比例）
// 区域用 [x0,y0,x1,y1] 相对比例（0~1），null = 全图
const PLAN = [
  // ---- 场景背景（16:9）----
  { src: '入仙门图.png', out: 'bg/login.jpg', use: '登录页背景', w: 1600, fmt: 'jpg', bg: true },
  { src: '战斗图.png', out: 'bg/battle.jpg', use: '刷怪历练背景', w: 1600, fmt: 'jpg', bg: true },
  { src: '渡劫图.png', out: 'bg/tribulation.jpg', use: '渡劫/天劫背景', w: 1600, fmt: 'jpg', bg: true },
  { src: '仙盟会议.png', out: 'bg/guild.jpg', use: '仙盟事务背景', w: 1600, fmt: 'jpg', bg: true },
  { src: '仙逝转世.png', out: 'bg/reincarnate.jpg', use: '坐化转世背景', w: 1600, fmt: 'jpg', bg: true },
  { src: '时间轮转.png', out: 'bg/time.jpg', use: '结算/挂机背景', w: 1600, fmt: 'jpg', bg: true },
  { src: '正魔对立.png', out: 'bg/faction.jpg', use: '阵营/赛季背景', w: 1600, fmt: 'jpg', bg: true },
  // ---- 标题与海报 ----
  { src: '横版标题.png', out: 'ui/title.png', use: '横版游戏标题', w: 560, fmt: 'png' },
  { src: '2x2名字标题.png', out: 'ui/title-square.jpg', use: '方形标题（启动页）', w: 800, fmt: 'jpg' },
  { src: '海报.png', out: 'ui/poster.jpg', use: '竖版海报（分享/公告）', w: 720, fmt: 'jpg' },
  // ---- 立绘 ----
  { src: '立绘.png', out: 'char/portrait.jpg', use: '角色立绘', w: 800, fmt: 'jpg' },
  { src: 'q版立绘.png', out: 'char/chibi.jpg', use: 'Q版立绘（导航/空状态）', w: 1200, fmt: 'jpg' }
];

function ensureDir(p) { fs.mkdirSync(path.dirname(p), { recursive: true }); }

function convert(srcFile, dstFile, targetW, fmt, crop, quantize) {
  ensureDir(dstFile);
  const cropJs = crop ? `$cx=[int]($i.Width*${crop[0]});$cy=[int]($i.Height*${crop[1]});$cw=[int]($i.Width*${crop[2]});$ch=[int]($i.Height*${crop[3]})` : '$cx=0;$cy=0;$cw=$i.Width;$ch=$i.Height';
  // 目标格式优先级：jpg → 高质量 JPEG；png → PNG（尺寸已被 PLAN 控制，不做调色板量化：PS5.1 上 8bpp 重映射会挂）
  const ps = `
Add-Type -AssemblyName System.Drawing
$i = [System.Drawing.Image]::FromFile('${srcFile.replace(/'/g, "''")}')
${cropJs}
$w = ${targetW}
$h = [int]($ch * $w / $cw)
$b = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($b)
$g.InterpolationMode = 'HighQualityBicubic'
$g.SmoothingMode = 'HighQuality'
$g.PixelOffsetMode = 'HighQuality'
$g.DrawImage($i, (New-Object System.Drawing.Rectangle(0,0,$w,$h)), (New-Object System.Drawing.Rectangle($cx,$cy,$cw,$ch)), [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$enc = ${fmt === 'jpg' ? "[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }" : '$null'}
if ($enc) { $p = New-Object System.Drawing.Imaging.EncoderParameters(1); $p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]88); $b.Save('${dstFile.replace(/'/g, "''")}', $enc, $p) }
else { $b.Save('${dstFile.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png) }
$b.Dispose(); $i.Dispose()
[Console]::WriteLine($w.ToString() + 'x' + $h.ToString())
`;
  const out = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  return out.trim().split(/\r?\n/).pop();
}

const entries = [];
let totalBytes = 0;
const problems = [];

for (const item of PLAN) {
  const srcFile = path.join(INBOX, item.src);
  if (!fs.existsSync(srcFile)) { problems.push(`源缺失：${item.src}`); continue; }
  const dstFile = path.join(OUT, item.out);
  const dim = convert(srcFile, dstFile, item.w, item.fmt, item.crop || null, item.quantize || false);
  const size = fs.statSync(dstFile).size;
  totalBytes += size;
  const limit = item.bg ? MAX_BG_BYTES : MAX_BYTES;
  if (size > limit) problems.push(`体积超限：${item.out} ${(size / 1024).toFixed(0)}KB > ${(limit / 1024).toFixed(0)}KB`);
  entries.push({
    src: item.src, out: 'assets/' + item.out, use: item.use,
    dim, bytes: size, format: item.fmt, crop: item.crop || null
  });
  console.log(`  ${item.out.padEnd(28)} ${dim.padEnd(11)} ${(size / 1024).toFixed(0).padStart(4)}KB  ${item.use}`);
}

// 图标集单独处理（网格切分 + 雪碧图）
// 实测网格：小图标素材 1536x1024 = 4列×4行（每格 384x256）；主站图标 1254x1254 = 2x2（每格 627x627，右上为选定主图标）
const ICON_SHEETS = [
  {
    src: '小图标素材.png', cols: 4, rows: 4, key: 'icons',
    label: '小图标素材（4x4 网格）',
    slots: [
      // 行优先：格位 = row*cols + col，用途按游戏导航语义命名
      'nav-map', 'nav-trade', 'nav-craft', 'nav-sect',
      'nav-guild', 'nav-battle', 'nav-char', 'nav-cave',
      'nav-skill', 'nav-gongfa', 'nav-bag', 'nav-achieve',
      'stat-hp', 'stat-mp', 'stat-exp', 'stat-stone'
    ]
  },
  {
    src: '四个图标右上角的是我选定的主网站图标.png', cols: 2, rows: 2, key: 'appicon',
    label: '主站图标（2x2，右上为选定）',
    slots: ['alt-tl', 'main', 'alt-bl', 'alt-br'],   // 右上 = main（用户指定）
    mainSlot: 'main'
  }
];

// ---- 图标网格切分：每格导出 128px PNG，并生成 favicon/PWA 尺寸 ----
// inset：格位内缩比例（0.06 = 四周各裁 6%），避免图标贴边、留呼吸感
function sliceCell(srcFile, dstFile, cx, cy, cw, ch, outSize, fmt, inset) {
  ensureDir(dstFile);
  const pad = inset || 0;
  const ps = `
Add-Type -AssemblyName System.Drawing
$i = [System.Drawing.Image]::FromFile('${srcFile.replace(/'/g, "''")}')
$ix = [int](${cw} * ${pad}); $iy = [int](${ch} * ${pad})
$iw = ${cw} - 2 * $ix; $ih = ${ch} - 2 * $iy
$b = New-Object System.Drawing.Bitmap(${outSize}, ${outSize})
$g = [System.Drawing.Graphics]::FromImage($b)
$g.InterpolationMode = 'HighQualityBicubic'
$g.SmoothingMode = 'HighQuality'
$g.PixelOffsetMode = 'HighQuality'
$g.Clear([System.Drawing.Color]::Transparent)
$scale = [Math]::Min(${outSize} / $iw, ${outSize} / $ih)
$dw = [int]($iw * $scale); $dh = [int]($ih * $scale)
$dx = [int](((${outSize} - $dw) / 2)); $dy = [int](((${outSize} - $dh) / 2))
$g.DrawImage($i, (New-Object System.Drawing.Rectangle($dx,$dy,$dw,$dh)), (New-Object System.Drawing.Rectangle((${cx} + $ix),(${cy} + $iy),$iw,$ih)), [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$enc = ${fmt === 'jpg' ? "[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }" : '$null'}
if ($enc) { $p = New-Object System.Drawing.Imaging.EncoderParameters(1); $p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]92); $b.Save('${dstFile.replace(/'/g, "''")}', $enc, $p) }
else { $b.Save('${dstFile.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png) }
$b.Dispose(); $i.Dispose()
[Console]::WriteLine('ok')
`;
  execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
}

const iconEntries = [];
for (const sheet of ICON_SHEETS) {
  const srcFile = path.join(INBOX, sheet.src);
  if (!fs.existsSync(srcFile)) { problems.push(`图标源缺失：${sheet.src}`); continue; }
  const psDim = `Add-Type -AssemblyName System.Drawing; $i=[System.Drawing.Image]::FromFile('${srcFile.replace(/'/g, "''")}'); [Console]::WriteLine($i.Width.ToString()+','+$i.Height.ToString()); $i.Dispose()`;
  const [W, H] = execFileSync('powershell', ['-NoProfile', '-Command', psDim], { encoding: 'utf8' }).trim().split(',').map(Number);
  const cw = Math.floor(W / sheet.cols), ch = Math.floor(H / sheet.rows);
  let idx = 0;
  for (let r = 0; r < sheet.rows; r++) {
    for (let c = 0; c < sheet.cols; c++) {
      const slot = sheet.slots[idx] || `cell-${idx}`;
      const outRel = sheet.key === 'appicon' ? `app/${slot}.png` : `icons/${slot}.png`;
      const dstFile = path.join(OUT, outRel);
      const size = sheet.key === 'appicon' ? 256 : 128;
      const inset = sheet.key === 'appicon' ? 0.02 : 0.07;
      sliceCell(srcFile, dstFile, c * cw, r * ch, cw, ch, size, 'png', inset);
      const bytes = fs.statSync(dstFile).size;
      totalBytes += bytes;
      iconEntries.push({ sheet: sheet.key, slot, out: 'assets/' + outRel, cell: `${c * cw},${r * ch},${cw},${ch}`, dim: `${size}x${size}`, bytes });
      idx++;
    }
  }
  console.log(`  ${sheet.label} → ${sheet.cols * sheet.rows} 格（每格 ${cw}x${ch}）已切分`);
}

// favicon / PWA 图标（用主站图标的 main 格）
const mainIcon = path.join(OUT, 'app', 'main.png');
if (fs.existsSync(mainIcon)) {
  for (const [sz, name] of [[32, 'favicon-32.png'], [180, 'apple-touch-icon.png'], [192, 'icon-192.png'], [512, 'icon-512.png']]) {
    const dst = path.join(OUT, name);
    const ps = `
Add-Type -AssemblyName System.Drawing
$i = [System.Drawing.Image]::FromFile('${mainIcon.replace(/'/g, "''")}')
$b = New-Object System.Drawing.Bitmap(${sz}, ${sz})
$g = [System.Drawing.Graphics]::FromImage($b)
$g.InterpolationMode = 'HighQualityBicubic'
$g.DrawImage($i, 0, 0, ${sz}, ${sz})
$g.Dispose(); $b.Save('${dst.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose(); $i.Dispose()
`;
    execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
    const bytes = fs.statSync(dst).size;
    totalBytes += bytes;
    iconEntries.push({ sheet: 'appicon', slot: name.replace('.png', ''), out: 'assets/' + name, cell: 'main', dim: `${sz}x${sz}`, bytes });
  }
  // 根目录 favicon.ico 位置也用 png（浏览器普遍接受）
  fs.copyFileSync(path.join(OUT, 'favicon-32.png'), path.join(ROOT, 'public', 'favicon.png'));
  console.log('  favicon/PWA 四尺寸已生成（源：主站图标 main 格）');
}

fs.writeFileSync(MANIFEST, JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: 'game-assets/_inbox（用户提供 14 张原始素材）',
  policy: { maxAssetBytes: MAX_BYTES, maxBgBytes: MAX_BG_BYTES, quality: 88 },
  totalBytes, count: entries.length + iconEntries.length,
  assets: entries, icons: iconEntries
}, null, 2) + '\n', 'utf8');

console.log(`\n产出 ${entries.length} 场景/UI 资产 + ${iconEntries.length} 图标，合计 ${(totalBytes / 1024 / 1024).toFixed(2)}MB`);
if (problems.length) { console.log('\n问题：'); problems.forEach((p) => console.log('  ⚠ ' + p)); process.exitCode = 1; }
else console.log('🟢 全部资产在体积上限内');
