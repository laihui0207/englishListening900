#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
提取英文句子和中文翻译 - 改进版
"""

import re
import json

def extract_sentences_with_translation(input_file):
    """从PDF提取文件中提取英文和中文翻译"""

    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    sentences = []
    current_id = 0

    for line in lines:
        # 移除行号
        original_line = line
        line = re.sub(r'^\d+\t', '', line).strip()

        if not line:
            continue

        # 跳过标题和说明
        if any(keyword in line for keyword in ['Part ', 'Listen and', 'Example', 'Practice', 'No. 英文']):
            continue

        # 尝试多种匹配模式

        # 模式1: 编号+英文+中文+词汇
        # 例如: "2Hello, how are you doing? 你好你最近怎么样 Hello, doing"
        match = re.match(r'^(\d+)([A-Z][^一-鿿]{3,})([一-鿿].+?)(?:\s+[A-Za-z]+,.*)?$', line)
        if match:
            number = int(match.group(1))
            english = match.group(2).strip()
            chinese = match.group(3).strip()

            # 清理末尾的词汇列表
            chinese = re.sub(r'\s+[A-Za-z]+,.*$', '', chinese)
            chinese = chinese.strip()

            if len(english) >= 3 and len(chinese) >= 2:
                current_id += 1
                sentences.append({
                    'id': current_id,
                    'english': english,
                    'chinese': chinese
                })
                continue

        # 模式2: 纯英文句子（从之前提取的文件）
        # 如果有独立的中文行，稍后匹配

    return sentences

def load_english_sentences(file_path):
    """加载纯英文句子文件"""
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    sentences = []
    for line in lines:
        line = re.sub(r'^\d+\t', '', line).strip()
        if line and not re.search(r'[一-鿿]', line):  # 不包含中文
            sentences.append(line)

    return sentences

def use_google_translate_api(english_sentences):
    """使用翻译（如果需要的话，这里先手动处理）"""
    # 这里我们先用已提取的数据
    pass

def main():
    # 首先从sentences.txt提取已有的中英文对照
    print("正在从 sentences.txt 提取中英文对照...")
    sentences_with_cn = extract_sentences_with_translation("sentences.txt")

    print(f"从PDF提取文件获得: {len(sentences_with_cn)} 组")

    # 加载900句英文
    print("\n正在加载900句英文...")
    english_sentences = load_english_sentences("英语常用语句900句.txt")
    print(f"共有 {len(english_sentences)} 句英文")

    # 创建映射
    result = []

    # 先添加已有翻译的
    cn_dict = {s['english']: s['chinese'] for s in sentences_with_cn}

    for i, eng in enumerate(english_sentences, 1):
        chinese = cn_dict.get(eng, "")  # 如果找不到就留空

        result.append({
            'id': i,
            'english': eng,
            'chinese': chinese,
            'audio': f"audio/sentence_{i:03d}.mp3"
        })

    # 统计
    has_translation = sum(1 for s in result if s['chinese'])
    no_translation = len(result) - has_translation

    print(f"\n统计结果:")
    print(f"  有翻译: {has_translation} 句")
    print(f"  无翻译: {no_translation} 句")

    # 保存
    output_file = "sentences_data_with_cn.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n已保存到: {output_file}")

    # 显示前20个
    print("\n前20个句子预览:")
    print("=" * 80)
    for s in result[:20]:
        print(f"{s['id']:3d}. {s['english']}")
        if s['chinese']:
            print(f"     {s['chinese']}")
        else:
            print(f"     [无翻译]")
        print()
    print("=" * 80)

if __name__ == "__main__":
    main()
