// 英语900句听力练习应用 - 使用预生成音频版本

class ListeningPractice {
    constructor() {
        this.sentences = [];
        this.allSentences = []; // 保存完整句子列表
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

        // 未听懂句子管理
        this.misunderstoodSentences = new Set(); // 存储未听懂句子的实际索引
        this.practiceMode = 'normal'; // 'normal' 或 'misunderstood-only'
        this.savedProgress = {
            normal: 0, // 全部句子模式的进度
            misunderstood: 0 // 未听懂模式的进度
        };

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

        // 未听懂功能相关元素
        this.btnMisunderstood = document.getElementById('btnMisunderstood');
        this.btnUnderstood = document.getElementById('btnUnderstood');
        this.misunderstoodCount = document.getElementById('misunderstoodCount');
        this.misunderstoodModeCount = document.getElementById('misunderstoodModeCount');
        this.totalCount = document.getElementById('totalCount');
        this.modeNormal = document.getElementById('modeNormal');
        this.modeMisunderstood = document.getElementById('modeMisunderstood');
        this.btnClearMarks = document.getElementById('btnClearMarks');
        this.btnExportMarks = document.getElementById('btnExportMarks');
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
            this.allSentences = [...data]; // 保存完整列表

            // 加载并追加自定义句子：登录用户从服务器取，否则用本地
            const customSentences = await this.loadCustomSentences();
            if (customSentences.length > 0) {
                this.sentences = this.sentences.concat(customSentences);
                this.allSentences = [...this.sentences]; // 更新完整列表
                this.loadingStatus.textContent = `✓ 已加载 ${data.length} 个句子（高质量音频） + ${customSentences.length} 个自定义句子`;
            } else {
                this.loadingStatus.textContent = `✓ 已加载 ${this.sentences.length} 个句子（高质量音频）`;
            }

            // 若有句子语音仍在生成中，启动轮询刷新
            this.schedulePendingAudioPoll();

            setTimeout(() => {
                this.loadingStatus.textContent = '';
            }, 3000);

            // 加载未听懂的句子标记
            this.loadMisunderstoodSentences();

            // 加载模式进度
            this.loadModeProgress();

            // 恢复上次的进度
            this.restoreProgress();

            this.updateDisplay();
            this.updateMisunderstoodStats();

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

        // 未听懂按钮
        this.btnMisunderstood.addEventListener('click', () => this.toggleMisunderstood());

        // 已听懂按钮
        this.btnUnderstood.addEventListener('click', () => this.markAsUnderstood());

        // 模式切换按钮
        this.modeNormal.addEventListener('click', () => this.switchPracticeMode('normal'));
        this.modeMisunderstood.addEventListener('click', () => this.switchPracticeMode('misunderstood-only'));

        // 清空标记按钮
        this.btnClearMarks.addEventListener('click', () => this.clearAllMarks());
        this.btnExportMarks.addEventListener('click', () => this.exportMisunderstood());

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
            case 'm':
                e.preventDefault();
                this.toggleMisunderstood();
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
            this.saveModeProgress(); // 保存模式进度
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
            this.saveModeProgress(); // 保存模式进度
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
        this.saveModeProgress(); // 保存模式进度
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
                    // 同时更新 savedProgress.normal
                    this.savedProgress.normal = progress.currentIndex;
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

        // 获取当前句子在完整列表中的实际索引
        const actualIndex = this.getCurrentActualIndex();
        const isMisunderstood = this.misunderstoodSentences.has(actualIndex);

        // 更新句子编号（带标记）
        const marker = isMisunderstood ? '<span class="misunderstood-marker">😕</span>' : '';
        this.sentenceNumber.innerHTML = `句子 ${this.currentIndex + 1}${marker}`;

        // 更新未听懂按钮状态和显示
        if (this.practiceMode === 'misunderstood-only') {
            // 在未听懂模式下隐藏"我没有听懂"按钮
            this.btnMisunderstood.style.display = 'none';
        } else {
            // 在正常模式下显示"我没有听懂"按钮
            this.btnMisunderstood.style.display = 'block';
            if (isMisunderstood) {
                this.btnMisunderstood.textContent = '✓ 已标记为未听懂';
                this.btnMisunderstood.classList.add('marked');
            } else {
                this.btnMisunderstood.textContent = '😕 我没有听懂';
                this.btnMisunderstood.classList.remove('marked');
            }
        }

        // 更新"已听懂"按钮显示（只在未听懂模式下显示）
        if (this.practiceMode === 'misunderstood-only') {
            this.btnUnderstood.classList.add('show');
        } else {
            this.btnUnderstood.classList.remove('show');
        }

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

    async importSentences() {
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

        this.btnImport.disabled = true;
        try {
            if (this.isLoggedIn()) {
                // 登录：提交后台异步生成语音
                await this.importSentencesToServer(newSentences);
            } else {
                // 未登录：本地保存 + TTS 播放
                this.importSentencesLocally(newSentences);
            }
            this.importText.value = '';
        } catch (error) {
            console.error('导入失败:', error);
            this.showStatus('❌ 导入失败：' + error.message, 'error');
        } finally {
            this.btnImport.disabled = false;
        }
    }

    async importSentencesToServer(newSentences) {
        const token = window.Auth.getToken();
        const res = await fetch('/api/sentences', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ sentences: newSentences })
        });
        const result = await res.json();
        if (!res.ok || !result.success) {
            throw new Error(result.error || '服务器错误');
        }

        // 把新句子加入列表（此时 audio 为 null，语音正在后台生成）
        const startIndex = this.sentences.length;
        const mapped = result.data.map(row => this.mapServerSentence(row));
        this.sentences = this.sentences.concat(mapped);
        this.allSentences = [...this.sentences];

        this.currentIndex = startIndex;
        this.resetPlaybackState();
        this.updateDisplay();
        this.updateMisunderstoodStats();

        // 开始轮询语音生成状态
        this.schedulePendingAudioPoll();

        this.showStatus(`✓ 已导入 ${mapped.length} 句，语音正在后台生成（暂用TTS播放，完成后自动切换）`, 'success');
    }

    importSentencesLocally(newSentences) {
        const startIndex = this.sentences.length;
        const importedSentences = newSentences.map((text, index) => ({
            id: 'local-' + (Date.now() + index),
            english: text,
            text: text,
            chinese: '',
            audio: null,
            isCustom: true
        }));

        this.sentences = this.sentences.concat(importedSentences);
        this.allSentences = [...this.sentences];
        this.saveCustomSentences(importedSentences);

        this.currentIndex = startIndex;
        this.resetPlaybackState();
        this.updateDisplay();
        this.updateMisunderstoodStats();

        this.showStatus(`成功导入 ${newSentences.length} 个句子（未登录，使用TTS播放。登录后可生成真人语音）`, 'success');
    }

    resetPlaybackState() {
        this.isTextVisible = false;
        this.audio.pause();
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        this.isPlaying = false;
    }

    // 判断是否已登录（auth.js 提供 window.Auth）
    isLoggedIn() {
        return typeof window.Auth !== 'undefined' && window.Auth.isLoggedIn();
    }

    // 把服务器返回的句子行映射成前端句子对象
    // ready 的句子用后端音频（token 走查询参数），否则 audio=null 回退 TTS
    mapServerSentence(row) {
        const token = window.Auth.getToken();
        return {
            id: 'custom-' + row.id,
            customId: row.id,
            english: row.text,
            text: row.text,
            chinese: '',
            audio: row.audio_status === 'ready'
                ? `/api/sentences/${row.id}/audio?token=${encodeURIComponent(token)}`
                : null,
            audioStatus: row.audio_status,
            isCustom: true
        };
    }

    saveCustomSentences(newSentences) {
        // 仅未登录时用 localStorage 保存；登录用户走服务器
        try {
            const saved = localStorage.getItem('customSentences');
            let customSentences = saved ? JSON.parse(saved) : [];
            customSentences = customSentences.concat(newSentences);
            localStorage.setItem('customSentences', JSON.stringify(customSentences));
        } catch (error) {
            console.error('Error saving custom sentences:', error);
        }
    }

    async loadCustomSentences() {
        // 登录用户：从服务器加载（含语音生成状态）
        if (this.isLoggedIn()) {
            try {
                const token = window.Auth.getToken();
                const res = await fetch('/api/sentences', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const { data } = await res.json();
                    return (data || []).map(row => this.mapServerSentence(row));
                }
            } catch (error) {
                console.error('从服务器加载自定义句子失败:', error);
            }
            return [];
        }
        // 未登录：localStorage
        try {
            const saved = localStorage.getItem('customSentences');
            if (saved) {
                const customSentences = JSON.parse(saved);
                if (customSentences.length > 0) return customSentences;
            }
        } catch (error) {
            console.error('Error loading custom sentences:', error);
        }
        return [];
    }

    async clearCustomSentences() {
        if (!await this.confirmDialog('确定要清除所有自定义句子吗？此操作不可恢复。')) {
            return;
        }
        try {
            if (this.isLoggedIn()) {
                const token = window.Auth.getToken();
                await fetch('/api/sentences', {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` }
                });
            } else {
                localStorage.removeItem('customSentences');
            }
            // 重新加载句子列表
            this.currentIndex = 0;
            await this.loadSentences();
            this.showStatus('✓ 已清除所有自定义句子', 'success');
        } catch (error) {
            console.error('Error clearing custom sentences:', error);
            this.showStatus('❌ 清除失败', 'error');
        }
    }

    // 轮询未生成完成的语音，就绪后热更新音频地址
    schedulePendingAudioPoll() {
        if (this._audioPollTimer) {
            clearInterval(this._audioPollTimer);
            this._audioPollTimer = null;
        }
        if (!this.isLoggedIn()) return;
        const hasPending = this.allSentences.some(
            s => s.isCustom && s.audioStatus && s.audioStatus !== 'ready'
        );
        if (!hasPending) return;

        this._audioPollTimer = setInterval(async () => {
            try {
                const token = window.Auth.getToken();
                const res = await fetch('/api/sentences', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!res.ok) return;
                const { data } = await res.json();
                let stillPending = false;
                (data || []).forEach(row => {
                    const target = this.allSentences.find(s => s.customId === row.id);
                    if (target && target.audioStatus !== row.audio_status) {
                        target.audioStatus = row.audio_status;
                        target.audio = row.audio_status === 'ready'
                            ? `/api/sentences/${row.id}/audio?token=${encodeURIComponent(token)}`
                            : null;
                    }
                    if (row.audio_status !== 'ready') stillPending = true;
                });
                if (!stillPending) {
                    clearInterval(this._audioPollTimer);
                    this._audioPollTimer = null;
                    this.showStatus('✓ 自定义句子语音已全部生成', 'success');
                }
            } catch (e) {
                // 网络波动忽略，下次继续
            }
        }, 5000);
    }

    showStatus(message, type = 'success') {
        this.importStatus.textContent = message;
        this.importStatus.style.color = type === 'success' ? '#4CAF50' : '#f44336';

        setTimeout(() => {
            this.importStatus.textContent = '';
        }, 3000);
    }

    // 应用内确认弹窗，返回 Promise<boolean>（比原生 confirm 在内嵌浏览器更可靠）
    confirmDialog(message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirmModal');
            const msgEl = document.getElementById('confirmMessage');
            const okBtn = document.getElementById('confirmOk');
            const cancelBtn = document.getElementById('confirmCancel');
            if (!modal) {
                // 兜底：元素缺失时退回原生 confirm
                resolve(window.confirm(message));
                return;
            }
            msgEl.textContent = message;
            modal.classList.add('show');

            const cleanup = (result) => {
                modal.classList.remove('show');
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
                modal.removeEventListener('click', onBackdrop);
                resolve(result);
            };
            const onOk = () => cleanup(true);
            const onCancel = () => cleanup(false);
            const onBackdrop = (e) => { if (e.target === modal) cleanup(false); };

            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
            modal.addEventListener('click', onBackdrop);
        });
    }

    // 获取当前句子在完整列表中的实际索引
    getCurrentActualIndex() {
        const currentSentence = this.sentences[this.currentIndex];
        return this.allSentences.findIndex(s => s.id === currentSentence.id);
    }

    // 切换当前句子的未听懂标记
    toggleMisunderstood() {
        if (this.sentences.length === 0) {
            return;
        }

        const actualIndex = this.getCurrentActualIndex();

        if (this.misunderstoodSentences.has(actualIndex)) {
            this.misunderstoodSentences.delete(actualIndex);
            this.showStatus('✓ 已取消标记', 'success');
        } else {
            this.misunderstoodSentences.add(actualIndex);
            this.showStatus('✓ 已标记为未听懂', 'success');
        }

        this.saveMisunderstoodSentences();
        this.updateDisplay();
        this.updateMisunderstoodStats();
    }

    // 标记当前句子为已听懂（从未听懂列表中移除）
    markAsUnderstood() {
        if (this.sentences.length === 0) {
            return;
        }

        // 只在未听懂模式下可用
        if (this.practiceMode !== 'misunderstood-only') {
            return;
        }

        const actualIndex = this.getCurrentActualIndex();

        // 从未听懂列表中移除
        this.misunderstoodSentences.delete(actualIndex);
        this.saveMisunderstoodSentences();

        // 更新统计
        this.updateMisunderstoodStats();

        this.showStatus('✓ 已从未听懂列表移除', 'success');

        // 从当前句子列表中移除
        const misunderstoodIndices = Array.from(this.misunderstoodSentences).sort((a, b) => a - b);
        this.sentences = misunderstoodIndices.map(idx => this.allSentences[idx]);

        // 检查是否还有未听懂的句子
        if (this.sentences.length === 0) {
            this.showStatus('🎉 太棒了！所有句子都已听懂', 'success');
            // 切换回全部句子模式
            setTimeout(() => {
                this.switchPracticeMode('normal');
            }, 2000);
            return;
        }

        // 调整当前索引
        if (this.currentIndex >= this.sentences.length) {
            this.currentIndex = this.sentences.length - 1;
        }

        // 保存进度
        this.savedProgress.misunderstood = this.currentIndex;
        this.saveModeProgress();

        // 更新显示
        this.updateDisplay();

        // 自动播放下一句
        setTimeout(() => {
            this.playCurrentSentence();
        }, 500);
    }

    // 切换练习模式
    switchPracticeMode(mode) {
        if (mode === 'misunderstood-only') {
            if (this.misunderstoodSentences.size === 0) {
                this.showStatus('还没有标记未听懂的句子', 'error');
                return;
            }

            // 保存当前模式的进度（使用统一的键名 'normal'）
            this.savedProgress.normal = this.currentIndex;

            // 过滤出未听懂的句子
            const misunderstoodIndices = Array.from(this.misunderstoodSentences).sort((a, b) => a - b);
            this.sentences = misunderstoodIndices.map(idx => this.allSentences[idx]);
            this.practiceMode = 'misunderstood-only';

            // 恢复未听懂模式的进度（使用统一的键名 'misunderstood'）
            this.currentIndex = this.savedProgress.misunderstood || 0;

            // 确保索引有效
            if (this.currentIndex >= this.sentences.length) {
                this.currentIndex = 0;
            }

            this.showStatus(`✓ 已切换到专项练习模式（${this.sentences.length} 个句子）`, 'success');
        } else {
            // 保存当前模式的进度（使用统一的键名 'misunderstood'）
            this.savedProgress.misunderstood = this.currentIndex;

            // 恢复所有句子
            this.sentences = [...this.allSentences];
            this.practiceMode = 'normal';

            // 恢复全部句子模式的进度（使用统一的键名 'normal'）
            this.currentIndex = this.savedProgress.normal || 0;

            // 确保索引有效
            if (this.currentIndex >= this.sentences.length) {
                this.currentIndex = 0;
            }

            this.showStatus('✓ 已切换到全部句子模式', 'success');
        }

        // 保存模式进度到 localStorage
        this.saveModeProgress();

        // 停止当前播放
        this.audio.pause();
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        this.isPlaying = false;
        this.isTextVisible = false;

        // 更新UI
        this.updateDisplay();
        this.updateModeButtons();

        // 自动播放当前句子
        setTimeout(() => {
            this.playCurrentSentence();
        }, 500);
    }

    // 更新模式按钮状态
    updateModeButtons() {
        if (this.practiceMode === 'normal') {
            this.modeNormal.classList.add('active');
            this.modeMisunderstood.classList.remove('active');
        } else {
            this.modeNormal.classList.remove('active');
            this.modeMisunderstood.classList.add('active');
        }
    }

    // 更新未听懂统计信息
    updateMisunderstoodStats() {
        const count = this.misunderstoodSentences.size;
        this.misunderstoodCount.textContent = count;
        this.misunderstoodModeCount.textContent = count;
        this.totalCount.textContent = this.allSentences.length;
        // 无未听懂句子时禁用导出
        this.btnExportMarks.disabled = count === 0;
    }

    // 清空所有未听懂标记
    async clearAllMarks() {
        if (this.misunderstoodSentences.size === 0) {
            this.showStatus('没有需要清除的标记', 'error');
            return;
        }

        if (!await this.confirmDialog(`确定要清除所有 ${this.misunderstoodSentences.size} 个未听懂标记吗？此操作不可恢复。`)) {
            return;
        }

        this.misunderstoodSentences.clear();
        this.saveMisunderstoodSentences();

        // 如果当前在专项模式，切换回普通模式
        if (this.practiceMode === 'misunderstood-only') {
            this.switchPracticeMode('normal');
        } else {
            this.updateDisplay();
            this.updateMisunderstoodStats();
        }

        this.showStatus('✓ 已清除所有标记', 'success');
    }

    // 导出全部未听懂的句子为文本文件
    exportMisunderstood() {
        if (this.misunderstoodSentences.size === 0) {
            this.showStatus('还没有标记未听懂的句子', 'error');
            return;
        }

        // 按索引排序，只导出英文句子，一句一行
        const indices = Array.from(this.misunderstoodSentences).sort((a, b) => a - b);
        const lines = indices.map((idx) => {
            const s = this.allSentences[idx];
            if (!s) return null;
            return s.english || s.text || '';
        }).filter(Boolean);

        const content = lines.join('\n') + '\n';

        // 触发浏览器下载
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `未听懂句子_${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showStatus(`✓ 已导出 ${lines.length} 个未听懂句子`, 'success');
    }

    // 保存未听懂的句子到 localStorage
    saveMisunderstoodSentences() {
        try {
            const data = Array.from(this.misunderstoodSentences);
            localStorage.setItem('misunderstoodSentences', JSON.stringify(data));
        } catch (error) {
            console.error('Error saving misunderstood sentences:', error);
        }
    }

    // 从 localStorage 加载未听懂的句子
    loadMisunderstoodSentences() {
        try {
            const saved = localStorage.getItem('misunderstoodSentences');
            if (saved) {
                const data = JSON.parse(saved);
                this.misunderstoodSentences = new Set(data);
                console.log(`加载了 ${this.misunderstoodSentences.size} 个未听懂标记`);
            }
        } catch (error) {
            console.error('Error loading misunderstood sentences:', error);
        }
    }

    // 保存模式进度
    saveModeProgress() {
        try {
            // 只更新当前模式的进度，保留其他模式的进度
            this.savedProgress[this.practiceMode] = this.currentIndex;

            // 从 localStorage 读取已保存的进度
            const saved = localStorage.getItem('practiceModeProgress');
            let allProgress = { normal: 0, misunderstood: 0 };

            if (saved) {
                allProgress = JSON.parse(saved);
            }

            // 更新当前模式的进度
            allProgress[this.practiceMode] = this.currentIndex;

            // 保留 savedProgress 中其他模式的值
            if (this.practiceMode === 'normal' && this.savedProgress.misunderstood !== undefined) {
                allProgress.misunderstood = this.savedProgress.misunderstood;
            } else if (this.practiceMode === 'misunderstood-only' && this.savedProgress.normal !== undefined) {
                allProgress.normal = this.savedProgress.normal;
            }

            // 保存到 localStorage
            localStorage.setItem('practiceModeProgress', JSON.stringify(allProgress));
            console.log('保存模式进度到localStorage:', JSON.stringify(allProgress));
        } catch (error) {
            console.error('Error saving mode progress:', error);
        }
    }

    // 加载模式进度
    loadModeProgress() {
        try {
            const saved = localStorage.getItem('practiceModeProgress');
            if (saved) {
                this.savedProgress = JSON.parse(saved);
                console.log('加载了模式进度:', this.savedProgress);
            }
        } catch (error) {
            console.error('Error loading mode progress:', error);
        }
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new ListeningPractice();
});
