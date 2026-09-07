#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
提取干净的完整英语句子
"""

import re

def extract_clean_sentences(input_file, output_file):
    """提取完整的英语句子"""
    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    sentences = []
    seen = set()

    for line in lines:
        # 移除行号
        line = re.sub(r'^\d+\t', '', line).strip()

        # 跳过空行
        if not line:
            continue

        # 必须包含字母
        if not re.search(r'[a-zA-Z]', line):
            continue

        # 不能包含中文
        if re.search(r'[一-鿿]', line):
            continue

        # 不能包含填空标记
        if '_' in line:
            continue

        # 长度要合适
        if len(line) < 5 or len(line) > 150:
            continue

        # 排除标题和说明
        if (line.startswith('Part ') or
            line.startswith('No.') or
            line.startswith('Example ') or
            line.startswith('Listen ') or
            'Practice' in line):
            continue

        # 排除纯大写标题
        if line.isupper() and len(line.split()) <= 5:
            continue

        # 排除选项标记 (A. B. C.)
        if re.match(r'^[A-Z]\.\s', line):
            continue

        # 只保留以标点结尾或包含完整句子结构的
        if line.endswith(('.', '?', '!', ',')):
            # 必须包含至少2个单词
            words = re.findall(r'\b[a-zA-Z]+\b', line)
            if len(words) >= 2:
                line_lower = line.lower()
                if line_lower not in seen:
                    seen.add(line_lower)
                    sentences.append(line)

    # 保存
    with open(output_file, 'w', encoding='utf-8') as f:
        for s in sentences:
            f.write(s + '\n')

    print(f'提取了 {len(sentences)} 个完整的英语句子')
    print(f'已保存到: {output_file}')
    print('\n前30个句子预览:')
    print('=' * 70)
    for i, s in enumerate(sentences[:30], 1):
        print(f'{i:3d}. {s}')
    print('=' * 70)

    return sentences

if __name__ == "__main__":
    sentences = extract_clean_sentences('sentences.txt', 'english_sentences_clean.txt')

    print(f'\n总计: {len(sentences)} 个句子')
    print('\n下一步:')
    print('1. 打开 english_sentences_clean.txt 查看所有句子')
    print('2. 打开 english-listening-practice.html')
    print('3. 将句子复制粘贴到网站的"导入句子"区域')
    print('4. 开始练习听力！')
