#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PDF文本提取脚本
从英语900句PDF中提取英语句子
"""

import re
import sys

def extract_sentences_from_pdf(pdf_path, output_path):
    """从PDF中提取英语句子"""
    try:
        import PyPDF2

        print(f"正在读取PDF文件: {pdf_path}")

        sentences = []

        with open(pdf_path, 'rb') as file:
            reader = PyPDF2.PdfReader(file)
            total_pages = len(reader.pages)

            print(f"PDF共有 {total_pages} 页")

            for page_num in range(total_pages):
                print(f"处理第 {page_num + 1}/{total_pages} 页...", end='\r')

                page = reader.pages[page_num]
                text = page.extract_text()

                # 按行分割
                lines = text.split('\n')

                for line in lines:
                    line = line.strip()

                    # 过滤条件：
                    # 1. 不是空行
                    # 2. 包含英文字母
                    # 3. 不是纯数字
                    # 4. 长度合适（3-200字符）
                    if (line and
                        re.search(r'[a-zA-Z]', line) and
                        not line.isdigit() and
                        3 <= len(line) <= 200):

                        # 清理特殊字符，保留基本标点
                        cleaned = re.sub(r'[^\w\s\'\.,!?;:\-]', '', line)
                        cleaned = cleaned.strip()

                        if cleaned and not cleaned.startswith('Page '):
                            sentences.append(cleaned)

        print(f"\n\n共提取到 {len(sentences)} 个句子")

        # 去重（保持顺序）
        unique_sentences = []
        seen = set()
        for s in sentences:
            s_lower = s.lower()
            if s_lower not in seen:
                seen.add(s_lower)
                unique_sentences.append(s)

        print(f"去重后剩余 {len(unique_sentences)} 个唯一句子")

        # 写入文件
        with open(output_path, 'w', encoding='utf-8') as f:
            for sentence in unique_sentences:
                f.write(sentence + '\n')

        print(f"\n句子已保存到: {output_path}")

        # 显示前10个句子作为预览
        print("\n前10个句子预览:")
        print("-" * 50)
        for i, sentence in enumerate(unique_sentences[:10], 1):
            print(f"{i}. {sentence}")
        print("-" * 50)

        return True

    except ImportError:
        print("\n错误: 未安装PyPDF2库")
        print("请运行: pip install PyPDF2")
        return False

    except FileNotFoundError:
        print(f"\n错误: 找不到PDF文件: {pdf_path}")
        return False

    except Exception as e:
        print(f"\n发生错误: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def main():
    pdf_path = "英语常用语句900句听力练习.pdf"
    output_path = "sentences.txt"

    print("=" * 60)
    print("英语900句PDF提取工具")
    print("=" * 60)
    print()

    success = extract_sentences_from_pdf(pdf_path, output_path)

    if success:
        print("\n✅ 提取成功！")
        print("\n接下来:")
        print("1. 打开 sentences.txt 查看提取的句子")
        print("2. 打开 english-listening-practice.html")
        print("3. 将句子复制粘贴到网站的'导入句子'区域")
        print("4. 开始练习！")
    else:
        print("\n❌ 提取失败")
        print("\n备选方案:")
        print("1. 手动从PDF复制句子")
        print("2. 使用在线PDF转文本工具")
        print("3. 检查PDF文件是否在当前目录")

if __name__ == "__main__":
    main()
