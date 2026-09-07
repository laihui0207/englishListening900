#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
智能提取英语900句
"""

import re

def extract_sentences_smart(input_file, output_file):
    """智能提取英语句子"""
    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    sentences = []
    seen = set()

    for line in lines:
        # 移除行号
        line = re.sub(r'^\d+\t', '', line).strip()

        if not line:
            continue

        # 模式1: 提取 "编号英文句子 中文翻译" 格式
        # 例如: "2Hello, how are you doing? 你好你最近怎么样 Hello, doing"
        match = re.match(r'^(\d+)([A-Z][^一-鿿]+?)([一-鿿].*)?$', line)
        if match:
            sentence = match.group(2).strip()
            # 清理末尾的单词列表（如 "Hello, doing"）
            sentence = re.sub(r'\s+[A-Za-z]+,\s+[A-Za-z]+(?:,\s+[A-Za-z]+)*$', '', sentence)
            if sentence and len(sentence) >= 5:
                if sentence.lower() not in seen:
                    seen.add(sentence.lower())
                    sentences.append(sentence)
                continue

        # 模式2: 纯英语句子（以句号、问号、感叹号结尾）
        if (re.search(r'[a-zA-Z]', line) and
            not re.search(r'[一-鿿]', line) and
            '_' not in line and
            line.endswith(('.', '?', '!')) and
            not line.startswith('Part ') and
            not line.startswith('Listen ') and
            5 <= len(line) <= 150):

            words = re.findall(r'\b[a-zA-Z]+\b', line)
            if len(words) >= 2:
                if line.lower() not in seen:
                    seen.add(line.lower())
                    sentences.append(line)

    # 保存
    with open(output_file, 'w', encoding='utf-8') as f:
        for s in sentences:
            f.write(s + '\n')

    print(f'成功提取 {len(sentences)} 个英语句子')
    print(f'已保存到: {output_file}')
    print('\n前50个句子预览:')
    print('=' * 70)
    for i, s in enumerate(sentences[:50], 1):
        print(f'{i:3d}. {s}')
    print('=' * 70)

    if len(sentences) > 50:
        print(f'\n... 还有 {len(sentences) - 50} 个句子')

    return sentences

if __name__ == "__main__":
    sentences = extract_sentences_smart('sentences.txt', 'english_900_sentences.txt')

    print(f'\n总计提取: {len(sentences)} 个句子')
    print('\n现在可以:')
    print('1. 打开 english_900_sentences.txt 查看所有句子')
    print('2. 在浏览器中打开 english-listening-practice.html')
    print('3. 复制句子并导入到网站中')
    print('4. 开始你的英语听力练习之旅！')
