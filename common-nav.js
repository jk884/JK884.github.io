/**
 * 锦刻激光 - 统一导航栏与登录鉴权
 * 用法：在页面中设置 window.navConfig = { currentPage: 'quote|contract|warehouse|login', requireLogin: true|false }
 * 然后引入 script src="common-nav.js"
 */
(function () {
  'use strict';

  var NAV_ITEMS = [
    { key: 'quote',     label: '实时报价', url: 'quote.html' },
    { key: 'contract',  label: '合同管理', url: 'contract.html' },
    { key: 'warehouse', label: '仓储管理', url: 'warehouse.html' },
    { key: 'admin',     label: '账号管理', url: 'admin.html' },
    { key: 'samples', label: '打样工作台', url: 'samples.html' }
  ];

  var LOGIN_PAGE = 'login.html';
  var IDLE_TIMEOUT = 20 * 60 * 1000; // 20分钟无操作超时

  // ---------- XSS 防护：HTML 转义函数 ----------
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\//g, '&#x2F;')
      .replace(/`/g, '&#x60;')
      .replace(/=/g, '&#x3D;');
  }

  // 暴露到全局，供其他脚本使用
  window.escapeHtml = escapeHtml;

  // ---------- 登录状态管理 ----------
  function isLoggedIn() {
    try {
      var key = window.SupabaseDB && SupabaseDB.isLoggedIn();
      var lastActivity = parseInt(sessionStorage.getItem('jk_last_activity') || '0', 10);
      if (!key) return false;
      if (!lastActivity || lastActivity > Date.now() || Date.now() - lastActivity >= IDLE_TIMEOUT) {
        clearLogin();
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearLogin() {
    if (window.SupabaseDB) SupabaseDB.clearSession();
    try {
      ['jk_pg_key', 'jk_token', 'jk_username', 'jk_user_name', 'jk_user_role',
       'jk_config', 'jk_user_info', 'jk_last_activity', 'jk_password'].forEach(function (k) {
        sessionStorage.removeItem(k);
      });
    } catch (e) {}
  }

  function getCurrentUser() {
    try {
      return {
        username: sessionStorage.getItem('jk_username') || '',
        name: sessionStorage.getItem('jk_user_name') || sessionStorage.getItem('jk_username') || '用户',
        role: sessionStorage.getItem('jk_user_role') || '',
        permissions: JSON.parse(sessionStorage.getItem('jk_permissions') || '[]')
      };
    } catch (e) {
      return { username: '', name: '用户', role: '', permissions: [] };
    }
  }

  function touchActivity() {
    if (window.navConfig && window.navConfig.requireLogin === false && !isLoggedIn()) return;
    if (!isLoggedIn()) { clearLogin(); window.location.href = LOGIN_PAGE; return; }
    try {
      sessionStorage.setItem('jk_last_activity', String(Date.now()));
    } catch (e) {}
  }

  function logout() {
    // 使用 Supabase Auth 登出
    if (window.SupabaseDB && typeof SupabaseDB.authLogout === 'function') {
      SupabaseDB.authLogout().catch(function () {});
    }
    clearLogin();
    window.location.href = LOGIN_PAGE;
  }

  // 修改密码 - 模态框版本
  function changePassword() {
    try {
      var user = getCurrentUser();
      if (!user || !user.username) {
        showPwdModalError('未登录，无法修改密码');
        return;
      }
      openPwdModal();
    } catch(e) {
      alert('修改密码出错：' + e.message);
    }
  }

  // 注入修改密码模态框样式
  function injectPwdModalStyle() {
    if (document.getElementById('cn-pwd-modal-style')) return;
    var style = document.createElement('style');
    style.id = 'cn-pwd-modal-style';
    style.textContent = [
      '.cn-pwd-mask{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.45);z-index:99999;display:flex;align-items:center;justify-content:center;animation:cnFadeIn .2s ease}',
      '@keyframes cnFadeIn{from{opacity:0}to{opacity:1}}',
      '@keyframes cnSlideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}',
      '.cn-pwd-modal{background:#fff;border-radius:16px;width:380px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,.2);overflow:hidden;animation:cnSlideUp .25s ease}',
      '.cn-pwd-header{padding:20px 24px 16px;border-bottom:1px solid #f0f0f0}',
      '.cn-pwd-title{font-size:18px;font-weight:700;color:#1a1a2e;margin:0}',
      '.cn-pwd-body{padding:20px 24px}',
      '.cn-pwd-field{margin-bottom:16px}',
      '.cn-pwd-field:last-child{margin-bottom:0}',
      '.cn-pwd-label{display:block;font-size:13px;font-weight:600;color:#555;margin-bottom:6px}',
      '.cn-pwd-input{width:100%;padding:10px 14px;border:1.5px solid #e0e0e0;border-radius:8px;font-size:14px;box-sizing:border-box;transition:border-color .2s,box-shadow .2s;outline:none}',
      '.cn-pwd-input:focus{border-color:#4f7cff;box-shadow:0 0 0 3px rgba(79,124,255,.15)}',
      '.cn-pwd-error{color:#e74c3c;font-size:12px;margin-top:6px;min-height:16px;display:none}',
      '.cn-pwd-error.show{display:block}',
      '.cn-pwd-footer{padding:16px 24px;background:#fafafa;display:flex;gap:12px;justify-content:flex-end}',
      '.cn-pwd-btn{padding:9px 22px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;border:none;transition:all .2s}',
      '.cn-pwd-btn-cancel{background:#f0f0f0;color:#666}',
      '.cn-pwd-btn-cancel:hover{background:#e4e4e4}',
      '.cn-pwd-btn-confirm{background:linear-gradient(135deg,#4f7cff,#3b5fe0);color:#fff}',
      '.cn-pwd-btn-confirm:hover{background:linear-gradient(135deg,#3b5fe0,#2a4bc8);transform:translateY(-1px);box-shadow:0 4px 12px rgba(79,124,255,.3)}',
      '.cn-pwd-btn-confirm:disabled{opacity:.6;cursor:not-allowed;transform:none;box-shadow:none}',
      '.cn-pwd-success{color:#27ae60;font-size:14px;text-align:center;padding:10px 0}'
    ].join('');
    document.head.appendChild(style);
  }

  // 打开修改密码模态框
  function openPwdModal() {
    injectPwdModalStyle();
    closePwdModal();

    var mask = document.createElement('div');
    mask.className = 'cn-pwd-mask';
    mask.id = 'cn-pwd-mask';
    mask.innerHTML = [
      '<div class="cn-pwd-modal">',
      '  <div class="cn-pwd-header"><h3 class="cn-pwd-title">修改密码</h3></div>',
      '  <div class="cn-pwd-body">',
      '    <div class="cn-pwd-field">',
      '      <label class="cn-pwd-label">当前密码</label>',
      '      <input type="password" class="cn-pwd-input" id="cnPwdOld" placeholder="请输入当前密码" autocomplete="off">',
      '      <div class="cn-pwd-error" id="cnPwdOldErr"></div>',
      '    </div>',
      '    <div class="cn-pwd-field">',
      '      <label class="cn-pwd-label">新密码</label>',
      '      <input type="password" class="cn-pwd-input" id="cnPwdNew" placeholder="至少6位" autocomplete="off">',
      '      <div class="cn-pwd-error" id="cnPwdNewErr"></div>',
      '    </div>',
      '    <div class="cn-pwd-field">',
      '      <label class="cn-pwd-label">确认新密码</label>',
      '      <input type="password" class="cn-pwd-input" id="cnPwdConfirm" placeholder="再次输入新密码" autocomplete="off">',
      '      <div class="cn-pwd-error" id="cnPwdConfirmErr"></div>',
      '    </div>',
      '  </div>',
      '  <div class="cn-pwd-footer">',
      '    <button class="cn-pwd-btn cn-pwd-btn-cancel" id="cnPwdCancel">取消</button>',
      '    <button class="cn-pwd-btn cn-pwd-btn-confirm" id="cnPwdSubmit">确认修改</button>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(mask);

    // 点击遮罩关闭
    mask.addEventListener('click', function(e) {
      if (e.target === mask) closePwdModal();
    });
    // ESC关闭
    var escHandler = function(e) {
      if (e.key === 'Escape') { closePwdModal(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);

    var cnPwdCancel = document.getElementById('cnPwdCancel');
    if (cnPwdCancel) cnPwdCancel.addEventListener('click', closePwdModal);
    var cnPwdSubmit = document.getElementById('cnPwdSubmit');
    if (cnPwdSubmit) cnPwdSubmit.addEventListener('click', submitPwdChange);

    // 回车提交
    ['cnPwdOld', 'cnPwdNew', 'cnPwdConfirm'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') submitPwdChange();
      });
    });

    setTimeout(function() { var oldPwd = document.getElementById('cnPwdOld'); if (oldPwd) oldPwd.focus(); }, 100);
  }

  function closePwdModal() {
    var mask = document.getElementById('cn-pwd-mask');
    if (mask) mask.remove();
  }

  function showPwdModalError(fieldId, msg) {
    var el = document.getElementById(fieldId);
    if (el) {
      el.textContent = msg;
      el.classList.add('show');
    }
  }
  function clearPwdModalErrors() {
    ['cnPwdOldErr', 'cnPwdNewErr', 'cnPwdConfirmErr'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) { el.textContent = ''; el.classList.remove('show'); }
    });
  }

  function submitPwdChange() {
    clearPwdModalErrors();
    var oldEl = document.getElementById('cnPwdOld'); if (!oldEl) return; var oldPwd = oldEl.value;
    var newEl = document.getElementById('cnPwdNew'); if (!newEl) return; var newPwd = newEl.value;
    var confirmEl = document.getElementById('cnPwdConfirm'); if (!confirmEl) return; var confirmPwd = confirmEl.value;
    var hasError = false;

    if (!oldPwd) { showPwdModalError('cnPwdOldErr', '请输入当前密码'); hasError = true; }
    if (!newPwd) { showPwdModalError('cnPwdNewErr', '请输入新密码'); hasError = true; }
    else if (newPwd.length < 6) { showPwdModalError('cnPwdNewErr', '密码长度不能少于6位'); hasError = true; }
    if (!confirmPwd) { showPwdModalError('cnPwdConfirmErr', '请确认新密码'); hasError = true; }
    else if (newPwd !== confirmPwd) { showPwdModalError('cnPwdConfirmErr', '两次输入的密码不一致'); hasError = true; }
    if (oldPwd && newPwd && oldPwd === newPwd) { showPwdModalError('cnPwdNewErr', '新密码不能与旧密码相同'); hasError = true; }
    if (hasError) return;

    var submitBtn = document.getElementById('cnPwdSubmit');
    if (!submitBtn) return;
    submitBtn.disabled = true;
    submitBtn.textContent = '提交中...';

    var user = getCurrentUser();
    SupabaseDB.updatePassword(user.username, oldPwd, newPwd).then(function (success) {
      if (!success) { showPwdModalError('cnPwdOldErr', '当前密码错误'); throw new Error('wrong password'); }
      sessionStorage.removeItem('jk_password');
      var info = null;
      try { info = JSON.parse(sessionStorage.getItem('jk_user_info') || 'null'); } catch(e) {}
      if (info) { delete info.password; sessionStorage.setItem('jk_user_info', JSON.stringify(info)); }
      var body = document.querySelector('.cn-pwd-body');
      if (body) {
        body.innerHTML = '<div class="cn-pwd-success">密码修改成功！</div>';
        var cancelBtn = document.getElementById('cnPwdCancel'); if (cancelBtn) cancelBtn.textContent = '关闭';
        var submitBtnHide = document.getElementById('cnPwdSubmit'); if (submitBtnHide) submitBtnHide.style.display = 'none';
      }
    }).catch(function(e) {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '确认修改'; }
      if (e.message !== 'wrong password') {
        showPwdModalError('cnPwdNewErr', '修改失败：' + e.message);
      }
    });
  }

  // ---------- 导航栏渲染 ----------
  function buildNav(currentPage) {
    var user = getCurrentUser();
    var roleLabel = user.role === 'admin' ? '管理员' : (user.role === 'operator' ? '运营' : (user.role === 'agent' ? '代理' : ''));
    var perms = user.permissions || [];

    var itemsHtml = NAV_ITEMS.filter(function (item) {
      // 管理员显示所有；其他用户按权限过滤
      if (user.role === 'admin' || perms.indexOf('admin') >= 0 || perms.indexOf('*') >= 0) return true;
      return item.key==='samples' ? perms.indexOf('sample_manage')>=0 : perms.indexOf(item.key)>=0;
    }).map(function (item) {
      var active = item.key === currentPage ? ' class="cn-active"' : '';
      return '<a href="' + item.url + '"' + active + '>' + item.label + '</a>';
    }).join('');

    var html =
      '<div class="cn-topbar" id="commonTopbar">' +
        '<div class="cn-inner">' +
          '<div class="cn-brand">' +
            '<div class="cn-logo">锦</div>' +
            '<span class="cn-brand-name">锦刻激光</span>' +
          '</div>' +
          '<nav class="cn-menu">' + itemsHtml + '</nav>' +
          '<div class="cn-extra" id="cnExtra"></div>' +
          '<div class="cn-user">' +
            (roleLabel ? '<span class="cn-role">' + roleLabel + '</span>' : '') +
            '<span class="cn-username">' + escapeHtml(user.name) + '</span>' +
            '<button class="cn-logout" id="cnLogoutBtn">退出</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    return html;
  }

  function injectStyles() {
    if (document.getElementById('cnNavStyles')) return;
    var css =
      '.cn-topbar{position:fixed;top:0;left:0;right:0;z-index:10000;background:linear-gradient(135deg,#12314b,#1e4976);' +
      'box-shadow:0 2px 12px rgba(0,0,0,.18);height:52px;display:flex;align-items:center;}' +
      '.cn-inner{max-width:1400px;margin:0 auto;padding:0 24px;display:flex;align-items:center;gap:32px;width:100%;box-sizing:border-box;}' +
      '.cn-brand{display:flex;align-items:center;gap:10px;flex-shrink:0;}' +
      '.cn-logo{width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#f0a832,#e07b1a);' +
      'display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:16px;}' +
      '.cn-brand-name{color:#fff;font-weight:700;font-size:15px;letter-spacing:1px;}' +
      '.cn-menu{display:flex;gap:4px;flex:1;}' +
      '.cn-menu a{color:rgba(255,255,255,.75);text-decoration:none;font-size:14px;padding:8px 16px;' +
      'border-radius:6px;transition:all .2s;white-space:nowrap;}' +
      '.cn-menu a:hover{color:#fff;background:rgba(255,255,255,.1);}' +
      '.cn-menu a.cn-active{color:#fff;background:rgba(240,168,50,.25);font-weight:600;}' +
      '.cn-user{display:flex;align-items:center;gap:10px;flex-shrink:0;}' +
      '.cn-extra{display:flex;align-items:center;gap:8px;flex-shrink:0;}' +
      '.cn-extra button,.cn-extra a{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.25);' +
      'padding:5px 12px;border-radius:6px;font-size:12px;cursor:pointer;text-decoration:none;transition:background .2s;}' +
      '.cn-extra button:hover,.cn-extra a:hover{background:rgba(255,255,255,.22);}' +
      '.cn-role{background:rgba(240,168,50,.2);color:#f0a832;font-size:11px;padding:2px 8px;border-radius:4px;font-weight:600;}' +
      '.cn-username{color:rgba(255,255,255,.85);font-size:13px;}' +
      '.cn-logout{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.25);' +
      'padding:5px 14px;border-radius:6px;font-size:12px;cursor:pointer;transition:background .2s;}' +
      '.cn-logout:hover{background:rgba(255,255,255,.22);}' +
      '@media(max-width:768px){.cn-inner{padding:0 12px;gap:12px;min-width:0;}.cn-menu{min-width:0;overflow-x:auto;flex-wrap:nowrap;}.cn-menu a{flex-shrink:0;padding:6px 10px;font-size:13px;}.cn-extra{max-width:130px;}.cn-extra #opInfoNameCompact{max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.cn-username{display:none;}.cn-brand-name{display:none;}}' +
      'body{padding-top:52px !important;}' +
      /* 用户信息弹窗 - 一体化卡片设计 */
      '#cnUserPopover{isolation:isolate;opacity:1!important;display:none;position:fixed;top:64px;right:16px;left:auto;margin-left:0;background:#fff;border-radius:16px;box-shadow:0 16px 48px rgba(18,49,75,.25),0 4px 12px rgba(0,0,0,.1);z-index:10002;width:min(320px,calc(100vw - 24px));max-height:calc(100dvh - 90px);overflow:auto;animation:none;border:1px solid rgba(18,49,75,.08);}' +
      '#cnUserPopover::before{content:"";position:absolute;top:-6px;left:50%;margin-left:-6px;width:12px;height:12px;background:#1a3f5f;transform:rotate(45deg);border-left:1px solid rgba(18,49,75,.08);border-top:1px solid rgba(18,49,75,.08);z-index:0;}' +
      '@keyframes cnPopFade{from{opacity:0;transform:translateY(-8px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}' +
      '#cnUserPopover .cn-pop-head{padding:18px 18px 14px;background:linear-gradient(135deg,#0f2a42 0%,#1a3f5f 50%,#1e4976 100%);color:#fff;position:relative;border-radius:16px 16px 0 0;}' +
      '#cnUserPopover .cn-pop-head::after{content:"";position:absolute;bottom:-1px;left:0;right:0;height:3px;background:linear-gradient(90deg,#e8a33d,#f0c060,#e8a33d);}' +
      '#cnUserPopover .cn-pop-user-row{display:flex;align-items:center;gap:12px;}' +
      '#cnUserPopover .cn-pop-avatar{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#e8a33d,#f0c060);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#12314b;flex-shrink:0;box-shadow:0 2px 8px rgba(232,163,61,.4);}' +
      '#cnUserPopover .cn-pop-name{font-size:16px;font-weight:700;margin-bottom:3px;}' +
      '#cnUserPopover .cn-pop-role{display:inline-block;background:rgba(232,163,61,.2);color:#f0c060;font-size:11px;padding:3px 10px;border-radius:12px;font-weight:600;letter-spacing:.5px;}' +
      '#cnUserPopover .cn-pop-body{padding:6px 18px 14px;}' +
      '#cnUserPopover .cn-pop-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;font-size:12.5px;border-bottom:1px solid #f3f5f8;}' +
      '#cnUserPopover .cn-pop-row:last-of-type{border-bottom:none;}' +
      '#cnUserPopover .cn-pop-label{color:#8a9bb0;display:flex;align-items:center;gap:7px;font-weight:500;}' +
      '#cnUserPopover .cn-pop-label .cn-pop-icon{font-size:13px;opacity:.8;}' +
      '#cnUserPopover .cn-pop-value{color:#12314b;font-weight:600;font-size:12px;}' +
      '#cnUserPopover .cn-pop-actions{display:flex;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid #f3f5f8;}' +
      '#cnUserPopover .cn-pop-btn{flex:1;padding:9px 0;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;transition:all .15s ease;display:flex;align-items:center;justify-content:center;gap:5px;}' +
      '#cnUserPopover .cn-pop-btn-primary{background:#12314b;color:#fff;}' +
      '#cnUserPopover .cn-pop-btn-primary:hover{background:#1a3f5f;}' +
      '#cnUserPopover .cn-pop-btn-danger{background:#fef0ef;color:#e74c3c;border:1px solid #fdd5d2;}' +
      '#cnUserPopover .cn-pop-btn-danger:hover{background:#fde2e0;}';
    var style = document.createElement('style');
    style.id = 'cnNavStyles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function renderNav(currentPage) {
    // 避免重复渲染
    if (document.getElementById('commonTopbar')) return;

    injectStyles();

    var navEl = document.createElement('div');
    navEl.innerHTML = buildNav(currentPage);
    document.body.insertBefore(navEl.firstChild, document.body.firstChild);
    if(!isLoggedIn()){
      var guestArea=document.querySelector('.cn-user');
      if(guestArea)guestArea.innerHTML='<a class="cn-logout" href="login.html">登录</a>';
    }

    var logoutBtn = document.getElementById('cnLogoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (confirm('确定要退出登录吗？')) {
          logout();
        }
      });
    }

    // 预填充右侧按钮组：已登录时直接显示用户名/通知/修改密码/退出，避免页面切换时闪烁
    if (isLoggedIn()) {
      var user = getCurrentUser();
      var extra = document.getElementById('cnExtra');
      var cnUser = document.querySelector('.cn-user');
      if (cnUser) cnUser.style.display = 'none';
      if (extra && extra.children.length === 0) {
        extra.innerHTML =
          '<span id="opInfoNameCompact" style="font-weight:600;color:#fff;font-size:13px;cursor:pointer;position:relative;" title="点击查看详情">' + escapeHtml(user.name) + '</span>' +
          '<div id="topNotifWrap" style="position:relative;display:inline-block;">' +
            '<button id="topNotifBtn" style="background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);color:#fff;font-size:14px;padding:4px 8px;border-radius:16px;cursor:pointer;">🔔</button>' +
          '</div>';

        // 给用户名添加点击事件，弹出用户信息
        var nameEl = document.getElementById('opInfoNameCompact');
        if (nameEl) {
          var popover = document.createElement('div');
          popover.id = 'cnUserPopover';
          var roleLabel = user.role === 'admin' ? '管理员' : (user.role === 'operator' ? '运营' : (user.role === 'agent' ? '代理' : '用户'));
          var perms = user.permissions || [];
          var permLabels = [];
          if (perms.indexOf('quote') >= 0) permLabels.push('报价');
          if (perms.indexOf('contract') >= 0) permLabels.push('合同');
          if (perms.indexOf('warehouse') >= 0) permLabels.push('仓储');
          if (perms.indexOf('admin') >= 0) permLabels.push('管理');
          if (perms.indexOf('sample_manage')>=0) permLabels.push('打样处理');
          var loginTime = '未记录', loginIP = '未记录', lastTime = '首次登录', lastIP = '未记录';
          try {
            var ui = JSON.parse(sessionStorage.getItem('jk_user_info') || '{}');
            loginTime = ui.currentLoginTime || '--';
            loginIP = ui.currentLoginIP || '--';
            lastTime = ui.lastLoginTime || '--';
            lastIP = ui.lastLoginIP || '--';
          } catch(e) {}
          var avatarChar = user.name ? user.name.charAt(0) : 'U';
          popover.innerHTML =
            '<div class="cn-pop-head">' +
              '<div class="cn-pop-user-row">' +
                '<div class="cn-pop-avatar">' + escapeHtml(avatarChar) + '</div>' +
                '<div>' +
                  '<div class="cn-pop-name">' + escapeHtml(user.name) + '</div>' +
                  '<span class="cn-pop-role">👤 ' + roleLabel + '</span>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="cn-pop-body">' +
              '<div class="cn-pop-row"><span class="cn-pop-label"><span class="cn-pop-icon">📋</span>权限</span><span class="cn-pop-value">' + (permLabels.length ? permLabels.join('、') : '--') + '</span></div>' +
              '<div class="cn-pop-row"><span class="cn-pop-label"><span class="cn-pop-icon">🕐</span>本次登录</span><span class="cn-pop-value">' + escapeHtml(loginTime) + '</span></div>' +
              '<div class="cn-pop-row"><span class="cn-pop-label"><span class="cn-pop-icon">🌐</span>登录IP</span><span class="cn-pop-value">' + escapeHtml(loginIP) + '</span></div>' +
              '<div class="cn-pop-row"><span class="cn-pop-label"><span class="cn-pop-icon">⏰</span>上次登录</span><span class="cn-pop-value">' + escapeHtml(lastTime) + '</span></div>' +
              '<div class="cn-pop-row"><span class="cn-pop-label"><span class="cn-pop-icon">📍</span>上次IP</span><span class="cn-pop-value">' + escapeHtml(lastIP) + '</span></div>' +
              '<div class="cn-pop-actions">' +
                '<button class="cn-pop-btn cn-pop-btn-primary" onclick="window.CommonNav.changePassword()">🔑 修改密码</button>' +
                '<button class="cn-pop-btn cn-pop-btn-danger" onclick="if(confirm(\'确定要退出登录吗？\')){window.CommonNav.logout();}">🚪 退出</button>' +
              '</div>' +
            '</div>';
          document.body.appendChild(popover);
          nameEl.addEventListener('click', function(e) {
            e.stopPropagation();
            popover.style.display = popover.style.display === 'block' ? 'none' : 'block';
            var rect = nameEl.getBoundingClientRect();
            popover.style.top = Math.min(rect.bottom + 12, window.innerHeight - popover.offsetHeight - 12) + 'px';
            popover.style.right='auto';popover.style.left=Math.max(12,Math.min(window.innerWidth-popover.offsetWidth-12,rect.right-popover.offsetWidth))+'px';
          });
          document.addEventListener('click', function() {
            popover.style.display = 'none';
          });
        }
      }
    }

    // 监听用户活动，刷新超时时间
    ['click', 'keydown', 'scroll'].forEach(function (evt) {
      document.addEventListener(evt, touchActivity, { passive: true });
    });
  }

  setInterval(function () {
    if (window.navConfig && window.navConfig.currentPage !== 'login' && window.navConfig.requireLogin !== false && !isLoggedIn()) { clearLogin(); window.location.href = LOGIN_PAGE; }
  }, 15000);

  // ---------- 初始化 ----------
  function init() {
    var config = window.navConfig || {};
    var currentPage = config.currentPage || '';
    var requireLogin = config.requireLogin !== false;

    // 登录页不需要导航栏和鉴权
    if (currentPage === 'login') {
      return;
    }

    // 需要登录的页面：检查登录状态
    if (requireLogin && !isLoggedIn()) {
      window.location.href = LOGIN_PAGE;
      return;
    }

    // 已登录或不需要登录：渲染导航栏
    touchActivity();
    renderNav(currentPage);
  }

  // 暴露给外部手动调用（报价页解密后动态加载时使用）
  window.CommonNav = {
    init: function (opts) {
      opts = opts || {};
      window.navConfig = {
        currentPage: opts.currentPage || window.navConfig?.currentPage || '',
        requireLogin: opts.requireLogin !== false
      };
      init();
    },
    logout: logout,
    changePassword: changePassword,
    isLoggedIn: isLoggedIn,
    addExtra: function (html) {
      var extra = document.getElementById('cnExtra');
      if (extra) {
        extra.insertAdjacentHTML('beforeend', html);
      }
    },
    getNavEl: function () {
      return document.getElementById('commonTopbar');
    }
  };

  // 自动初始化（如果页面已设置 navConfig）
  // 关键：同步立即执行 init()，而非等 DOMContentLoaded。
  // 所有页面均在 <body> 开头同步引入本脚本，执行时浏览器尚未首次渲染，
  // 导航栏元素和 body{padding-top:52px} 会在首次渲染前就位，
  // 页面从第一帧就是最终布局，彻底消除导航栏导致的闪烁。
  if (window.navConfig) {
    init();
  }
})();
