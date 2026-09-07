#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
深度清理翻译数据
"""

import json
import re

def deep_clean_translation(chinese):
    """深度清理中文翻译"""
    if not chinese:
        return ""

    # 移除所有英文单词和逗号的组合（词汇列表）
    # 例如: "Good," 或 "How's, going" 或 "What's"
    chinese = re.sub(r'\s*[A-Za-z\']+,?\s*', '', chinese)

    # 移除末尾的标点
    chinese = chinese.strip(',.;!? \t')

    # 移除多余空格
    chinese = re.sub(r'\s+', '', chinese)

    return chinese

def main():
    input_file = "sentences_data.json"
    output_file = "sentences_data.json"

    print("正在深度清理翻译数据...")

    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 清理翻译
    cleaned_count = 0
    for item in data:
        if item['chinese']:
            original = item['chinese']
            cleaned = deep_clean_translation(item['chinese'])
            if cleaned != original:
                cleaned_count += 1
            item['chinese'] = cleaned

    # 统计
    has_translation = sum(1 for s in data if s['chinese'])
    no_translation = len(data) - has_translation

    print(f"总计: {len(data)} 句")
    print(f"  有翻译: {has_translation} 句")
    print(f"  无翻译: {no_translation} 句")
    print(f"  已清理: {cleaned_count} 句")

    # 保存
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n已保存到: {output_file}")

    # 显示示例
    print("\n清理后的示例（前30句）:")
    print("=" * 80)
    for s in data[:30]:
        print(f"{s['id']:3d}. {s['english']}")
        if s['chinese']:
            print(f"     中文：{s['chinese']}")
        else:
            print(f"     中文：[暂无翻译]")
        print()
    print("=" * 80)

if __name__ == "__main__":
    main()
