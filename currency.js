// ===== 货币切换功能 =====
// 全局变量
window.currentCurrency = 'CNY'; // 当前货币：CNY 或 USD
window.exchangeRate = 0.14; // 默认汇率（1人民币=0.14美元）
window.exchangeRateDate = ''; // 汇率日期

// 判断账户是否为美元账户
window.isUSDAccount = function(accountType) {
  return accountType === 'juming_hk' || accountType === 'juming_us' || accountType === 'qijun_usd';
};

// 获取实时汇率（使用 Frankfurter API，免费无需API Key）
window.fetchExchangeRate = function() {
  return new Promise(function(resolve) {
    // 检查缓存（2小时内有效）
    try {
      var cachedRate = localStorage.getItem('jk_exchange_rate');
      var cachedDate = localStorage.getItem('jk_exchange_rate_date');
      if (cachedRate && cachedDate) {
        var age = Date.now() - parseInt(cachedDate);
        if (age < 2 * 60 * 60 * 1000) { // 2小时
          window.exchangeRate = parseFloat(cachedRate);
          console.log('[汇率] 使用缓存汇率:', window.exchangeRate);
          resolve(window.exchangeRate);
          return;
        }
      }
    } catch(e) {
      console.log('[汇率] 读取缓存失败:', e);
    }
    
    // 从 API 获取实时汇率
    fetch('https://api.frankfurter.app/latest?from=CNY&to=USD')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data && data.rates && data.rates.USD) {
          window.exchangeRate = data.rates.USD;
          window.exchangeRateDate = data.date;
          try {
            localStorage.setItem('jk_exchange_rate', window.exchangeRate.toString());
            localStorage.setItem('jk_exchange_rate_date', Date.now().toString());
          } catch(e) {}
          console.log('[汇率] 获取实时汇率:', window.exchangeRate, '日期:', window.exchangeRateDate);
        }
        resolve(window.exchangeRate);
      })
      .catch(function(err) {
        console.log('[汇率] 获取失败，使用默认汇率:', window.exchangeRate, err);
        resolve(window.exchangeRate);
      });
  });
};

// 切换货币
window.switchCurrency = function(currency) {
  window.currentCurrency = currency;
  console.log('[货币] 切换到:', currency);
  
  // 更新表格标题
  window.updateCurrencyLabels();
  
  // 重新计算金额（延迟执行，确保DOM更新完成）
  setTimeout(function() {
    if (typeof ctCalcGrandTotal === 'function') ctCalcGrandTotal();
    if (typeof fmCalcGrandTotal === 'function') fmCalcGrandTotal();
    if (typeof recalcAllRows === 'function') recalcAllRows();
  }, 100);
};

// 更新货币相关的标签
window.updateCurrencyLabels = function() {
  var isUSD = window.currentCurrency === 'USD';
  var unit = isUSD ? '美元' : '元';
  var currencyName = isUSD ? '美元' : '人民币';
  
  // 更新交易合同表格标题
  var allTh = document.querySelectorAll('#ctTable th, .ct-money');
  allTh.forEach(function(th) {
    var text = th.textContent || '';
    if (text.indexOf('单价') >= 0) {
      th.innerHTML = '单价（' + unit + '）';
    } else if (text.indexOf('总金额') >= 0) {
      th.innerHTML = '总金额（' + unit + '）';
    }
  });
  
  // 更新合计大写标签
  var ctGrandLabel = document.querySelector('.ct-total-capital');
  if (ctGrandLabel) {
    var span = ctGrandLabel.querySelector('span');
    if (span) {
      span.textContent = '合计金额（大写）：' + currencyName;
    } else {
      ctGrandLabel.innerHTML = '<span>合计金额（大写）：' + currencyName + '</span>';
    }
  }
};

