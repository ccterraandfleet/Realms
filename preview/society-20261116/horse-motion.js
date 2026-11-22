export function horseMotion(speed,turnRate,feeding,clips){const velocity=Math.max(Math.abs(speed),Math.abs(turnRate)*.6);const clip=velocity>.15?(velocity>4?'Gallop':'Walk'):feeding?'Eating':'Idle';const reference=clips?.[clip]?.referenceSpeed;const timeScale=['Idle','Eating'].includes(clip)?1:Math.max(.1,Math.min(3,velocity/(reference||1)))*(speed<-.05?-1:1);return{clip,timeScale};}
export function hoofSamples(metric,time){if(!metric?.frames?.length)return null;const n=metric.frames.length,t=((time/metric.duration)%1+1)%1*n,i=Math.floor(t),u=t-i,a=metric.frames[i],b=metric.frames[(i+1)%n];return a.map((p,k)=>p.map((v,j)=>v+(b[k][j]-v)*u));}
// Advance locomotion by actual rendered travel, not a capped display clock.
export function horseAnimationFrame(distance,speed,angle,dt,lastSpeed,eating,clips){
 if(distance>1e-5){const moving=Math.abs(speed)>.05?speed:Math.abs(lastSpeed||0)>.05?lastSpeed:Math.sign(speed||1)*.4,plan=horseMotion(moving,0,false,clips),reference=clips?.[plan.clip]?.referenceSpeed||(plan.clip==='Gallop'?5.15:1.237);return{...plan,delta:distance/(Math.abs(plan.timeScale)*reference),lastSpeed:moving};}
 if(Math.abs(angle)>1e-5){const plan=horseMotion(0,Math.min(1.2,Math.abs(angle)/Math.max(.001,dt)),false,clips),reference=clips?.Walk?.referenceSpeed||1.237;return{...plan,delta:Math.abs(angle)*.6/(Math.abs(plan.timeScale)*reference),lastSpeed:lastSpeed||0};}
 return{...horseMotion(0,0,eating,clips),delta:dt,lastSpeed:lastSpeed||0};
}
