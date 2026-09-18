// One shared scene keeps the attendant's hand, hose and nozzle physically aligned.
class NozzleMotion {
  constructor({clock=()=>performance.now(),update=()=>{},couple=()=>{},park=()=>{},reduced=false}={}){
    Object.assign(this,{clock,update,couple,park,reduced});
    this.position=0;this.target=0;this.phase='docked';this.wanted=false;this.resolve=null;this.last=this.clock();this.publish();
  }
  publish(){this.update({frame:Math.round(this.position),position:this.position,phase:this.phase})}
  connect(){
    if(this.wanted&&this.promise)return this.promise;
    this.frame();this.wanted=true;this.target=11;this.last=this.clock();
    this.promise=new Promise(resolve=>this.resolve=resolve);
    this.phase=this.position===11?'connected':'undocking';if(this.position===11){this.resolve(true);this.resolve=null}this.publish();return this.promise;
  }
  stop(){
    if(!this.wanted)return;
    this.frame();this.wanted=false;this.target=0;this.last=this.clock();
    if(this.resolve){this.resolve(false);this.resolve=null}
    if(this.position>=9)this.couple(false);
    this.phase=this.position>=8?'unplugging':'returning';this.publish();
  }
  frame(at=this.clock()){
    const elapsed=Math.max(0,at-this.last);this.last=at;
    if(this.position!==this.target){
      const distance=this.reduced?11:elapsed/150;
      this.position=this.target>this.position?Math.min(this.target,this.position+distance):Math.max(this.target,this.position-distance);
      if(this.wanted){
        this.phase=this.position<2?'undocking':this.position<4?'lifting':this.position<8?'connecting':this.position<11?'plugging':'connected';
        if(this.position===11){this.couple(true);if(this.resolve){this.resolve(true);this.resolve=null}}
      }else{
        this.phase=this.position>8?'unplugging':this.position>3?'returning':this.position>0?'securing':'docked';
        if(this.position===0)this.park();
      }
    }else if(!this.wanted&&this.phase!=='docked')this.phase='docked';
    this.publish();return this.position;
  }
}
let nozzleMotion=null;
function paintNozzle(p){
 const image=document.querySelector('#attendant-frames'),scene=document.querySelector('#coupling-scene');if(!image||!scene)return;
 // Frame 0 is the seated nozzle; return plays exactly the same physical path backwards.
 const lower=Math.floor(p.position),upper=Math.min(11,lower+1),blend=document.querySelector('#attendant-blend');const transform=n=>`translate(${-25*(n%4)}%, ${-100/3*Math.floor(n/4)}%)`;image.style.transform=transform(lower);if(blend){blend.style.transform=transform(upper);blend.style.opacity=String(p.position-lower)}
 scene.dataset.phase=p.phase;
 const glass=[[262,181,67,85],[259,181,69,85],[262,181,69,85],[264,181,69,85],[262,181,67,85],[259,181,68,85],[262,181,69,85],[258,181,69,85],[257,180,68,86],[258,180,69,86],[258,180,68,86],[263,180,68,86]];
 const screens=[[38,74,67,48],[38,74,68,48],[40,74,67,48],[40,74,66,48],[38,76,65,44],[37,76,66,44],[38,76,67,44],[39,76,65,44],[37,76,65,44],[37,76,66,44],[38,76,66,44],[40,76,65,44]];
 const interpolate=rects=>rects[lower].map((n,i)=>n+(rects[upper][i]-n)*(p.position-lower));
 const place=(selector,rect)=>{const el=scene.querySelector(selector);if(!el)return;['left','top','width','height'].forEach((key,i)=>el.style[key]=`calc(${rect[i]/362*100}% + ${rect[i]/362*4-(i<2?2:0)}px)`)};
 const g=interpolate(glass);place('.glass-volume',g);
 // A fitted metal extension finishes inside the neck; its front rim occludes the tip.
 // Coordinates share the photographic frame's 362-unit square, so resizing cannot detach it.
 const coupling=scene.querySelector('.tank-coupling'),cx=g[0]+g[2]/2;
 if(coupling){const opacity=Math.max(0,Math.min(1,(p.position-6.5)/1.5));coupling.style.opacity=String(opacity);
 const path=`M ${cx-17} 153 Q ${cx-4} 155 ${cx} 161 L ${cx} 169`;
 coupling.querySelector('.inserted-spout-shadow').setAttribute('d',path);coupling.querySelector('.inserted-spout').setAttribute('d',path);
 coupling.querySelector('.neck-front').setAttribute('d',`M ${cx-9} 159 Q ${cx} 164 ${cx+9} 159 L ${cx+9} 165 Q ${cx} 170 ${cx-9} 165 Z`);
 }
place('.attendant-readout',interpolate(screens));place('.tank-name',[g[0]+9,280,g[2]-18,18]);
 const labels={docked:'Nozzle secured in pump',undocking:'Attendant is taking the nozzle',lifting:'Removing nozzle from holder',connecting:'Attendant is connecting your tank',plugging:'Inserting nozzle into tank',connected:'Tank connected · keep holding',unplugging:'Removing nozzle from tank',returning:'Returning nozzle to pump',securing:'Securing nozzle in its holder'};
 const status=document.querySelector('#coupling-status');if(status&&status.textContent!==labels[p.phase])status.textContent=labels[p.phase];
 document.querySelectorAll('[data-motion-step]').forEach(el=>el.classList.toggle('current',el.dataset.motionStep===(['undocking','lifting','connecting','plugging'].includes(p.phase)?'connecting':p.phase==='connected'?'filling':['unplugging','returning','securing'].includes(p.phase)?'returning':'ready')));
}
function setupNozzleMotion(){nozzleMotion=new NozzleMotion({update:paintNozzle,couple:()=>pumpSound?.coupling?.(),park:()=>{pumpSound?.coupling();pumpSound?.speak(holdPump?.complete?'One litre filled. Nozzle secured.':'Nozzle secured.')},reduced:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false})}
async function prepareAttendant(){
 const img=document.querySelector('#attendant-frames');if(!img)throw new Error('Please reopen the filling station.');
 try{await img.decode()}catch{throw new Error('The attendant animation could not load. Refresh the page and try again.')}
}
