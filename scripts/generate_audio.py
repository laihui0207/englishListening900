#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
使用 Edge-TTS 生成高质量英语音频
微软Edge浏览器的TTS引擎，免费且接近真人发音
"""

import os
import asyncio
import sys

def check_edge_tts():
    """检查是否安装了edge-tts"""
    try:
        import edge_tts
        return True
    except ImportError:
        return False

async def generate_audio_files(input_file, output_dir):
    """批量生成音频文件"""
    import edge_tts

    # 创建输出目录
    os.makedirs(output_dir, exist_ok=True)

    # 读取句子
    print(f"正在读取句子文件: {input_file}")
    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    sentences = []
    for line in lines:
        # 移除行号（如果有）
        line = line.strip()
        if '\t' in line:
            parts = line.split('\t', 1)
            if len(parts) == 2:
                line = parts[1]
        if line:
            sentences.append(line)

    print(f"共找到 {len(sentences)} 个句子")
    print(f"输出目录: {output_dir}")
    print()

    # Edge-TTS 语音选项
    # en-US-AriaNeural - 女声，自然流畅
    # en-US-GuyNeural - 男声，清晰标准
    # en-GB-SoniaNeural - 英式女声
    # en-AU-NatashaNeural - 澳式女声

    voice = "en-US-AriaNeural"  # 美式英语女声（推荐）
    print(f"使用语音: {voice}")
    print("=" * 70)
    print()

    # 批量生成音频
    for i, sentence in enumerate(sentences, 1):
        output_file = os.path.join(output_dir, f"sentence_{i:03d}.mp3")

        # 显示进度
        print(f"[{i}/{len(sentences)}] 生成中: {sentence[:50]}...", end='\r')

        try:
            # 创建TTS通信对象
            communicate = edge_tts.Communicate(sentence, voice)

            # 保存为MP3文件
            await communicate.save(output_file)

        except Exception as e:
            print(f"\n错误 - 句子 {i}: {e}")
            continue

    print()
    print("=" * 70)
    print(f"\n✓ 完成！共生成 {len(sentences)} 个音频文件")
    print(f"文件位置: {output_dir}")

    # 统计文件大小
    total_size = 0
    for i in range(1, len(sentences) + 1):
        file_path = os.path.join(output_dir, f"sentence_{i:03d}.mp3")
        if os.path.exists(file_path):
            total_size += os.path.getsize(file_path)

    size_mb = total_size / (1024 * 1024)
    print(f"总大小: {size_mb:.2f} MB")

    return len(sentences)

async def test_voice():
    """测试语音效果"""
    import edge_tts

    print("正在测试语音效果...")
    test_sentence = "Hello, this is a test of Edge TTS. The voice quality is very natural."
    test_file = "test_voice.mp3"

    communicate = edge_tts.Communicate(test_sentence, "en-US-AriaNeural")
    await communicate.save(test_file)

    print(f"✓ 测试音频已生成: {test_file}")
    print("请播放该文件检查语音质量")

def create_sentence_mapping(input_file, output_dir):
    """创建句子索引文件（用于网站加载）"""
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

    # 生成JSON映射文件
    import json

    mapping = []
    for i, sentence in enumerate(sentences, 1):
        mapping.append({
            "id": i,
            "text": sentence,
            "audio": f"audio/sentence_{i:03d}.mp3"
        })

    mapping_file = os.path.join(output_dir, "sentences_mapping.json")
    with open(mapping_file, 'w', encoding='utf-8') as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)

    print(f"\n✓ 已创建句子映射文件: {mapping_file}")

def main():
    print("=" * 70)
    print("Edge-TTS 音频生成器")
    print("=" * 70)
    print()

    # 检查是否安装了edge-tts
    if not check_edge_tts():
        print("❌ 未安装 edge-tts 库")
        print()
        print("请先安装:")
        print("  pip install edge-tts")
        print()
        print("安装后重新运行此脚本")
        return

    input_file = "英语常用语句900句.txt"
    output_dir = "audio"

    if not os.path.exists(input_file):
        print(f"❌ 找不到文件: {input_file}")
        return

    print("选择操作:")
    print("1. 生成所有音频文件（推荐）")
    print("2. 仅测试语音效果")
    print()

    choice = input("请选择 (1 或 2): ").strip()

    if choice == "2":
        asyncio.run(test_voice())
    elif choice == "1":
        print()
        print("开始生成音频文件...")
        print("这可能需要几分钟时间，请耐心等待...")
        print()

        count = asyncio.run(generate_audio_files(input_file, output_dir))

        # 创建映射文件
        create_sentence_mapping(input_file, output_dir)

        print()
        print("=" * 70)
        print("下一步:")
        print("1. 检查 audio 文件夹中的音频文件")
        print("2. 运行 update_website.py 更新网站以使用音频文件")
        print("=" * 70)
    else:
        print("无效选择")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n操作已取消")
    except Exception as e:
        print(f"\n发生错误: {e}")
        import traceback
        traceback.print_exc()
