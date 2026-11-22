// Each patch owns a contiguous 6-by-4 block of the field's existing stalks.
export function patchForStalk(i){return Math.floor(i%30/6)+5*Math.floor(Math.floor(i/30)/4);}
export function patchSite(h,off,id){return{x:h.x+off[0]-7.1+(id%5*6+2.5)*.48,z:h.z+off[1]-5.6+(Math.floor(id/5)*4+1.5)*.57};}
// Previous saves used a numeric ready time. Preserve the remaining growth time.
export function cropStage(h,k,time){const v=h.harvested?.[k];if(v==null)return 'ripe';if(v==='bare')return 'bare';const ready=typeof v==='number'?v:v.ready;if(time>=ready)return 'ripe';return ready-time>45?'shoots':'green';}
export function reservePatch(s,h,a){const used=new Set(Object.values(s.actors).filter(b=>b!==a&&b.house===h.id&&b.work?.phase!=='deliver').map(b=>b.work?.patch));const first=Number(a.id.split(':').pop())%25;for(const stage of ['bare','ripe'])for(let n=0;n<25;n++){const i=(first+n)%25;if(!used.has(i)&&cropStage(h,i,s.time)===stage)return i;}return null;}
