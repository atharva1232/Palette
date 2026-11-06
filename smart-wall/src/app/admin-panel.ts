import { Component, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Catalogue } from './catalogue';
import { patternStyles, patternBackground, WallPattern } from './catalog';

@Component({
  selector: 'app-admin-panel', imports: [FormsModule, DatePipe, DecimalPipe], styleUrl: './admin-panel.css',
  template: `
  <section class="admin-page"><span class="eyebrow">SMARTWALL MANAGEMENT</span><h1>Studio control.</h1><p>Manage the catalogue, accounts and service. Private design reviews are recorded in the audit log.</p>
  <nav aria-label="Admin sections">@for (item of tabs; track item) { <button type="button" [class.active]="tab === item" (click)="tab=item; load()">{{ item }}</button> }</nav>
  @if (error()) { <p class="error" role="alert">{{ error() }}</p> } @if (message()) { <p role="status">{{ message() }}</p> }
  <button type="button" (click)="load()" [disabled]="busy()">Refresh</button>
  @if (tab === 'Overview' && overview()) {
    <p>Refreshes every 15 seconds · Measured {{ overview().measuredAt | date:'medium' }}</p>
    <div class="metrics"><article><span>Accounts</span><strong>{{ overview().users }}</strong></article><article><span>Room uploads*</span><strong>{{ overview().uploads }}</strong></article><article><span>Design saves*</span><strong>{{ overview().saves }}</strong></article><article><span>Current designs</span><strong>{{ overview().currentDesigns }}</strong></article><article><span>Average active visit</span><strong>{{ overview().averageSessionSeconds | number:'1.0-0' }} s</strong></article><article><span>Ease / accuracy</span><strong>{{ overview().feedback.ease | number:'1.1-1' }} / {{ overview().feedback.accuracy | number:'1.1-1' }}</strong><small>{{ overview().feedback.count }} responses</small></article></div>
    <p>* Activity counts cover the last 90 days from instrumentation onward. Uploads are browser-reported successful photo loads, including samples/reopened photos. Imported historical saves are excluded. Active time estimates visible-page heartbeats; ratings use a 1–5 scale.</p>
    <h2>Recent activity</h2><ul>@for (event of overview().recent; track $index) { <li>{{ event.type }} · {{ event.createdAt | date:'medium' }}</li> } @empty { <li>No recorded activity yet.</li> }</ul>
  }
  @if (tab === 'Colours') {
    <div class="management-grid"><form (ngSubmit)="saveColour()"><h2>{{ colour.id ? 'Edit shade' : 'Add shade' }}</h2><label>Name<input name="colourName" [(ngModel)]="colour.name" required maxlength="80" /></label><label>HEX<input name="hex" type="color" [(ngModel)]="colour.hex" /></label><label>Family<input name="family" [(ngModel)]="colour.family" required maxlength="80" /></label><label>Brand / manufacturer<input name="brand" [(ngModel)]="colour.brand" required maxlength="80" /></label><label>Available finishes<select name="finishes" multiple [(ngModel)]="colour.finishes"><option>Matte</option><option>Satin</option><option>Gloss</option></select></label><label class="check"><input type="checkbox" name="active" [(ngModel)]="colour.active" /> Available in catalogue</label><button [disabled]="busy()">Save shade</button><button type="button" (click)="resetColour()">New shade</button></form>
    <div class="catalog-list">@for (c of colours(); track c.id) { <article><span class="swatch" [style.background]="c.hex"></span><div><strong>{{ c.name }}</strong><p>{{ c.hex }} · {{ c.brand }} · {{ c.active === false ? 'Archived' : 'Available' }}</p></div><button type="button" (click)="editColour(c)">Edit</button><button type="button" (click)="archive('colours',c.id)" [disabled]="c.active === false">Archive</button></article> }</div></div>
  }
  @if (tab === 'Patterns') {
    <div class="management-grid"><form (ngSubmit)="savePattern()"><h2>{{ pattern.id ? 'Edit pattern' : 'Add pattern' }}</h2><label>Name<input name="patternName" [(ngModel)]="pattern.name" required maxlength="60" /></label><label>Description<textarea name="description" [(ngModel)]="pattern.description" maxlength="500"></textarea></label><label>Style<select name="style" [(ngModel)]="pattern.style">@for (s of styles; track s) { <option>{{ s }}</option> }</select></label><label>Background<input type="color" name="base" [(ngModel)]="pattern.base" /></label><label>Motif<input type="color" name="ink" [(ngModel)]="pattern.ink" /></label><label>Scale<input type="range" name="scale" min="16" max="96" step="4" [(ngModel)]="pattern.scale" /></label><div class="pattern-preview" [style.background]="background(pattern)"></div><label class="check"><input type="checkbox" name="patternActive" [(ngModel)]="pattern.active" /> Available in catalogue</label><button [disabled]="busy()">Save pattern</button><button type="button" (click)="resetPattern()">New pattern</button></form>
    <div class="catalog-list">@for (p of patterns(); track p.id) { <article><span class="swatch" [style.background]="background(p)"></span><div><strong>{{ p.name }}</strong><p>{{ p.style }} · {{ p.active === false ? 'Archived' : 'Available' }}</p></div><button type="button" (click)="editPattern(p)">Edit</button><button type="button" (click)="archive('patterns',p.id)" [disabled]="p.active === false">Archive</button></article> }</div></div>
  }
  @if (tab === 'Users') { <div class="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Verified</th><th>Designs</th><th>Status</th><th>Action</th></tr></thead><tbody>@for (u of users(); track u.id) { <tr><td>{{ u.name }}<small>{{ u.email }}</small></td><td>{{ u.role }}</td><td>{{ u.emailVerified ? 'Yes' : 'No' }}</td><td>{{ u.designs }}</td><td>{{ u.disabled ? 'Disabled' : 'Active' }}</td><td>@if (u.role !== 'admin') { <button type="button" (click)="setDisabled(u)">{{ u.disabled ? 'Enable' : 'Disable' }}</button> }</td></tr> }</tbody></table></div> }
  @if (tab === 'Designs') { <label>Reason for private design review<input [(ngModel)]="reviewReason" maxlength="300" placeholder="e.g. Investigating a reported saving problem" /></label><p>Only open a room photo when needed for the stated review. Each access is logged.</p><div class="catalog-list">@for (p of projects(); track p.userId + p.id) { <article><div><strong>{{ p.name }}</strong><p>Owner {{ p.userId }} · {{ p.savedAt | date:'medium' }}</p></div><button type="button" (click)="review(p)" [disabled]="!reviewReason.trim()">Review design</button></article> }</div>@if (reviewed()) { <div class="review"><button type="button" (click)="reviewed.set(null)">Close private review</button><h2>{{ reviewed().name }}</h2><div class="review-images"><figure><img [src]="'data:' + reviewed().photoType + ';base64,' + reviewed().photo" alt="Original room photo for authorized review" /><figcaption>Original</figcaption></figure><figure><img [src]="'data:image/png;base64,' + reviewed().preview" alt="Saved painted room for authorized review" /><figcaption>Saved design</figcaption></figure></div></div> } }
  @if (tab === 'Feedback') { <ul>@for (f of feedback(); track f._id) { <li><strong>{{ f.device }} · Ease {{ f.ease }}/5 · Accuracy {{ f.accuracy }}/5</strong><p>{{ f.comment || 'No comment' }}</p><small>{{ f.createdAt | date:'medium' }}</small></li> } @empty { <li>No feedback yet.</li> }</ul> }
  @if (tab === 'Settings') { <form (ngSubmit)="saveSettings()"><h2>System settings</h2><label>Website name<input name="siteName" [(ngModel)]="settings.siteName" maxlength="60" required /></label><label class="check"><input name="maintenance" type="checkbox" [(ngModel)]="settings.maintenance" /> Show maintenance notice</label><label class="check"><input name="publishing" type="checkbox" [(ngModel)]="settings.allowPublishing" /> Allow community pattern publishing</label><button [disabled]="busy()">Save settings</button></form> }
  @if (tab === 'Audit') { <ul>@for (a of audits(); track a._id) { <li><strong>{{ a.action }}</strong><p>Actor {{ a.actor }} · {{ a.createdAt | date:'medium' }}</p><pre>{{ format(a.target) }}</pre></li> } @empty { <li>No admin actions yet.</li> }</ul> }
  </section>`
})
export class AdminPanel implements OnDestroy {
  private http=inject(HttpClient); private catalogue=inject(Catalogue);
  tabs=['Overview','Colours','Patterns','Users','Designs','Feedback','Settings','Audit']; tab='Overview';
  error=signal(''); message=signal(''); busy=signal(false); overview=signal<any>(null);
  colours=signal<any[]>([]); patterns=signal<any[]>([]); users=signal<any[]>([]); projects=signal<any[]>([]); feedback=signal<any[]>([]); audits=signal<any[]>([]); reviewed=signal<any>(null);
  reviewReason=''; styles=patternStyles; background=patternBackground;
  colour:any={}; pattern:any={}; settings={siteName:'SmartWall',maintenance:false,allowPublishing:true};
  private timer= setInterval(()=>{ if(this.tab==='Overview' && document.visibilityState==='visible') void this.load(); },15000);
  constructor(){this.resetColour();this.resetPattern();void this.load();}
  format(value:unknown):string { return JSON.stringify(value); }
  resetColour():void {this.colour={name:'',hex:'#713343',family:'Neutrals',brand:'SmartWall concept palette',finishes:['Matte'],active:true};}
  resetPattern():void {this.pattern={name:'',description:'',style:'Stripes',base:'#f0e8db',ink:'#713343',scale:40,active:true};}
  editColour(c:any):void{this.colour=structuredClone(c);}
  editPattern(p:any):void{this.pattern=structuredClone(p);}
  async load():Promise<void>{
    this.error.set('');
    try {
      const get=(path:string)=>firstValueFrom(this.http.get<any>('/api/admin/'+path));
      if(this.tab==='Overview')this.overview.set(await get('overview'));
      if(['Colours','Patterns'].includes(this.tab)){const c=await get('catalog');this.colours.set(c.colours);this.patterns.set(c.patterns);}
      if(this.tab==='Users')this.users.set(await get('users'));
      if(this.tab==='Designs')this.projects.set(await get('projects'));
      if(this.tab==='Feedback')this.feedback.set(await get('feedback'));
      if(this.tab==='Audit')this.audits.set(await get('audit'));
      if(this.tab==='Settings')this.settings=await firstValueFrom(this.http.get<any>('/api/settings'));
    }catch(e:any){this.error.set(e?.error?.error||'Could not load administration data.');}
  }
  private async save(path:string,value:unknown):Promise<void>{if(this.busy())return;this.busy.set(true);this.error.set('');try{const result:any=await firstValueFrom(this.http.post('/api/admin/'+path,value));if(path==='colours')this.colour.id=result.id;if(path==='patterns')this.pattern.id=result.id;this.message.set('Changes saved.');this.catalogue.refresh();await this.load();}catch(e:any){this.error.set(e?.error?.error||'Changes could not be saved.');}finally{this.busy.set(false);}}
  saveColour():void{void this.save('colours',this.colour);}
  savePattern():void{void this.save('patterns',this.pattern);}
  saveSettings():void{void this.save('settings',this.settings);}
  setDisabled(u:any):void{if(confirm(`${u.disabled?'Enable':'Disable'} ${u.name}? Disabling signs out their sessions.`))void this.save('users/'+u.id,{disabled:!u.disabled});}
  async archive(kind:string,id:string):Promise<void>{if(!confirm('Remove this item from the available catalogue? Existing saved designs keep their appearance.'))return;try{await firstValueFrom(this.http.delete('/api/admin/'+kind+'/'+id));this.catalogue.refresh();await this.load();}catch(e:any){this.error.set(e?.error?.error||'Could not archive item.');}}
  async review(p:any):Promise<void>{try{this.reviewed.set(await firstValueFrom(this.http.post('/api/admin/projects/'+p.userId+'/'+p.id+'/review',{reason:this.reviewReason})));}catch(e:any){this.error.set(e?.error?.error||'Review failed.');}}
  ngOnDestroy():void{clearInterval(this.timer);this.reviewed.set(null);}
}
