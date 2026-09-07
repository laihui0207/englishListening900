const pptxgen = require('pptxgenjs');

// Create presentation
const pres = new pptxgen();
pres.layout = 'LAYOUT_16x9';
pres.author = 'AI Presentation';
pres.title = 'AI未来发展预测';

// Color palette - Ocean Gradient (professional tech feel)
const colors = {
  primary: '065A82',    // deep blue
  secondary: '1C7293',  // teal
  accent: '21295C',     // midnight
  light: 'F2F2F2',      // off-white
  white: 'FFFFFF',
  text: '333333'
};

// Slide 1: Title
const slide1 = pres.addSlide();
slide1.background = { color: colors.primary };
slide1.addText('AI未来发展预测', {
  x: 0.5, y: 2.0, w: 9.0, h: 1.2,
  fontSize: 44, bold: true, color: colors.white,
  align: 'center', fontFace: 'Arial'
});
slide1.addText('探索人工智能的未来趋势与机遇', {
  x: 0.5, y: 3.3, w: 9.0, h: 0.6,
  fontSize: 20, color: colors.light,
  align: 'center', fontFace: 'Arial'
});
slide1.addText('2026年9月', {
  x: 0.5, y: 4.5, w: 9.0, h: 0.4,
  fontSize: 16, color: colors.light,
  align: 'center', fontFace: 'Arial'
});
slide1.addNotes('各位领导、各位同事，大家好！\n\n今天我很荣幸能够与大家分享关于人工智能未来发展的预测。我们正处在一个技术革命的关键时刻，AI正在以前所未有的速度改变着我们的世界。在接下来的30分钟里，我将带大家了解AI的现状、未来趋势，以及它将如何影响我们的生活和工作。\n\n这个主题不仅关系到技术从业者，更关系到每一个人的未来。让我们一起探索这个激动人心的领域。\n\n【预计时长：2分钟】');

// Slide 2: Current AI Landscape
const slide2 = pres.addSlide();
slide2.background = { color: colors.white };
slide2.addText('当前AI发展现状', {
  x: 0.5, y: 0.5, w: 9.0, h: 0.6,
  fontSize: 36, bold: true, color: colors.primary,
  fontFace: 'Arial'
});

const currentItems = [
  { title: '大语言模型崛起', desc: 'GPT-4、Claude等突破性进展' },
  { title: '多模态AI', desc: '文本、图像、视频、音频融合' },
  { title: '应用场景爆发', desc: '从对话助手到专业工具' },
  { title: '计算能力提升', desc: '专用芯片和云计算支撑' }
];

currentItems.forEach((item, i) => {
  const row = Math.floor(i / 2);
  const col = i % 2;
  const x = 0.8 + col * 4.7;
  const y = 1.8 + row * 1.4;

  slide2.addShape(pres.ShapeType.rect, {
    x: x, y: y, w: 4.2, h: 1.1,
    fill: { color: colors.light },
    line: { color: colors.secondary, width: 2 }
  });

  slide2.addText(item.title, {
    x: x + 0.2, y: y + 0.15, w: 3.8, h: 0.4,
    fontSize: 18, bold: true, color: colors.primary,
    fontFace: 'Arial'
  });

  slide2.addText(item.desc, {
    x: x + 0.2, y: y + 0.6, w: 3.8, h: 0.35,
    fontSize: 14, color: colors.text,
    fontFace: 'Arial'
  });
});

slide2.addNotes('首先让我们看看当前AI发展的现状。\n\n2022年底ChatGPT的发布标志着大语言模型时代的到来。GPT-4、Claude Opus、Gemini等模型展现出了惊人的理解和生成能力。这不是简单的技术进步，而是一个质的飞跃。\n\n同时，我们看到多模态AI的快速发展。AI不再局限于处理文本，而是能够理解图像、生成视频、识别语音。这种融合能力让AI更接近人类的感知方式。\n\n应用场景也在爆发式增长。从最初的聊天助手，到现在的代码生成、文档写作、数据分析、创意设计等专业工具。AI正在深入到各个领域。\n\n这一切的背后，是计算能力的巨大提升。专用AI芯片、云计算平台的发展，为这些突破提供了必要的基础设施。\n\n【预计时长：2.5分钟】');

// Slide 3: Key Trends
const slide3 = pres.addSlide();
slide3.background = { color: colors.white };
slide3.addText('驱动AI发展的关键趋势', {
  x: 0.5, y: 0.5, w: 9.0, h: 0.6,
  fontSize: 36, bold: true, color: colors.primary,
  fontFace: 'Arial'
});

const trends = [
  '算力指数级增长',
  '数据质量提升',
  '算法持续创新',
  '开源生态繁荣',
  '产业资本涌入',
  '监管框架完善'
];

