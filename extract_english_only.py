#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
提取纯英语句子（只保留英文，去除中文翻译和练习题）
"""

import re

def is_pure_english_sentence(text):
    """判断是否为纯英语句子"""
    # 去除空格后检查
    text_clean = text.strip()

    # 必须包含英文字母
    if not re.search(r'[a-zA-Z]', text_clean):
        return False

    # 不能包含中文字符
    if re.search(r'[一-鿿]', text_clean):
        return False

    # 不能是纯数字或编号
    if re.match(r'^[\d\s\.\-_]+$', text_clean):
        return False

    # 排除常见的标题和说明文字
    exclude_patterns = [
        r'^Part \d+:',
        r'^No\.',
        r'^Example \d+',
        r'Listen and fill',
        r'Practice',
        r'Sample',
        r'^[A-Z]\.',  # A. B. C. 选项
        r'______',  # 填空题标记
        r'^Greetings and',
        r'^Personal Information',
        r'^\d+\s*[A-Z][a-z]+ and',  # "1Family and Friends"
    ]

    for pattern in exclude_patterns:
        if re.search(pattern, text_clean):
            return False

    # 长度要合理（5-150字符）
    if len(text_clean) < 5 or len(text_clean) > 150:
        return False

    # 必须包含至少一个完整单词
    if not re.search(r'\b[a-zA-Z]{2,}\b', text_clean):
        return False

    return True

def extract_pure_english_sentences(input_file, output_file):
    """提取纯英语句子"""
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        pure_sentences = []
        seen = set()

        for line in lines:
            # 移除行号（如果有）
            line = re.sub(r'^\d+\t', '', line)
            line = line.strip()

            if is_pure_english_sentence(line):
                # 去重
                line_lower = line.lower()
                if line_lower not in seen:
                    seen.add(line_lower)
                    pure_sentences.append(line)

        # 写入文件
        with open(output_file, 'w', encoding='utf-8') as f:
            for sentence in pure_sentences:
                f.write(sentence + '\n')

        print(f"成功提取 {len(pure_sentences)} 个纯英语句子")
        print(f"已保存到: {output_file}")

        # 显示前20个句子
        print("\n前20个句子预览:")
        print("=" * 60)
        for i, sentence in enumerate(pure_sentences[:20], 1):
            print(f"{i:2d}. {sentence}")
        print("=" * 60)

        return True

    except Exception as e:
        print(f"错误: {e}")
        return False

if __name__ == "__main__":
    input_file = "sentences.txt"
    output_file = "english_sentences_only.txt"

    print("正在提取纯英语句子...")
    extract_pure_english_sentences(input_file, output_file)

    print("\n提取完成！")
    print("请打开 english_sentences_only.txt 查看结果")
    print("然后复制粘贴到听力练习网站中使用")
