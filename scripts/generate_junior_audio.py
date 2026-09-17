#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
为 levels/junior/sentences.json 批量生成 TTS 音频
使用 edge-tts（与 primary 相同引擎）
"""
import asyncio
import edge_tts
import json
import os
import sys

VOICE = "en-US-AriaNeural"
SENTENCES_JSON = os.path.join(os.path.dirname(__file__), '..', 'levels', 'junior', 'sentences.json')
AUDIO_DIR = os.path.join(os.path.dirname(__file__), '..', 'levels', 'junior', 'audio')


async def generate():
    with open(SENTENCES_JSON, 'r', encoding='utf-8') as f:
        sentences = json.load(f)

    os.makedirs(AUDIO_DIR, exist_ok=True)

    total = len(sentences)
    print(f"共 {total} 句，音频目录: {AUDIO_DIR}")
    print(f"Voice: {VOICE}\n")

    errors = []
    for item in sentences:
        i = item['id']
        text = item['english']
        out = os.path.join(AUDIO_DIR, f"sentence_{i:03d}.mp3")

        if os.path.exists(out):
            if i % 50 == 0:
                print(f"  跳过已存在 {i}/{total}")
            continue

        try:
            await edge_tts.Communicate(text, VOICE).save(out)
        except Exception as e:
            print(f"  错误 [{i}] {text[:40]}: {e}")
            errors.append(i)
            continue

        if i % 50 == 0 or i == total:
            print(f"  进度 {i}/{total} — {text[:40]}")

    size_mb = sum(
        os.path.getsize(os.path.join(AUDIO_DIR, f))
        for f in os.listdir(AUDIO_DIR) if f.endswith('.mp3')
    ) / 1024 / 1024

    print(f"\n完成！总大小: {size_mb:.1f} MB")
    if errors:
        print(f"失败句子编号: {errors}")


if __name__ == "__main__":
    if not os.path.exists(SENTENCES_JSON):
        print(f"找不到 {SENTENCES_JSON}")
        print("请先运行 generate_junior_data.py")
        sys.exit(1)
    asyncio.run(generate())
