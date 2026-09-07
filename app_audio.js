// 英语900句听力练习应用 - 使用预生成音频版本

class ListeningPractice {
    constructor() {
        this.sentences = [];
        this.currentIndex = 0;
        this.isTextVisible = false;
        this.isPlaying = false;

        // 音频设置
        this.audioVolume = 1.0;
        this.audioRate = 1.0;

        // 进度保存设置
        this.autoSaveProgress = true;

        // 播放类型追踪
        this.currentPlaybackType = null; // 'audio' 或 'tts'
        this.ttsUtterance = null;

        // 音频对象
        this.audio = new Audio();
        this.audio.addEventListener('ended', () => {
            this.isPlaying = false;
            this.updatePlayButton();
        });
        this.audio.addEventListener('error', (e) => {
            console.error('Audio error:', e);
            this.showStatus('音频加载失败', 'error');
            this.isPlaying = false;
            this.updatePlayButton();
        });

        // 绑定DOM元素
        this.bindElements();

        // 加载设置
        this.loadSettings();

        // 加载句子数据
        this.loadSentences();

        // 设置事件监听
        this.setupEventListeners();
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
        this.importText = document.getElementById('importText');
        this.btnImport = document.getElementById('btnImport');
        this.btnClearCustom = document.getElementById('btnClearCustom');
        this.importStatus = document.getElementById('importStatus');
        this.loadingStatus = document.getElementById('loadingStatus');
        this.jumpInput = document.getElementById('jumpInput');
        this.btnJump = document.getElementById('btnJump');
        this.autoSaveToggle = document.getElementById('autoSaveToggle');
    }

    async loadSentences() {
        try {
            this.loadingStatus.textContent = '正在加载句子数据...';

            const response = await fetch('sentences_data.json');
            if (!response.ok) {
                throw new Error('无法加载句子数据');
            }

            const data = await response.json();
            this.sentences = data;

            // 加载并追加自定义句子
            const customSentences = this.loadCustomSentences();
            if (customSentences.length > 0) {
                this.sentences = this.sentences.concat(customSentences);
                this.loadingStatus.textContent = `✓ 已加载 ${data.length} 个句子（高质量音频） + ${customSentences.length} 个自定义句子`;
            } else {
                this.loadingStatus.textContent = `✓ 已加载 ${this.sentences.length} 个句子（高质量音频）`;
            }

            setTimeout(() => {
                this.loadingStatus.textContent = '';
            }, 3000);

            // 恢复上次的进度
            this.restoreProgress();

            this.updateDisplay();

        } catch (error) {
            console.error('Error loading sentences:', error);
            this.loadingStatus.textContent = '❌ 加载失败，请检查 sentences_data.json 文件';
            this.loadDefaultSentences();
        }
    }

