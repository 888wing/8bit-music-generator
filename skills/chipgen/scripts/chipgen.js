#!/usr/bin/env node
/* chipgen.js — 8-bit 音樂／音效 headless 產生器（零依賴，node >= 16）
   與瀏覽器版共用同一套種子與樂曲/音效參數生成邏輯；DSP 為同規格獨立實作。
   stdout 只輸出 JSON manifest（agent 友善），錯誤走 stderr。 */
'use strict';
const fs=require('fs'),path=require('path');

//===PURE-START===（與瀏覽器版一致）
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const pick=(r,arr)=>arr[Math.floor(r()*arr.length)];
const irnd=(r,n)=>Math.floor(r()*n);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mtof=m=>440*Math.pow(2,(m-69)/12);

const KEYS=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const SCALES={major:[0,2,4,5,7,9,11],minor:[0,2,3,5,7,8,10],dorian:[0,2,3,5,7,9,10],harm:[0,2,3,5,7,8,11]};
const SCALE_CN={major:'大調',minor:'小調',dorian:'多利安',harm:'和聲小調'};

const MOODS={
  adventure:{label:'冒險旅程',scale:'major',bpm:[142,164],
    progs:[[0,4,5,3],[0,3,0,4],[0,5,3,4],[3,4,0,0]],
    rhythms:[[3,3,2,4,4],[2,2,4,4,2,2],[4,2,2,4,-2,2],[2,2,2,2,4,4],[6,2,4,4]],
    p2:'arp',arpPat:[0,1,2,1],arpRate:2,bass:'oct8',drums:'drive',duty1:.5,duty2:.25,gate:.9},
  battle:{label:'戰鬥',scale:'minor',bpm:[168,188],
    progs:[[0,5,6,4],[0,3,6,4],[0,6,0,4],[0,5,3,4]],
    rhythms:[[2,2,2,2,2,2,4],[2,2,4,2,2,2,2],[2,-2,2,2,2,2,4],[4,2,2,2,2,2,2],[2,2,2,2,8]],
    p2:'arp',arpPat:[0,2,1,2],arpRate:1,bass:'pump',drums:'battle',duty1:.25,duty2:.125,gate:.8},
  town:{label:'村莊／日常',scale:'major',bpm:[104,124],
    progs:[[0,5,3,4],[0,3,4,4],[0,5,1,4],[0,1,3,4]],
    rhythms:[[4,2,2,4,4],[4,4,4,4],[6,2,4,4],[4,2,2,8],[3,3,2,8]],
    p2:'offbeat',arpPat:[0,1,2,1],arpRate:2,bass:'walk',drums:'soft',duty1:.5,duty2:.5,gate:.95},
  dungeon:{label:'地城／神祕',scale:'dorian',bpm:[92,112],
    progs:[[0,6,5,6],[0,2,0,6],[0,6,0,4],[0,3,6,5]],
    rhythms:[[6,2,4,4],[4,4,8],[8,4,4],[4,-4,4,4],[2,2,4,8]],
    p2:'pad',arpPat:[0,1,2,1],arpRate:2,bass:'half',drums:'sparse',duty1:.125,duty2:.25,gate:.95},
  sad:{label:'哀傷',scale:'minor',bpm:[76,92],
    progs:[[0,5,2,6],[0,3,5,6],[0,5,0,4],[0,2,5,4]],
    rhythms:[[8,4,4],[4,4,8],[6,2,8],[12,4],[4,8,4]],
    p2:'pad',arpPat:[0,1,2,1],arpRate:2,bass:'half',drums:'faint',duty1:.5,duty2:.25,gate:.98},
  boss:{label:'魔王戰',scale:'harm',bpm:[176,196],
    progs:[[0,1,0,4],[0,5,1,4],[0,3,1,4],[0,6,1,4]],
    rhythms:[[2,2,2,2,2,2,2,2],[2,2,2,2,4,2,2],[2,2,2,-2,2,2,4],[4,2,2,2,2,4]],
    p2:'arp',arpPat:[0,1,2,3],arpRate:1,bass:'pump',drums:'boss',duty1:.125,duty2:.25,gate:.8},
};

const DRUMPATS={
  drive:{k:'x...x...x...x...',s:'....x.......x...',h:'x.x.x.x.x.x.x.x.',vel:1},
  battle:{k:'x..x....x..x....',s:'....x.......x...',h:'x.x.x.x.x.x.x.x.',vel:1},
  soft:{k:'x.......x.......',s:'....x.......x...',h:'..x...x...x...x.',vel:.85},
  sparse:{k:'x.........x.....',s:'........x.......',h:'x...x...x...x...',vel:.7},
  faint:{k:'x...............',s:'........x.......',h:'................',vel:.5},
  boss:{k:'x...x...x...x..x',s:'....x.......x...',h:'x.x.x.x.x.x.x.xo',vel:1},
};

