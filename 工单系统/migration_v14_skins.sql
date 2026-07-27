-- 迁移 v14: 更新皮肤系统 - 5旧皮肤替换为8新皮肤
-- 旧: golden(金碧辉煌), ink(水墨丹青), cyber(赛博修仙), glass(毛玻璃), rune(暗黑符文)
-- 新: ink(水墨修仙), cyber(赛博修仙), luxe(奢华金属), magazine(轻奢杂志), wabi(日式和风), minimal(极简主义), frost(磨砂玻璃态), brutal(粗野主义)

-- 1. 更新已有皮肤（保留ID，更新key/name/label/description/price/sort）
UPDATE skins SET key='luxe', name='奢华金属', label='奢华金属', description='鎏金溢彩，华贵典藏 · 金属光泽，浮雕质感', price=588, sort_order=2 WHERE key='golden';
UPDATE skins SET key='magazine', name='轻奢杂志', label='轻奢杂志', description='杂志级排版，克制优雅 · 大留白，精字距', price=288, sort_order=3 WHERE key='glass';
UPDATE skins SET key='wabi', name='日式和风', label='日式和风', description='侘寂美学，一木一石 · 自然质感，和纸纹理', price=488, sort_order=4 WHERE key='rune';
UPDATE skins SET label='水墨修仙', description='泼墨写意，素雅高远 · 大面积留白，笔触质感', price=388, sort_order=0 WHERE key='ink';
UPDATE skins SET label='赛博修仙', description='霓虹光污染，数据流涌动 · 紧凑布局，速度感', price=688, sort_order=1 WHERE key='cyber';

-- 2. 插入新皮肤（minimal, frost, brutal 在数据库中不存在旧记录）
INSERT OR IGNORE INTO skins (name, key, label, description, price, sort_order, is_active) VALUES
('极简主义', 'minimal', '极简主义', '少即是多，内容至上 · 极致留白，去装饰化', 188, 5, 1),
('磨砂玻璃态', 'frost', '磨砂玻璃态', 'Apple 风格玻璃拟态 · 通透模糊，悬浮层次', 388, 6, 1),
('粗野主义', 'brutal', '粗野主义', '粗粝不羁，破格醒目 · 厚边框，撞色块，无圆角', 288, 7, 1);
