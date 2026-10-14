(function visualV25(){
  'use strict';
  const intro=document.getElementById('introScreen'),blend=document.getElementById('blendingScreen');
  const home=document.getElementById('homeArt'),mix=document.getElementById('blendingArt');
  if(!intro||!blend||!home||!mix)return;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const duration=7100; let introStart=performance.now();
  let blendingStart=0, raf=0, bottleIntro=null,bottleBlend=null,field=null,prevPhase=-1;
  let lost=false, frame=0;
  const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
  const smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
  const ease=x=>1-Math.pow(1-clamp(x),3);
  const css=k=>getComputedStyle(document.documentElement).getPropertyValue(k).trim();
  const dpr=()=>Math.min(window.devicePixelRatio||1,1.7);
  const sin=Math.sin,cos=Math.cos,TAU=2*Math.PI;
  function fit(canvas){
    const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight),r=dpr();
    const ww=Math.round(w*r),hh=Math.round(h*r);
    if(canvas.width!==ww||canvas.height!==hh){canvas.width=ww;canvas.height=hh;}
    const c=canvas.getContext('2d',{alpha:true});if(!c)return null;
    c.setTransform(r,0,0,r,0,0);c.clearRect(0,0,w,h);
    return {c,w,h};
  }
  function mkBottle(el){
    const existing=el.querySelector('.vfx-bottle-canvas');
    if(existing)existing.remove();
    const canvas=document.createElement('canvas');
    canvas.className='vfx-bottle-canvas';canvas.setAttribute('aria-hidden','true');
    el.appendChild(canvas);
    const img=el.querySelector('.bottle-img');
    const obj={canvas,img,el};
    function ready(){if(img.complete&&img.naturalWidth>0){el.classList.add('vfx-canvas-ready');refresh();}}
    if(img){img.addEventListener('load',ready,{once:true});img.addEventListener('error',()=>el.classList.remove('vfx-canvas-ready'),{once:true});ready();}
    return obj;
  }
  function mount(){
    if(home.querySelector('.bottle-img')!==bottleIntro?.img||!home.querySelector('.vfx-bottle-canvas'))bottleIntro=mkBottle(home);
    if(mix.querySelector('.bottle-img')!==bottleBlend?.img||!mix.querySelector('.vfx-bottle-canvas'))bottleBlend=mkBottle(mix);
    if(!field){
      field=document.createElement('canvas');field.className='vfx-field-canvas';
      field.setAttribute('aria-hidden','true');blend.insertBefore(field,blend.firstChild);
    }
    if(!blend.querySelector('.vfx-phase-sub')){
      const p=document.createElement('div');p.className='vfx-phase-sub';p.setAttribute('aria-hidden','true');
      const progress=blend.querySelector('.progress');progress?.parentNode.insertBefore(p,progress);
    }
  }
  function isActive(){return !document.hidden&&!reduced.matches&&(!intro.hidden||!blend.hidden);}
  function refresh(){
    if(isActive()&&!raf){raf=requestAnimationFrame(tick);}
    if(!isActive()&&raf){cancelAnimationFrame(raf);raf=0;}
  }
  function dimension(o,w,h){
    const img=o.img;
    const sourceW=img.naturalWidth,sourceH=img.naturalHeight;
    const k=Math.min(w*.90/sourceW,h*.96/sourceH);
    const dw=sourceW*k,dh=sourceH*k;
    return {dw,dh,x:(w-dw)/2,y:(h-dh)/2,sourceW,sourceH};
  }
  function paintLiquid(c,g,t,p,memory){
    const W=memory?422:455,H=memory?762:688;
    const path=memory?
      'M104 282 Q210 269 329 282 L333 663 Q332 692 304 700 L113 700 Q94 695 92 669 Z':
      'M224 278 C325 260 389 345 389 430 C395 537 319 588 227 585 C125 590 59 535 65 429 C61 346 125 281 224 278 Z';
    if(typeof Path2D==='undefined')return;
    c.save();c.translate(g.x,g.y);c.scale(g.dw/W,g.dh/H);
    c.clip(new Path2D(path));
    const palette=[css('--fluid-light')||'#9cdffe',css('--fluid-mid')||'#8f9cff',css('--fluid-dark')||'#3e559f'];
    const top=memory?283:283,bottom=memory?701:587;
    const target=bottom-(memory?350:244)*clamp(.06+ease((p-.08)/.79)*.84);
    const wave=2+12*sin(Math.PI*clamp((p-.25)/.7))*sin(t*.007);
    const fill=c.createLinearGradient(70,target,325,bottom);
    fill.addColorStop(0,palette[0]);fill.addColorStop(.44,palette[1]);fill.addColorStop(1,palette[2]);
    c.globalAlpha=.30;
    c.beginPath();c.moveTo(35,target);
    for(let x=35;x<=W+10;x+=9){const y=target+wave*sin(x*.034-t*.010)+4*sin(x*.08+t*.014);c.lineTo(x,y);}
    c.lineTo(W+15,H+15);c.lineTo(30,H+15);c.closePath();c.fillStyle=fill;c.fill();
    c.globalAlpha=.18;c.strokeStyle='rgba(241,253,255,.72)';c.lineWidth=2;
    c.beginPath();for(let x=55;x<=W-55;x+=6){const y=target+wave*sin(x*.034-t*.010)+4*sin(x*.08+t*.014);x===55?c.moveTo(x,y):c.lineTo(x,y);}c.stroke();
    const boil=clamp((p-.33)/.22)*clamp((.92-p)/.17);
    for(let i=0;i<25;i++){
      const yy=bottom-((t*.030*(1+i%4)+i*23)%(bottom-top+70));
      if(yy<target+9)continue;
      const xx=W/2+Math.sin(i*17.31)*99+sin(t*.002+i)*8,rr=(1.1+i%4)*(.55+boil*1.65);
      c.globalAlpha=(.15+.25*boil);c.beginPath();c.arc(xx,yy,rr,0,TAU);
      c.strokeStyle='rgba(248,252,255,.88)';c.lineWidth=1.2;c.stroke();
    }
    c.restore();
  }
  function paintVessel(obj,t,p,mode){
    if(!obj||!obj.img?.complete||!obj.img.naturalWidth||!obj.el.classList.contains('vfx-canvas-ready'))return;
    const f=fit(obj.canvas);if(!f)return;
    const {c,w,h}=f,img=obj.img,g=dimension(obj,w,h);
    const introMode=mode==='intro',morph=introMode?1-smooth((p-.19)/.64):clamp(sin(Math.PI*smooth((p-.08)/.84)),0,1);
    const deformation=morph*(introMode?.13:.085);
    const apparition=introMode?smooth((p-.03)/.25):smooth((p-.01)/.14);
    c.globalAlpha=apparition;
    // Clip original decorative images to recognizable glass silhouettes; they contain baked backgrounds.
    // This is a rendering mask, not a new container type.
    const specimen=obj.el.dataset.vessel==='specimen';
    const SW=specimen?422:455,SH=specimen?762:688;
    const silhouette=specimen?
      'M213 27 C245 27 267 53 267 89 C268 124 245 157 216 161 C184 161 158 131 158 96 C157 56 177 27 213 27 Z M150 143 L282 143 L289 245 Q353 249 357 306 L356 683 Q356 720 332 724 L84 724 Q69 717 70 683 L70 306 Q73 255 135 245 Z M52 704 L379 704 L381 755 L44 755 Z M339 271 L392 292 L397 420 L347 432 Z':
      'M224 22 C260 22 281 46 283 86 C282 123 262 153 225 155 C187 154 167 124 169 85 C170 48 187 22 224 22 Z M176 143 L276 143 L282 259 Q359 266 396 330 C430 400 418 504 376 547 Q323 612 226 606 Q113 607 73 550 C29 504 27 406 60 335 Q96 267 169 259 Z M35 602 L416 602 L421 684 L27 684 Z';
    c.save();
    c.translate(g.x,g.y);c.scale(g.dw/SW,g.dh/SH);c.clip(new Path2D(silhouette));
    c.setTransform(dpr(),0,0,dpr(),0,0);
    const pieces=150,srcStep=g.sourceH/pieces,dstStep=g.dh/pieces;
    for(let i=0;i<pieces;i++){
      const q=(i+.5)/pieces;
      const bell=sin(Math.PI*q);
      const swell=(sin(q*12.5+t*.0043)+.48*sin(q*27-t*.0031))*deformation*bell;
      const widthRatio=clamp(1+swell,.55,1.35);
      const slide=sin(q*13-t*.0035)*deformation*g.dw*.035;
      const offsetY=(introMode?(1-smooth((p-.05)/.44))*.012*sin(q*31+t*.004)*g.dh:0);
      const ww=g.dw*widthRatio;
      c.drawImage(img,0,i*srcStep,g.sourceW,srcStep+1,g.x+(g.dw-ww)/2+slide,g.y+i*dstStep+offsetY,ww,dstStep+.35);
    }
    c.globalAlpha=1;
    c.restore();
    c.save();paintLiquid(c,g,t,p,obj.el.dataset.vessel==='specimen');c.restore();
    // Restrained moving glass highlights, limited to the object silhouette.
    c.save();c.globalCompositeOperation='screen';
    const sheen=c.createLinearGradient(g.x,g.y,g.x+g.dw,g.y+g.dh);
    sheen.addColorStop(0,'rgba(136,215,237,.00)');
    sheen.addColorStop(.48,'rgba(178,224,255,.03)');
    sheen.addColorStop(.53,'rgba(224,239,255,.09)');
    sheen.addColorStop(.58,'rgba(178,224,255,.01)');
    sheen.addColorStop(1,'rgba(255,255,255,0)');
    c.globalAlpha=clamp(.35+morph*.45);
    c.fillStyle=sheen;c.fillRect(g.x,g.y,g.dw,g.dh);
    c.restore();
  }
  function vapor(c,centerX,centerY,t,spread,strength){
    for(let i=0;i<8;i++){
      const k=(t*.000085+i/8)%1;
      const ax=centerX+sin(i*4.7+t*.0004)*spread*.28;
      const x=ax+sin(k*7+i*2.2)*spread*(.13+.4*k);
      const y=centerY-k*spread*1.35;
      const r=5+spread*.08+spread*.11*k;
      const grad=c.createRadialGradient(x,y,0,x,y,r);
      const hue=i%2?'167,215,243':'197,172,244';
      grad.addColorStop(0,`rgba(${hue},${.09*strength*(1-k)})`);
      grad.addColorStop(1,`rgba(${hue},0)`);
      c.fillStyle=grad;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();
    }
  }
  function introWorld(t,p){
    if(!bottleIntro)return;const canvas=bottleIntro.canvas;
    const c=canvas.getContext('2d');if(!c)return;
    const w=canvas.clientWidth,h=canvas.clientHeight;
    c.setTransform(dpr(),0,0,dpr(),0,0);
    const cx=w/2,cy=h*.48;
    vapor(c,cx,cy+65,t,Math.min(w,h)*.34,.85);
    c.save();
    for(let i=0;i<32;i++){
      const angle=i*2.399963+.003*t*(i%2?.25:-.18),k=clamp((p-.03)*2);
      const radius=(1-ease(k))*(w*.43)+18+sin(t*.002+i)*8;
      const x=cx+cos(angle)*radius*.70,y=cy+sin(angle)*radius*.57;
      const a=.09+.25*(1-ease(k));
      c.fillStyle=i%3?'rgba(139,218,237,'+a+')':'rgba(225,179,255,'+a+')';
      c.beginPath();c.arc(x,y,1.1+i%3,0,TAU);c.fill();
    }
    c.restore();
  }
  const phases=[
    ['正在收集你的氣味','素材正在靠近這只容器'],
    ['香材在玻璃裡交會','不同的氣息開始形成流線'],
    ['液體正在沸騰與融合','顏色、溫度與記憶正在混合'],
    ['封存今天的味道','讓變化緩慢凝聚成形']
  ];
  function fieldFX(t,p){
    if(!field)return;
    const f=fit(field);if(!f)return;const {c,w,h}=f;
    const vesselRect=mix.getBoundingClientRect(),parentRect=blend.getBoundingClientRect();
    const cx=vesselRect.left-parentRect.left+vesselRect.width/2;
    const cy=vesselRect.top-parentRect.top+vesselRect.height*.56;
    const streamIn=smooth((p-.08)/.37),streamOut=1-smooth((p-.65)/.27);
    const streamAlpha=clamp(streamIn*streamOut,0,1);
    const hueColors=['111,216,229','202,151,221','232,176,159','152,189,244'];
    c.lineCap='round';
    for(let i=0;i<36;i++){
      const angle=i*2.399963;
      const radius=Math.max(w,h)*(.39+(i%5)*.05);
      const originX=cx+cos(angle)*radius,originY=cy+sin(angle)*radius*.80;
      const swirl=t*.0009*(i%2?1:-1),u=(p*2.2+i*.087)%1;
      const k=smooth(u),reveal=(.2+.8*sin(Math.PI*u))*streamAlpha;
      const x=originX*(1-k)+cx*k+sin(swirl+i*2.2)*w*.09*(1-k);
      const y=originY*(1-k)+cy*k+cos(swirl+i)*h*.065*(1-k);
      const rgb=hueColors[i%hueColors.length];
      c.beginPath();
      c.moveTo(x+(originX-cx)*.13*(1-u),y+(originY-cy)*.13*(1-u));
      c.quadraticCurveTo(x+sin(angle*2+swirl)*40,y+cos(angle+swirl)*48,x,y);
      c.strokeStyle='rgba('+rgb+','+(reveal*.57)+')';
      c.lineWidth=(.7+i%3*.5)*Math.min(1.2,w/360);
      c.stroke();
      c.fillStyle='rgba('+rgb+','+(reveal*.72)+')';
      c.beginPath();c.arc(x,y,1.4+i%3*.8,0,TAU);c.fill();
    }
    const boiling=smooth((p-.32)/.18)*(1-smooth((p-.78)/.15));
    if(boiling>.03){
      for(let i=0;i<14;i++){
        const a=i*2.4+t*.001*(i%2?1:-1),r=boiling*(24+(i%6)*13);
        const x=cx+cos(a)*r,y=cy+sin(a)*r*.6;
        c.beginPath();c.arc(x,y,1.2+(i%3)*.6,0,TAU);
        c.fillStyle='rgba(206,237,247,'+(boiling*.44)+')';c.fill();
      }
    }
    const ringTime=(p-.72)/.27;
    if(ringTime>0&&ringTime<1){
      const a=smooth(ringTime),r=(20+Math.max(w,h)*.45*a);
      c.strokeStyle='rgba(178,220,245,'+(.29*(1-a))+')';c.lineWidth=2*(1-a)+.5;
      c.beginPath();c.ellipse(cx,cy,r,r*.58,0,0,TAU);c.stroke();
    }
    vapor(c,cx,cy+30,t,Math.min(w,h)*.22,.66*clamp((p-.24)/.18)*(1-smooth((p-.84)/.13)));
  }
  function updatePhase(p){
    const idx=p<.23?0:p<.48?1:p<.78?2:3;
    if(prevPhase!==idx){
      prevPhase=idx;
      const h2=blend.querySelector('h2'),sub=blend.querySelector('.vfx-phase-sub');
      if(h2)h2.textContent=phases[idx][0];
      if(sub)sub.textContent=phases[idx][1];
    }
    const bar=blend.querySelector('.progress i');
    if(bar)bar.style.width=(clamp(p)*100).toFixed(1)+'%';
  }
  function tick(t){
    raf=0;if(!isActive())return;
    if(!intro.hidden&&bottleIntro?.img?.complete){
      const p=clamp((t-introStart)/5400);
      paintVessel(bottleIntro,t,p,'intro');
      introWorld(t,p);
    }
    if(!blend.hidden&&bottleBlend?.img?.complete){
      const p=clamp((t-blendingStart)/duration);
      fieldFX(t,p);
      paintVessel(bottleBlend,t,p,'blend');
      updatePhase(p);
    }
    frame++;
    if(!intro.hidden&&blend.hidden&&t-introStart>5550)return;
    raf=requestAnimationFrame(tick);
  }
  const mo=new MutationObserver(()=>{
    if(!blend.hidden&&blendingStart===0){blendingStart=performance.now();prevPhase=-1;}
    if(blend.hidden){blendingStart=0;prevPhase=-1;}
    refresh();
  });
  mo.observe(blend,{attributes:true,attributeFilter:['hidden']});
  mo.observe(intro,{attributes:true,attributeFilter:['hidden']});
  const introObserver=new MutationObserver(()=>{if(!intro.hidden){introStart=performance.now();refresh();}});
  introObserver.observe(intro,{attributes:true,attributeFilter:['hidden']});
  const rebuild=new MutationObserver(()=>{if(home.querySelector('.vfx-bottle-canvas')&&mix.querySelector('.vfx-bottle-canvas'))return;mount();refresh();});
  rebuild.observe(home,{childList:true});rebuild.observe(mix,{childList:true});
  document.addEventListener('visibilitychange',refresh);
  reduced.addEventListener?.('change',refresh);
  window.addEventListener('resize',refresh,{passive:true});
  mount();refresh();
  document.documentElement.setAttribute('data-visual-patch','v25-canvas-1');
})();