function idxToSemi(scale,idx){const o=Math.floor(idx/7);const m=((idx%7)+7)%7;return scale[m]+12*o;}
function chordTones(scale,deg){
  const t=[deg,deg+2,deg+4].map(i=>scale[i%7]+12*Math.floor(i/7));
  return [t[0],t[1],t[2],t[0]+12];
}
function isChordIdx(deg,idx){const m=((idx%7)+7)%7;return m===deg%7||m===(deg+2)%7||m===(deg+4)%7;}
function snapChord(deg,idx,dir){
  for(let off=0;off<7;off++){
    const a=idx+(dir>=0?off:-off), b=idx+(dir>=0?-off:off);
    if(isChordIdx(deg,a))return a;
    if(isChordIdx(deg,b))return b;
  }
  return idx;
}
function makeMotif(r,rhythm){
  const ev=[];let pos=0;
  for(const d of rhythm){
    if(d<0){pos+=-d;continue;}
    const strong=pos%8===0;
    const delta=strong?pick(r,[-2,-1,0,0,1,2]):pick(r,[-2,-1,-1,0,1,1,2]);
    ev.push({pos,d,strong,delta});
    pos+=d;
  }
  return ev;
}
function renderMotif(motif,deg,cur,lo,hi){
  const out=[];
  for(const e of motif){
    let idx=clamp(cur.v+e.delta,lo,hi);
    if(e.strong)idx=clamp(snapChord(deg,idx,e.delta>=0?1:-1),lo,hi);
    cur.v=idx;
    out.push({pos:e.pos,d:e.d,idx,strong:e.strong});
  }
  return out;
}
function genMelody(r,mood,prog,bars,scale){
  const lo=-2,hi=12;
  const rhA=pick(r,mood.rhythms),rhB=pick(r,mood.rhythms);
  const mA=makeMotif(r,rhA),mB=makeMotif(r,rhB);
  const cur={v:pick(r,[2,4,7])};
  const notes=[];
  for(let b=0;b<bars;b++){
    const deg=prog[b];
    if(b===bars-1){
      const pre=clamp(snapChord(deg,cur.v,-1),lo,hi);
      let root=Math.round(pre/7)*7;
      if(Math.abs(root+7-pre)<Math.abs(root-pre))root+=7;
      root=clamp(root,lo,hi);
      notes.push({s:b*16,d:8,idx:pre,v:.9});
      notes.push({s:b*16+8,d:8,idx:root,v:.95});
      continue;
    }
    const base=(b%4===2)?mB:mA;
    const mm=base.map(e=>({...e}));
    if(b>=4&&r()<0.3){const i=irnd(r,mm.length);mm[i].delta=clamp(mm[i].delta+pick(r,[-1,1]),-3,3);}
    for(const n of renderMotif(mm,deg,cur,lo,hi)){
      notes.push({s:b*16+n.pos,d:n.d,idx:n.idx,v:n.strong?.95:.72+r()*.14});
    }
  }
  return notes;
}
function genPulse2(r,mood,prog,bars,scale,rootAdj){
  const base=60+rootAdj,notes=[];
  for(let b=0;b<bars;b++){
    const ct=chordTones(scale,prog[b]);
    if(mood.p2==='arp'){
      const pat=mood.arpPat,step=mood.arpRate;
      for(let i=0;i<16;i+=step){
        notes.push({s:b*16+i,d:step,m:base+ct[pat[(i/step)%pat.length]],v:i%4===0?.72:.58});
      }
    }else if(mood.p2==='offbeat'){
      for(let i=0;i<4;i++)notes.push({s:b*16+2+i*4,d:2,m:base+ct[i%2?2:1],v:.6});
    }else{
      notes.push({s:b*16,d:8,m:base+ct[1],v:.5});
      notes.push({s:b*16+8,d:8,m:base+ct[2],v:.48});
    }
  }
  return notes;
}
function genBass(r,mood,prog,bars,scale,rootAdj){
  const notes=[];
  for(let b=0;b<bars;b++){
    const ct=chordTones(scale,prog[b]);
    let root=36+rootAdj+ct[0];
    while(root>47)root-=12;
    while(root<33)root+=12;
    const fifth=root+7>49?root-5:root+7;
    if(mood.bass==='oct8'){
      [0,0,12,0,0,12,0,12].forEach((p,i)=>notes.push({s:b*16+i*2,d:2,m:root+p,v:i%4===0?.9:.75}));
    }else if(mood.bass==='pump'){
      for(let i=0;i<8;i++)notes.push({s:b*16+i*2,d:2,m:i===7?root-5:root,v:i%4===0?.95:.8});
    }else if(mood.bass==='walk'){
      [root,fifth,root+12>49?root:root+12,fifth].forEach((m,i)=>notes.push({s:b*16+i*4,d:4,m,v:i===0?.9:.78}));
    }else{
      notes.push({s:b*16,d:8,m:root,v:.85});
      notes.push({s:b*16+8,d:8,m:fifth,v:.72});
    }
  }
  return notes;
}
function genDrums(r,mood,bars){
  const p=DRUMPATS[mood.drums],ev=[],dv=p.vel;
  for(let b=0;b<bars;b++){
    const fill=b%4===3;
    for(let i=0;i<16;i++){
      const s=b*16+i;
      if(p.k[i]==='x')ev.push({s,t:'k',v:.95*dv});
      if(p.s[i]==='x')ev.push({s,t:'s',v:.9*dv});
      if(fill&&dv>=.85&&(i===14||i===15))ev.push({s,t:'s',v:.68*dv});
      const h=p.h[i];
      if(h==='x')ev.push({s,t:'h',v:(i%4===0?.5:.32)*dv});
      else if(h==='o')ev.push({s,t:'o',v:.5*dv});
    }
  }
  return ev;
}
function generateSong(opts){
  const seed=opts.seed>>>0;
  const r=mulberry32(seed);
  const mood=MOODS[opts.mood];
  const scale=SCALES[mood.scale];
  const rootPc=opts.key==='random'?irnd(r,12):KEYS.indexOf(opts.key);
  const rootAdj=rootPc>6?rootPc-12:rootPc;
  const bpm=opts.bpm||Math.round(mood.bpm[0]+r()*(mood.bpm[1]-mood.bpm[0]));
  const bars=opts.bars;
  const progA=pick(r,mood.progs);
  let progB=pick(r,mood.progs);
  if(progB===progA)progB=pick(r,mood.progs);
  const prog=[];
  for(let b=0;b<bars;b++){
    const phrase=Math.floor(b/4);
    const useB=bars>=16&&phrase%4===2;
    prog.push((useB?progB:progA)[b%4]);
  }
  const melBase=72+rootAdj;
  const mel=genMelody(r,mood,prog,bars,scale).map(n=>({s:n.s,d:n.d,m:melBase+idxToSemi(scale,n.idx),v:n.v}));
  const p2=genPulse2(r,mood,prog,bars,scale,rootAdj);
  const bass=genBass(r,mood,prog,bars,scale,rootAdj);
  const drums=genDrums(r,mood,bars);
  return {seed,bpm,bars,rootPc,mood:opts.mood,scaleName:mood.scale,tracks:{p1:mel,p2,bass,drums}};
}
function songToMidi(song){
  const TPQ=480,T16=120;
  const out=[];
  const append=(a,b)=>{for(const x of b)a.push(x)};
  const str=s=>s.split('').map(c=>c.charCodeAt(0));
  const u32=n=>[n>>>24&255,n>>>16&255,n>>>8&255,n&255];
  const vlq=(a,n)=>{const s=[];do{s.push(n&127);n=Math.floor(n/128)}while(n>0);for(let i=s.length-1;i>0;i--)a.push(s[i]|128);a.push(s[0]);};
  function trackChunk(events){
    const d=[];let last=0;
    for(const e of events){vlq(d,e.tick-last);last=e.tick;append(d,e.bytes);}
    vlq(d,0);d.push(0xFF,0x2F,0x00);
    const c=[];append(c,str('MTrk'));append(c,u32(d.length));append(c,d);
    return c;
  }
  append(out,str('MThd'));append(out,u32(6));out.push(0,1,0,5,TPQ>>8&255,TPQ&255);
  const mpq=Math.round(60000000/song.bpm);
  append(out,trackChunk([
    {tick:0,pr:-1,bytes:[0xFF,0x58,0x04,4,2,24,8]},
    {tick:0,pr:-1,bytes:[0xFF,0x51,0x03,mpq>>16&255,mpq>>8&255,mpq&255]},
  ]));
  const chans=[['p1',0,80,'Pulse 1 Lead'],['p2',1,80,'Pulse 2 Harmony'],['bass',2,38,'Triangle Bass'],['drums',9,0,'Noise Drums']];
  const DRMAP={k:36,s:38,h:42,o:46};
  for(const [key,ch,prg,name] of chans){
    const evs=[{tick:0,pr:-1,bytes:[0xFF,0x03,name.length].concat(str(name))}];
    if(ch!==9)evs.push({tick:0,pr:-1,bytes:[0xC0|ch,prg]});
    for(const n of song.tracks[key]){
      const isD=key==='drums';
      const note=isD?DRMAP[n.t]:n.m;
      const vel=clamp(Math.round(20+n.v*100),1,127);
      const on=n.s*T16;
      const durT=isD?40:Math.max(20,n.d*T16-10);
      evs.push({tick:on,pr:1,bytes:[0x90|ch,note,vel]});
      evs.push({tick:on+durT,pr:0,bytes:[0x80|ch,note,0]});
    }
    evs.sort((a,b)=>a.tick-b.tick||a.pr-b.pr);
    append(out,trackChunk(evs));
  }
  return new Uint8Array(out);
}
function songDur(song){return song.bars*16*(60/song.bpm/4);}

