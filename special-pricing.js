(function(){
 'use strict';
 var bridge,box,status,applyButton,quantity,pickup,dialog,message,notice,selection,key='',offer=null,timer,expiryTimer,version=0,enabled=false;
 function node(tag,text,parent){var n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(parent)parent.appendChild(n);return n;}
 function stable(v){if(Array.isArray(v))return v.map(stable).sort(function(a,b){return JSON.stringify(a).localeCompare(JSON.stringify(b));});if(v&&typeof v==='object'){var o={};Object.keys(v).sort().forEach(function(k){o[k]=stable(v[k]);});return o;}return v;}
 function signature(s){return JSON.stringify(stable(s))+'|'+quantity.value+'|'+pickup.checked;}
 function count(){return Number(quantity.value);}
 function validCount(){return Number.isInteger(count())&&count()>=1&&count()<=100000;}
 function terms(r){return '起订 '+r.min_quantity+' 台；'+(r.pickup_only?'须自提':'配送方式不限')+'；'+(r.valid_until?'有效至 '+new Date(r.valid_until).toLocaleString():'长期有效');}
 function current(){return enabled&&offer&&selection&&signature(selection)===key&&offer.applicable&&validCount()&&count()>=offer.min_quantity&&(!offer.pickup_only||pickup.checked)&&(!offer.valid_until||new Date(offer.valid_until).getTime()>Date.now());}
 function paint(){
  applyButton.disabled=!offer||offer.status!=='none'||!validCount();
  if(!validCount()){status.textContent='请输入 1～100000 的整数台数';return;}
  if(!offer){status.textContent='正在加载，请稍后';return;}
  if(offer.status==='none'){status.textContent='针对当前整套配置向直属上级申请特价；相同配置仅可申请一次。';return;}
  var labels={pending:'申请已提交，等待 '+offer.supervisor_name+' 处理',rejected:'申请已拒绝',approved:current()?'申请成功，已使用特价 '+offer.unit_price+' 元/台':'已批准 '+offer.unit_price+' 元/台，当前条件不满足，使用常规价格'};
  status.textContent=labels[offer.status]+(offer.status==='approved'?'。'+terms(offer):'')+(offer.decision_note?'。说明：'+offer.decision_note:'');
 }
 async function lookup(){
  if(!enabled||!selection||!validCount())return;
  var requestVersion=++version,snapshot=JSON.parse(JSON.stringify(selection)),requestKey=signature(snapshot);
  try{
   var result=await SupabaseDB._rpc('get_special_price',{p_selection:snapshot,p_quantity:count(),p_pickup:pickup.checked});
   if(requestVersion!==version||requestKey!==key)return;
   offer=result;paint();clearTimeout(expiryTimer);
   if(result.valid_until){var delay=new Date(result.valid_until).getTime()-Date.now();if(delay>0)expiryTimer=setTimeout(invalidate,Math.min(delay+20,2147483647));}
   bridge.refresh();
  }catch(e){if(requestVersion===version){offer=null;status.textContent='特价状态加载失败：'+e.message;applyButton.disabled=true;}}
 }
 function invalidate(){key='';offer=null;version++;clearTimeout(timer);try{UserState.storage.setItem('special_order_context',JSON.stringify({quantity:count(),pickup:pickup.checked}));}catch(e){}bridge.refresh();}
 window.SpecialPricing={
  onQuoteChange:function(s,r){if(!enabled)return;selection=JSON.parse(JSON.stringify(s));var next=signature(s);if(next!==key){key=next;offer=null;version++;clearTimeout(timer);timer=setTimeout(lookup,250);}paint();var subtotal=document.getElementById('specialOrderTotal');subtotal.textContent=validCount()?'数量 '+count()+' 台 · 订单金额 '+(r.total*count()).toLocaleString('zh-CN',{maximumFractionDigits:2})+' 元（普票）':'';},
  adjust:function(s,total){if(!enabled)return {total:total,quantity:1,pickup:false};var active=signature(s)===key&&current();return {total:active?Number(offer.unit_price):total,quantity:validCount()?count():1,pickup:pickup.checked,request:active?offer:null};},
  terms:terms,
  restore:function(record){if(!enabled)return;quantity.value=String(record.quantity||1);pickup.checked=!!record.pickup;invalidate();},
  verifyCurrent:async function(){if(!enabled)return;clearTimeout(timer);await lookup();if(!offer)throw new Error('无法确认当前配置的特价状态，请稍后重试');},
  context:function(){return enabled?{quantity:validCount()?count():1,pickup:pickup.checked,request:current()?offer:null}:{quantity:1,pickup:false,request:null};}
 };
 async function init(){
  bridge=window.quotePricingBridge;if(!bridge){setTimeout(init,200);return;}
  var profile=await SupabaseDB.getPageProfile();if(profile.role!=='agent')return;
  enabled=true;box=node('details');box.id='specialPriceBox';box.style.cssText='margin:14px 0;padding:12px;border:1px solid #dce4ed;border-radius:8px;background:#f7f9fc';
  var table=document.querySelector('.quote-table');table.after(box);node('summary','代理专享 · 特价申请',box).style.cursor='pointer';
  var qlabel=node('label','本次采购台数 ',box);quantity=node('input',undefined,qlabel);quantity.type='number';quantity.min='1';quantity.max='100000';quantity.step='1';quantity.value='1';quantity.id='specialPriceQuantity';quantity.style.cssText='width:90px;margin:12px';
  var plabel=node('label',undefined,box);pickup=node('input',undefined,plabel);pickup.type='checkbox';pickup.id='specialPricePickup';plabel.append(' 自提');
  try{var saved=JSON.parse(UserState.storage.getItem('special_order_context')||'{}');if(Number.isInteger(saved.quantity)&&saved.quantity>=1&&saved.quantity<=100000)quantity.value=String(saved.quantity);pickup.checked=!!saved.pickup;}catch(e){}
  status=node('p','正在加载，请稍后',box);node('p','',box).id='specialOrderTotal';applyButton=node('button','申请价格',box);applyButton.id='specialPriceApply';applyButton.type='button';
  dialog=node('dialog',undefined,document.body);dialog.id='specialPriceDialog';dialog.style.cssText='width:min(540px,90vw);border:1px solid #dce4ed;border-radius:14px;padding:24px';node('h3','向直属上级申请当前配置特价',dialog);var detail=node('pre','',dialog);detail.style.cssText='white-space:pre-wrap;max-height:35vh;overflow:auto';
  var form=node('form',undefined,dialog);message=node('textarea',undefined,form);message.maxLength=2000;message.placeholder='申请理由、交付要求等';message.rows=4;message.style.width='100%';notice=node('p','',form);var submit=node('button','提交申请',form),cancel=node('button','取消',form);cancel.type='button';cancel.onclick=function(){dialog.close();};
  var submittedSelection,submittedQuantity,submittedPickup;
  applyButton.onclick=function(){submittedSelection=bridge.getSelection();submittedQuantity=count();submittedPickup=pickup.checked;detail.textContent=QuoteEngine.buildCopyText(submittedSelection)+'\n采购 '+submittedQuantity+' 台；'+(submittedPickup?'自提':'配送');message.value='';notice.textContent='相同配置只能申请一次，拒绝或过期后也不能重复申请。';dialog.showModal();};
  form.onsubmit=async function(e){e.preventDefault();submit.disabled=true;try{await SupabaseDB._rpc('submit_special_price',{p_selection:submittedSelection,p_message:message.value.trim(),p_quantity:submittedQuantity,p_pickup:submittedPickup});dialog.close();invalidate();window.dispatchEvent(new Event('price-notifications-changed'));}catch(err){notice.textContent=err.message;}finally{submit.disabled=false;}};
  quantity.oninput=pickup.onchange=invalidate;
  window.addEventListener('special-price-changed',invalidate);
  window.addEventListener('focus',invalidate);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)invalidate();});
  bridge.refresh();
 }
 init().catch(function(e){console.warn('特价申请加载失败：'+e.message);});
})();
