"""
解析 english900.pdf 提取的原始文本，生成 sentences_primary.json
- 提取900条英文句子（含单元分组）
- 补充中文翻译
"""
import re
import json

# 60个单元的中文翻译映射（按PDF顺序，每单元15句）
UNIT_TRANSLATIONS = {
    # Unit 1-10 (page1 block1)
    "Greetings": {
        "unit_cn": "问候语",
        "sentences": [
            "你好。", "早上好。", "我是约翰·史密斯。",
            "你是比尔·琼斯吗？", "是的，我是。", "你好吗？",
            "很好，谢谢。", "海伦怎么样？",
            "她非常好，谢谢你。", "下午好，格林先生。",
            "晚上好，布朗太太。", "今晚你好吗？",
            "晚安，约翰。", "再见，比尔。", "明天见。",
        ]
    },
    "Classroom expressions": {
        "unit_cn": "课堂用语",
        "sentences": [
            "请进来。", "请坐下。", "请站起来。",
            "请打开你的书。", "请合上你的书。",
            "不要打开你的书。", "你明白吗？",
            "是的，我明白。", "不，我不明白。",
            "听并重复。", "现在请读。", "很好。",
            "该开始了。", "我们现在开始吧。", "这是第一课。",
        ]
    },
    "Identifying objects": {
        "unit_cn": "辨认物品（一）",
        "sentences": [
            "这是什么？", "那是一本书。", "这是你的书吗？",
            "不，那不是我的书。", "这是谁的书？",
            "那是你的书。", "那是什么？", "那是一本书吗？",
            "不，不是。", "那是一支铅笔。", "那是你的吗？", "是的，是我的。",
            "门在哪里？", "在那里。", "这本书是他的吗？",
        ]
    },
    "Identifying objects.": {
        "unit_cn": "辨认物品（二）",
        "sentences": [
            "这些是什么？", "那些是书。", "书在哪里？",
            "在那里。", "这些是我的铅笔。", "你的钢笔在哪里？",
            "它们在那边。", "这些是你的钢笔吗？",
            "是的，是的。", "那些是我的。",
            "这些是你的书，不是吗？", "不，不是。",
            "它们不是我的。", "这些是我的，那些是你的。",
            "那些不是你的钢笔，是吗？",
        ]
    },
    "Identifying people by occupation": {
        "unit_cn": "辨认职业",
        "sentences": [
            "你是谁？", "我是学生。", "那边那个人是谁？",
            "他也是学生。", "那位女士是学生吗？", "不，她不是。",
            "那些人也不是学生。", "我是你的老师吗？",
            "是的，你是。", "那个人是老师，不是吗？",
            "是的，他是。", "那些人是谁？",
            "也许他们是农民。",
            "他们不是学生吗？", "我真的不知道。",
        ]
    },
    "Introductions and courtesies": {
        "unit_cn": "介绍与礼节",
        "sentences": [
            "你叫什么名字？", "我叫琼斯。",
            "你的名字是什么？", "我的名字是比尔。",
            "你的姓怎么拼？", "琼斯。J-O-N-E-S。",
            "你朋友叫什么名字？", "他叫约翰·史密斯。",
            "约翰和我是老朋友。", "你是约翰的兄弟吗？",
            "不，我不是。", "这位是琼斯先生。", "你好。",
            "琼斯太太，这位是约翰·史密斯先生。", "很高兴认识你。",
        ]
    },
    "Days and months of the calendar": {
        "unit_cn": "日期与月份",
        "sentences": [
            "今天是星期几？", "今天是星期一。",
            "昨天是星期几？", "昨天是星期天。",
            "明天是星期几？", "现在是几月份？",
            "现在是一月。", "上个月是十二月，对吗？",
            "是的，是的。", "下个月是几月？",
            "我在医院住了好几个星期。", "你星期二在哪里？",
            "你二月份在这里，不是吗？", "不，我没有。",
            "你的朋友一周前在这里，不是吗？",
        ]
    },
    "Talking about objects": {
        "unit_cn": "谈论物品",
        "sentences": [
            "你有一本书吗？", "是的，我有。",
            "你有收音机，不是吗？", "不，我没有。",
            "我也没有留声机。",
            "这台收音机是你的吗？", "是的，我认为是的。",
            "你有多少姐妹和兄弟？", "你没有我的帽子吗？",
            "是的，你的帽子和外套我都有。",
            "约翰有黄铅笔吗？", "是的，他有。",
            "他有收音机，不是吗？", "不，他没有。",
            "他已经有留声机了，但还没有收音机。",
        ]
    },
    "Telling time": {
        "unit_cn": "说时间",
        "sentences": [
            "现在几点了？", "两点钟。",
            "两点过几分。",
            "我的表快，你的表慢。", "打扰一下，你能告诉我准确时间吗？",
            "不，我不能。",
            "我不知道现在几点了。",
            "我认为现在还不到四点。",
            "现在大概是三点半。",
            "我每天六点前起床。",
            "餐厅要到七点四十五分才开门。", "你明天十点钟会在这里吗？",
            "是的，我会。",
            "我们会准时到，不是吗？", "我希望如此。",
        ]
    },
    "Talking about dates": {
        "unit_cn": "谈论日期",
        "sentences": [
            "今天是几号？",
            "今天是一九六三年十一月一日。",
            "你什么时候出生？", "我生于一九三五年十一月一日。",
            "今天是我的生日。",
            "我姐姐生于一九三八年。",
            "我不知道确切日期。",
            "你在哪里出生？",
            "我出生在离这里不远的一个小镇。",
            "你对十世纪了解多少？",
            "我对那一点都不了解。",
            "我们来谈谈别的吧。",
            "去年四月份你在哪里？",
            "我不记得那时我在哪里。",
            "明年这个时候你会在哪里？",
        ]
    },
}

