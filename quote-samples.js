(function(){
 'use strict';
 var service=window.SampleService,list=document.getElementById('sampleCardList'),message=document.getElementById('sampleCardMessage'),timer;
 if(!list)return;
 async function load(){try{var rows=await service.list({own:true,limit:10});list.replaceChildren();document.getElementById('sampleCardCount').textContent=rows.length===10?'最近10件':rows.length+' 件';if(!rows.length)service.node('p','暂无打样，点击“添加打样”登记需求。',list);rows.forEach(function(s){var row=service.node('article',undefined,list);row.className='sample-row';service.node('h3',s.title,row);service.badge(s.status,row);if(s.delivery_status)service.node('small',s.delivery_status,row);service.node('p',(s.carrier||'快递')+'：'+(s.tracking||'待寄送'),row);service.button(row,'查看详情',function(){service.openDetail(s.id).catch(function(e){message.textContent=e.message;});});});message.textContent='';}catch(e){message.textContent='打样加载失败：'+e.message;}}
 document.getElementById('sampleAdd').onclick=function(){service.openCreate().catch(function(e){message.textContent=e.message;});};
 function refresh(){clearTimeout(timer);timer=setTimeout(load,200);}
 window.addEventListener('samples-changed',refresh);window.addEventListener('focus',refresh);
 service.ready().then(function(){load();if(window.LiveData)LiveData.subscribe('sample_requests',refresh);}).catch(function(e){message.textContent=e.message;});
})();
