// 英语900句听力练习应用

class ListeningPractice {
    constructor() {
        // 默认句子库（示例数据）
        this.sentences = [
            "Hello, how are you?",
            "Good morning! Have a nice day.",
            "What's your name?",
            "Nice to meet you.",
            "How old are you?",
            "Where are you from?",
            "I'm from China.",
            "What do you do?",
            "I'm a student.",
            "What time is it?",
            "It's nine o'clock.",
            "How's the weather today?",
            "It's sunny and warm.",
            "Do you like English?",
            "Yes, I love it very much.",
            "Can you speak Chinese?",
            "A little bit.",
            "What's your favorite food?",
            "I like pizza.",
            "Where do you live?",
            "I live in Beijing.",
            "How do you go to school?",
            "I go by bus.",
            "What are you doing?",
            "I'm reading a book.",
            "Do you have any hobbies?",
            "I like playing basketball.",
            "What's your phone number?",
            "My number is 138-0000-0000.",
            "Can I help you?",
            "Yes, please. I need some information."
        ];

        this.currentIndex = 0;
        this.isTextVisible = false;
        this.isSpeaking = false;

        // 语音设置
        this.speechRate = 0.9;
        this.speechVolume = 1.0;
        this.selectedVoice = null;

        // 初始化语音合成
        this.synth = window.speechSynthesis;
        this.voices = [];

        // 绑定DOM元素
        this.bindElements();

        // 加载语音列表
        this.loadVoices();

        // 设置事件监听
        this.setupEventListeners();

        // 初始化显示
        this.updateDisplay();
    }

    bindElements() {
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        this.sentenceNumber = document.getElementById('sentenceNumber');
        this.sentenceDisplay = document.getElementById('sentenceDisplay');
        this.btnPlay = document.getElementById('btnPlay');
        this.btnRepeat = document.getElementById('btnRepeat');
        this.btnToggle = document.getElementById('btnToggle');
        this.btnPrev = document.getElementById('btnPrev');
        this.btnNext = document.getElementById('btnNext');
        this.rateControl = document.getElementById('rateControl');
        this.rateValue = document.getElementById('rateValue');
        this.volumeControl = document.getElementById('volumeControl');
        this.volumeValue = document.getElementById('volumeValue');
        this.voiceSelect = document.getElementById('voiceSelect');
        this.importText = document.getElementById('importText');
        this.btnImport = document.getElementById('btnImport');
        this.importStatus = document.getElementById('importStatus');
    }

    loadVoices() {
        // 加载可用的语音
        const loadVoicesList = () => {
            this.voices = this.synth.getVoices();

            // 筛选英语语音
            const englishVoices = this.voices.filter(voice =>
                voice.lang.startsWith('en-')
            );

            // 填充语音选择下拉框
            this.voiceSelect.innerHTML = '<option value="">默认英语</option>';
            englishVoices.forEach((voice, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = `${voice.name} (${voice.lang})`;
                this.voiceSelect.appendChild(option);
            });

            // 设置默认语音（优先选择美式英语）
            const preferredVoice = englishVoices.find(voice =>
                voice.lang === 'en-US' && voice.name.includes('Female')
            ) || englishVoices.find(voice =>
                voice.lang === 'en-US'
            ) || englishVoices[0];

            if (preferredVoice) {
                const voiceIndex = this.voices.indexOf(preferredVoice);
                this.voiceSelect.value = voiceIndex;
                this.selectedVoice = preferredVoice;
            }
        };

        // 语音列表可能需要异步加载
        if (this.synth.getVoices().length > 0) {
            loadVoicesList();
        }
        this.synth.addEventListener('voiceschanged', loadVoicesList);
    }

    setupEventListeners() {
        // 播放按钮
        this.btnPlay.addEventListener('click', () => this.playCurrentSentence());

        // 重播按钮
        this.btnRepeat.addEventListener('click', () => this.repeatSentence());

        // 显示/隐藏原文按钮
        this.btnToggle.addEventListener('click', () => this.toggleText());

        // 导航按钮
        this.btnPrev.addEventListener('click', () => this.previousSentence());
        this.btnNext.addEventListener('click', () => this.nextSentence());

        // 语速控制
        this.rateControl.addEventListener('input', (e) => {
            this.speechRate = parseFloat(e.target.value);
            this.rateValue.textContent = this.speechRate.toFixed(1) + 'x';
        });

        // 音量控制
        this.volumeControl.addEventListener('input', (e) => {
            this.speechVolume = parseFloat(e.target.value);
            this.volumeValue.textContent = Math.round(this.speechVolume * 100) + '%';
        });

        // 语音选择
        this.voiceSelect.addEventListener('change', (e) => {
            const voiceIndex = parseInt(e.target.value);
            this.selectedVoice = this.voices[voiceIndex] || null;
        });

        // 导入按钮
        this.btnImport.addEventListener('click', () => this.importSentences());

        // 键盘快捷键
        document.addEventListener('keydown', (e) => this.handleKeyPress(e));
    }

