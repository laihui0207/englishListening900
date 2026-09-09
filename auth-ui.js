// 登录/注册弹窗的界面逻辑，连接 window.Auth
(function () {
  let mode = 'login'; // 'login' | 'register'

  const $ = (id) => document.getElementById(id);
  const modal = $('authModal');
  const title = $('authTitle');
  const errorEl = $('authError');
  const usernameInput = $('authUsername');
  const passwordInput = $('authPassword');
  const submitBtn = $('btnAuthSubmit');
  const switchText = $('authSwitchText');
  const switchLink = $('authSwitchLink');
  const authUser = $('authUser');
  const btnAuthAction = $('btnAuthAction');

  function refreshBar() {
    if (window.Auth.isLoggedIn()) {
      authUser.textContent = `👤 ${window.Auth.getUsername()}`;
      authUser.title = '点击打开设置';
      btnAuthAction.textContent = '退出登录';
    } else {
      authUser.textContent = '未登录（进度仅保存在本机）';
      authUser.title = '';
      btnAuthAction.textContent = '登录 / 注册';
    }
  }

  // ===== 设置弹窗（DeepSeek API Key）=====
  const settingsModal = $('settingsModal');
  const settingsError = $('settingsError');
  const settingsApiKey = $('settingsApiKey');
  const settingsCurrent = $('settingsCurrent');
  const settingsMasked = $('settingsMasked');

  async function settingsApi(path, method, body) {
    const headers = {};
    const token = window.Auth.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '请求失败');
    return data;
  }

  async function openSettings() {
    if (!window.Auth.isLoggedIn()) {
      openModal();
      return;
    }
    settingsError.textContent = '';
    settingsApiKey.value = '';
    settingsModal.classList.add('show');
    try {
      const { data } = await settingsApi('/settings', 'GET');
      if (data.hasApiKey) {
        settingsMasked.textContent = data.maskedApiKey;
        settingsCurrent.style.display = 'flex';
      } else {
        settingsCurrent.style.display = 'none';
      }
    } catch (e) {
      settingsError.textContent = e.message;
    }
  }

  async function saveKey() {
    const key = settingsApiKey.value.trim();
    settingsError.textContent = '';
    if (!key) {
      settingsError.textContent = '请输入 API Key';
      return;
    }
    try {
      await settingsApi('/settings/apikey', 'PUT', { apiKey: key });
      settingsModal.classList.remove('show');
    } catch (e) {
      settingsError.textContent = e.message;
    }
  }

  async function deleteKey() {
    settingsError.textContent = '';
    try {
      await settingsApi('/settings/apikey', 'DELETE');
      settingsApiKey.value = '';
      settingsCurrent.style.display = 'none';
    } catch (e) {
      settingsError.textContent = e.message;
    }
  }

  if (settingsModal) {
    authUser.addEventListener('click', () => {
      if (window.Auth.isLoggedIn()) openSettings();
    });
    $('btnSaveKey').addEventListener('click', saveKey);
    $('btnDeleteKey').addEventListener('click', deleteKey);
    $('settingsClose').addEventListener('click', () =>
      settingsModal.classList.remove('show')
    );
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) settingsModal.classList.remove('show');
    });
    settingsApiKey.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveKey();
    });
    // 暴露给 app_audio.js：无 key 时点 AI 分析可直接打开设置
    window.Settings = { open: openSettings };
  }

  function setMode(next) {
    mode = next;
    errorEl.textContent = '';
    if (mode === 'login') {
      title.textContent = '登录';
      submitBtn.textContent = '登录';
      switchText.textContent = '还没有账号？';
      switchLink.textContent = '立即注册';
    } else {
      title.textContent = '注册';
      submitBtn.textContent = '注册';
      switchText.textContent = '已有账号？';
      switchLink.textContent = '去登录';
    }
  }

  function openModal() {
    setMode('login');
    usernameInput.value = '';
    passwordInput.value = '';
    modal.classList.add('show');
    usernameInput.focus();
  }

  function closeModal() {
    modal.classList.remove('show');
  }

  async function submit() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    errorEl.textContent = '';
    submitBtn.disabled = true;
    try {
      if (mode === 'register') {
        await window.Auth.register(username, password);
      } else {
        await window.Auth.login(username, password);
      }
      closeModal();
      // 重新加载以应用同步下来的进度
      location.reload();
    } catch (e) {
      errorEl.textContent = e.message;
    } finally {
      submitBtn.disabled = false;
    }
  }

  btnAuthAction.addEventListener('click', async () => {
    if (window.Auth.isLoggedIn()) {
      await window.Auth.uploadProgress(); // 退出前同步一次
      await window.Auth.logout();
      refreshBar();
    } else {
      openModal();
    }
  });

  switchLink.addEventListener('click', () =>
    setMode(mode === 'login' ? 'register' : 'login')
  );
  submitBtn.addEventListener('click', submit);
  $('authClose').addEventListener('click', closeModal);
  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  refreshBar();
})();
