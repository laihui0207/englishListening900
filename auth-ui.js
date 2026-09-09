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
      btnAuthAction.textContent = '退出登录';
    } else {
      authUser.textContent = '未登录（进度仅保存在本机）';
      btnAuthAction.textContent = '登录 / 注册';
    }
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