trends.forEach((trend, i) => {
  const row = Math.floor(i / 3);
  const col = i % 3;
  const x = 1.0 + col * 2.8;
  const y = 1.8 + row * 1.5;

  slide3.addShape(pres.ShapeType.ellipse, {
    x: x, y: y, w: 0.5, h: 0.5,
    fill: { color: colors.secondary }
  });

  slide3.addText((i + 1).toString(), {
    x: x, y: y, w: 0.5, h: 0.5,
    fontSize: 20, bold: true, color: colors.white,
    align: 'center', valign: 'middle',
    fontFace: 'Arial'
  });

  slide3.addText(trend, {
    x: x + 0.7, y: y + 0.08, w: 2.0, h: 0.4,
    fontSize: 16, color: colors.text,
    fontFace: 'Arial'
  });
});

slide3.addNotes('要预测AI的未来，我们需要理解驱动其发展的关键趋势。\n\n第一，算力的指数级增长。摩尔定律虽然放缓，但专用AI芯片的发展让训练更大模型成为可能。未来几年，我们将看到万亿参数级别的模型。\n\n第二，数据质量的提升。不仅仅是数据量，更重要的是高质量、标注良好的数据。合成数据和数据清洗技术也在快速进步。\n\n第三，算法的持续创新。从Transformer到更高效的架构，从监督学习到强化学习，算法创新从未停止。\n\n第四，开源生态的繁荣。Llama、Mistral等开源模型降低了AI的门槛，让更多人能够参与创新。\n\n第五，产业资本的大量涌入。全球科技巨头和投资机构都在加大AI投入，这为技术突破提供了充足资金。\n\n第六，监管框架的逐步完善。各国政府都在制定AI相关法规，这虽然带来约束，但也为健康发展提供了保障。\n\n【预计时长：2.5分钟】');

// Slide 4: Near-term Predictions (1-3 years)
const slide4 = pres.addSlide();
slide4.background = { color: colors.white };
slide4.addText('近期预测（1-3年）', {
  x: 0.5, y: 0.5, w: 9.0, h: 0.6,
  fontSize: 36, bold: true, color: colors.primary,
  fontFace: 'Arial'
});

slide4.addShape(pres.ShapeType.rect, {
  x: 0.8, y: 1.5, w: 4.0, h: 3.2,
  fill: { color: colors.light },
  line: { color: colors.secondary, width: 2 }
});

slide4.addText('技术突破', {
  x: 1.0, y: 1.7, w: 3.6, h: 0.4,
  fontSize: 20, bold: true, color: colors.primary,
  fontFace: 'Arial'
});

const nearTechPoints = [
  '个人AI助手普及',
  'AI Agent自主完成复杂任务',
  '实时多模态交互',
  '推理能力显著提升'
];

nearTechPoints.forEach((point, i) => {
  slide4.addText('• ' + point, {
    x: 1.2, y: 2.2 + i * 0.5, w: 3.4, h: 0.4,
    fontSize: 15, color: colors.text,
    fontFace: 'Arial'
  });
});

slide4.addShape(pres.ShapeType.rect, {
  x: 5.2, y: 1.5, w: 4.0, h: 3.2,
  fill: { color: colors.light },
  line: { color: colors.accent, width: 2 }
});

slide4.addText('应用落地', {
  x: 5.4, y: 1.7, w: 3.6, h: 0.4,
  fontSize: 20, bold: true, color: colors.accent,
  fontFace: 'Arial'
});

const nearAppPoints = [
  '编程效率提升10倍',
  '内容创作自动化',
  '客户服务AI化',
  '医疗诊断辅助普及'
];

nearAppPoints.forEach((point, i) => {
  slide4.addText('• ' + point, {
    x: 5.6, y: 2.2 + i * 0.5, w: 3.4, h: 0.4,
    fontSize: 15, color: colors.text,
    fontFace: 'Arial'
  });
});

slide4.addNotes('让我们从近期预测开始，看看未来1到3年AI会有哪些突破。\n\n在技术层面，个人AI助手将真正普及。不是简单的语音助手，而是能够理解上下文、记住你的偏好、主动提供帮助的智能伙伴。\n\nAI Agent将能够自主完成复杂任务。比如，你只需要说"帮我规划下周的商务旅行"，AI就能自动搜索航班、预订酒店、安排会议，甚至准备会议材料。\n\n实时多模态交互将成为现实。你可以一边展示图片，一边用语音描述，AI能够立即理解并给出相关建议。\n\n推理能力的提升意味着AI不仅能回答问题，还能进行复杂的逻辑推理和问题解决。\n\n在应用层面，编程效率将提升10倍。AI不仅能生成代码，还能理解需求、设计架构、调试问题、优化性能。\n\n内容创作将高度自动化。从文章写作到视频制作，AI能够快速生成高质量内容，人类创作者将专注于创意和策略层面。\n\n客户服务将全面AI化，但会更加人性化，能够处理复杂问题和情绪安抚。\n\n医疗诊断辅助将普及到基层医院，帮助医生更准确地诊断疾病，减少误诊。\n\n【预计时长：3分钟】');

