(function () {
  'use strict';
  // Three workshop instruments, drawn locally with the same steel/glass materials as the hall.
  function box(c,x,y,w,h,r,fill) { c.beginPath(); c.roundRect(x,y,w,h,r); c.fillStyle=fill;c.fill(); }
  function text(c,s,x,y,w,size,colour) { c.font='600 '+size+'px sans-serif';while(c.measureText(String(s)).width>w && size>8)c.font='600 '+(--size)+'px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillStyle=colour;c.fillText(String(s),x,y,w); }
  function draw(c,o,live) {
    const {x,y,w,h}=o; const hue=o.kind==='join'?'#e2b76c':o.kind==='memory'?'#9ca7f6':'#61d5c9';
    c.save();c.shadowColor='rgba(0,0,0,.5)';c.shadowBlur=9;c.shadowOffsetY=7;
    const metal=c.createLinearGradient(x,y,x,y+h*.8);metal.addColorStop(0,'#53616a');metal.addColorStop(.12,'#273540');metal.addColorStop(1,'#142029');
    box(c,x,y,w,h*.82,8,metal);c.shadowBlur=0;c.shadowOffsetY=0;
    c.strokeStyle='#70818a';c.lineWidth=1;c.stroke();
    for(const bx of [x+7,x+w-7])for(const by of [y+7,y+h*.82-7]){c.beginPath();c.arc(bx,by,2,0,Math.PI*2);c.fillStyle='#a6afb5';c.fill();}
    if(o.kind==='join') {
      // Two independent copper paths meet at the matching window.
      c.strokeStyle=hue;c.lineWidth=3;
      for(const fy of [.22,.57]){c.beginPath();c.moveTo(x,y+h*fy);c.lineTo(x+w*.20,y+h*fy);c.lineTo(x+w*.34,y+h*.4);c.stroke();}
      box(c,x+w*.30,y+h*.17,w*.62,h*.48,5,'#0b171e');
      text(c,live.valueText||'',x+w*.61,y+h*.34,w*.55,14,hue);
      text(c,live.detailText||'',x+w*.61,y+h*.53,w*.55,10,'#b7c6cb');
    } else if(o.kind==='memory') {
      // A removable memory cassette with visible contact pins and a retained word/number.
      box(c,x+14,y+11,w-28,h*.54,4,'#0d181f');
      for(let i=0;i<7;i++)box(c,x+w*.2+i*w*.085,y+h*.66,w*.04,h*.06,1,'#bd9e60');
      text(c,live.valueText||'',x+w*.5,y+h*.30,w-36,16,hue);
      text(c,live.detailText||'',x+w*.5,y+h*.52,w-36,12,'#b7c6cb');
    } else {
      // An arithmetic instrument: result window above a physical operation selector.
      box(c,x+12,y+10,w-24,h*.35,4,'#0b171e');
      text(c,live.valueText||'',x+w*.5,y+h*.27,w-30,15,hue);
      c.beginPath();c.arc(x+w*.22,y+h*.62,h*.105,0,Math.PI*2);c.fillStyle='#7d8e97';c.fill();
      c.strokeStyle=hue;c.lineWidth=2;c.beginPath();c.moveTo(x+w*.22,y+h*.62);c.lineTo(x+w*.22+h*.075,y+h*.58);c.stroke();
      text(c,live.detailText||'',x+w*.65,y+h*.62,w*.50,11,'#d7e1e5');
    }
    text(c,o.name||live.label||'',x+w*.5,y+h*.93,w,13,'#edf0e9');c.restore();
  }
  window.WorkshopCompositionArt={draw};
})();
