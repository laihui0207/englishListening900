#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 juniorEnglish900.pdf 提取句子 → 生成 levels/junior/sentences.json
用中文序号行（一、二、三...）定位单元标题，再在两个标题之间提取编号句子
"""
import re, json, os

CHINESE_ORDINAL = re.compile(r'[一二三四五六七八九十百][、．]')
SENTENCE_NUM    = re.compile(r'(?<!\d)(\d{1,3})\.\s+(?=[A-Z\'"\(])')


def extract_pages(pdf_path):
    try:
        import pdfplumber
        with pdfplumber.open(pdf_path) as pdf:
            return [p.extract_text() or '' for p in pdf.pages]
    except ImportError:
        pass
    import PyPDF2
    with open(pdf_path, 'rb') as f:
        r = PyPDF2.PdfReader(f)
        return [p.extract_text() or '' for p in r.pages]


def ascii_only(s):
    return re.sub(r'[^\x00-\x7F]+', ' ', s)


def unit_name_from_line(line):
    """从含中文序号的行提取英文单元名"""
    name = ascii_only(line).strip()
    name = ' '.join(name.split())
    return name if len(name) > 1 else None


def clean_sentence(raw):
    s = ascii_only(raw)
    s = ' '.join(s.split())
    # 取斜线第一变体
    s = re.split(r'\s*/\s*', s)[0]
    # 末尾清理
    s = re.sub(r'[\s\-·…]+$', '', s)
    # 去末尾孤立数字（如 "...to page 20. 20"）
    s = re.sub(r'\s+\d+\s*$', '', s)
    # 修复单字母PDF断字：如 "w orks"→"works"（仅单字母前缀，避免误合并正常短词）
    s = re.sub(r"(?<!['\w])([a-z]) ([a-z]{3,})(?!['\w])", lambda m: m.group(1)+m.group(2), s)
    return s.strip()


def parse(pages):
    # 把所有页按字符位置拼成一个序列，同时记录每行是否为单元标题
    # 结构：[(type, content)]  type = 'unit' | 'line'
    events = []
    for page in pages:
        for line in page.splitlines():
            if CHINESE_ORDINAL.search(line):
                name = unit_name_from_line(line)
                if name:
                    events.append(('unit', name))
            else:
                events.append(('line', line))

    # 合并句子行：把所有非单元行连成一大段，但在单元标题处切断
    # 构建 [(unit_name, text_block)] 列表
    blocks = []
    cur_unit = 'Greetings'
    cur_lines = []
    for typ, content in events:
        if typ == 'unit':
            if cur_lines:
                blocks.append((cur_unit, '\n'.join(cur_lines)))
            cur_unit = content
            cur_lines = []
        else:
            cur_lines.append(content)
    if cur_lines:
        blocks.append((cur_unit, '\n'.join(cur_lines)))

    sentences = {}
    units_map = {}

    for unit_name, block in blocks:
        # 在 block 里找所有编号句子
        tokens = list(SENTENCE_NUM.finditer(block))
        for i, tok in enumerate(tokens):
            num = int(tok.group(1))
            if num < 1 or num > 1200:
                continue
            start = tok.end()
            end = tokens[i+1].start() if i+1 < len(tokens) else len(block)
            raw = block[start:end]
            text = clean_sentence(raw)
            if len(text) < 4:
                continue
            if len(re.findall(r'\b[a-zA-Z]+\b', text)) < 2:
                continue
            if num not in sentences:
                sentences[num] = text
                units_map[num] = unit_name

    return sentences, units_map


def build_json(sentences, units_map):
    output = []
    for num in sorted(sentences):
        output.append({
            'id': num,
            'english': sentences[num],
            'chinese': '',
            'audio': f'levels/junior/audio/sentence_{num:03d}.mp3',
            'unit': units_map.get(num, 'General'),
            'unit_cn': '',
        })
    for i, item in enumerate(output, 1):
        item['id'] = i
        item['audio'] = f'levels/junior/audio/sentence_{i:03d}.mp3'
    return output


if __name__ == '__main__':
    pdf_path = os.path.join(os.path.dirname(__file__), '..', 'juniorEnglish900.pdf')
    out_dir  = os.path.join(os.path.dirname(__file__), '..', 'levels', 'junior')
    out_path = os.path.join(out_dir, 'sentences.json')
    os.makedirs(out_dir, exist_ok=True)

    print(f"读取: {pdf_path}")
    pages = extract_pages(pdf_path)
    print(f"共 {len(pages)} 页")

    sentences, units_map = parse(pages)
    print(f"提取到 {len(sentences)} 句")

    data = build_json(sentences, units_map)

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n已写入: {out_path}  ({len(data)} 句)")
    print("前 20 句：")
    for item in data[:20]:
        print(f"  {item['id']:3d}. [{item['unit']}] {item['english']}")
    print("后 5 句：")
    for item in data[-5:]:
        print(f"  {item['id']:3d}. [{item['unit']}] {item['english']}")

    from collections import Counter
    uc = Counter(d['unit'] for d in data)
    print(f"\n单元分布（{len(uc)} 个单元）：")
    for u, c in sorted(uc.items()):
        print(f"  {u}: {c} 句")
