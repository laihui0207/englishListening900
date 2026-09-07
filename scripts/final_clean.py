#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
最终清理：只保留纯净完整的英语句子
"""

import re

def is_valid_sentence(text):
    """判断是否为有效的完整英语句子"""
    # 不能包含填空符号
    if '_' in text:
        return False

    # 不能包含中文
    if re.search(r'[一-鿿]', text):
        return False

    # 必须以标点结尾
    if not text.endswith(('.', '?', '!')):
        return False

    # 排除标题类
    title_keywords = [
        'Greetings', 'Personal Information', 'Time and Dates', 'Weather',
        'Family', 'Work', 'Career', 'Study', 'Education', 'Shopping',
        'Consumer', 'Food', 'Dining', 'Health', 'Medical', 'Transportation',
        'Travel', 'Housing', 'Living', 'Emotions', 'Feelings', 'Hobbies',
        'Entertainment', 'Requests', 'Help', 'Opinions', 'Suggestions',
        'Telephone', 'Communication', 'Banking', 'Finance', 'Culture',
        'Customs', 'Technology', 'Internet', 'Environment', 'Nature',
        'Law', 'Rules', 'Sports', 'Fitness', 'Business', 'Negotiations',
        'Hotel', 'Accommodation', 'Airport', 'Idioms', 'Expressions',
        'Workplace', 'Social Events', 'Parties', 'Daily Routines',
        'Dictation', 'Practice', 'Example'
    ]

    for keyword in title_keywords:
        if keyword in text and len(text.split()) <= 4:
            return False

    # 必须包含至少2个单词
    words = re.findall(r'\b[a-zA-Z]{2,}\b', text)
    if len(words) < 2:
        return False

    # 长度要合理
    if len(text) < 5 or len(text) > 150:
        return False

    return True

def clean_sentences(input_file, output_file):
    """清理并保存纯净的句子"""
    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    clean_list = []
    seen = set()

    for line in lines:
        line = line.strip()

        if is_valid_sentence(line):
            line_lower = line.lower()
            if line_lower not in seen:
                seen.add(line_lower)
                clean_list.append(line)

    # 保存
    with open(output_file, 'w', encoding='utf-8') as f:
        for sentence in clean_list:
            f.write(sentence + '\n')

    print(f'清理完成！保留 {len(clean_list)} 个纯净句子')
    print(f'已保存到: {output_file}')

    # 显示统计
    print(f'\n句子长度统计:')
    print(f'  最短: {min(len(s) for s in clean_list)} 字符')
    print(f'  最长: {max(len(s) for s in clean_list)} 字符')
    print(f'  平均: {sum(len(s) for s in clean_list) // len(clean_list)} 字符')

    print(f'\n前100个句子预览:')
    print('=' * 70)
    for i, s in enumerate(clean_list[:100], 1):
        print(f'{i:3d}. {s}')
    print('=' * 70)

    if len(clean_list) > 100:
        print(f'\n... 还有 {len(clean_list) - 100} 个句子')

    return clean_list

if __name__ == "__main__":
    print('正在清理英语句子...\n')
    sentences = clean_sentences('english_900_sentences.txt', 'final_sentences.txt')

    print(f'\n✓ 完成！共 {len(sentences)} 个干净的英语句子')
    print('\n使用方法:')
    print('1. 打开 english-listening-practice.html （已自动打开）')
    print('2. 打开 final_sentences.txt，复制所有内容')
    print('3. 在网站中找到"导入句子"区域，粘贴句子')
    print('4. 点击"导入句子"按钮')
    print('5. 开始练习！')
