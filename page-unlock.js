// 页面密钥不落盘；只接受服务器对当前用户、页面、版本授权后的结果。
(async function () {
  'use strict';
  var status = document.getElementById('pageStatus');
  function decode(value) {
    return Uint8Array.from(atob(value), function (c) { return c.charCodeAt(0); });
  }
  function hasActiveSession() {
    var last = Number(sessionStorage.getItem('jk_last_activity'));
    return SupabaseDB.isLoggedIn() && last > 0 && last <= Date.now() && Date.now() - last < 20 * 60 * 1000;
  }
  try {
    if (!hasActiveSession()) {
      SupabaseDB.clearSession();
      window.location.replace('login.html');
      return;
    }
    var payload = JSON.parse(document.getElementById('pagePayload').textContent);
    if (!['contract', 'warehouse', 'admin'].includes(payload.page)) throw new Error('页面标识无效');
    var session = SupabaseDB.getSession();
    var token = session.access_token;
    // 取密钥与显示资料并行；正常登录后显示资料无需再发请求。
    var access = await Promise.all([
      SupabaseDB.getPageKey(payload.page, payload.version),
      SupabaseDB.getPageProfile()
    ]);
    var keyText = access[0];
    var profile = access[1];
    if (!profile || profile.id !== session.user.id) throw new Error('登录信息已变化，请重新登录');
    var key = await window.crypto.subtle.importKey('raw', decode(keyText), { name: 'AES-GCM' }, false, ['decrypt']);
    keyText = null;
    var plaintext = await window.crypto.subtle.decrypt({
      name: 'AES-GCM', iv: decode(payload.iv),
      additionalData: new TextEncoder().encode(payload.page + ':' + payload.version)
    }, key, decode(payload.ct));
    // 异步鉴权期间若已退出或切换账号，不渲染旧会话内容。
    if (!hasActiveSession() || SupabaseDB.getSession().access_token !== token) throw new Error('登录已失效，请重新登录');
    sessionStorage.setItem('jk_username', profile.username);
    sessionStorage.setItem('jk_user_id', profile.id);
    sessionStorage.setItem('jk_user_name', profile.full_name || profile.username);
    sessionStorage.setItem('jk_user_role', profile.role || '');
    sessionStorage.setItem('jk_permissions', JSON.stringify(Array.isArray(profile.permissions) ? profile.permissions : []));
    sessionStorage.setItem('jk_user_info', JSON.stringify(Object.assign({}, JSON.parse(sessionStorage.getItem('jk_user_info') || '{}'), {
      username: profile.username, name: profile.full_name || profile.username,
      role: profile.role, permissions: profile.permissions,
      phone: profile.phone || '', parentOperatorId: profile.parent_operator_id || '',
      parentOperatorName: profile.parent_operator_name || ''
    })));
    sessionStorage.setItem('jk_last_activity', String(Date.now()));
    // 仅写入经 AES-GCM 认证的本项目完整 HTML，让脚本依原顺序初始化。
    var html = new TextDecoder().decode(plaintext);
    document.open();
    document.write(html);
    document.close();
  } catch (err) {
    status.dataset.state = 'error';
    status.textContent = '无法打开页面：权限不足、会话失效或服务端密钥尚未配置。请返回系统入口或联系管理员。';
  }
})();
