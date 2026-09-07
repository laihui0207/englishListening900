#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
提取英文句子和中文翻译
"""

import re
import json

def extract_sentences_with_translation(input_file):
    """从PDF提取文件中提取英文和中文翻译"""

    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    sentences = []

    for line in lines:
        # 移除行号
        line = re.sub(r'^\d+\t', '', line).strip()

        if not line:
            continue

        # 匹配格式：编号+英文句子+中文翻译+词汇列表
        # 例如: "2Hello, how are you doing? 你好你最近怎么样 Hello, doing"
        match = re.match(r'^(\d+)([A-Z][^一-鿿]+?)([一-鿿][^A-Za-z]+?)(?:\s+[A-Za-z]+,.*)?$', line)

        if match:
            number = int(match.group(1))
            english = match.group(2).strip()
            chinese = match.group(3).strip()

            # 清理中文翻译末尾可能的空格和标点
            chinese = re.sub(r'\s+$', '', chinese)

            # 过滤掉太短的
            if len(english) >= 3 and len(chinese) >= 2:
                sentences.append({
                    'id': number,
                    'english': english,
                    'chinese': chinese
                })

    return sentences

def main():
    input_file = "sentences.txt"
    output_file = "sentences_with_translation.json"

    print("正在提取英文句子和中文翻译...")
    print()

    sentences = extract_sentences_with_translation(input_file)

    print(f"成功提取 {len(sentences)} 组句子")
    print()

    # 显示前20个
    print("前20个句子预览:")
    print("=" * 80)
    for i, s in enumerate(sentences[:20], 1):
        print(f"{i:3d}. {s['english']}")
        print(f"     {s['chinese']}")
        print()
    print("=" * 80)

    # 保存为JSON
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(sentences, f, ensure_ascii=False, indent=2)

    print(f"\n已保存到: {output_file}")
    print(f"共 {len(sentences)} 组中英文对照")

if __name__ == "__main__":
    main()
