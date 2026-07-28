# -*- coding: utf-8 -*-
import re

# Read the userscript to extract guzhenren CSS
path = r'G:\皮皮\编程项目\艾德尔机器人\工单系统\pages-frontend\docs\ider_skin_full.user.js'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

# Find guzhenren css
idx = c.find('guzhenren: {')
css_start = c.find('css: `', idx) + 6
css_end = c.find('`', css_start)
guzhenren_css = c[css_start:css_end]

# Remove @import line
guzhenren_css = re.sub(r'@import[^;]+;', '', guzhenren_css)

# Add to API endpoint
api_path = r'G:\皮皮\编程项目\艾德尔机器人\工单系统\pages-frontend\functions\api\skins\css\[key].js'
with open(api_path, 'r', encoding='utf-8') as f:
    api_c = f.read()

api_c = api_c.replace('};', '  guzhenren: `' + guzhenren_css + '`,\n};', 1)

with open(api_path, 'w', encoding='utf-8') as f:
    f.write(api_c)
print('Done: added guzhenren CSS')
