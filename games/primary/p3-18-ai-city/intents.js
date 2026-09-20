/* intents.js — Nova intents */
const Intents = (() => {
'use strict';
const I=[
{id:'help',p:[/help/i,/how.*play/i],r:['Place buildings from the palette onto the grid. Draw roads by dragging. Connect utilities. Then run the simulation to see your city come alive!']},
{id:'scan',p:[/scan/i,/hazard/i,/ground/i],r:['Press the Scan button, then click or drag across green tiles to find underground hazards. Turbo mode is faster but less accurate!']},
{id:'build',p:[/build/i,/place/i,/road/i,/drone/i,/bus/i],r:['Select a building from the palette, then click a grid tile to place it. Roads can be drawn by dragging across tiles. Each building costs tokens.']},
{id:'graph',p:[/graph/i,/relation/i,/cause/i,/connect/i],r:['In the Optimise phase, select building nodes and connect them with relationship arrows. The AI will find feedback loops and bottlenecks!']},
{id:'sim',p:[/sim/i,/simulation/i,/run/i,/speed/i],r:['Run the simulation to see buses, waste trucks, and drones move through your city. Use speed controls to watch daily patterns or handle fast crises.']},
{id:'crisis',p:[/crisis/i,/heatwave/i,/flood/i,/storm/i,/emergency/i],r:['During crises, use the dashboard controls to respond. Heatwave: adjust energy mix. Flood: reroute traffic. Storm: stabilize the grid.']},
{id:'nova',p:[/nova/i,/hello/i,/hi/i,/hey/i],r:['I am Nova, your AI City Architect co-pilot! I can help with scanning, building, the knowledge graph, and crisis management.']},
];
function match(text){for(const i of I)for(const p of i.p)if(p.test(text))return i.r[Math.floor(Math.random()*i.r.length)];return null;}
return{match};
})();
