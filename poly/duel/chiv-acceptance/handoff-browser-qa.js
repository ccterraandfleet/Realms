(() => {
const status=document.getElementById('qaStatus'),report=document.getElementById('qaReport'),button=document.getElementById('qaRun');
const errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
document.getElementById('qaHide').onclick=()=>document.getElementById('qaPanel').style.display='none';
const ready=setInterval(()=>{if(window.__duel?.ready&&window.__contactReady?.()&&window.__swingState?.().loaded){clearInterval(ready);button.disabled=false;status.textContent='Assets ready. Isolated saved changes; production is unchanged.';}},100);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
button.onclick=async()=>{
 button.disabled=true;const checks=[];const nativeRAF=window.requestAnimationFrame;let pendingFrame=null;
 window.requestAnimationFrame=fn=>{pendingFrame=fn;return 0;};await sleep(150);
 const save=()=>{window.__acceptanceReport={mode:window.__perf?.(),checks,errors,complete:false,inputMethod:'DOM input events and deterministic simulation; not a hardware FPS benchmark'};report.textContent=JSON.stringify(window.__acceptanceReport,null,2);};
 const check=(name,fn)=>{const result=fn();checks.push({name,...result});save();if(!result.ok)throw Error(name);};
 const tap=(dx=-80,dy=0)=>{__aimInject(dx,dy);dispatchEvent(new MouseEvent('mousedown',{button:0}));dispatchEvent(new MouseEvent('mouseup',{button:0}));};
 const key=(value,down=true)=>dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{key:value}));
 try{
  check('Paused screen freezes combat and position',()=>{const before=__lifecycle(),p=__where();__tickN(120);__renderOnce(.1);return{ok:!before.running&&before.clock===__lifecycle().clock&&p.x===__where().x&&p.z===__where().z}});
  window.__forceInput=true;document.querySelector('#playButton').click();
  check('Start action opens the duel',()=>({ok:__lifecycle().running&&document.querySelector('#intro').style.display==='none'}));
  check('All WASD directions, sprint and arena boundary',()=>{
   const go=(k,fast=false,n=10)=>{__exchangeLab.reset(6);key(k);if(fast)key('Shift');for(let i=0;i<n;i++){__tickN(6);__renderOnce(.1);}key(k,false);key('Shift',false);return __where();};
   const a=go('d'),w=go('w'),s=go('s'),left=go('a'),sp=go('d',true),wall=go('d',true,40);
   return{ok:a.x>3&&w.z<-3&&s.z>3&&left.x<-3&&sp.x>a.x+1&&Math.hypot(wall.x,wall.z)<10,walk:a.x,sprint:sp.x,wallRadius:Math.hypot(wall.x,wall.z)};
  });
  check('Every clicked attack and mouse look',()=>{
   const names=[];for(const[dx,dy,want]of[[-80,0,'Slash'],[80,0,'Slash'],[0,-80,'Overhead'],[0,80,'Stab']]){__exchangeLab.reset();tap(dx,dy);__tickN(1);names.push(__duel.duel.a.attack?.name===want);}
   __exchangeLab.reset();document.dispatchEvent(new MouseEvent('mousemove',{movementX:80,movementY:-30}));__renderOnce(.016);return{ok:names.every(Boolean)&&Math.abs(__vm.camera.rotation.y)>.1,attacks:names};
  });
  check('Heavy input, feint, jab, kick and dodge',()=>{
   __exchangeLab.reset();__aimInject(-80,0);dispatchEvent(new MouseEvent('mousedown',{button:1}));dispatchEvent(new MouseEvent('mouseup',{button:1}));__tickN(1);const middle=__duel.duel.a.attack?.name==='SlashHeavy';
   __exchangeLab.reset();__aimInject(-80,0);dispatchEvent(new MouseEvent('mousedown',{button:0}));__tickN(14);const held=/Heavy/.test(__duel.duel.a.attack?.name||'');dispatchEvent(new MouseEvent('mouseup',{button:0}));
   __exchangeLab.reset();key('j');__tickN(1);const jab=__duel.duel.a.attack?.name==='Jab';__exchangeLab.reset();key('k');__tickN(1);const kick=__duel.duel.a.attack?.name==='KickLow';
   __exchangeLab.reset();tap();__tickN(2);key('q');__tickN(1);const feint=!__duel.duel.a.attack;__exchangeLab.reset();key(' ');__tickN(1);const dodge=__duel.duel.a.state==='dodge';return{ok:middle&&held&&jab&&kick&&feint&&dodge,middle,held,jab,kick,feint,dodge};
  });
  check('Block followed by riposte',()=>{
   __exchangeLab.reset();dispatchEvent(new MouseEvent('mousedown',{button:2}));__exchangeLab.enemy({attack:'Slash'});__tickN(48);const blocked=__exchangeLab.state().events.some(e=>e.type==='block');tap(0,-80);__tickN(1);return{ok:blocked&&__duel.duel.a.hp===100&&__exchangeLab.state().events.some(e=>e.type==='riposte'),hp:__duel.duel.a.hp,events:__exchangeLab.state().events.map(e=>e.type)};
  });
  check('Player counter intercepts an incoming matching strike',()=>{
   __exchangeLab.reset();dispatchEvent(new MouseEvent('mousedown',{button:2}));__exchangeLab.enemy({attack:'Slash'});__tickN(30);tap();__tickN(12);return{ok:__duel.duel.a.hp===100&&__exchangeLab.state().events.some(e=>e.type==='counter'),hp:__duel.duel.a.hp,events:__exchangeLab.state().events.map(e=>e.type)};
  });
  check('Wrong counter receives damage',()=>{
   __exchangeLab.reset();dispatchEvent(new MouseEvent('mousedown',{button:2}));__exchangeLab.enemy({attack:'Slash'});__tickN(30);tap(0,-80);__tickN(12);return{ok:__duel.duel.a.hp<100,hp:__duel.duel.a.hp};
  });
  check('Opponent counters the player under the same rules',()=>{
   __exchangeLab.reset();tap();__tickN(30);__exchangeLab.enemy({guard:true,attack:'Slash'});__tickN(12);return{ok:__duel.duel.b.hp===100&&__exchangeLab.state().events.some(e=>e.type==='counter'),hp:__duel.duel.b.hp,events:__exchangeLab.state().events.map(e=>e.type)};
  });
  check('Escape freezes the clock and clears held movement',()=>{
   key('w');key('Escape');window.__forceInput=false;const c=__lifecycle().clock;__tickN(120);__renderOnce(.1);const ok=!__lifecycle().running&&!__lifecycle().pressed.length&&__lifecycle().clock===c;window.__forceInput=true;document.querySelector('#playButton').click();return{ok};
  });
  check('Focus loss releases movement and guard',()=>{key('w');dispatchEvent(new MouseEvent('mousedown',{button:2}));dispatchEvent(new Event('blur'));return{ok:!__lifecycle().running&&!__lifecycle().pressed.length&&__feel().guard===null}});
  document.querySelector('#restartButton').click();document.querySelector('#playButton').click();
  check('New match restores resources and spawn positions',()=>{const l=__lifecycle(),w=__where();return{ok:l.round===0&&l.score.every(v=>v===0)&&__duel.duel.a.hp===100&&__duel.duel.b.hp===100&&w.x===0&&w.z===0&&Math.abs(w.gap-3.4)<.01}});
  check('Genuine defeats progress three rounds and finish the match',()=>{
   const outcomes=[],gaps=[];for(let r=0;r<3;r++){__exchangeLab.reset(1.3);for(let n=0;n<600&&!__duel.duel.over;n++){if(__duel.duel.a.canStartAttack())tap();__tickN(1);if(n%12===0)__renderOnce(.2);}outcomes.push(__duel.duel.b.hp<=0);__tickN(100);gaps.push(__where().gap);}
   const l=__lifecycle();return{ok:outcomes.every(Boolean)&&l.over&&l.round===3&&l.score[0]===3&&gaps.slice(0,2).every(g=>Math.abs(g-3.4)<.01),outcomes,gaps,score:l.score,history:l.roundResults};
  });
  key('r');key('r',false);
  check('Rematch clears score, results and death state',()=>({ok:!__lifecycle().over&&__lifecycle().round===0&&__lifecycle().roundResults.length===0&&__duel.duel.a.hp===100&&__where().gap===3.4}));
  key('4');key('4',false);
  check('Difficulty selection starts a clean first round',()=>({ok:__lifecycle().styleKey==='champion'&&__lifecycle().round===0&&__lifecycle().score.every(v=>v===0)}));
  const select=document.querySelector('#opponentSelect');select.value='ladder';select.dispatchEvent(new Event('change'));document.querySelector('#playButton').click();
  check('Progressive ladder can be restored',()=>({ok:__lifecycle().styleKey==='recruit'&&__lifecycle().round===0}));
  check('No runtime exceptions',()=>({ok:errors.length===0&&!window.__firstLoopError,errors,loopError:window.__firstLoopError||null}));
  window.__acceptanceReport.complete=true;report.textContent=JSON.stringify(window.__acceptanceReport,null,2);status.textContent=checks.length+' checks passed. Source preview only, not a production deployment.';
 }catch(e){status.textContent='FAILED: '+e.message;save();}
 finally{window.__forceInput=false;key('Escape');window.requestAnimationFrame=nativeRAF;if(pendingFrame)nativeRAF(pendingFrame);button.disabled=false;}
};
})();

(()=>{const b=document.createElement('button');b.textContent='Watch live duel';document.getElementById('qaPanel').append(b);b.onclick=()=>{window.__forceInput=true;document.getElementById('playButton').click();document.getElementById('qaPanel').style.display='none';const raf=window.requestAnimationFrame;let cb;window.requestAnimationFrame=f=>{cb=f;return 0};let t=0;const timer=setInterval(()=>{t++;if(t%22===0){window.__aimInject(-80,0);dispatchEvent(new MouseEvent('mousedown',{button:0}));dispatchEvent(new MouseEvent('mouseup',{button:0}));}window.__tickN(3);window.__renderOnce(.05)},50);addEventListener('keydown',function stop(e){if(e.key==='Escape'){clearInterval(timer);window.__forceInput=false;window.requestAnimationFrame=raf;if(cb)raf(cb);removeEventListener('keydown',stop)}});};})();