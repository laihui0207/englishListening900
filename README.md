# 英语听力练习系统

一个基于 Web 的英语听力练习应用，支持多级别学习。

## 项目结构

```
demo/
├── index.html              # 主页面
├── app_audio.js           # 前端逻辑
├── server.js              # 后端服务器
├── sentences_data.json    # 通用级别数据（250句）
├── sentences_primary.json # 小学级别数据（900句，English 900）
├── audio/
│   ├── general/          # 通用级别音频文件
│   └── primary/          # 小学级别音频文件
└── scripts/
    ├── translate_primary.js        # 翻译脚本
    └── generate_primary_audio.js   # 音频生成脚本

## 学习级别

### 小学级别（Primary）
- **数据来源**: English 900 经典教材
- **句子数量**: 900句
- **难度**: 基础日常对话
- **主题**: 
  - 问候语和课堂用语
  - 识别物品和人物
  - 日期和时间
  - 日常活动
  - 家庭和邻居
  - 购物和用餐
- **特点**: 句子简短，词汇基础，适合初学者

### 初中级别（Middle School）
- **状态**: 暂时复用通用级别数据
- **计划**: 后续添加初中难度的专门内容

### 通用级别（General）
- **句子数量**: 250句
- **难度**: 中等
- **内容**: 综合性日常英语对话

## 功能特点

1. **多级别选择**: 用户可以根据自己的水平选择合适的练习级别
2. **音频播放**: 每个句子都有 TTS 生成的标准美式英语发音
3. **中英对照**: 提供中文翻译帮助理解
4. **进度跟踪**: 显示当前练习进度

## 技术栈

- **前端**: HTML5, CSS3, 原生 JavaScript
- **后端**: Node.js + Express
- **TTS**: edge-tts (Microsoft Azure TTS)
- **翻译**: OpenAI API

## 启动项目

### 安装依赖
```bash
npm install
```

### 生成音频文件（如果需要）
```bash
# 安装 edge-tts
pip install edge-tts

# 生成小学级别音频
cd scripts
node generate_primary_audio.js
```

### 启动服务器
```bash
node server.js
```

访问 http://localhost:3000

## 数据格式

每个级别的 JSON 文件格式：
```json
[
  {
    "id": 1,
    "english": "Hello.",
    "chinese": "你好。",
    "audio": "sentence_001.mp3"
  }
]
```

## 开发计划

- [x] 小学级别数据准备（English 900）
- [x] 翻译所有句子
- [ ] 生成所有音频文件（进行中）
- [ ] 添加初中级别专门内容
- [ ] 添加发音评分功能
- [ ] 添加单词本功能
- [ ] 添加学习统计和历史记录

## License

MIT