const SFX_CATS={
  coin:{label:'金幣／拾取'},jump:{label:'跳躍'},laser:{label:'雷射／射擊'},hit:{label:'受擊'},
  explosion:{label:'爆炸'},powerup:{label:'強化'},blip:{label:'介面嗶聲'},fall:{label:'下墜／失敗'},
};
function genSfx(cat,seed){
  seed=seed>>>0;
  if(cat==='random'){
    const rr=mulberry32(seed^0xA5A5);
    cat=pick(rr,Object.keys(SFX_CATS));
  }
  const r=mulberry32(seed);
  const p={cat,seed,wave:'pulse',duty:.5,f0:440,mode:'none',f1:0,slideT:0,curve:'exp',
           steps:null,vib:null,env:{att:.001,sus:.05,dec:.2,punch:0},vol:.55,
           nRate0:1,nRate1:1,filt:null};
  switch(cat){
    case 'coin':
      p.f0=mtof(pick(r,[83,84,86,88,89,91]));
      p.mode='steps';
      p.steps=[{t:.06+r()*.03,semi:pick(r,[5,7,12])}];
      p.env={att:.001,sus:.07+r()*.05,dec:.15+r()*.15,punch:.4};
      break;
    case 'laser':
      p.duty=pick(r,[.125,.25]);
      p.f0=mtof(72+irnd(r,18));
      p.mode='slide';p.f1=p.f0*(.06+r()*.12);p.slideT=.08+r()*.18;
      p.env={att:.001,sus:.02,dec:.06+r()*.1,punch:.25};
      p.vol=.5;break;
    case 'jump':
      p.duty=pick(r,[.5,.25]);
      p.f0=mtof(48+irnd(r,10));
      p.mode='slide';p.f1=p.f0*(2.1+r()*1.6);p.slideT=.12+r()*.12;p.curve='lin';
      p.env={att:.002,sus:.12,dec:.1+r()*.1,punch:.15};
      p.env.sus=p.slideT;
      break;
    case 'powerup':
      p.f0=mtof(60+irnd(r,10));
      if(r()<.5){
        const st=.055+r()*.035;
        const lad=pick(r,[[4,7,12],[3,7,12],[4,7,12,16],[5,9,12,17]]);
        p.mode='steps';
        p.steps=lad.map((s,i)=>({t:st*(i+1),semi:s}));
        p.env={att:.002,sus:st*(lad.length+1)+.03,dec:.2+r()*.2,punch:.2};
      }else{
        p.mode='slide';p.f1=p.f0*(2.5+r()*2);p.slideT=.35+r()*.25;p.curve='lin';
        p.vib={rate:9+r()*5,cents:80+r()*80};
        p.env={att:.002,sus:p.slideT,dec:.18+r()*.15,punch:.15};
      }
      break;
    case 'explosion':
      p.wave='noise';
      p.nRate0=.8+r()*.7;p.nRate1=.12+r()*.18;
      p.filt={type:'lowpass',f0:2200+r()*2200,f1:220+r()*280,q:.7};
      p.env={att:.002,sus:.04+r()*.1,dec:.35+r()*.55,punch:.6};
      p.vol=.7;break;
    case 'hit':
      if(r()<.5){
        p.wave='noise';p.nRate0=.6+r()*.3;p.nRate1=.2+r()*.15;
        p.filt={type:'lowpass',f0:1600+r()*900,f1:380+r()*220,q:.8};
        p.env={att:.001,sus:.012,dec:.07+r()*.08,punch:.5};
      }else{
        p.duty=.25;p.f0=mtof(55+irnd(r,10));
        p.mode='slide';p.f1=p.f0*.3;p.slideT=.07+r()*.05;
        p.env={att:.001,sus:.015,dec:.07+r()*.07,punch:.4};
      }
      p.vol=.6;break;
    case 'blip':
      p.wave=r()<.3?'tri':'pulse';
      p.f0=mtof(74+irnd(r,14));
      if(r()<.4){p.mode='steps';p.steps=[{t:.045,semi:pick(r,[12,7,-5])}];}
      p.env={att:.001,sus:.02+r()*.025,dec:.03+r()*.05,punch:.2};
      p.vol=.45;break;
    case 'fall':
      p.f0=mtof(69+irnd(r,8));
      p.mode='slide';p.f1=p.f0*.13;p.slideT=.5+r()*.35;p.curve='lin';
      p.vib={rate:7+r()*5,cents:60+r()*70};
      p.env={att:.003,sus:p.slideT,dec:.12+r()*.12,punch:.1};
      p.vol=.5;break;
  }
  return p;
}
function sfxDur(p){return p.env.att+p.env.sus+p.env.dec+.08;}
function variantSeed(seed,k){return (seed+0x9E3779B9*(k+1))>>>0;}
function sfxChildSeed(seed,k){return variantSeed(seed,k);}
//===PURE-END===

