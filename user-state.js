// 本地草稿按经过认证的 Auth 用户 ID 隔离；不接收用户名作为授权依据。
(function () {
  'use strict';
  function key(name) {
    var session = window.SupabaseDB && SupabaseDB.getSession();
    if (!session || !session.user || !session.user.id) throw new Error('登录已失效');
    return 'jk:user:' + session.user.id + ':' + name;
  }
  window.UserState = {storage: {
    getItem: function(name) { try { return localStorage.getItem(key(name)); } catch(e) { return null; } },
    setItem: function(name,value) { localStorage.setItem(key(name), value); },
    removeItem: function(name) { localStorage.removeItem(key(name)); }
  }};
})();
