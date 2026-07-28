-- 迁移 v16: 皮肤调价 + 新增敦煌飞天/阴阳太极
-- 最高质量: 敦煌飞天、阴阳太极、赛博修仙、水墨修仙 → 129 修仙币
-- 中档: 奢华金属、日式和风 → 88 修仙币
-- 低档: 轻奢杂志、磨砂玻璃态 → 68 修仙币
-- 最低: 极简主义、粗野主义 → 48 修仙币

-- 1. 更新已有皮肤价格
UPDATE skins SET price = 129, sort_order = 0 WHERE key = 'ink';
UPDATE skins SET price = 129, sort_order = 1 WHERE key = 'cyber';
UPDATE skins SET price = 88, sort_order = 4 WHERE key = 'luxe';
UPDATE skins SET price = 88, sort_order = 5 WHERE key = 'wabi';
UPDATE skins SET price = 68, sort_order = 6 WHERE key = 'magazine';
UPDATE skins SET price = 68, sort_order = 7 WHERE key = 'frost';
UPDATE skins SET price = 48, sort_order = 8 WHERE key = 'minimal';
UPDATE skins SET price = 48, sort_order = 9 WHERE key = 'brutal';

-- 2. 插入新皮肤
INSERT OR IGNORE INTO skins (name, key, label, description, price, sort_order, is_active) VALUES
('敦煌飞天', 'dunhuang', '敦煌飞天', '壁画霓裳，飞天神韵 · 莫高色彩，飘带灵动', 129, 2, 1),
('阴阳太极', 'taiji', '阴阳太极', '阴阳相生，太极无极 · 黑白对立，道法自然', 129, 3, 1);