    loadDefaultSentences() {
        // 默认句子（备用）
        this.sentences = [
            { id: 1, text: "Hello, how are you doing?", audio: null },
            { id: 2, text: "Good morning!", audio: null },
            { id: 3, text: "Nice to meet you.", audio: null }
        ];
        this.updateDisplay();
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
            this.audioRate = parseFloat(e.target.value);
            this.rateValue.textContent = this.audioRate.toFixed(1) + 'x';
            this.audio.playbackRate = this.audioRate;
        });

        // 音量控制
        this.volumeControl.addEventListener('input', (e) => {
            this.audioVolume = parseFloat(e.target.value);
            this.volumeValue.textContent = Math.round(this.audioVolume * 100) + '%';
            this.audio.volume = this.audioVolume;
        });

        // 跳转按钮
        this.btnJump.addEventListener('click', () => this.jumpToSentence());

        // 回车键跳转
        this.jumpInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.jumpToSentence();
            }
        });

        // 自动保存开关
        this.autoSaveToggle.addEventListener('change', (e) => {
            this.autoSaveProgress = e.target.checked;
            this.saveSettings();
            if (this.autoSaveProgress) {
                this.saveProgress();
                this.showStatus('✓ 已开启自动保存进度', 'success');
            } else {
                localStorage.removeItem('listeningPracticeProgress');
                this.showStatus('✓ 已关闭自动保存进度', 'success');
            }
        });

        // 导入按钮
        this.btnImport.addEventListener('click', () => this.importSentences());

        // 清除自定义句子按钮
        this.btnClearCustom.addEventListener('click', () => this.clearCustomSentences());

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
                this.playCurrentSentence();
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

    playCurrentSentence() {
        if (this.sentences.length === 0) {
            this.showStatus('请先加载或导入句子', 'error');
            return;
        }

        const sentence = this.sentences[this.currentIndex];

        if (this.isPlaying) {
            // 如果正在播放，停止
            if (this.currentPlaybackType === 'audio') {
                this.audio.pause();
            } else if (this.currentPlaybackType === 'tts' && this.ttsUtterance) {
                window.speechSynthesis.cancel();
            }
            this.isPlaying = false;
            this.updatePlayButton();
            return;
        }

        // 获取英文文本
        const englishText = sentence.english || sentence.text || '';

        if (sentence.audio) {
            // 播放预生成的音频文件
            this.currentPlaybackType = 'audio';
            this.audio.src = sentence.audio;
            this.audio.playbackRate = this.audioRate;
            this.audio.volume = this.audioVolume;

            this.audio.play()
                .then(() => {
                    this.isPlaying = true;
                    this.updatePlayButton();
                })
                .catch(error => {
                    console.error('Audio playback error:', error);
                    // 如果音频加载失败，回退到TTS
                    this.showStatus('音频加载失败，使用TTS播放', 'warning');
                    this.playWithTTS(englishText);
                });
        } else {
            // 没有音频文件，使用TTS
            this.playWithTTS(englishText);
        }
    }

    playWithTTS(text) {
        if (!text) {
            this.showStatus('没有可播放的文本', 'error');
            return;
        }

        // 检查浏览器是否支持TTS
        if (!window.speechSynthesis) {
            this.showStatus('浏览器不支持TTS语音合成', 'error');
            return;
        }

        console.log('使用TTS播放:', text);
        this.currentPlaybackType = 'tts';

        // 创建语音合成实例
        this.ttsUtterance = new SpeechSynthesisUtterance(text);
        this.ttsUtterance.lang = 'en-US';
        this.ttsUtterance.rate = this.audioRate;
        this.ttsUtterance.volume = this.audioVolume;

        // 监听播放开始
        this.ttsUtterance.onstart = () => {
            console.log('TTS开始播放');
            this.showStatus('正在使用TTS播放...', 'success');
        };

        // 监听播放结束
        this.ttsUtterance.onend = () => {
            console.log('TTS播放结束');
            this.isPlaying = false;
            this.updatePlayButton();
        };

        // 监听错误
        this.ttsUtterance.onerror = (event) => {
            console.error('TTS error:', event);
            this.isPlaying = false;
            this.updatePlayButton();
            this.showStatus('TTS播放失败', 'error');
        };

        // 开始播放
        window.speechSynthesis.speak(this.ttsUtterance);
        this.isPlaying = true;
        this.updatePlayButton();
    }

    repeatSentence() {
        if (this.currentPlaybackType === 'audio') {
            this.audio.currentTime = 0;
        } else if (this.currentPlaybackType === 'tts') {
            window.speechSynthesis.cancel();
        }
        this.isPlaying = false;
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
            this.audio.pause();
            this.isPlaying = false;
            this.updateDisplay();
            this.saveProgress();
            // 自动播放下一句
            this.playCurrentSentence();
        }
    }

    previousSentence() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.isTextVisible = false;
            this.audio.pause();
            this.isPlaying = false;
            this.updateDisplay();
            this.saveProgress();
            // 自动播放上一句
            this.playCurrentSentence();
        }
    }

    jumpToSentence() {
        const input = this.jumpInput.value.trim();
        const targetIndex = parseInt(input);

        if (!input) {
            this.showStatus('请输入句子编号', 'error');
            return;
        }

        if (isNaN(targetIndex) || targetIndex < 1 || targetIndex > this.sentences.length) {
            this.showStatus(`请输入1到${this.sentences.length}之间的数字`, 'error');
            return;
        }

        this.currentIndex = targetIndex - 1;
        this.isTextVisible = false;
        this.audio.pause();
        this.isPlaying = false;
        this.updateDisplay();
        this.saveProgress();
        this.jumpInput.value = '';

        this.showStatus(`✓ 已跳转到第 ${targetIndex} 句`, 'success');

        // 自动播放跳转后的句子
        this.playCurrentSentence();
    }

    loadSettings() {
        try {
            const saved = localStorage.getItem('listeningPracticeSettings');
            if (saved) {
                const settings = JSON.parse(saved);
                this.autoSaveProgress = settings.autoSaveProgress !== false; // 默认为true
            }

            // 更新UI
            if (this.autoSaveToggle) {
                this.autoSaveToggle.checked = this.autoSaveProgress;
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    saveSettings() {
        try {
            const settings = {
                autoSaveProgress: this.autoSaveProgress
            };
            localStorage.setItem('listeningPracticeSettings', JSON.stringify(settings));
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    saveProgress() {
        if (!this.autoSaveProgress) {
            return;
        }

        try {
            const progress = {
                currentIndex: this.currentIndex,
                timestamp: new Date().toISOString()
            };
            localStorage.setItem('listeningPracticeProgress', JSON.stringify(progress));
        } catch (error) {
            console.error('Error saving progress:', error);
        }
    }

    restoreProgress() {
        if (!this.autoSaveProgress) {
            return;
        }

        try {
            const saved = localStorage.getItem('listeningPracticeProgress');
            if (saved) {
                const progress = JSON.parse(saved);
                if (progress.currentIndex >= 0 && progress.currentIndex < this.sentences.length) {
                    this.currentIndex = progress.currentIndex;
                    const date = new Date(progress.timestamp);
                    const timeStr = date.toLocaleString('zh-CN');
                    this.showStatus(`✓ 已恢复上次进度（${timeStr}）- 第 ${this.currentIndex + 1} 句`, 'success');
                }
            }
        } catch (error) {
            console.error('Error restoring progress:', error);
        }
    }

    updateDisplay() {
        if (this.sentences.length === 0) {
            this.progressText.textContent = '等待加载句子...';
            this.sentenceNumber.textContent = '句子 0';
            this.sentenceDisplay.textContent = '正在加载...';
            return;
        }

        const sentence = this.sentences[this.currentIndex];
        const progress = ((this.currentIndex + 1) / this.sentences.length) * 100;

        // 更新进度条
        this.progressFill.style.width = progress + '%';
        this.progressText.textContent = `进度: ${this.currentIndex + 1} / ${this.sentences.length}`;

        // 更新句子编号
        this.sentenceNumber.textContent = `句子 ${this.currentIndex + 1}`;

        // 更新句子显示
        if (this.isTextVisible) {
            // 显示英文和中文
            const englishText = sentence.english || sentence.text || '';
            const chineseText = sentence.chinese || '';

            if (chineseText) {
                this.sentenceDisplay.innerHTML = `
                    <div style="font-size: 1.3em; color: #333; margin-bottom: 15px;">${englishText}</div>
                    <div style="font-size: 1.1em; color: #666; border-top: 2px solid #e0e0e0; padding-top: 15px;">${chineseText}</div>
                `;
            } else {
                this.sentenceDisplay.innerHTML = `
                    <div style="font-size: 1.3em; color: #333;">${englishText}</div>
                `;
            }
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
        if (this.isPlaying) {
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

        // 追加到现有句子列表
        const startId = this.sentences.length + 1;
        const importedSentences = newSentences.map((text, index) => ({
            id: startId + index,
            english: text,
            text: text,
            chinese: '',
            audio: null,  // 导入的句子没有音频，将使用TTS
            isCustom: true  // 标记为自定义句子
        }));

        // 追加到句子列表
        this.sentences = this.sentences.concat(importedSentences);

        // 保存自定义句子到localStorage
        this.saveCustomSentences(importedSentences);

        // 跳转到第一个新导入的句子
        this.currentIndex = startId - 1;
        this.isTextVisible = false;
        this.audio.pause();
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        this.isPlaying = false;
        this.updateDisplay();

        // 清空输入框
        this.importText.value = '';

        // 显示成功消息
        this.showStatus(`成功导入 ${newSentences.length} 个句子（追加到第 ${startId} 句，将使用TTS播放）`, 'success');
    }

    saveCustomSentences(newSentences) {
        try {
            // 获取已保存的自定义句子
            const saved = localStorage.getItem('customSentences');
            let customSentences = saved ? JSON.parse(saved) : [];

            // 追加新句子
            customSentences = customSentences.concat(newSentences);

            // 保存到localStorage
            localStorage.setItem('customSentences', JSON.stringify(customSentences));

            console.log(`已保存 ${customSentences.length} 个自定义句子到localStorage`);
        } catch (error) {
            console.error('Error saving custom sentences:', error);
        }
    }

    loadCustomSentences() {
        try {
            const saved = localStorage.getItem('customSentences');
            if (saved) {
                const customSentences = JSON.parse(saved);
                if (customSentences.length > 0) {
                    console.log(`从localStorage加载了 ${customSentences.length} 个自定义句子`);
                    return customSentences;
                }
            }
        } catch (error) {
            console.error('Error loading custom sentences:', error);
        }
        return [];
    }

    clearCustomSentences() {
        if (!confirm('确定要清除所有自定义句子吗？此操作不可恢复。')) {
            return;
        }

        try {
            // 清除localStorage中的自定义句子
            localStorage.removeItem('customSentences');

            // 重新加载原始句子（不包含自定义句子）
            this.loadSentences();

            this.showStatus('✓ 已清除所有自定义句子', 'success');
        } catch (error) {
            console.error('Error clearing custom sentences:', error);
            this.showStatus('❌ 清除失败', 'error');
        }
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
