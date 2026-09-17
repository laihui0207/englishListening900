#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量翻译 levels/junior/sentences.json 的 chinese 字段
使用 DeepSeek API，批量发送减少请求次数，支持断点续传
"""
import json, os, re, time, sys

try:
    from openai import OpenAI
except ImportError:
    print("pip install openai")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
except ImportError:
    pass  # 直接用环境变量

API_KEY = os.environ.get('DEEPSEEK_API_KEY', '')
if not API_KEY:
    print("未找到 DEEPSEEK_API_KEY，请在 .env 中配置")
    sys.exit(1)

client = OpenAI(api_key=API_KEY, base_url="https://api.deepseek.com")

SENTENCES_JSON = os.path.join(os.path.dirname(__file__), '..', 'levels', 'junior', 'sentences.json')
BATCH_SIZE = 30  # 每次翻译30句


def translate_batch(sentences):
    """sentences: list of english strings → list of chinese strings"""
    numbered = '\n'.join(f"{i+1}. {s}" for i, s in enumerate(sentences))
    prompt = (
        "将下列英语句子翻译成简洁的中文，保持口语化风格，适合初中生。"
        "按原序号输出，格式：序号. 中文翻译，每行一句，不加任何解释。\n\n"
        + numbered
    )
    resp = client.chat.completions.create(
        model="deepseek-chat",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=2000,
    )
    text = resp.choices[0].message.content.strip()
    results = []
    for line in text.splitlines():
        line = line.strip()
        m = re.match(r'^\d+[.、．]\s*(.+)$', line)
        if m:
            results.append(m.group(1).strip())
    return results


def main():
    with open(SENTENCES_JSON, encoding='utf-8') as f:
        data = json.load(f)

    todo = [i for i, d in enumerate(data) if not d.get('chinese')]
    print(f"需要翻译: {len(todo)} 句，已完成: {len(data)-len(todo)} 句")

    if not todo:
        print("全部已翻译！")
        return

    total = len(todo)
    done = 0

    for batch_start in range(0, len(todo), BATCH_SIZE):
        batch_indices = todo[batch_start:batch_start + BATCH_SIZE]
        batch_english = [data[i]['english'] for i in batch_indices]

        for attempt in range(3):
            try:
                translations = translate_batch(batch_english)
                break
            except Exception as e:
                print(f"  重试 {attempt+1}/3: {e}")
                time.sleep(2 ** attempt)
        else:
            print(f"  跳过批次 {batch_start}-{batch_start+len(batch_indices)}")
            continue

        # 对齐翻译结果（API 偶尔少返回一行）
        for j, idx in enumerate(batch_indices):
            if j < len(translations):
                data[idx]['chinese'] = translations[j]

        done += len(batch_indices)
        print(f"  进度 {done}/{total} — {data[batch_indices[0]]['english'][:30]} → {data[batch_indices[0]]['chinese']}")

        # 每批保存，支持断点续传
        with open(SENTENCES_JSON, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        time.sleep(0.5)  # 避免限速

    still_missing = sum(1 for d in data if not d.get('chinese'))
    print(f"\n完成！剩余未翻译: {still_missing} 句")


if __name__ == '__main__':
    main()
