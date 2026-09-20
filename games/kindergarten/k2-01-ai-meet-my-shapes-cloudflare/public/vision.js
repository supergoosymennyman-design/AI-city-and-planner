/**
 * vision.js — Geometry-Based Shape Classification from Stroke Points
 * k2-01: AI, Meet My Shapes!
 * No pixel grid, no ML, no KNN, no dHash.
 * Classifies from raw touch stroke points using geometric features.
 */
function VisionPipeline(){
  this._c=null;this._examples={}
}

VisionPipeline.prototype.pointAtCanvas=function(el){this._c=el};

// Resample raw points to N equidistant points along the path
VisionPipeline.prototype._resample=function(points,N){
  if(!points||points.length<2){
    var arr=[];var pt=points&&points.length?points[points.length-1]:{x:0,y:0};
    for(var i=0;i<N;i++)arr.push({x:pt.x,y:pt.y});return arr
  }
  // Compute total path length
  var totalLen=0,segs=[];
  for(var i=1;i<points.length;i++){
    var dx=points[i].x-points[i-1].x,dy=points[i].y-points[i-1].y;
    var len=Math.sqrt(dx*dx+dy*dy);
    segs.push({a:points[i-1],b:points[i],len:len,cumLen:totalLen});
    totalLen+=len
  }
  if(totalLen<1){
    var arr2=[];var pt2=points[points.length-1];
    for(var i=0;i<N;i++)arr2.push({x:pt2.x,y:pt2.y});return arr2
  }
  var interval=totalLen/(N-1),result=[];
  var segIdx=0,segPtr=0;
  for(var i=0;i<N;i++){
    var target=i*interval;
    while(segIdx<segs.length-1&&segs[segIdx+1].cumLen<target)segIdx++;
    var seg=segs[segIdx];
    while(segPtr<seg.len&&seg.cumLen+segPtr<target)segPtr=Math.min(segPtr+1,seg.len);
    var t=(target-Math.max(0,seg.cumLen))/Math.max(seg.len,1);
    t=Math.max(0,Math.min(1,t));
    result.push({x:seg.a.x+(seg.b.x-seg.a.x)*t,y:seg.a.y+(seg.b.y-seg.a.y)*t})
  }
  return result
};

// Extract 5 geometric features from resampled points
VisionPipeline.prototype._extractFeatures=function(pts){
  if(!pts||pts.length<3)return null;
  var N=pts.length;

  // Feature 1+4: cornerCount + totalAngle
  var cornerCount=0,totalAngle=0;
  for(var i=2;i<N-2;i++){
    var v1x=pts[i].x-pts[i-2].x,v1y=pts[i].y-pts[i-2].y;
    var v2x=pts[i+2].x-pts[i].x,v2y=pts[i+2].y-pts[i].y;
    var ang1=Math.atan2(v1y,v1x),ang2=Math.atan2(v2y,v2x);
    var diff=ang2-ang1;
    while(diff>Math.PI)diff-=2*Math.PI;
    while(diff<-Math.PI)diff+=2*Math.PI;
    var absAng=Math.abs(diff);
    totalAngle+=absAng;
    if(absAng>0.8){cornerCount++;i+=3}
  }

  // Feature 2: radiusVariance
  var cx=0,cy=0;
  for(var i=0;i<N;i++){cx+=pts[i].x;cy+=pts[i].y}
  cx/=N;cy/=N;
  var meanR=0;
  for(var i=0;i<N;i++){var dx=pts[i].x-cx,dy=pts[i].y-cy;meanR+=Math.sqrt(dx*dx+dy*dy)}
  meanR/=N;
  var stdR=0;
  for(var i=0;i<N;i++){var dx=pts[i].x-cx,dy=pts[i].y-cy;var diff=Math.sqrt(dx*dx+dy*dy)-meanR;stdR+=diff*diff}
  stdR=Math.sqrt(stdR/N);
  var radiusVariance=meanR>0?stdR/meanR:1;

  // Feature 3: aspectRatio
  var minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(var i=0;i<N;i++){
    if(pts[i].x<minX)minX=pts[i].x;if(pts[i].x>maxX)maxX=pts[i].x;
    if(pts[i].y<minY)minY=pts[i].y;if(pts[i].y>maxY)maxY=pts[i].y
  }
  var w=maxX-minX||1,h=maxY-minY||1;
  var aspectRatio=w/h;

  // Feature 5: isClosed
  var first=pts[0],last=pts[N-1];
  var gap=Math.sqrt((last.x-first.x)*(last.x-first.x)+(last.y-first.y)*(last.y-first.y));
  var diag=Math.sqrt(w*w+h*h);
  var isClosed=gap<diag*0.5;

  return{cornerCount:cornerCount,radiusVariance:radiusVariance,aspectRatio:aspectRatio,totalAngle:totalAngle,isClosed:isClosed}
};

// Decision tree classifier
VisionPipeline.prototype.classifyStroke=function(points){
  if(!points||points.length<10)return null;
  var pts=this._resample(points,64);
  var f=this._extractFeatures(pts);
  if(!f)return null;

  console.log('[classifyStroke] isClosed='+f.isClosed+' cc='+f.cornerCount+' rv='+f.radiusVariance.toFixed(4)+' ar='+f.aspectRatio.toFixed(4)+' ta='+f.totalAngle.toFixed(4)+' pts='+points.length);

  if(!f.isClosed){
    if(points.length<30){console.log('[SMART] AI says: no shape (not closed, too few points)');return null}
  }

  // Circle
  if(f.radiusVariance<0.10){console.log('[SMART] AI says: circle');return"circle"}

  // Rectangle
  if(f.aspectRatio<0.6||f.aspectRatio>1.6){console.log('[SMART] AI says: rectangle');return"rectangle"}

  // Triangle
  if(f.radiusVariance>0.15&&f.cornerCount<=3){console.log('[SMART] AI says: triangle');return"triangle"}

  // Square
  console.log('[SMART] AI says: square');
  return"square"
};

VisionPipeline.prototype.storeExample=function(points,shape){
  if(!this._examples[shape])this._examples[shape]=[];
  this._examples[shape].push(points);
  var pts=this._resample(points,64);
  var f=this._extractFeatures(pts);
  if(f)console.log('[TEACHING] stored shape='+shape+' pts='+points.length+' cc='+f.cornerCount+' rv='+f.radiusVariance.toFixed(4)+' ar='+f.aspectRatio.toFixed(4)+' ta='+f.totalAngle.toFixed(4)+' isClosed='+f.isClosed+' total='+this._examples[shape].length)
};

VisionPipeline.prototype.clearExamples=function(){this._examples={}};