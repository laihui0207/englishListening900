// 从 PDF 文本提取现有的中文翻译并填充到 sentences_primary.json
const fs = require('fs');
const path = require('path');

// PDF 中的英中对照（手动提取的部分）
const pdfTranslations = {
  // Greetings
  "Hello.": "你好！",
  "Good morning.": "早晨好！",
  "I'm John Smith.": "我是约翰·史密斯。",
  "Are you Bill Jones?": "你是比尔·琼斯吗？",
  "Yes, I am.": "是的，我是。",
  "How are you?": "你好吗？",
  "Fine, thanks.": "很好，谢谢。",
  "How is Helen?": "海伦好吗？",
  "She's very well, thank you.": "她很好，谢谢您。",
  "Good afternoon, Mr. Green.": "午安，格林先生。",
  "Good evening, Mrs. Brown.": "晚上好，布朗夫人。",
  "How are you this evening?": "今晚上您好吗？",
  "Good night, John.": "晚安，约翰。",
  "Good-bye, Bill.": "再见，比尔。",
  "See you tomorrow.": "明天见。",

  // Classroom expressions
  "Come in, please.": "请进！",
  "Sit down.": "坐下！",
  "Stand up, please.": "请站起来。",
  "Open your book, please.": "请把书打开。",
  "Close your book, please.": "请把书合上。",
  "Don't open your book.": "别打开书。",
  "Do you understand?": "你明白了吗？",
  "Yes, I understand.": "是的，我明白了。",
  "No, I don't understand.": "不，我不明白。",
  "Listen and repeat.": "先听，然后再重复一遍。",
  "Now read, please.": "现在请大家读。",
  "That's fine.": "好得很。",
  "It's time to begin.": "到开始的时候了。",
  "Let's begin now.": "现在让我们开始。",
  "This is Lesson One.": "这是第一课。"
};

// 通用翻译补充（简单直译）
const commonTranslations = {
  "What's your name?": "你叫什么名字？",
  "My name is": "我的名字是",
  "What time is it?": "现在几点？",
  "It's": "现在是",
  "Thank you": "谢谢",
  "You're welcome": "不客气",
  "Excuse me": "打扰一下",
  "I'm sorry": "对不起",
  "How old are you?": "你多大了？",
  "I'm": "我是/我有",
  "years old": "岁",
  "Where are you from?": "你来自哪里？",
  "I'm from": "我来自",
  "Nice to meet you": "很高兴见到你",
  "What's this?": "这是什么？",
  "What's that?": "那是什么？",
  "This is": "这是",
  "That is": "那是"
};

function main() {
  const dataPath = path.join(__dirname, '..', 'sentences_primary.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  let filled = 0;

  data.forEach(item => {
    if (!item.chinese || item.chinese.trim() === '') {
      // 先匹配 PDF 翻译
      if (pdfTranslations[item.english]) {
        item.chinese = pdfTranslations[item.english];
        filled++;
      }
      // 再匹配通用翻译
      else if (commonTranslations[item.english]) {
        item.chinese = commonTranslations[item.english];
        filled++;
      }
      // 否则保持空，等待API翻译
    }
  });

  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Filled ${filled} translations from PDF and common patterns`);
  console.log(`Remaining: ${data.filter(s => !s.chinese || s.chinese.trim() === '').length}`);
}

main();