// Slide 5: Mid-term Predictions (3-5 years)
const slide5 = pres.addSlide();
slide5.background = { color: colors.white };
slide5.addText('中期预测（3-5年）', {
  x: 0.5, y: 0.5, w: 9.0, h: 0.6,
  fontSize: 36, bold: true, color: colors.primary,
  fontFace: 'Arial'
});

const midItems = [
  { icon: '🧠', title: 'AGI雏形出现', desc: '接近人类智能的通用AI系统' },
  { icon: '🤝', title: '人机深度协作', desc: 'AI成为工作中不可或缺的伙伴' },
  { icon: '🏭', title: '产业全面重构', desc: '传统行业被AI深度改造' },
  { icon: '🎓', title: '教育范式转变', desc: '个性化AI导师成为标配' }
];

midItems.forEach((item, i) => {
  const row = Math.floor(i / 2);
  const col = i % 2;
  const x = 1.0 + col * 4.2;
  const y = 1.8 + row * 1.7;

  slide5.addShape(pres.ShapeType.rect, {
    x: x, y: y, w: 3.8, h: 1.4,
    fill: { color: colors.light },
    line: { color: colors.secondary, width: 2 }
  });

  slide5.addText(item.icon + ' ' + item.title, {
    x: x + 0.2, y: y + 0.2, w: 3.4, h: 0.5,
    fontSize: 20, bold: true, color: colors.primary,
    fontFace: 'Arial'
  });

  slide5.addText(item.desc, {
    x: x + 0.2, y: y + 0.8, w: 3.4, h: 0.5,
    fontSize: 14, color: colors.text,
    fontFace: 'Arial'
  });
});

slide5.addNotes('展望3到5年的中期未来，我们可能会看到更加深刻的变革。\n\n首先，AGI（通用人工智能）的雏形可能会出现。虽然可能还达不到完全的人类智能水平，但会在多个领域展现出接近甚至超越人类的能力。这是一个重要的里程碑。\n\n人机深度协作将成为常态。AI不再是工具，而是真正的工作伙伴。在医疗领域，AI医生和人类医生协作；在法律领域，AI律师协助案件分析；在科研领域，AI科学家加速研究进程。\n\n产业将面临全面重构。制造业、金融业、零售业等传统行业都将被AI深度改造。不是简单的自动化，而是整个商业模式、组织结构的根本性变革。那些不能适应的企业可能会被淘汰。\n\n教育范式将发生根本转变。每个学生都将拥有AI导师，提供完全个性化的学习路径。教育不再是标准化的流水线，而是因材施教的定制化服务。教师的角色也将从知识传授者转变为学习引导者和情感支持者。\n\n这个阶段的关键词是"深度融合"。AI将不再是外部工具，而是深深嵌入到我们工作和生活的每个环节。\n\n【预计时长：3分钟】');

// Slide 6: Long-term Predictions (5-10+ years)
const slide6 = pres.addSlide();
slide6.background = { color: colors.primary };
slide6.addText('长期预测（5-10年及以上）', {
  x: 0.5, y: 0.5, w: 9.0, h: 0.6,
  fontSize: 36, bold: true, color: colors.white,
  fontFace: 'Arial'
});

slide6.addShape(pres.ShapeType.rect, {
  x: 1.5, y: 1.5, w: 7.0, h: 3.3,
  fill: { color: colors.white, transparency: 10 }
});

const longPoints = [
  '真正的AGI实现，智能水平超越人类',
  'AI驱动的科学发现加速（新材料、新药物、新能源）',
  '脑机接口与AI融合，增强人类智能',
  '自主AI系统管理城市、交通、能源',
  '工作性质根本改变，创造力成为核心价值',
  '人类寿命大幅延长，AI辅助医疗突破'
];

longPoints.forEach((point, i) => {
  slide6.addText((i + 1) + '. ' + point, {
    x: 2.0, y: 1.8 + i * 0.5, w: 6.0, h: 0.4,
    fontSize: 15, color: colors.white,
    fontFace: 'Arial'
  });
});

slide6.addNotes('让我们把目光投向更远的未来，5到10年甚至更久以后。\n\n真正的AGI可能会实现。这意味着AI将在所有智力任务上达到甚至超越人类水平。这不是科幻，而是很多研究者认为可能在2030年代实现的目标。\n\nAI将驱动科学发现的爆炸式增长。在新材料设计、药物研发、清洁能源技术等领域，AI能够模拟无数种可能性，找到人类可能需要数十年才能发现的解决方案。癌症治疗、气候变化等重大问题可能会取得突破。\n\n脑机接口技术与AI的融合将开启人类增强的新时代。我们可能能够直接用思维与AI交互，甚至将AI的计算能力与人类的创造力结合，创造出超越两者的混合智能。\n\n自主AI系统将管理整个城市的运行。从交通调度到能源分配，从应急响应到资源优化，AI将让城市更加高效、安全、宜居。\n\n工作的性质将根本改变。大部分重复性、分析性工作将由AI完成，人类将专注于创造性、战略性、情感性的工作。终身学习将成为必然，人类需要不断适应新的角色。\n\n在医疗领域，AI辅助的精准医疗可能让人类寿命大幅延长。从基因编辑到纳米机器人，从再生医学到衰老逆转，AI将加速这些突破性技术的实现。\n\n当然，这些预测充满不确定性，但方向是明确的：AI将深刻改变人类文明的方方面面。\n\n【预计时长：3.5分钟】');

