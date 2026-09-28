import { schoolScenario } from './driving-simulation.js';
export const SCHOOL_PREVIEW = schoolScenario('mixed',71);
export function courseBounds(track,margin=10){
 const xs=track.points.map(p=>p.x),zs=track.points.map(p=>p.z);
 const minX=Math.min(...xs)-margin,maxX=Math.max(...xs)+margin,minZ=Math.min(...zs)-margin,maxZ=Math.max(...zs)+margin;
 return {minX,maxX,minZ,maxZ,w:maxX-minX,d:maxZ-minZ,cx:(minX+maxX)/2,cz:(minZ+maxZ)/2};
}
export const SCHOOL_BOUNDS=Object.freeze(courseBounds(SCHOOL_PREVIEW.track));
