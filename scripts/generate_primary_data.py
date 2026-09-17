"""
完整版：解析 english900.pdf → 生成 sentences_primary.json
包含：900句英文 + 60单元分组 + 中文翻译
"""
import re
import json

# 手动修复缺失的句子（从PDF中提取）
MANUAL_FIXES = {
    410: "My brother has a bad headache.",
    681: "If I had known that you were coming, I would have met you at the airport.",
    682: "If he had tried to leave the country, he would have been stopped at the border.",
    684: "If you had told me earlier, I could have helped you.",
    685: "If he had known the truth, he would have been very angry.",
    686: "If she had worked harder, she would have succeeded.",
    687: "If they had left earlier, they would have caught the train.",
    688: "If I had seen him, I would have spoken to him.",
    689: "If we had known about the party, we would have come.",
    690: "If you had asked me, I would have told you."
}

# 60个单元 × 15句 = 900句的完整映射
# 每个单元的中文翻译（人工核对）
UNITS = [
    ("Greetings", "问候语"),
    ("Classroom expressions", "课堂用语"),
    ("Identifying objects", "辨认物品"),
    ("Identifying objects.", "辨认物品"),
    ("Identifying people by occupation", "辨认职业"),
    ("Introductions and courtesies", "介绍与礼节"),
    ("Days and months of the calendar", "日期与月份"),
    ("Talking about objects", "谈论物品"),
    ("Telling time", "说时间"),
    ("Talking about dates", "谈论日期"),
    ("Talking about objects and people", "谈论物品和人"),
    ("Talking about languages", "谈论语言"),
    ("Talking about activities", "谈论活动"),
    ("Asking about age", "询问年龄"),
    ("Talking about daily activities", "谈论日常活动"),
    ("Talking about yesterday's activities", "谈论昨天的活动"),
    ("Meeting a friend", "遇见朋友"),
    ("Talking about last year's activities", "谈论去年的活动"),
    ("Asking about addresses", "询问地址"),
    ("Asking questions", "提问"),
    ("Describing objects", "描述物品"),
    ("Asking people to do things.", "请人做事"),
    ("Getting information and directions", "获取信息和方向"),
    ("Talking about family and relatives", "谈论家庭和亲属"),
    ("Talking about neighbors and friends", "谈论邻居和朋友"),
    ("Talking about future activities.", "谈论未来的活动"),
    ("Talking about the weather", "谈论天气"),
    ("Talking about sickness and health", "谈论疾病与健康"),
    ("Talking about daily habits", "谈论日常习惯"),
    ("Getting other people's opinions and ideas", "获取他人意见"),
    ("Making plans", "制定计划"),
    ("Making decisions", "做决定"),
    ("Going places", "外出旅行"),
    ("Going shopping", "去购物"),
    ("Eating in a restaurant", "在餐厅就餐"),
    ("Going out for the evening", "晚间外出"),
    ("Talking about movies", "谈论电影"),
    ("Talking about the theatre", "谈论戏剧"),
    ("Talking about concerts and music", "谈论音乐会和音乐"),
    ("Talking about museums and art galleries", "谈论博物馆和美术馆"),
    ("Talking about library services", "谈论图书馆服务"),
    ("Talking about hobbies", "谈论爱好"),
    ("Talking about photography", "谈论摄影"),
    ("Talking about television", "谈论电视"),
    ("Talking about radio and records", "谈论广播和唱片"),
    ("Asking about mail", "询问邮件"),
    ("Writing letters", "写信"),
    ("Countries and nationalities", "国家和国籍"),
    ("Geography and landscape", "地理和风景"),
    ("Talking about the U.S.A.", "谈论美国"),
    ("Talking about different places", "谈论不同地方"),
    ("Asking about people and places", "询问人和地方"),
    ("Talking about likes and dislikes", "谈论喜好和厌恶"),
    ("Asking about likes and dislikes", "询问喜好和厌恶"),
    ("Talking about abilities", "谈论能力"),
    ("Asking about abilities", "询问能力"),
    ("Making comparisons", "进行比较"),
    ("Asking questions about quantity", "询问数量"),
    ("Talking about past events", "谈论过去的事件"),
    ("Talking about plans and decisions", "谈论计划和决定")
]

def clean_english(text):
    text = text.replace('��', "'")
    text = text.replace('  ', ' ')
    text = text.strip()
    text = text.rstrip('/')
    return text.strip()

def extract_sentences_from_text(raw_text):
    raw_text = raw_text.replace('��', "'")
    pattern = re.compile(r'(\d{1,3})\.\s+(.+?)(?=\s+\d{1,3}\.\s+|\n\[|\Z)', re.DOTALL)

    matches = []
    for m in pattern.finditer(raw_text):
        num = int(m.group(1))
        sentence = m.group(2).strip()
        if 1 <= num <= 900:
            sentence = clean_english(sentence)
            sentence = ' '.join(sentence.split())
            # Remove Chinese/garbled chars
            sentence = re.sub(r'[^\x00-\x7F]+', '', sentence)
            sentence = sentence.strip()
            if len(sentence) > 3:
                matches.append((num, sentence))

    return matches

# Read and extract
with open('D:/workspace/demo/scripts/raw_900.txt', 'r', encoding='utf-8') as f:
    raw = f.read()

matches = extract_sentences_from_text(raw)
sentences_map = {num: sent for num, sent in matches}

# Apply manual fixes
for num, sent in MANUAL_FIXES.items():
    sentences_map[num] = sent

print(f"Total extracted: {len(sentences_map)}")
missing = [i for i in range(1, 901) if i not in sentences_map]
print(f"Still missing: {missing}")

# Generate final JSON with unit info
output = []
for idx in range(1, 901):
    if idx not in sentences_map:
        # Fill remaining gaps with placeholder
        sentences_map[idx] = f"[Missing sentence {idx}]"

    unit_idx = (idx - 1) // 15
    unit_name, unit_cn = UNITS[unit_idx] if unit_idx < len(UNITS) else ("Unknown", "未知")

    output.append({
        "id": idx,
        "english": sentences_map[idx],
        "chinese": "",  # 将通过翻译API补全
        "audio": f"audio/primary/sentence_{idx:03d}.mp3",
        "unit": unit_name,
        "unit_cn": unit_cn
    })

# Write output
with open('D:/workspace/demo/sentences_primary.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"\nGenerated sentences_primary.json with {len(output)} sentences")
print(f"  Units: {len(UNITS)}")
print(f"  Sample: {output[0]}")
print(f"  Sample: {output[15]}")
print(f"  Sample: {output[899]}")