// Slide 7: Impact on Healthcare
const slide7 = pres.addSlide();
slide7.background = { color: colors.white };
slide7.addText('AI对医疗健康的影响', {
  x: 0.5, y: 0.5, w: 9.0, h: 0.6,
  fontSize: 36, bold: true, color: colors.primary,
  fontFace: 'Arial'
});

slide7.addText('精准诊断', {
  x: 1.0, y: 1.6, w: 2.5, h: 0.4,
  fontSize: 18, bold: true, color: colors.accent,
  fontFace: 'Arial'
});
slide7.addText('影像识别准确率超过人类医生，早期癌症检出率提升50%以上', {
  x: 1.0, y: 2.0, w: 2.5, h: 0.8,
  fontSize: 13, color: colors.text,
  fontFace: 'Arial'
});

slide7.addText('个性化治疗', {
  x: 3.7, y: 1.6, w: 2.5, h: 0.4,
  fontSize: 18, bold: true, color: colors.accent,
  fontFace: 'Arial'
});
slide7.addText('基于基因组数据定制治疗方案，提高疗效，减少副作用', {
  x: 3.7, y: 2.0, w: 2.5, h: 0.8,
  fontSize: 13, color: colors.text,
  fontFace: 'Arial'
});

slide7.addText('药物研发', {
  x: 6.4, y: 1.6, w: 2.5, h: 0.4,
  fontSize: 18, bold: true, color: colors.accent,
  fontFace: 'Arial'
});
slide7.addText('新药研发周期从10年缩短到2-3年，成本降低70%', {
  x: 6.4, y: 2.0, w: 2.5, h: 0.8,
  fontSize: 13, color: colors.text,
  fontFace: 'Arial'
});

slide7.addText('远程医疗', {
  x: 1.0, y: 3.2, w: 2.5, h: 0.4,
  fontSize: 18, bold: true, color: colors.accent,
  fontFace: 'Arial'
});
slide7.addText('AI辅助远程诊断，优质医疗资源下沉到基层', {
  x: 1.0, y: 3.6, w: 2.5, h: 0.8,
  fontSize: 13, color: colors.text,
  fontFace: 'Arial'
});

slide7.addText('健康管理', {
  x: 3.7, y: 3.2, w: 2.5, h: 0.4,
  fontSize: 18, bold: true, color: colors.accent,
  fontFace: 'Arial'
});
slide7.addText('实时监测健康数据，预测疾病风险，提供预防建议', {
  x: 3.7, y: 3.6, w: 2.5, h: 0.8,
  fontSize: 13, color: colors.text,
  fontFace: 'Arial'
});

slide7.addText('手术机器人', {
  x: 6.4, y: 3.2, w: 2.5, h: 0.4,
  fontSize: 18, bold: true, color: colors.accent,
  fontFace: 'Arial'
});
slide7.addText('AI辅助手术规划和执行，提高精准度，减少创伤', {
  x: 6.4, y: 3.6, w: 2.5, h: 0.8,
  fontSize: 13, color: colors.text,
  fontFace: 'Arial'
});

slide7.addNotes('接下来我们具体看看AI将如何影响不同领域。首先是医疗健康。\n\n在精准诊断方面，AI的影像识别能力已经超过了人类医生。特别是在肺癌、乳腺癌等疾病的早期筛查中，AI能够发现人眼难以察觉的细微变化，使早期癌症检出率提升50%以上。这意味着更多患者能够得到及时治疗。\n\n个性化治疗将成为现实。每个人的基因不同，对药物的反应也不同。AI可以分析海量的基因组数据，为每个患者定制最适合的治疗方案，既提高疗效，又减少副作用。\n\n在药物研发领域，传统上需要10年以上时间和数十亿美元投入。AI可以快速筛选化合物、预测药效、优化分子结构，将研发周期缩短到2-3年，成本降低70%。这将让更多罕见病患者获得治疗机会。\n\n远程医疗将打破地域限制。AI辅助的远程诊断系统能让偏远地区的患者获得三甲医院专家级的诊疗服务。优质医疗资源将真正下沉到基层。\n\n健康管理将变得主动而非被动。通过可穿戴设备和AI分析，系统能够实时监测你的健康数据，预测疾病风险，提供个性化的预防建议。从"治病"转向"防病"。\n\n手术机器人配合AI，能够进行更精准的手术规划和执行。特别是在神经外科、心脏外科等需要极高精准度的领域，AI辅助手术将减少创伤，提高成功率。\n\n【预计时长：3分钟】');

