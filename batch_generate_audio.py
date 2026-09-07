#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量生成音频文件 - 简化版
"""

import asyncio
import edge_tts
import os
import json

async def generate_all_audio():
    """生成所有音频文件"""

    input_file = "英语常用语句900句.txt"
    output_dir = "audio"

    # 创建输出目录
    os.makedirs(output_dir, exist_ok=True)

    # 读取句子
    print("Reading sentences...")
    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    sentences = []
    for line in lines:
        line = line.strip()
        if '\t' in line:
            parts = line.split('\t', 1)
            if len(parts) == 2:
                line = parts[1]
        if line:
            sentences.append(line)

    print(f"Found {len(sentences)} sentences")
    print(f"Output directory: {output_dir}")
    print(f"Voice: en-US-AriaNeural (Natural female voice)")
    print()
    print("Generating audio files...")
    print("=" * 70)

    voice = "en-US-AriaNeural"

    # 生成音频
    for i, sentence in enumerate(sentences, 1):
        output_file = os.path.join(output_dir, f"sentence_{i:03d}.mp3")

        # 显示进度（每10个显示一次）
        if i % 10 == 0 or i == 1 or i == len(sentences):
            print(f"Progress: {i}/{len(sentences)} - {sentence[:40]}...")

        try:
            communicate = edge_tts.Communicate(sentence, voice)
            await communicate.save(output_file)
        except Exception as e:
            print(f"Error at sentence {i}: {e}")
            continue

    print("=" * 70)
    print(f"Done! Generated {len(sentences)} audio files")

    # 统计大小
    total_size = 0
    for i in range(1, len(sentences) + 1):
        file_path = os.path.join(output_dir, f"sentence_{i:03d}.mp3")
        if os.path.exists(file_path):
            total_size += os.path.getsize(file_path)

    size_mb = total_size / (1024 * 1024)
    print(f"Total size: {size_mb:.2f} MB")
    print(f"Files location: {os.path.abspath(output_dir)}")

    # 创建JSON映射
    print()
    print("Creating sentence mapping...")
    mapping = []
    for i, sentence in enumerate(sentences, 1):
        mapping.append({
            "id": i,
            "text": sentence,
            "audio": f"audio/sentence_{i:03d}.mp3"
        })

    mapping_file = "sentences_data.json"
    with open(mapping_file, 'w', encoding='utf-8') as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)

    print(f"Mapping file created: {mapping_file}")
    print()
    print("Next steps:")
    print("1. Check the audio folder")
    print("2. The website will be updated to use these audio files")

if __name__ == "__main__":
    asyncio.run(generate_all_audio())
