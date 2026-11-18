export const SKILLS={farming:'Farming',forestry:'Forestry',excavation:'Excavation',mining:'Mining',masonry:'Masonry',smelting:'Smelting',smithing:'Smithing',logistics:'Logistics'};
export const ROLE_SKILL={farmer:'farming',forester:'forestry',clayworker:'excavation',miner:'mining',brickmaker:'masonry',smelter:'smelting',smith:'smithing'};
export const skillLevel=xp=>Math.min(50,1+Math.floor(Math.sqrt(Math.max(0,xp)/100)));
export const nextSkillXP=xp=>skillLevel(xp)>=50?null:100*skillLevel(xp)**2;
export function awardSkill(actor,skill,xp){if(!Object.hasOwn(SKILLS,skill)||!Number.isSafeInteger(xp)||xp<0||xp>1000)throw Error('Invalid earned experience');actor.skills??={};actor.skills[skill]=Math.min(10000000,(actor.skills[skill]||0)+xp);return skillLevel(actor.skills[skill]);}
export function workSeconds(actor,role,base){const skill=ROLE_SKILL[role],level=skillLevel(actor.skills?.[skill]||0);return base/(1+Math.min(.25,(level-1)*.01));}
export function awardProduction(actor,role,baseSeconds){const skill=ROLE_SKILL[role];if(skill)awardSkill(actor,skill,Math.max(1,Math.round(baseSeconds)));}
export function awardDelivery(actor,payload,origin,destination){if(!origin)return;const units=Object.values(payload).reduce((n,v)=>n+v,0),distance=Math.hypot(origin.x-destination.x,origin.z-destination.z);if(units>0&&distance>=3)awardSkill(actor,'logistics',Math.min(100,Math.max(1,Math.floor(distance/5))*Math.max(1,Math.floor(units/4))));}
export function assertProgression(actor){for(const[k,v]of Object.entries(actor.skills||{}))if(!Object.hasOwn(SKILLS,k)||!Number.isSafeInteger(v)||v<0||v>10000000)throw Error('Invalid skill ledger');}