// Slide 8: Impact on Education and Work
const slide8 = pres.addSlide();
slide8.background = { color: colors.white };
slide8.addText('AI对教育与工作的影响', {
  x: 0.5, y: 0.5, w: 9.0, h: 0.6,
  fontSize: 36, bold: true, color: colors.primary,
  fontFace: 'Arial'
});

// Left column - Education
slide8.addShape(pres.ShapeType.rect, {
  x: 0.8, y: 1.4, w: 4.2, h: 3.4,
  fill: { color: 'E3F2FD' }
});

slide8.addText('🎓 教育变革', {
  x: 1.0, y: 1.6, w: 3.8, h: 0.5,
  fontSize: 22, bold: true, color: colors.primary,
  fontFace: 'Arial'
});

const eduPoints = [
  'AI导师提供24/7个性化辅导',
  '自适应学习路径，因材施教',
  '实时反馈和能力评估',
  '虚拟现实增强学习体验',
  '教师专注于启发和情感支持'
];

eduPoints.forEach((point, i) => {
  slide8.addText('✓ ' + point, {
    x: 1.2, y: 2.3 + i * 0.45, w: 3.6, h: 0.4,
    fontSize: 14, color: colors.text,
    fontFace: 'Arial'
  });
});

// Right column - Work
slide8.addShape(pres.ShapeType.rect, {
  x: 5.2, y: 1.4, w: 4.2, h: 3.4,
  fill: { color: 'FFF3E0' }
});

slide8.addText('💼 工作重塑', {
  x: 5.4, y: 1.6, w: 3.8, h: 0.5,
  fontSize: 22, bold: true, color: colors.accent,
  fontFace: 'Arial'
});

const workPoints = [
  '重复性工作自动化',
  '人类专注于创造性任务',
  '技能需求快速变化',
  '终身学习成为必需',
  '新职业大量涌现'
];

workPoints.forEach((point, i) => {
  slide8.addText('✓ ' + point, {
    x: 5.6, y: 2.3 + i * 0.45, w: 3.6, h: 0.4,
    fontSize: 14, color: colors.text,
    fontFace: 'Arial'
  });
});

slide8.addNotes('教育和工作是另外两个将被AI深刻改变的领域。\n\n在教育方面，AI导师将为每个学生提供24小时随时可用的个性化辅导。不同于传统的"一刀切"教学，AI能够了解每个学生的知识基础、学习风格、兴趣点，提供完全定制化的学习内容和进度安排。\n\n自适应学习系统会根据学生的掌握情况实时调整难度。如果某个概念没理解，系统会用不同方式重新讲解；如果已经掌握，就跳到下一个挑战。真正做到因材施教。\n\n实时反馈和能力评估让学习效果可见。学生和家长能够清楚地看到进步轨迹和薄弱环节，有针对性地改进。\n\n虚拟现实技术结合AI，能够创造沉浸式学习体验。学历史可以"穿越"到古代，学天文可以"遨游"太空，学化学可以在虚拟实验室安全地进行实验。\n\n教师的角色将发生根本转变。从知识的传授者变为学习的引导者、情感的支持者、价值观的塑造者。人类教师将专注于培养AI无法替代的能力：批判性思维、创造力、同理心、协作能力。\n\n在工作领域，首当其冲的是重复性工作的自动化。数据录入、简单客服、基础财务工作等将大量被AI取代。但这不是坏事，而是解放人类去做更有价值的工作。\n\n人类将专注于创造性、战略性、人际性的任务。这些是AI目前还难以完全胜任的领域。比如产品创新、战略规划、团队管理、客户关系建立等。\n\n技能需求将快速变化。今天热门的技能可能5年后就过时了。终身学习不再是选择，而是生存必需。每个人都需要持续更新知识和技能。\n\n同时，大量新职业将涌现。AI训练师、提示工程师、AI伦理专家、人机协作设计师等新职业已经出现，未来还会有更多我们现在无法想象的职业。\n\n【预计时长：3分钟】');

// Slide 9: Impact on Daily Life
const slide9 = pres.addSlide();
slide9.background = { color: colors.white };
slide9.addText('AI对日常生活的影响', {
  x: 0.5, y: 0.5, w: 9.0, h: 0.6,
  fontSize: 36, bold: true, color: colors.primary,
  fontFace: 'Arial'
});

const lifeAreas = [
  { area: '智能家居', impact: '全屋智能化，理解生活习惯，主动优化环境' },
  { area: '出行交通', impact: '自动驾驶普及，出行更安全高效，交通拥堵减少' },
  { area: '购物消费', impact: '精准推荐，虚拟试穿试用，智能议价助手' },
  { area: '娱乐休闲', impact: 'AI生成个性化内容，虚拟伴侣，沉浸式体验' },
  { area: '社交沟通', impact: '实时翻译，跨语言无障碍交流，情感分析辅助' },
  { area: '理财规划', impact: 'AI财务顾问，个性化投资建议，风险预警' }
];

