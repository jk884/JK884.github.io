(function(){
 'use strict';
 var listeners=[],socket,timer,retry,ref=0,backoff=1000,joined=false;
 function emit(table,data){listeners.filter(function(x){return x.table===table;}).forEach(function(x){x.callback(data);});}
 function send(event,payload,topic){if(socket&&socket.readyState===1)socket.send(JSON.stringify({topic:topic||'realtime:business',event:event,payload:payload,ref:String(++ref),join_ref:'1'}));}
 function stop(){clearInterval(timer);clearTimeout(retry);joined=false;if(socket){socket.onclose=null;socket.close();socket=null;}}
 function start(){
  stop();if(document.hidden||!listeners.length||!SupabaseDB.getSession())return;
  var token=SupabaseDB.getSession().access_token;
  socket=new WebSocket(SupabaseDB.connection.url.replace('https:','wss:')+'/realtime/v1/websocket?apikey='+encodeURIComponent(SupabaseDB.connection.publicKey)+'&vsn=1.0.0');
  socket.onopen=function(){ref=0;send('phx_join',{access_token:token,config:{broadcast:{ack:false,self:false},presence:{enabled:false},postgres_changes:Array.from(new Set(listeners.map(function(x){return x.table;}))).map(function(t){return {event:'*',schema:'public',table:t};})}});timer=setInterval(function(){if(!SupabaseDB.getSession()){stop();return;}send('heartbeat',{},'phoenix');},25000);};
  socket.onmessage=function(e){try{var m=JSON.parse(e.data);if(m.event==='phx_reply'&&m.ref==='1'){if(m.payload.status!=='ok'){socket.close();return;}joined=true;listeners.forEach(function(x){x.callback({resync:true});});}if(m.event==='system'){if(m.payload.status==='error'){socket.close();return;}if(m.payload.status==='ok')backoff=1000;}if(m.event==='postgres_changes'&&m.payload.data){backoff=1000;emit(m.payload.data.table,m.payload.data);}if(m.event==='phx_error')socket.close();}catch(err){console.warn('实时连接消息无法处理');}};
  socket.onclose=function(){clearInterval(timer);joined=false;retry=setTimeout(start,backoff);backoff=Math.min(backoff*2,60000);};
 }
 window.LiveData={subscribe:function(table,callback){var item={table:table,callback:callback};listeners.push(item);start();return function(){listeners=listeners.filter(function(x){return x!==item;});start();};},isConnected:function(){return joined;}};
 document.addEventListener('visibilitychange',start);window.addEventListener('online',start);window.addEventListener('pagehide',stop);
})();
