import { Injectable } from '@angular/core';
@Injectable({ providedIn: 'root' })
export class Activity {
  private visit = crypto.randomUUID();
  constructor() { this.record('heartbeat'); setInterval(() => { if (document.visibilityState === 'visible') this.record('heartbeat'); }, 30000); }
  record(type: 'upload'|'heartbeat'): void {
    void fetch('/api/activity', { method:'POST', headers: { 'Content-Type':'application/json','X-SmartWall-Request':'1' }, body: JSON.stringify({ type,visit:this.visit }) }).catch(()=>{});
  }
}