// ================= DSP（純 JS 逐取樣渲染，全 seeded、可重現）=================
function curve(segs){
  return t=>{
    if(t<=segs[0].t0)return segs[0].v0;
    for(const s of segs){
      if(t<=s.t1){
        if(t<=s.t0)return s.v0;
        const a=(t-s.t0)/(s.t1-s.t0);
        return s.ty==='exp'?s.v0*Math.pow(s.v1/s.v0,a):s.v0+(s.v1-s.v0)*a;
      }
    }
    return segs[segs.length-1].v1;
  };
}
function biquadCoef(type,f,Q,sr){
  f=Math.min(Math.max(f,10),sr*0.45);
  const w=2*Math.PI*f/sr,cs=Math.cos(w),sn=Math.sin(w),al=sn/(2*Q);
  let b0,b1,b2;
  if(type==='lowpass'){b0=(1-cs)/2;b1=1-cs;b2=b0;}
  else if(type==='highpass'){b0=(1+cs)/2;b1=-(1+cs);b2=b0;}
  else{b0=al;b1=0;b2=-al;}
  const a0=1+al,a1=-2*cs,a2=1-al;
  return [b0/a0,b1/a0,b2/a0,a1/a0,a2/a0];
}
function makeBiquad(c){
  let z1=0,z2=0;
  return {
    set(cc){c=cc;},
    p(x){const y=c[0]*x+z1;z1=c[1]*x-c[3]*y+z2;z2=c[2]*x-c[4]*y;return y;}
  };
}
function renderNoteInto(mono,sr,n){ // n:{t,dur,f0,vel,kind,duty,vib}
  const a=0.004,end=n.t+Math.max(n.dur,0.03);
  const sus=Math.max(n.t+a+0.005,end-0.02);
  const v=Math.max(n.vel,0.002);
  const env=curve([
    {t0:n.t,t1:n.t+a,v0:0.0001,v1:v,ty:'exp'},
    {t0:n.t+a,t1:sus,v0:v,v1:Math.max(v*0.82,0.002),ty:'lin'},
    {t0:sus,t1:end,v0:Math.max(v*0.82,0.002),v1:0.0008,ty:'exp'},
  ]);
  const vibEnd=n.t+Math.min(0.25,n.dur*0.5);
  const useVib=n.vib&&n.dur>0.22;
  let ph=0;
  const i0=Math.max(0,Math.floor(n.t*sr)),i1=Math.min(mono.length,Math.ceil((end+0.03)*sr));
  for(let i=i0;i<i1;i++){
    const t=i/sr;
    let f=n.f0;
    if(useVib){
      const d=t>=vibEnd?14:14*(t-n.t)/(vibEnd-n.t);
      f=n.f0*Math.pow(2,(d*Math.sin(2*Math.PI*5.6*(t-n.t)))/1200);
    }
    ph+=f/sr;const p=ph-Math.floor(ph);
    const s=n.kind==='pulse'?(p<n.duty?1:-1):(p<0.5?4*p-1:3-4*p);
    mono[i]+=s*env(t);
  }
}
function renderDrumInto(mono,sr,t,type,vel,noise){
  const nAt=i=>noise[i%noise.length];
  const i0=Math.max(0,Math.floor(t*sr));
  if(type==='k'){
    const fE=curve([{t0:t,t1:t+0.09,v0:150,v1:42,ty:'exp'}]);
    const gE=curve([{t0:t,t1:t+0.13,v0:vel,v1:0.001,ty:'exp'}]);
    let ph=0;
    const i1=Math.min(mono.length,Math.ceil((t+0.15)*sr));
    for(let i=i0;i<i1;i++){const tt=i/sr;ph+=fE(tt)/sr;const p=ph-Math.floor(ph);mono[i]+=(p<0.5?4*p-1:3-4*p)*gE(tt);}
    const bq=makeBiquad(biquadCoef('lowpass',2200,0.707,sr));
    const cE=curve([{t0:t,t1:t+0.02,v0:vel*0.4,v1:0.001,ty:'exp'}]);
    const j1=Math.min(mono.length,Math.ceil((t+0.03)*sr));
    for(let i=i0;i<j1;i++)mono[i]+=bq.p(nAt(i))*cE(i/sr);
  }else if(type==='s'){
    const bq=makeBiquad(biquadCoef('bandpass',1800,0.8,sr));
    const gE=curve([{t0:t,t1:t+0.11,v0:vel*0.9,v1:0.001,ty:'exp'}]);
    const i1=Math.min(mono.length,Math.ceil((t+0.13)*sr));
    for(let i=i0;i<i1;i++)mono[i]+=bq.p(nAt(i))*gE(i/sr);
    const fE=curve([{t0:t,t1:t+0.05,v0:210,v1:120,ty:'exp'}]);
    const oE=curve([{t0:t,t1:t+0.06,v0:vel*0.3,v1:0.001,ty:'exp'}]);
    let ph=0;
    const j1=Math.min(mono.length,Math.ceil((t+0.08)*sr));
    for(let i=i0;i<j1;i++){const tt=i/sr;ph+=fE(tt)/sr;const p=ph-Math.floor(ph);mono[i]+=(p<0.5?4*p-1:3-4*p)*oE(tt);}
  }else{
    const d=type==='o'?0.14:0.035;
    const bq=makeBiquad(biquadCoef('highpass',7500,0.707,sr));
    const gE=curve([{t0:t,t1:t+d,v0:vel*0.6,v1:0.001,ty:'exp'}]);
    const i1=Math.min(mono.length,Math.ceil((t+d+0.02)*sr));
    for(let i=i0;i<i1;i++)mono[i]+=bq.p(nAt(i))*gE(i/sr);
  }
}
function renderSongPCM(song,sr){
  const mood=MOODS[song.mood];
  const sp=60/song.bpm/4,off=0.05;
  const N=Math.ceil((songDur(song)+0.4)*sr);
  const noiseRng=mulberry32((song.seed^0xD12A)>>>0);
  const noise=new Float32Array(Math.floor(sr*1.2));
  for(let i=0;i<noise.length;i++)noise[i]=noiseRng()*2-1;
  const ch={p1:new Float32Array(N),p2:new Float32Array(N),bass:new Float32Array(N),drums:new Float32Array(N)};
  for(const n of song.tracks.p1)renderNoteInto(ch.p1,sr,{t:off+n.s*sp,dur:n.d*sp*mood.gate,f0:mtof(n.m),vel:n.v,kind:'pulse',duty:mood.duty1,vib:true});
  for(const n of song.tracks.p2)renderNoteInto(ch.p2,sr,{t:off+n.s*sp,dur:n.d*sp*0.85,f0:mtof(n.m),vel:n.v,kind:'pulse',duty:mood.duty2,vib:false});
  for(const n of song.tracks.bass)renderNoteInto(ch.bass,sr,{t:off+n.s*sp,dur:n.d*sp*0.9,f0:mtof(n.m),vel:n.v,kind:'tri',duty:0,vib:false});
  for(const n of song.tracks.drums)renderDrumInto(ch.drums,sr,off+n.s*sp,n.t,n.v,noise);
  return {ch,N};
}
const CH_MIX={p1:{g:0.30,pan:-0.22},p2:{g:0.20,pan:0.22},bass:{g:0.55,pan:0},drums:{g:0.42,pan:0.05}};
function panLR(pan){const x=(pan+1)*Math.PI/4;return [Math.cos(x),Math.sin(x)];}
function mixdown(ch,N){
  const stems={},L=new Float32Array(N),R=new Float32Array(N);
  for(const k in ch){
    const {g,pan}=CH_MIX[k];
    const [pl,pr]=panLR(pan);
    const sl=new Float32Array(N),sr2=new Float32Array(N);
    const src=ch[k];
    for(let i=0;i<N;i++){
      const v=src[i]*g*0.9;
      sl[i]=v*pl;sr2[i]=v*pr;
      L[i]+=v*pl;R[i]+=v*pr;
    }
    stems[k]=[sl,sr2];
  }
  let peak=0;
  for(let i=0;i<N;i++){const a=Math.abs(L[i]),b=Math.abs(R[i]);if(a>peak)peak=a;if(b>peak)peak=b;}
  const s=peak>0.891?0.891/peak:1;
  if(s!==1){
    for(let i=0;i<N;i++){L[i]*=s;R[i]*=s;}
    for(const k in stems){const[a,b]=stems[k];for(let i=0;i<N;i++){a[i]*=s;b[i]*=s;}}
  }
  return {mix:[L,R],stems,scale:s,peak};
}
function renderSfxPCM(p,sr){
  const dur=sfxDur(p)+0.1;
  const N=Math.ceil(dur*sr);
  const mono=new Float32Array(N);
  const e=p.env,t=0.02;
  const tA=t+e.att;
  const tP=tA+Math.min(0.03,e.sus*0.5+0.002);
  const tS=Math.max(tP+0.002,tA+e.sus);
  const tE=tS+e.dec;
  const env=curve([
    {t0:t,t1:tA,v0:0.0001,v1:p.vol*(1+e.punch),ty:'lin'},
    {t0:tA,t1:tP,v0:p.vol*(1+e.punch),v1:p.vol,ty:'lin'},
    {t0:tP,t1:tS,v0:p.vol,v1:p.vol,ty:'lin'},
    {t0:tS,t1:tE,v0:p.vol,v1:0.0008,ty:'exp'},
  ]);
  const iEnd=Math.min(N,Math.ceil((tE+0.05)*sr));
  const i0=Math.floor(t*sr);
  if(p.wave==='noise'){
    const rng=mulberry32((p.seed^0x5EED)>>>0);
    const rE=curve([{t0:t,t1:tE,v0:p.nRate0,v1:Math.max(p.nRate1,0.02),ty:'exp'}]);
    let acc=1,curN=0;
    let bq=null,fc=null;
    if(p.filt){
      fc=curve([{t0:t,t1:tE,v0:p.filt.f0,v1:Math.max(p.filt.f1,40),ty:'exp'}]);
      bq=makeBiquad(biquadCoef(p.filt.type,p.filt.f0,p.filt.q,sr));
    }
    for(let i=i0;i<iEnd;i++){
      const tt=i/sr;
      acc+=rE(tt);
      while(acc>=1){curN=rng()*2-1;acc-=1;}
      let s=curN;
      if(bq){
        if((i&31)===0)bq.set(biquadCoef(p.filt.type,fc(tt),p.filt.q,sr));
        s=bq.p(s);
      }
      mono[i]+=s*env(tt);
    }
  }else{
    let fE=null;
    if(p.mode==='slide')fE=curve([{t0:t,t1:t+p.slideT,v0:p.f0,v1:Math.max(p.f1,20),ty:p.curve==='exp'?'exp':'lin'}]);
    let ph=0;
    for(let i=i0;i<iEnd;i++){
      const tt=i/sr;
      let f=p.f0;
      if(p.mode==='slide')f=fE(tt);
      else if(p.mode==='steps'){for(const st of p.steps)if(tt>=t+st.t)f=p.f0*Math.pow(2,st.semi/12);}
      if(p.vib)f*=Math.pow(2,(p.vib.cents*Math.sin(2*Math.PI*p.vib.rate*(tt-t)))/1200);
      ph+=f/sr;const q=ph-Math.floor(ph);
      const s=p.wave==='pulse'?(q<p.duty?1:-1):(q<0.5?4*q-1:3-4*q);
      mono[i]+=s*env(tt);
    }
  }
  return mono;
}
function normalizeTo(chans,target){
  let peak=0;
  for(const c of chans)for(let i=0;i<c.length;i++){const a=Math.abs(c[i]);if(a>peak)peak=a;}
  if(peak<1e-6)return 1;
  const s=target/peak;
  for(const c of chans)for(let i=0;i<c.length;i++)c[i]*=s;
  return s;
}