lifeAreas.forEach((item, i) => {
  const row = Math.floor(i / 2);
  const col = i % 2;
  const x = 0.8 + col * 4.7;
  const y = 1.7 + row * 1.1;

  slide9.addShape(pres.ShapeType.rect, {
    x: x, y: y, w: 4.2, h: 0.9,
    fill: { color: colors.light }
  });

  slide9.addText(item.area, {
    x: x + 0.15, y: y + 0.1, w: 1.2, h: 0.3,
    fontSize: 16, bold: true, color: colors.primary,
    fontFace: 'Arial'
  });

  slide9.addText(item.impact, {
    x: x + 0.15, y: y + 0.45, w: 3.9, h: 0.4,
    fontSize: 13, color: colors.text,
    fontFace: 'Arial'
  });
});

slide9.addNotes('AI不仅会改变宏观的行业和社会，也会深入到我们每个人的日常生活。\n\n在智能家居方面，未来的家将真正"懂"你。不需要设置复杂的规则，AI通过观察学习你的生活习惯。比如，它知道你什么时候起床，会提前调节室温和灯光；知道你的口味偏好，会建议今天的菜谱；甚至能察觉你情绪不佳，播放你喜欢的音乐来放松。\n\n出行交通将因自动驾驶而彻底改变。不仅更安全（AI不会疲劳驾驶、酒驾），还更高效。车辆之间能够互相通信协调，大幅减少交通拥堵。你可以在通勤路上工作、学习或休息，而不是浪费时间在驾驶上。\n\n购物体验将高度个性化。AI不仅能精准推荐你可能喜欢的商品，还能提供虚拟试穿试用功能。想买衣服？AI能根据你的体型生成虚拟试穿效果。智能议价助手还能帮你找到最优惠的价格。\n\n娱乐休闲将进入新境界。AI能够根据你的喜好生成个性化的音乐、视频、游戏内容。虚拟伴侣能够陪你聊天、玩游戏，甚至提供情感支持。虚拟现实技术让你能够体验任何你想象的场景。\n\n社交沟通将没有语言障碍。实时AI翻译让你能够和世界各地的人流畅交流。情感分析功能还能帮助你更好地理解对方的真实感受，改善沟通效果。\n\n理财规划将更加科学。AI财务顾问能够根据你的收入、支出、目标，提供个性化的投资建议。实时监控市场变化，及时预警风险，帮你做出更明智的财务决策。\n\n【预计时长：2.5分钟】');

// Slide 10: Challenges and Ethical Considerations
const slide10 = pres.addSlide();
slide10.background = { color: colors.accent };
slide10.addText('挑战与伦理考量', {
  x: 0.5, y: 0.5, w: 9.0, h: 0.6,
  fontSize: 36, bold: true, color: colors.white,
  fontFace: 'Arial'
});

const challenges = [
  { title: '就业冲击', desc: '大量岗位被替代，社会如何转型？' },
  { title: '数据隐私', desc: 'AI需要数据，如何保护个人隐私？' },
  { title: '算法偏见', desc: 'AI会放大现有的社会偏见吗？' },
  { title: '安全风险', desc: 'AI系统被攻击或滥用怎么办？' },
  { title: '控制问题', desc: '超级AI会失控吗？谁来监管？' },
  { title: '数字鸿沟', desc: 'AI加剧还是缩小贫富差距？' }
];

challenges.forEach((item, i) => {
  const row = Math.floor(i / 3);
  const col = i % 3;
  const x = 0.7 + col * 3.0;
  const y = 1.6 + row * 1.7;

  slide10.addShape(pres.ShapeType.rect, {
    x: x, y: y, w: 2.7, h: 1.3,
    fill: { color: colors.white }
  });

  slide10.addText(item.title, {
    x: x + 0.2, y: y + 0.2, w: 2.3, h: 0.4,
    fontSize: 18, bold: true, color: colors.accent,
    fontFace: 'Arial'
  });

  slide10.addText(item.desc, {
    x: x + 0.2, y: y + 0.7, w: 2.3, h: 0.5,
    fontSize: 13, color: colors.text,
    fontFace: 'Arial'
  });
});

