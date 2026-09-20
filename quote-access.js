// 报价页只验证已登录会话；用户名、密码统一在 login.html 输入。
(function () {
  'use strict';
  function activeSession() {
    var session = SupabaseDB.getSession();
    var last = Number(sessionStorage.getItem('jk_last_activity'));
    return session && session.user && last > 0 && last <= Date.now() && Date.now() - last < 20 * 60 * 1000 ? session : null;
  }
  window.QuoteAccess = {
    open: async function (unlock) {
      var status = document.getElementById('quoteAccessStatus');
      var session = activeSession();
      if (!session) {
        SupabaseDB.clearSession();
        window.location.replace('login.html');
        return;
      }
      var token = session.access_token;
      function isCurrentSession() {
        var current = activeSession();
        return !!current && current.access_token === token;
      }
      try {
        var access = await Promise.all([SupabaseDB.getPageProfile(), SupabaseDB.getQuoteKey()]);
        var profile = access[0];
        if (!isCurrentSession() || !profile || profile.id !== session.user.id) throw new Error('登录已失效，请返回登录页重新验证');
        var userInfo = {
          id: profile.id, username: profile.username,
          role: profile.role || '', permissions: Array.isArray(profile.permissions) ? profile.permissions : [],
          name: profile.full_name || profile.username, full_name: profile.full_name,
          phone: profile.phone || '', shop_name: profile.shop_name || '',
          shop_company: profile.shop_company || '', shop_address: profile.shop_address || '',
          operator_id: profile.operator_id, parent_operator_id: profile.parent_operator_id,
          parent_operator_name: profile.parent_operator_name,
          lastLoginTime: JSON.parse(sessionStorage.getItem('jk_user_info') || '{}').lastLoginTime || profile.last_login_at || '首次登录', lastLoginIP: JSON.parse(sessionStorage.getItem('jk_user_info') || '{}').lastLoginIP || profile.last_login_ip || '未记录'
        };
        status.textContent = '正在加载，请稍后';
        await unlock(userInfo, isCurrentSession, access[1]);
      } catch (err) {
        status.dataset.state = 'error';
        status.textContent = err.message || '无法验证登录，请返回登录页重试';
      }
    }
  };
})();