// ================= WAV / .tres =================
function wavBuffer(chans,sr){
  const nCh=chans.length,len=chans[0].length;
  const bytes=44+len*nCh*2;
  const b=Buffer.alloc(bytes);
  b.write('RIFF',0);b.writeUInt32LE(bytes-8,4);b.write('WAVE',8);
  b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(nCh,22);
  b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*nCh*2,28);b.writeUInt16LE(nCh*2,32);b.writeUInt16LE(16,34);
  b.write('data',36);b.writeUInt32LE(len*nCh*2,40);
  let o=44;
  for(let i=0;i<len;i++)for(let c=0;c<nCh;c++){
    let s=chans[c][i];s=s<-1?-1:s>1?1:s;
    b.writeInt16LE(Math.round(s<0?s*32768:s*32767),o);o+=2;
  }
  return b;
}
function godotRandomizerTres(resPaths,pitch,volDb){
  const n=resPaths.length;
  let s='[gd_resource type="AudioStreamRandomizer" load_steps='+(n+1)+' format=3]\n\n';
  resPaths.forEach((p,i)=>{s+='[ext_resource type="AudioStream" path="'+p+'" id="'+(i+1)+'"]\n';});
  s+='\n[resource]\nplayback_mode = 0\nrandom_pitch = '+pitch+'\nrandom_volume_offset_db = '+volDb+'\nstreams_count = '+n+'\n';
  resPaths.forEach((p,i)=>{s+='stream_'+i+'/stream = ExtResource("'+(i+1)+'")\nstream_'+i+'/weight = 1.0\n';});
  return s;
}