    handleKeyPress(e) {
        // 如果焦点在输入框中，不处理快捷键
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
            return;
        }

        switch(e.key.toLowerCase()) {
            case ' ':
                e.preventDefault();
                if (this.isSpeaking) {
                    this.stopSpeaking();
                } else {
                    this.playCurrentSentence();
                }
                break;
            case 'r':
                e.preventDefault();
                this.repeatSentence();
                break;
            case 's':
                e.preventDefault();
                this.toggleText();
                break;
            case 'arrowleft':
                e.preventDefault();
                this.previousSentence();
                break;
            case 'arrowright':
                e.preventDefault();
                this.nextSentence();
                break;
        }
    }

    speak(text) {
        return new Promise((resolve, reject) => {
            // 停止当前播放
            this.synth.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = this.speechRate;
            utterance.volume = this.speechVolume;
            utterance.lang = 'en-US';

            if (this.selectedVoice) {
                utterance.voice = this.selectedVoice;
            }

            utterance.onstart = () => {
                this.isSpeaking = true;
                this.updatePlayButton();
            };

            utterance.onend = () => {
                this.isSpeaking = false;
                this.updatePlayButton();
                resolve();
            };

            utterance.onerror = (error) => {
                this.isSpeaking = false;
                this.updatePlayButton();
                reject(error);
            };

            this.synth.speak(utterance);
        });
    }

    stopSpeaking() {
        this.synth.cancel();
        this.isSpeaking = false;
        this.updatePlayButton();
    }

    async playCurrentSentence() {
        if (this.isSpeaking) {
            this.stopSpeaking();
            return;
        }

        const sentence = this.sentences[this.currentIndex];
        try {
            await this.speak(sentence);
        } catch (error) {
            console.error('Speech error:', error);
            this.showStatus('语音播放出错，请检查浏览器设置', 'error');
        }
    }

    repeatSentence() {
        this.playCurrentSentence();
    }

    toggleText() {
        this.isTextVisible = !this.isTextVisible;
        this.updateDisplay();
    }

    nextSentence() {
        if (this.currentIndex < this.sentences.length - 1) {
            this.currentIndex++;
            this.isTextVisible = false;
            this.stopSpeaking();
            this.updateDisplay();
            // 自动播放下一句
            this.playCurrentSentence();
        }
    }

    previousSentence() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.isTextVisible = false;
            this.stopSpeaking();
            this.updateDisplay();
            // 自动播放上一句
            this.playCurrentSentence();
        }
    }

    updateDisplay() {
        const sentence = this.sentences[this.currentIndex];
        const progress = ((this.currentIndex + 1) / this.sentences.length) * 100;

        // 更新进度条
        this.progressFill.style.width = progress + '%';
        this.progressText.textContent = `进度: ${this.currentIndex + 1} / ${this.sentences.length}`;

        // 更新句子编号
        this.sentenceNumber.textContent = `句子 ${this.currentIndex + 1}`;

        // 更新句子显示
        if (this.isTextVisible) {
            this.sentenceDisplay.textContent = sentence;
            this.sentenceDisplay.classList.remove('sentence-hidden');
            this.btnToggle.textContent = '🙈 隐藏原文';
            this.btnToggle.classList.remove('hidden');
        } else {
            this.sentenceDisplay.textContent = '点击"显示原文"查看句子';
            this.sentenceDisplay.classList.add('sentence-hidden');
            this.btnToggle.textContent = '👁️ 显示原文';
            this.btnToggle.classList.add('hidden');
        }

        // 更新导航按钮状态
        this.btnPrev.disabled = this.currentIndex === 0;
        this.btnNext.disabled = this.currentIndex === this.sentences.length - 1;
    }

    updatePlayButton() {
        if (this.isSpeaking) {
            this.btnPlay.textContent = '⏸️ 暂停';
        } else {
            this.btnPlay.textContent = '▶️ 播放';
        }
    }

    importSentences() {
        const text = this.importText.value.trim();

        if (!text) {
            this.showStatus('请输入要导入的句子', 'error');
            return;
        }

        // 按行分割，过滤空行
        const newSentences = text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        if (newSentences.length === 0) {
            this.showStatus('没有找到有效的句子', 'error');
            return;
        }

        // 替换现有句子
        this.sentences = newSentences;
        this.currentIndex = 0;
        this.isTextVisible = false;
        this.stopSpeaking();
        this.updateDisplay();

        // 清空输入框
        this.importText.value = '';

        // 显示成功消息
        this.showStatus(`成功导入 ${newSentences.length} 个句子！`, 'success');
    }

    showStatus(message, type = 'success') {
        this.importStatus.textContent = message;
        this.importStatus.style.color = type === 'success' ? '#4CAF50' : '#f44336';

        setTimeout(() => {
            this.importStatus.textContent = '';
        }, 3000);
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new ListeningPractice();
});
