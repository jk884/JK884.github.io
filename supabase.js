// ========================================
// Supabase 工具模块（Auth + REST）
// 封装所有数据库和认证操作，前端只调这里的函数
// ========================================
var SupabaseDB = (function () {
  var BASE_URL = 'https://xnyjrddfntcbrpxhnuzz.supabase.co/rest/v1';
  var AUTH_URL = 'https://xnyjrddfntcbrpxhnuzz.supabase.co/auth/v1';
  var ANON_KEY = 'sb_publishable_juV2Bs_XYPW7puOJBZ8a0g_noGJ63nB';
  var STORAGE_KEY = 'supabase_auth_session';
  var sessionGeneration = 0;

  // ========== 会话管理 ==========
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {} // 升级后重新登录
  function getSession(allowExpired) {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var session = JSON.parse(raw);
      // 检查 access token 是否过期
      if (!session.access_token || !Number.isFinite(session.expires_at) || (!allowExpired && Date.now() / 1000 >= session.expires_at)) {
        return null; // 需要刷新
      }
      return session;
    } catch (e) {
      return null;
    }
  }

  function saveSession(session) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch (e) {}
  }

  function clearSession() {
    sessionGeneration++;
    try {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
      ['jk_pg_key', 'jk_token', 'jk_username', 'jk_user_id', 'jk_user_name', 'jk_user_role', 'jk_permissions', 'jk_user_info', 'jk_password', 'jk_config', 'jk_last_activity', 'jk_profile_cache'].forEach(function (key) { sessionStorage.removeItem(key); });
    } catch (e) {}
  }

  function getAccessToken() {
    var session = getSession();
    return session ? session.access_token : null;
  }

  // ========== 请求头 ==========
  function headers() {
    var h = {
      'apikey': ANON_KEY,
      'Content-Type': 'application/json'
    };
    var token = getAccessToken();
    if (token) {
      h['Authorization'] = 'Bearer ' + token;
    } else {
      h['Authorization'] = 'Bearer ' + ANON_KEY;
    }
    return h;
  }

  function authHeaders() {
    return {
      'apikey': ANON_KEY,
      'Content-Type': 'application/json'
    };
  }

  // ========== Auth API ==========

  // 必须收到本次密码验证的有效会话，不能回退到浏览器里的旧账号。
  function requestPasswordSession(username, password) {
    if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password.trim()) {
      return Promise.reject(new Error('请输入用户名和密码'));
    }
    var email = username.trim().toLowerCase() + '@jklaser.com';
    return fetch(AUTH_URL + '/token?grant_type=password', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email: email, password: password })
    }).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (e) {
          var msg = e.msg || e.error_description || e.error || '登录失败';
          // 如果是邮箱未确认，尝试自动确认（我们的迁移脚本已经确认了）
          throw new Error(msg);
        });
      }
      return res.status === 204 ? null : res.json();
    }).then(function (session) {
      if (!session || typeof session.access_token !== 'string' || !session.access_token ||
          !session.user || !session.user.id || typeof session.user.email !== 'string' ||
          session.user.email.toLowerCase() !== email || !Number.isFinite(session.expires_in) || session.expires_in <= 0) {
        throw new Error('登录验证未返回有效会话，请重新登录');
      }
      session.expires_at = Math.floor(Date.now() / 1000) + session.expires_in;
      return session;
    });
  }

  function authLogin(username, password) {
    clearSession();
    var generation = sessionGeneration;
    return requestPasswordSession(username, password).then(function (session) {
      if (generation !== sessionGeneration) throw new Error('本次登录已取消');
      saveSession(session);
      if (!getAccessToken()) throw new Error('无法保存登录会话，请检查浏览器设置');
      return session;
    });
  }

  // 刷新会话
  function authRefreshSession() {
    var session = getSession(true);
    var generation = sessionGeneration;
    if (!session || !session.refresh_token) {
      return Promise.reject(new Error('没有刷新令牌'));
    }
    return fetch(AUTH_URL + '/token?grant_type=refresh_token', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ refresh_token: session.refresh_token })
    }).then(function (res) {
      if (!res.ok) {
        clearSession();
        return res.json().then(function (e) {
          throw new Error(e.msg || '刷新会话失败');
        });
      }
      return res.status === 204 ? null : res.json();
    }).then(function (newSession) {
      if (generation !== sessionGeneration) throw new Error('登录已失效，请重新登录');
      if (newSession.access_token) {
        newSession.expires_at = Math.floor(Date.now() / 1000) + (newSession.expires_in || 3600);
        saveSession(newSession);
      }
      return newSession;
    });
  }

  // 登出
  function authLogout() {
    var token = getAccessToken();
    clearSession();
    if (token) {
      return fetch(AUTH_URL + '/logout', {
        method: 'POST',
        headers: {
          'apikey': ANON_KEY,
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        }
      }).catch(function () {}); // 忽略登出错误
    }
    return Promise.resolve();
  }

  // 获取当前用户信息（从 Auth）
  function authGetUser() {
    var token = getAccessToken();
    if (!token) return Promise.reject(new Error('未登录'));
    return fetch(AUTH_URL + '/user', {
      method: 'GET',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': 'Bearer ' + token
      }
    }).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (e) {
          throw new Error(e.msg || '获取用户信息失败');
        });
      }
      return res.status === 204 ? null : res.json();
    });
  }

  // 获取当前用户的 profile（包含角色、权限等）
  function getCurrentProfile() {
    var currentSession = getSession();
    var token = getAccessToken();
    if (!token) return Promise.reject(new Error('未登录'));
    // 先用 Auth 接口拿到当前用户 id，再按 id 精确查询 profile，避免取到表内第一条记录
    return authGetUser().then(function (authUser) {
      var userId = authUser && authUser.id;
      if (!userId) throw new Error('未获取到用户ID');
      return select('profiles', 'select=*&id=eq.' + userId).then(function (profiles) {
        if (profiles && profiles.length > 0) return profiles[0];
        throw new Error('profile 不存在');
      });
    }).catch(function () {
      // 查表失败（RLS 限制）时，回退到 RPC 函数
      return rpc('get_current_profile', {});
    }).then(function (profile) {
      var current = getSession();
      if (!currentSession || !currentSession.user || !current || current.access_token !== currentSession.access_token ||
          !profile || profile.id !== currentSession.user.id) throw new Error('登录身份已变化，请重新登录');
      // 仅缓存显示资料，不缓存页面密钥，也不以此决定解密权限。
      var display = {};
      ['id','username','full_name','role','permissions','phone','shop_name','shop_company','shop_address',
       'operator_id','parent_operator_id','parent_operator_name','last_login_at','last_login_ip'].forEach(function (field) {
        display[field] = profile[field];
      });
      try {
        sessionStorage.setItem('jk_profile_cache', JSON.stringify({
          userId: current.user.id, expiresAt: current.expires_at, profile: display
        }));
      } catch (e) {}
      return profile;
    });
  }

  // 页面展示可复用当前会话的资料；取密钥 RPC 仍逐次在服务端核验最新权限。
  function getPageProfile() {
    var session = getSession();
    if (!session || !session.user) return Promise.reject(new Error('未登录'));
    try {
      var cached = JSON.parse(sessionStorage.getItem('jk_profile_cache') || 'null');
      if (cached && cached.userId === session.user.id && cached.expiresAt === session.expires_at &&
          cached.profile && cached.profile.id === session.user.id) return Promise.resolve(cached.profile);
    } catch (e) {}
    return getCurrentProfile();
  }

  // 检查是否已登录
  function isLoggedIn() {
    return !!getAccessToken();
  }

  // ========== REST API ==========

  // 调用 RPC 函数
  function rpc(name, params) {
    return fetch(BASE_URL + '/rpc/' + name, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(params || {})
    }).then(function (res) {
      if (!res.ok) return res.json().then(function (e) { throw new Error(e.message || '请求失败'); });
      return res.status === 204 ? null : res.json();
    });
  }

  // 读取表数据
  function select(table, query) {
    var url = BASE_URL + '/' + table;
    if (query) url += '?' + query;
    return fetch(url, {
      method: 'GET',
      headers: headers()
    }).then(function (res) {
      if (!res.ok) return res.json().then(function (e) { throw new Error(e.message || '请求失败'); });
      return res.status === 204 ? null : res.json();
    });
  }

  // 插入数据
  function insert(table, data) {
    return fetch(BASE_URL + '/' + table, {
      method: 'POST',
      headers: Object.assign(headers(), {Prefer: 'return=representation'}),
      body: JSON.stringify(data)
    }).then(function (res) {
      if (!res.ok) return res.json().then(function (e) { throw new Error(e.message || '插入失败'); });
      return res.status === 204 ? null : res.json();
    });
  }

  // 更新数据
  function update(table, id, data) {
    return fetch(BASE_URL + '/' + table + '?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify(data)
    }).then(function (res) {
      if (!res.ok) return res.json().then(function (e) { throw new Error(e.message || '更新失败'); });
      return res.status === 204 ? null : res.json();
    });
  }

  // 删除数据
  function remove(table, id) {
    return fetch(BASE_URL + '/' + table + '?id=eq.' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: headers()
    }).then(function (res) {
      if (!res.ok) return res.json().then(function (e) { throw new Error(e.message || '删除失败'); });
      return res.status === 204 ? null : res.json();
    });
  }

  // ========== 业务函数（兼容旧接口） ==========

  return {
    connection: {url: BASE_URL.replace('/rest/v1', ''), publicKey: ANON_KEY},
    getPageKey: function (page, version) {
      if (!['contract', 'warehouse', 'admin'].includes(page) || !/^[a-f0-9-]{36}$/.test(version)) {
        return Promise.reject(new Error('页面参数无效'));
      }
      if (!getAccessToken()) return Promise.reject(new Error('请先登录'));
      return rpc('get_page_key', { p_page: page, p_version: version }).then(function (key) {
        if (typeof key !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(key)) throw new Error('页面密钥不可用');
        return key;
      });
    },
    // 服务端必须核验当前用户的报价权限，禁止公开读取密钥。
    getQuoteKey: function () {
      if (!getAccessToken()) return Promise.reject(new Error('请先登录'));
      return rpc('get_quote_key', {}).then(function (key) {
        if (typeof key !== 'string' || !key.trim()) throw new Error('报价密钥尚未在服务端配置');
        return key;
      }).catch(function () { throw new Error('无法获取报价密钥：请确认报价权限及服务端密钥配置'); });
    },
    // Auth 相关
    authLogin: authLogin,
    authRefreshSession: authRefreshSession,
    authLogout: authLogout,
    authGetUser: authGetUser,
    getCurrentProfile: getCurrentProfile,
    getPageProfile: getPageProfile,
    isLoggedIn: isLoggedIn,
    getSession: getSession,
    clearSession: clearSession,

    // 登录失败次数限制相关
    checkAccountLock: function (username) {
      return rpc('check_account_lock', { p_username: username });
    },
    recordLoginFailure: function (username, ip) {
      return rpc('record_login_failure', { p_username: username, p_ip_address: ip || null });
    },
    recordLoginSuccess: function (username, ip) {
      return rpc('record_login_success', { p_username: username, p_ip_address: ip || null });
    },
    unlockAccount: function (username) {
      return rpc('unlock_account', { p_username: username });
    },

    // 旧的登录接口（保留兼容，内部使用 Auth）
    login: function (username, password) {
      return authLogin(username, password).then(function (session) {
        return getCurrentProfile().then(function (profile) {
          // 转换为旧格式（返回单个对象，不是数组）
          return {
            id: profile.id,
            username: profile.username,
            role: profile.role,
            permissions: profile.permissions,
            full_name: profile.full_name,
            name: profile.full_name || profile.username,
            phone: profile.phone,
            shop_name: profile.shop_name,
            shop_company: profile.shop_company,
            shop_address: profile.shop_address,
            operator_id: profile.operator_id,
            parent_operator_id: profile.parent_operator_id,
            parent_operator_name: profile.parent_operator_name,
            last_login_time: profile.last_login_at,
            last_login_ip: profile.last_login_ip
          };
        });
      });
    },

    // 修改密码（使用 Auth）
    updatePassword: function (username, oldPassword, newPassword) {
      // 先验证旧密码
      var current = getSession();
      var generation = sessionGeneration;
      if (!current || !current.user) return Promise.reject(new Error('未登录'));
      return requestPasswordSession(username, oldPassword).then(function (verified) {
        if (generation !== sessionGeneration || verified.user.id !== current.user.id) throw new Error('登录信息已变化');
        var token = verified.access_token;
        return fetch(AUTH_URL + '/user', {
          method: 'PUT',
          headers: {
            'apikey': ANON_KEY,
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ password: newPassword })
        }).then(function (res) {
          if (!res.ok) return res.json().then(function (e) { throw new Error(e.msg || '修改密码失败'); });
          return res.status === 204 ? null : res.json();
        }).then(function (result) {
          if (generation !== sessionGeneration) throw new Error('登录已失效，请重新登录');
          saveSession(verified);
          return result;
        });
      });
    },

    // 获取所有用户（从 profiles 表）
    getUsers: function () {
      return select('profiles', 'select=id,username,full_name,role,permissions,sample_email,operator_id,parent_operator_id,parent_operator_name,phone,created_at,updated_at&order=created_at.asc');
    },

    // 创建用户（管理员操作，需要先创建 Auth 用户，再创建 profile；鉴权由当前登录会话 + 后端 RLS/RPC 保证）
    createUser: function (username, password, role, permissions, parentOperatorId, parentOperatorName, sampleEmail) {
      if (!getAccessToken()) return Promise.reject(new Error('请先登录'));
      return fetch(AUTH_URL.replace('/auth/v1','/functions/v1/admin-users'), {
        method:'POST', headers:headers(), body:JSON.stringify({username:username,password:password,role:role,permissions:permissions,parentOperatorId:parentOperatorId,parentOperatorName:parentOperatorName,sampleEmail:sampleEmail||''})
      }).catch(function(){throw new Error('无法连接创建账号接口，请确认已部署 admin-users 并检查网络连接');}).then(async function(res){var data;try{data=await res.json();}catch(e){throw new Error('创建账号接口返回异常，请检查 admin-users 部署');}if(!res.ok){if(res.status===404)throw new Error('创建账号接口尚未部署，请先部署 admin-users');throw new Error(data.error||data.message||'创建账号失败');}return data;});
    },

    // 更新用户
    updateUser: function (userId, username, role, permissions, parentOperatorId, parentOperatorName, sampleEmail) {
      return update('profiles', userId, {
        username: username,
        role: role,
        permissions: permissions,
        sample_email: sampleEmail||'',
        parent_operator_id: parentOperatorId || null,
        parent_operator_name: parentOperatorName || null
      });
    },

    // 删除用户
    deleteUser: function (userId) {
      // 删除 auth.users 会级联删除 profiles（因为有外键 ON DELETE CASCADE）
      // 但前端无法直接删除 auth.users，需要用 RPC 函数（后端鉴权）
      return rpc('delete_auth_user', { p_user_id: userId });
    },

    // 重置用户密码
    resetUserPassword: function (userId, newPassword) {
      return rpc('reset_user_password', { p_user_id: userId, p_new_password: newPassword });
    },

    // 库存相关
    getInventory: function () {
      return select('inventory', 'select=*&order=item_key.asc');
    },

    updateInventoryItem: function (itemKey, quantity) {
      var items={};items[itemKey]=quantity;return rpc('set_inventory_batch', {p_items:items});
    },

    batchUpdateInventory: function (items) {
      return rpc('set_inventory_batch', { p_items: items });
    },

    // 库存匹配相关
    getAllMappings: function () {
      return select('user_workspace', 'select=data&kind=eq.mapping').then(function(rows) { return rows[0] ? rows[0].data : []; });
    },

    saveMappings: function (mappings) {
      return rpc('save_workspace', { p_kind: 'mapping', p_data: mappings });
    },

    deleteMapping: function (quoteKey) {
      return select('user_workspace', 'select=data&kind=eq.mapping').then(function(rows) { return rpc('save_workspace', { p_kind: 'mapping', p_data: (rows[0] ? rows[0].data : []).filter(function(m) { return m.quote_key !== quoteKey; }) }); });
    },

    // 客户管理相关
    getCustomers: function () {
      return select('customers', 'select=*&user_id=eq.' + encodeURIComponent(getSession().user.id) + '&order=created_at.desc&limit=500');
    },

    saveCustomer: function (customer) {
      var session = getSession();
      var userId = session ? session.user.id : null;
      var data = {
        user_id: userId,
        name: customer.name,
        head: customer.head || '',
        phone: customer.phone || '',
        addr: customer.addr || '',
        credit: customer.credit || '',
        mail: customer.mail || '',
        tel: customer.tel || '',
        price_term: customer.priceTerm || ''
      };
      return insert('customers', data);
    },

    updateCustomer: function (id, customer) {
      var data = {
        name: customer.name,
        head: customer.head || '',
        phone: customer.phone || '',
        addr: customer.addr || '',
        credit: customer.credit || '',
        mail: customer.mail || '',
        tel: customer.tel || '',
        price_term: customer.priceTerm || '',
        updated_at: new Date().toISOString()
      };
      return update('customers', id, data);
    },

    deleteCustomer: function (id) {
      return remove('customers', id);
    },

    // 报价历史相关
    getQuotes: function () {
      return select('quotes', 'select=*&user_id=eq.' + encodeURIComponent(getSession().user.id) + '&order=created_at.desc&limit=200');
    },

    saveQuote: function (quote) {
      var session = getSession();
      var userId = session ? session.user.id : null;
      var data = {
        user_id: userId,
        customer_name: quote.customerName || '',
        quote_data: quote.quoteData || {},
        total_price: quote.totalPrice || 0
      };
      return insert('quotes', data);
    },

    deleteQuote: function (id) {
      return remove('quotes', id);
    },

    updateQuote: function (id, data) {
      return update('quotes', id, data);
    },

    // 原始 API（供高级使用）
    _rpc: rpc,
    _select: select,
    _insert: insert,
    _update: update,
    _delete: remove
  };
})();