// ================= CLI =================
function parseArgs(a){
  const o={_:[]};
  for(let i=0;i<a.length;i++){
    const x=a[i];
    if(x.startsWith('--')){
      const k=x.slice(2);
      if(i+1<a.length&&!a[i+1].startsWith('--'))o[k]=a[++i];
      else o[k]=true;
    }else o._.push(x);
  }
  return o;
}
function die(msg){process.stderr.write('chipgen: '+msg+'\n');process.exit(1);}
function outPath(dir,name){fs.mkdirSync(dir,{recursive:true});return path.join(dir,name);}
const USAGE=`chipgen — 8-bit 音樂／音效 headless 產生器（零依賴）

用法：
  node chipgen.js list
  node chipgen.js music --mood <${Object.keys(MOODS).join('|')}>
       [--key C..B|random] [--bars 8|16|32] [--seed N] [--bpm N]
       [--variants N] [--stems] [--midi] [--no-mix] [--sr 44100] [--out DIR]
  node chipgen.js sfx --cat <${Object.keys(SFX_CATS).join('|')}|random>
       [--seed N] [--variants N] [--no-normalize] [--sr 44100] [--out DIR]
       [--tres FILE.tres] [--res-prefix res://audio/sfx/] [--pitch 1.05] [--vol-db 2]

stdout 一律輸出 JSON manifest；同一組參數＋種子輸出 byte 級可重現。`;