slide10.addNotes('在拥抱AI带来的机遇的同时，我们也必须正视挑战和伦理问题。\n\n首先是就业冲击。虽然新技术会创造新职业，但转型期会有大量人员失业。司机、收银员、客服、基础文员等职业可能大量消失。社会如何帮助这些人转型？失业期间如何保障他们的生活？全民基本收入是否是解决方案？这些都是需要认真思考的问题。\n\n数据隐私是另一个重大挑战。AI的强大能力建立在海量数据之上，但这些数据涉及个人隐私。如何在利用数据推动创新和保护个人隐私之间找到平衡？谁有权访问和使用你的数据？数据泄露的后果如何承担？这需要完善的法律和技术保障。\n\n算法偏见问题不容忽视。如果训练数据包含偏见，AI会学习并放大这些偏见。比如招聘算法可能歧视某些群体，信贷算法可能对少数族裔不公平。如何确保AI的公平性？如何审计和纠正算法偏见？这需要多元化的AI开发团队和严格的测试机制。\n\n安全风险也是重大隐患。AI系统可能被黑客攻击，造成严重后果。想象一下，如果自动驾驶系统被攻击，或者医疗AI被篡改，后果不堪设想。AI技术也可能被用于恶意目的，如深度伪造、自动化网络攻击、智能化监控等。如何确保AI安全可控？\n\n控制问题是长远的担忧。随着AI能力不断增强，我们如何确保它始终符合人类价值观？如果出现超级AI，谁来监管？如何防止失控？虽然这可能还很遥远，但需要提前规划。\n\n最后是数字鸿沟问题。AI技术会加剧还是缩小贫富差距？如果只有少数人能够获得AI的好处，而大多数人只是被替代，社会不平等会加剧。如何确保AI的普惠性？这需要政策引导和社会共同努力。\n\n【预计时长：3.5分钟】');

// Slide 11: Opportunities and Preparation
const slide11 = pres.addSlide();
slide11.background = { color: colors.white };
slide11.addText('机遇与准备', {
  x: 0.5, y: 0.5, w: 9.0, h: 0.6,
  fontSize: 36, bold: true, color: colors.primary,
  fontFace: 'Arial'
});

slide11.addShape(pres.ShapeType.rect, {
  x: 0.8, y: 1.4, w: 4.2, h: 3.3,
  fill: { color: 'E8F5E9' }
});

slide11.addText('💡 个人层面', {
  x: 1.0, y: 1.6, w: 3.8, h: 0.4,
  fontSize: 20, bold: true, color: colors.primary,
  fontFace: 'Arial'
});

const personalPrep = [
  '学习AI工具，提升效率',
  '培养创造力和批判性思维',
  '发展人际交往能力',
  '保持好奇心，终身学习',
  '关注AI发展，适时转型'
];

personalPrep.forEach((point, i) => {
  slide11.addText('• ' + point, {
    x: 1.2, y: 2.2 + i * 0.45, w: 3.6, h: 0.4,
    fontSize: 15, color: colors.text,
    fontFace: 'Arial'
  });
});

slide11.addShape(pres.ShapeType.rect, {
  x: 5.2, y: 1.4, w: 4.2, h: 3.3,
  fill: { color: 'FFF9C4' }
});

slide11.addText('🏢 组织层面', {
  x: 5.4, y: 1.6, w: 3.8, h: 0.4,
  fontSize: 20, bold: true, color: colors.accent,
  fontFace: 'Arial'
});

const orgPrep = [
  '制定AI战略，投资AI能力',
  '培训员工，提升AI素养',
  '重构业务流程，拥抱变革',
  '建立AI伦理规范',
  '参与行业标准制定'
];

orgPrep.forEach((point, i) => {
  slide11.addText('• ' + point, {
    x: 5.6, y: 2.2 + i * 0.45, w: 3.6, h: 0.4,
    fontSize: 15, color: colors.text,
    fontFace: 'Arial'
  });
});

slide11.addNotes('面对AI时代的到来，我们应该如何准备？这里有一些建议。\n\n在个人层面，首先要主动学习和使用AI工具。不要抗拒，而要拥抱。学会使用ChatGPT、Claude等工具提升工作效率。把AI当作你的助手，而不是威胁。\n\n其次，要培养AI难以替代的能力。创造力、批判性思维、复杂问题解决能力，这些是人类独特的优势。不要只学习可以被自动化的技能。\n\n人际交往能力会变得更加重要。同理心、情商、沟通协调能力，这些"软技能"在AI时代反而更有价值。因为机器可以处理信息，但难以真正理解人的情感。\n\n保持好奇心，终身学习。不要觉得学完学校就够了。世界变化太快，需要不断更新知识。幸运的是，AI也能帮助我们学习，个性化AI导师会让学习更高效。\n\n关注AI发展趋势，及时调整职业方向。如果你的工作很可能被自动化，提前规划转型。不要等到失业了才行动。\n\n在组织层面，企业需要制定明确的AI战略。AI不是可选项，而是生存必需。要投资AI能力，无论是自研还是采购。\n\n培训员工，提升全员的AI素养。不仅是技术部门，所有员工都应该了解AI的基本原理和应用场景。让AI成为企业文化的一部分。\n\n重构业务流程，而不是简单地在现有流程上加AI。AI的价值在于重新设计工作方式，提升整体效率。\n\n建立AI伦理规范，确保AI的负责任使用。这不仅是道德要求，也是风险管理。AI系统失误可能带来巨大损失。\n\n参与行业标准和最佳实践的制定。AI治理需要全社会共同参与，企业作为重要参与者，应该积极发声。\n\n【预计时长：3分钟】');

