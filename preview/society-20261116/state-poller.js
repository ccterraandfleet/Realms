// Serialize snapshots. A mutation must not settle on a read started before it.
export function createStatePoller(load,apply){
 let inFlight=null;
 function start(){const task=Promise.resolve().then(load).then(value=>{apply(value);return value;}).finally(()=>{if(inFlight===task)inFlight=null;});inFlight=task;return task;}
 return{
  get pending(){return inFlight!==null;},
  async poll(fresh=false){
   const older=inFlight;
   if(fresh&&older)await older.catch(()=>{});
   return inFlight||start();
  }
 };
}