function main(){
  const args=parseArgs(process.argv.slice(2));
  const cmd=args._[0];
  const sr=clamp(parseInt(args.sr,10)||44100,8000,96000);
  const outDir=typeof args.out==='string'?args.out:'.';

  if(!cmd||args.help){process.stderr.write(USAGE+'\n');process.exit(cmd?0:1);}

  if(cmd==='list'){
    const moods={};
    for(const [k,m] of Object.entries(MOODS))moods[k]={label:m.label,scale:m.scale,scale_cn:SCALE_CN[m.scale],bpm:m.bpm};
    const sfx={};
    for(const [k,c] of Object.entries(SFX_CATS))sfx[k]={label:c.label};
    console.log(JSON.stringify({moods,sfx,keys:KEYS.concat(['random']),bars:[8,16,32]},null,2));
    return;
  }

  if(cmd==='music'){
    const mood=args.mood||'adventure';
    if(!MOODS[mood])die('未知風格 "'+mood+'"（可用：'+Object.keys(MOODS).join(', ')+'）');
    const key=args.key||'random';
    if(key!=='random'&&!KEYS.includes(key))die('未知調性 "'+key+'"');
    const bars=parseInt(args.bars,10)||16;
    if(bars<4||bars>64||bars%4!==0)die('bars 需為 4 的倍數（建議 8/16/32），收到 '+bars);
    const seed=args.seed!==undefined?(parseInt(args.seed,10)>>>0):Math.floor(Math.random()*1e6);
    if(!Number.isFinite(seed))die('seed 需為整數');
    const bpmV=parseInt(args.bpm,10);
    const baseBpm=Number.isFinite(bpmV)&&bpmV>0?clamp(bpmV,50,240):0;
    const baseSong=generateSong({seed,mood,key,bars,bpm:baseBpm});
    const variantKey=key==='random'?KEYS[baseSong.rootPc]:key;
    const lockedBpm=baseBpm||baseSong.bpm;
    const variants=clamp(parseInt(args.variants,10)||1,1,32);
    const renderOne=(song,variantIndex)=>{
      const base='chip_'+song.mood+'_'+KEYS[song.rootPc].replace('#','s')+'_'+song.seed;
      const files={};
      const {ch,N}=renderSongPCM(song,sr);
      const {mix,stems,scale}=mixdown(ch,N);
      if(!args['no-mix']){
        const f=outPath(outDir,base+'_mix.wav');
        fs.writeFileSync(f,wavBuffer(mix,sr));
        files.mix=f;
      }
      if(args.stems){
        files.stems={};
        const names={p1:'pulse1_lead',p2:'pulse2_harmony',bass:'triangle_bass',drums:'noise_drums'};
        for(const k in stems){
          const f=outPath(outDir,base+'_'+names[k]+'.wav');
          fs.writeFileSync(f,wavBuffer(stems[k],sr));
          files.stems[k]=f;
        }
      }
      if(args.midi){
        const f=outPath(outDir,base+'.mid');
        fs.writeFileSync(f,Buffer.from(songToMidi(song)));
        files.midi=f;
      }
      return {
        type:'music',variantIndex,seed:song.seed,mood:song.mood,mood_label:MOODS[song.mood].label,
        key:KEYS[song.rootPc],scale:song.scaleName,scale_cn:SCALE_CN[song.scaleName],
        bpm:song.bpm,bars:song.bars,duration:+songDur(song).toFixed(3),
        sampleRate:sr,normalized:scale<1,files,
      };
    };
    if(variants===1){
      console.log(JSON.stringify(renderOne(baseSong,0),null,2));
      return;
    }
    const items=[];
    for(let k=0;k<variants;k++){
      const s=k===0?seed:variantSeed(seed,k-1);
      const song=generateSong({seed:s,mood,key:variantKey,bars,bpm:lockedBpm});
      items.push(renderOne(song,k));
    }
    console.log(JSON.stringify({
      type:'music-variants',seed:baseSong.seed,mood:baseSong.mood,mood_label:MOODS[baseSong.mood].label,
      variants,variantStrategy:'Keep mood/key/bars/bpm fixed; derive each variant seed with (baseSeed + 0x9E3779B9 * index) >>> 0.',
      base:{seed:baseSong.seed,mood:baseSong.mood,key:KEYS[baseSong.rootPc],bpm:lockedBpm,bars:baseSong.bars},
      sampleRate:sr,items,
    },null,2));
    return;
  }

  if(cmd==='sfx'){
    const cat=args.cat||'random';
    if(cat!=='random'&&!SFX_CATS[cat])die('未知類別 "'+cat+'"（可用：'+Object.keys(SFX_CATS).join(', ')+', random）');
    const seed=args.seed!==undefined?(parseInt(args.seed,10)>>>0):Math.floor(Math.random()*1e6);
    if(!Number.isFinite(seed))die('seed 需為整數');
    const variants=clamp(parseInt(args.variants,10)||1,1,32);
    const normalize=!args['no-normalize'];
    const resolvedCat=genSfx(cat,seed).cat; // random 只解析一次，變體同類
    const files=[];
    for(let k=0;k<variants;k++){
      const s=k===0?seed:sfxChildSeed(seed,k-1);
      const p=genSfx(resolvedCat,s);
      const mono=renderSfxPCM(p,sr);
      if(normalize)normalizeTo([mono],0.891);
      const f=outPath(outDir,'sfx_'+p.cat+'_'+p.seed+'.wav');
      fs.writeFileSync(f,wavBuffer([mono],sr));
      files.push({file:f,seed:p.seed,cat:p.cat,wave:p.wave,duration:+sfxDur(p).toFixed(3)});
    }
    let tres=null;
    if(typeof args.tres==='string'){
      const prefix=typeof args['res-prefix']==='string'?args['res-prefix']:'res://audio/sfx/';
      const pitch=parseFloat(args.pitch)||1.05;
      const volDb=args['vol-db']!==undefined?parseFloat(args['vol-db']):2;
      const resPaths=files.map(f=>prefix+path.basename(f.file));
      fs.mkdirSync(path.dirname(path.resolve(args.tres)),{recursive:true});
      fs.writeFileSync(args.tres,godotRandomizerTres(resPaths,pitch,volDb));
      tres=args.tres;
    }
    console.log(JSON.stringify({
      type:'sfx',cat:resolvedCat,cat_label:SFX_CATS[resolvedCat].label,
      seed,variants,sampleRate:sr,normalized:normalize,files,tres,
    },null,2));
    return;
  }

  die('未知指令 "'+cmd+'"\n\n'+USAGE);
}
main();