// Slide 12: Conclusion
const slide12 = pres.addSlide();
slide12.background = { color: colors.primary };
slide12.addText('结语：拥抱AI时代', {
  x: 0.5, y: 1.2, w: 9.0, h: 0.8,
  fontSize: 40, bold: true, color: colors.white,
  align: 'center', fontFace: 'Arial'
});

slide12.addShape(pres.ShapeType.rect, {
  x: 2.0, y: 2.5, w: 6.0, h: 2.0,
  fill: { color: colors.white, transparency: 15 }
});

const conclusion = [
  'AI是工具，不是威胁',
  '变化带来挑战，更带来机遇',
  '关键在于如何适应和引导',
  '未来属于会利用AI的人'
];

conclusion.forEach((point, i) => {
  slide12.addText('✓ ' + point, {
    x: 2.5, y: 2.7 + i * 0.45, w: 5.0, h: 0.4,
    fontSize: 18, color: colors.white, bold: true,
    fontFace: 'Arial'
  });
});

slide12.addNotes('最后，让我总结一下今天的分享。\n\nAI是工具，不是威胁。虽然AI的发展速度令人惊叹，能力令人震撼，但归根结底，AI是人类创造的工具，是为了增强人类能力，而不是取代人类。我们应该以积极的心态看待AI，而不是恐惧和抗拒。\n\n变化确实会带来挑战。工作岗位的变化、技能要求的转变、伦理问题的出现，这些都是现实存在的挑战。但历史告诉我们，每一次重大技术革命都伴随着挑战和阵痛，但最终都推动了人类文明的进步。\n\n更重要的是，变化带来巨大机遇。AI将解放我们从重复性劳动中，让我们有更多时间从事创造性工作。AI将帮助我们解决人类面临的重大挑战，从疾病到气候变化。AI将让个性化教育、精准医疗、高效工作成为现实。\n\n关键在于如何适应和引导。作为个人，我们需要主动学习，提升自己的AI素养和不可替代的能力。作为组织，我们需要拥抱变革，投资AI能力。作为社会，我们需要建立合理的法律和伦理框架，确保AI的负责任发展。\n\n未来属于那些能够与AI协作、利用AI增强自己能力的人。不是AI会取代人类，而是会用AI的人将取代不会用AI的人。\n\nAI时代已经到来，不是将来时，而是现在进行时。问题不是"是否"拥抱AI，而是"如何"拥抱AI。让我们以开放的心态、积极的行动，共同创造一个人机协作、共同繁荣的美好未来！\n\n【预计时长：2.5分钟】');

// Slide 13: Q&A
const slide13 = pres.addSlide();
slide13.background = { color: colors.secondary };
slide13.addText('感谢聆听', {
  x: 0.5, y: 1.8, w: 9.0, h: 0.8,
  fontSize: 44, bold: true, color: colors.white,
  align: 'center', fontFace: 'Arial'
});

slide13.addText('Q & A', {
  x: 0.5, y: 2.8, w: 9.0, h: 0.8,
  fontSize: 36, color: colors.white,
  align: 'center', fontFace: 'Arial'
});

slide13.addText('欢迎提问与讨论', {
  x: 0.5, y: 3.8, w: 9.0, h: 0.5,
  fontSize: 20, color: colors.light,
  align: 'center', fontFace: 'Arial'
});

slide13.addNotes('好的，我的演讲就到这里。感谢大家的聆听！\n\n现在欢迎大家提问。无论是关于AI技术细节的问题，还是关于AI对特定行业影响的问题，或者是关于个人职业发展的困惑，我都很乐意与大家交流探讨。\n\n【预计时长：5-8分钟Q&A】\n\n常见问题准备：\n\nQ: AI会完全取代程序员吗？\nA: 不会完全取代，但会改变程序员的工作方式。AI能够处理重复性编码，程序员将更多专注于系统设计、架构决策、复杂问题解决。会用AI辅助编程的程序员会更高效。\n\nQ: 普通人应该如何准备AI时代？\nA: 1)学会使用主流AI工具；2)培养创造力和批判性思维；3)保持学习习惯；4)关注行业变化趋势；5)不要恐惧，要拥抱变化。\n\nQ: AI的安全问题能解决吗？\nA: 安全是持续的过程，不是一劳永逸的。需要技术手段（加密、访问控制）、制度保障（审计、监管）、伦理规范多管齐下。重要的是建立AI安全文化。\n\nQ: 中国在AI领域的位置如何？\nA: 中国在AI应用和数据规模上有优势，在基础模型上与美国有差距但在快速追赶。关键是继续投资基础研究，培养人才，同时发挥应用场景丰富的优势。');

// Save presentation
pres.writeFile({ fileName: 'AI未来发展预测.pptx' })
  .then(() => {
    console.log('Presentation created successfully: AI未来发展预测.pptx');
  })
  .catch(err => {
    console.error('Error creating presentation:', err);
  });
