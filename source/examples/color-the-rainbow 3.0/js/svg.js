function createShape(type,fill,size){
  var svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 100 100');
  if(size) svg.style.width = size;
  if(size) svg.style.height = size;
  var el;
  switch(type){
    case 'circle':
      el=document.createElementNS('http://www.w3.org/2000/svg','circle');
      el.setAttribute('cx','50');el.setAttribute('cy','50');el.setAttribute('r','44');
      break;
    case 'square':
      el=document.createElementNS('http://www.w3.org/2000/svg','rect');
      el.setAttribute('x','6');el.setAttribute('y','6');
      el.setAttribute('width','88');el.setAttribute('height','88');el.setAttribute('rx','6');
      break;
    case 'triangle':
      el=document.createElementNS('http://www.w3.org/2000/svg','polygon');
      el.setAttribute('points','50,6 94,94 6,94');
      break;
  }
  el.setAttribute('fill',fill||'#e0e0e0');
  el.setAttribute('stroke','#bbb');
  el.setAttribute('stroke-width','2');
  svg.appendChild(el);
  return svg
}