// 人民币大写转换（备用方案）
window.capNumCNY = function(n) {
  if (isNaN(n) || n === null || n === undefined) return '零元整';
  n = Number(n);
  if (n === 0) return '零元整';

  var digits = ['零','壹','贰','叁','肆','伍','陆','柒','捌','玖'];
  var intUnits = ['','拾','佰','仟'];
  var bigUnits = ['','万','亿','万亿'];

  var negative = n < 0;
  n = Math.abs(n);
  n = Math.round(n * 100) / 100; // 先四舍五入到分，避免 decPart 溢出为 100
  var intPart = Math.floor(n);
  var decPart = Math.round((n - intPart) * 100);

  var intStr = '';
  if (intPart === 0) {
    intStr = '零';
  } else {
    var groups = [];
    var temp = intPart;
    while (temp > 0) {
      groups.push(temp % 10000);
      temp = Math.floor(temp / 10000);
    }
    for (var g = groups.length - 1; g >= 0; g--) {
      var group = groups[g];
      var groupStr = '';
      var zeroFlag = false;
      for (var d = 3; d >= 0; d--) {
        var digit = Math.floor(group / Math.pow(10, d)) % 10;
        if (digit === 0) {
          zeroFlag = true;
        } else {
          if (zeroFlag && groupStr !== '') groupStr += '零';
          groupStr += digits[digit] + intUnits[d];
          zeroFlag = false;
        }
      }
      if (groupStr !== '') {
        intStr += groupStr + bigUnits[g];
      } else if (intStr !== '' && g > 0) {
        if (!intStr.endsWith('零')) intStr += '零';
      }
    }
  }

  var decStr = '';
  if (decPart === 0) {
    decStr = '整';
  } else {
    var jiao = Math.floor(decPart / 10);
    var fen = decPart % 10;
    if (jiao > 0) decStr += digits[jiao] + '角';
    if (fen > 0) decStr += digits[fen] + '分';
    if (jiao === 0 && fen > 0) decStr = '零' + decStr;
  }

  var result = intStr + '元' + decStr;
  if (negative) result = '负' + result;
  return result;
};

// 美元大写转换（中文大写美元）
window.capNumUSD = function(n) {
  if (isNaN(n) || n === null || n === undefined) return '零美元整';
  n = Number(n);
  if (n === 0) return '零美元整';

  var digits = ['零','壹','贰','叁','肆','伍','陆','柒','捌','玖'];
  var intUnits = ['','拾','佰','仟'];
  var bigUnits = ['','万','亿','万亿'];

  var negative = n < 0;
  n = Math.abs(n);
  n = Math.round(n * 100) / 100; // 先四舍五入到分，避免 decPart 溢出为 100
  var intPart = Math.floor(n);
  var decPart = Math.round((n - intPart) * 100);

  var intStr = '';
  if (intPart === 0) {
    intStr = '零';
  } else {
    var groups = [];
    var temp = intPart;
    while (temp > 0) {
      groups.push(temp % 10000);
      temp = Math.floor(temp / 10000);
    }
    for (var g = groups.length - 1; g >= 0; g--) {
      var group = groups[g];
      var groupStr = '';
      var zeroFlag = false;
      for (var d = 3; d >= 0; d--) {
        var digit = Math.floor(group / Math.pow(10, d)) % 10;
        if (digit === 0) {
          zeroFlag = true;
        } else {
          if (zeroFlag && groupStr !== '') groupStr += '零';
          groupStr += digits[digit] + intUnits[d];
          zeroFlag = false;
        }
      }
      if (groupStr !== '') {
        intStr += groupStr + bigUnits[g];
      } else if (intStr !== '' && g > 0) {
        if (!intStr.endsWith('零')) intStr += '零';
      }
    }
  }

  var decStr = '';
  if (decPart === 0) {
    decStr = '整';
  } else {
    var jiao = Math.floor(decPart / 10);
    var fen = decPart % 10;
    if (jiao > 0) decStr += digits[jiao] + '角';
    if (fen > 0) decStr += digits[fen] + '分';
    if (jiao === 0 && fen > 0) decStr = '零' + decStr;
  }

  var result = intStr + '美元' + decStr;
  if (negative) result = '负' + result;
  return result;
};

// 根据货币获取大写金额
window.capNumByCurrency = function(n) {
  if (window.currentCurrency === 'USD') {
    return window.capNumUSD(n);
  }
  // 人民币模式：优先使用 contract.html 中的 capNum 函数，不存在则使用备用方案
  if (typeof window.capNum === 'function') {
    return window.capNum(n);
  }
  return window.capNumCNY(n);
};

// 金额格式化（根据货币）
window.fmtMoneyByCurrency = function(n) {
  var amount = window.convertAmount(n);
  if (window.currentCurrency === 'USD') {
    return '$' + Number(amount).toFixed(2);
  }
  return Number(amount).toFixed(2);
};

// 根据汇率转换金额
window.convertAmount = function(rmbAmount) {
  if (window.currentCurrency === 'USD') {
    return rmbAmount * window.exchangeRate;
  }
  return rmbAmount;
};

console.log('[货币] currency.js 加载完成');
