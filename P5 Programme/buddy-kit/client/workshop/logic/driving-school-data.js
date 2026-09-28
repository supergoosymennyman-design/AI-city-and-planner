/* Authored practice readings, not a hidden City driver. Same eight-number contract.
 * Grid coverage teaches correction, braking distance, and waiting/restarting.
 * Students file these rows through the ordinary Files → Splitter → Model workflow.
 */
(function(){
 const fields=['left','center','right','laneOffset','headingError','speed','trafficLight','turnIntent'];
 function rows(exercise){
  const out=[];
  const add=(changes,answer)=>{const features={left:40,center:40,right:40,laneOffset:0,headingError:0,speed:0,trafficLight:0,turnIntent:0,...changes};out.push({i:out.length,features,answer,face:fields.map(k=>`${k} ${features[k]}`).join(' · ')});};
  if(exercise==='light')for(const speed of [0,.5,1,2,3,4,5,6,7,8])for(const trafficLight of [0,2])for(const laneOffset of [-.1,0,.1])add({speed,trafficLight,laneOffset},trafficLight===2?'stop':'forward');
  if(exercise==='obstacle')for(let center=0;center<=40;center+=1)for(const speed of [0,1,2,3,4,5,6,7,8])add({center,speed},center<5?'stop':center<12?'slow':'forward');
  if(exercise==='bend')for(const speed of [0,3,6,8])for(const laneOffset of [-2,-1,0,1,2])for(let h=-6;h<=6;h++){
    const headingError=h*.04,error=headingError+laneOffset*.15;
    add({speed,laneOffset,headingError},error>.04?'left':error<-.04?'right':'forward');
  }
  return out;
 }
 const api={rows};if(typeof module!=='undefined')module.exports=api;if(typeof window!=='undefined')window.WorkshopDrivingSchool=api;
})();