def clean_english(text):
    text = text.replace('��', "'")
    text = text.replace('  ', ' ')
    text = text.strip()
    text = text.rstrip('/')
    return text.strip()

def extract_sentences_from_text(raw_text):
    raw_text = raw_text.replace('��', "'")

    # Pattern: number, period, space, text up to (but not including) next "number."
    # Use lookahead to stop before next numbered sentence
    pattern = re.compile(r'(\d{1,3})\.\s+(.+?)(?=\s+\d{1,3}\.\s+|\n\[|\Z)', re.DOTALL)

    matches = []
    for m in pattern.finditer(raw_text):
        num = int(m.group(1))
        sentence = m.group(2).strip()
        if 1 <= num <= 900:
            sentence = clean_english(sentence)
            # Collapse whitespace
            sentence = ' '.join(sentence.split())
            # Remove Chinese characters (they're garbled anyway, we have translations)
            sentence = re.sub(r'[^\x00-\x7F]+', '', sentence)
            sentence = sentence.strip()
            if len(sentence) > 3:
                matches.append((num, sentence))

    return matches

# Read raw text
with open('D:/workspace/demo/scripts/raw_900.txt', 'r', encoding='utf-8') as f:
    raw = f.read()

matches = extract_sentences_from_text(raw)
seen = {}
for num, sentence in matches:
    seen[num] = sentence

print(f"Extracted {len(seen)} unique sentence numbers")
print("Sample:")
for i in [1, 15, 16, 30, 100, 150, 300, 450, 600, 750, 900]:
    if i in seen:
        print(f"  {i}: {seen[i]}")
    else:
        print(f"  {i}: MISSING")

all_nums = sorted(seen.keys())
print(f"\nRange: {min(all_nums)} - {max(all_nums)}")
missing = [i for i in range(1, 901) if i not in seen]
print(f"Missing count: {len(missing)}")
if missing[:30]:
    print(f"First missing: {missing[:30]}")
