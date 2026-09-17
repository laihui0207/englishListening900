#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
清洗 levels/junior/sentences.json
- "A / B" → 取第一个变体 A
- 去除末尾 / · 等杂字符
- 过滤太短或无实质内容的行
- 重新编号，更新 audio 路径
"""
import json, re, os

src = os.path.join(os.path.dirname(__file__), '..', 'levels', 'junior', 'sentences.json')

with open(src, encoding='utf-8') as f:
    data = json.load(f)

def clean(text):
    # 取斜线第一个变体（"A / B" → "A"）
    text = text.split(' / ')[0].split('/')[0]
    # 去除末尾标点垃圾：· … — - 空格
    text = re.sub(r'[\s·…—\-]+$', '', text)
    # 去除非 ASCII 可打印字符（保留常见标点）
    text = re.sub(r"[^\x20-\x7E\'’]", '', text)
    text = text.strip()
    return text

cleaned = []
for item in data:
    eng = clean(item['english'])
    # 过滤：长度 < 4，或英文单词少于 2 个
    if len(eng) < 4:
        continue
    if len(re.findall(r'\b[a-zA-Z]+\b', eng)) < 2:
        continue
    cleaned.append({**item, 'english': eng})

# 重新编号并更新音频路径
for i, item in enumerate(cleaned, 1):
    item['id'] = i
    item['audio'] = f"levels/junior/audio/sentence_{i:03d}.mp3"

with open(src, 'w', encoding='utf-8') as f:
    json.dump(cleaned, f, ensure_ascii=False, indent=2)

print(f"清洗完成：{len(data)} → {len(cleaned)} 句")
print("示例：")
for item in cleaned[:8]:
    print(f"  {item['id']}. {item['english']}")
