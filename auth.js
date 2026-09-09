// 前端认证 + 进度云同步
// 设计：进度仍存于 localStorage（app_audio.js 不变），登录后与服务器同步这些键。
(function () {
  const TOKEN_KEY = 'authToken';
  const USER_KEY = 'authUsername';

  // 需要云同步的 localStorage 键（app_audio.js 使用的进度相关键）
  // 注意：自定义句子登录后走 /api/sentences 存数据库，不在此列
  const SYNC_KEYS = [
    'listeningPracticeProgress',
    'misunderstoodSentences',
    'practiceModeProgress',
    'listeningPracticeSettings',
  ];

  const getToken = () => localStorage.getItem(TOKEN_KEY);
  const getUsername = () => localStorage.getItem(USER_KEY);

  async function api(path, method, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`/api/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `请求失败 (${res.status})`);
    }
    return data;
  }

  // 把 localStorage 中的进度键收集成一个对象
  function collectProgress() {
    const progress = {};
    SYNC_KEYS.forEach((key) => {
      const val = localStorage.getItem(key);
      if (val !== null) progress[key] = val;
    });
    return progress;
  }

  // 把服务器进度写回 localStorage
  function applyProgress(progress) {
    if (!progress || typeof progress !== 'object') return;
    SYNC_KEYS.forEach((key) => {
      if (progress[key] !== undefined) {
        localStorage.setItem(key, progress[key]);
      }
    });
  }

  async function register(username, password) {
    const { data } = await api('register', 'POST', { username, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, data.username);
    // 新用户：把本地已有进度上传，避免丢失
    await uploadProgress();
    return data;
  }

  async function login(username, password) {
    const { data } = await api('login', 'POST', { username, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, data.username);
    // 服务器有进度则覆盖本地
    if (data.progress && Object.keys(data.progress).length > 0) {
      applyProgress(data.progress);
    } else {
      // 服务器无进度：上传本地进度
      await uploadProgress();
    }
    return data;
  }

  async function logout() {
    try {
      await api('logout', 'POST');
    } catch (e) {
      // 忽略登出网络错误，本地清理即可
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async function uploadProgress() {
    if (!getToken()) return;
    try {
      await api('progress', 'PUT', collectProgress());
    } catch (e) {
      console.error('进度上传失败:', e.message);
    }
  }

  // 暴露给页面 UI 使用
  window.Auth = {
    getToken,
    getUsername,
    isLoggedIn: () => !!getToken(),
    register,
    login,
    logout,
    uploadProgress,
  };

  // 登录状态下，定期 + 页面关闭时同步进度
  if (getToken()) {
    setInterval(uploadProgress, 30000); // 每 30 秒
    window.addEventListener('beforeunload', () => {
      // beforeunload 用 sendBeacon 更可靠，但需要 token 在 URL 或 body；
      // 这里退化为同步 fetch 的 keepalive
      const token = getToken();
      if (!token) return;
      fetch('/api/progress', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(collectProgress()),
        keepalive: true,
      });
    });
  }
})();
