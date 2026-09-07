#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
清理翻译数据
"""

import json
import re

def clean_translation(chinese):
    """清理中文翻译"""
    if not chinese:
        return ""

    # 移除末尾的英文词汇列表 (如 "Good, morning")
    chinese = re.sub(r'\s+[A-Za-z]+(?:,\s*[A-Za-z]+)*\s*$', '', chinese)

    # 移除多余空格
    chinese = re.sub(r'\s+', ' ', chinese).strip()

    return chinese

def main():
    input_file = "sentences_data_with_cn.json"
    output_file = "sentences_data.json"

    print("正在清理翻译数据...")

    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 清理翻译
    for item in data:
        if item['chinese']:
            item['chinese'] = clean_translation(item['chinese'])

    # 统计
    has_translation = sum(1 for s in data if s['chinese'])
    no_translation = len(data) - has_translation

    print(f"总计: {len(data)} 句")
    print(f"  有翻译: {has_translation} 句")
    print(f"  无翻译: {no_translation} 句")

    # 保存
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n已保存到: {output_file}")

    # 显示示例
    print("\n清理后的示例（前20句）:")
    print("=" * 80)
    for s in data[:20]:
        print(f"{s['id']:3d}. {s['english']}")
        if s['chinese']:
            print(f"     {s['chinese']}")
        else:
            print(f"     [暂无翻译]")
        print()
    print("=" * 80)

if __name__ == "__main__":
    main()
