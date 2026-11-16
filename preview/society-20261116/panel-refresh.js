// Keep active controls alive while the world continues to update.
export class PanelRefreshGuard{
 constructor(){this.html=null;this.held=false;this.until=0;}
 begin(){this.held=true;}
 end(now){this.held=false;this.until=now+250;}
 allowed(now){return !this.held&&now>=this.until;}
 changed(html,sameTab){return !sameTab||this.html!==html;}
 committed(html){this.html=html;}
}
