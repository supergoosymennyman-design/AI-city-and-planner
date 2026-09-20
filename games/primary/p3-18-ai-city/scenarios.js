/** scenarios.js — Phase 5: 12 AI City Scenarios */
const Scenarios = (() => {
'use strict';

const S = [];

function has(st, ...types) { return types.some(t => st.buildings.some(b => b.type === t)); }
function cnt(st, type) { return st.buildings.filter(b => b.type === type).length; }
function sysPct(st, sys) {
  const s = st.sim?.systems?.[sys];
  return s ? Math.round(s.health) : 70;
}
function adaptName(st, fallback, ...types) {
  for (const t of types) {
    const b = st.buildings.find(x => x.type === t);
    if (b && Game.BLD[t]?.l) return Game.BLD[t].l;
  }
  return fallback;
}

// ── 1. HEATWAVE ──
S.push({
  id:'heatwave',icon:'🔥',
  name:'Heatwave Power Crisis',
  desc:'A heatwave is straining the power grid. Dr. Amina needs the hospital to stay online.',
  missing:'Need a power plant',
  check:st=>has(st,'solar','wind','hydro','bat','data'),
  aiIntro:st=>{
    const sup=st.buildings.filter(b=>Game.BLD[b.type]?.p?.e).reduce((t,b)=>t+(Game.BLD[b.type].p.e||0),0);
    const def=Math.round(st.buildings.length*0.7+8);
    return `🔥 Heatwave detected!<br>Power demand: ${def} energy/tick (+40%). Supply: ${sup} energy/tick. Deficit: ${Math.max(0,def-sup)}.<br>Hospital needs 4 energy. Data Center needs 8. Citizens need AC. If we do nothing, the hospital loses power in ~${Math.max(1,Math.floor(sup/(def||1)*3))} minutes.`;
  },
  meter:ss=>({value:Math.min(100,Math.max(0,ss.scr_crisis||50)),label:'Crisis Severity',max:100}),
  gauge:(ss,st)=>({label:'Power Reserve',value:Math.round((ss.scr_sup||0)+(ss.scr_bat||100)/20),max:25,unit:'MW'}),
  steps:[
    { stage:'📞 Emergency Call', storytelling:true,
      character:{name:'Dr. Amina',emoji:'👩🏾‍⚕️',title:'Chief of City Hospital',
        message:'Mayor! The backup generator just kicked in. I have 12 patients on ventilators — including little Amara, the girl from the school visit last week. Her mom is in the waiting room. The battery will last 4 minutes. Please, I need power. I need you to choose fast.'},
      ai:'Nova: Grid demand is at 140% of capacity. The data center is drawing 8 units, residential AC is pulling another 20. If we redirect non-critical power, we can keep the ICU running.',
      novaSays:"Dr. Amina has never called the Mayor's office before. She's scared. Twelve families are waiting to hear if their loved ones make it through today.",
      choices:[{text:'▶ Continue',apply:st=>{},next:1}] },
    { stage:'1 ⚡ First Response', timer:20, defaultChoice:1,
      ai:"Dr. Amina just sent a photo — the ventilator batteries show 3:42 remaining. Power demand exceeds supply by 30%. What's your call?",
      choices:[
        {text:'🟢 Drain Battery Reserve (+12 energy, -40% battery)',
          impacts:[{icon:'⚡',label:'Energy',val:12,max:20},{icon:'🔋',label:'Battery',val:-40,max:100}],
          novaReact:"Battery power coming online! Those are hospital-grade batteries — they'll give Dr. Amina the 8 minutes she needs to stabilize the patients.",
          apply:st=>{st.scr_bat=(st.scr_bat||100)-40;st.scr_sup=(st.scr_sup||0)+12;st.scr_crisis=(st.scr_crisis||50)-5;},next:2},
        {text:'🔵 Throttle AI Data Center (-6 demand, -AI)',
          impacts:[{icon:'⚡',label:'Demand',val:-6,max:20},{icon:'🤖',label:'AI Compute',val:-30,max:100}],
          novaReact:'Taking the AI offline saves power but slows every other city system — traffic lights, waste collection, even the water pumps. I go quiet.',
          apply:st=>{st.scr_dem=(st.scr_dem||0)-6;st.scr_compute=(st.scr_compute||100)-30;st.scr_crisis=(st.scr_crisis||50)+10;},next:10} ]},
    { stage:'2 ⚠️ Crisis Worsens',
      ai:"Dr. Amina reports the ICU temperature is rising — backup AC can't keep up. The grid is at 72% and temperatures outside are still climbing.",
      choices:[
        {text:'🟢 AI Cooling Optimization (+8 efficiency, +2 sentiment)',
          impacts:[{icon:'⚡',label:'Efficiency',val:8,max:15},{icon:'😊',label:'Sentiment',val:2,max:10}],
          novaReact:'My cooling algorithm finds the fastest, cheapest way to cool the ICU without drawing extra power. It learns as it runs — getting smarter every minute.',
          apply:st=>{st.scr_sup=(st.scr_sup||0)+5;st.scr_sent=(st.scr_sent||70)+2;st.scr_crisis=(st.scr_crisis||50)-15;},next:3},
        {text:'🟡 Load Shedding (-4 demand, -5 sentiment)',
          impacts:[{icon:'⚡',label:'Demand',val:-4,max:15},{icon:'😊',label:'Sentiment',val:-5,max:10}],
          novaReact:'Rolling blackouts in residential zones. People lose AC and lights. But the ICU stays alive. Sometimes we all have to give up a little comfort.',
          apply:st=>{st.scr_dem=(st.scr_dem||0)-4;st.scr_sent=(st.scr_sent||70)-5;st.scr_crisis=(st.scr_crisis||50)-10;},next:3} ]},
    { stage:'🤖 How AI Helps', storytelling:true,
      character:{name:'Nova',emoji:'🤖',title:'Your AI Assistant',
        message:"Mayor, let me show you how I'm helping. I ran 1,000 different simulations of the power grid every second — trying every possible combination of throttling, battery drain, and load redistribution. My algorithm found that prioritizing the ICU with battery power was the best option in 87% of scenarios. That's called OPTIMIZATION — trying lots of solutions and picking the best one!"},
      ai:'Nova: I can compute thousands of power distribution strategies per second to find the best one for any situation.',
      novaSays:'Optimization is like trying every seat on a bus to find the comfiest one — but I can do it in less than a second!',
      choices:[{text:'▶ I see! What else can we do?',apply:st=>{},next:4}] },
    { stage:'4 📊 Analyze the Data',
      dataView:[
        {icon:'🏘️',label:'North District',value:23,max:100,unit:'% power'},
        {icon:'🏥',label:'Hospital Zone',value:12,max:100,unit:'% power'},
        {icon:'🏭',label:'South District',value:45,max:100,unit:'% power'},
      ],
      ai:"Nova: Look at the power levels across the city. Which district is MOST at risk right now?",
      choices:[
        {text:"🟢 Hospital Zone — only 12% power! That's where Dr. Amina is!",
          impacts:[{icon:'⚡',label:'Power Focus',val:10,max:15}],
          novaReact:'Correct! The hospital zone is critical — that data told us exactly where to send power next.',
          apply:st=>{st.scr_sup=(st.scr_sup||0)+10;st.scr_crisis=(st.scr_crisis||50)-10;},next:5},
        {text:'🟡 North District — 23% remaining',
          impacts:[{icon:'⚡',label:'Power Focus',val:3,max:15}],
          novaReact:'North District is low, but the hospital needs it more. Reading data correctly is key to good decisions.',
          apply:st=>{st.scr_sup=(st.scr_sup||0)+3;st.scr_crisis=(st.scr_crisis||50);},next:5}] },
    { stage:'5 🔥 Make the Call',
      ai:"Nova: My final optimization — shut down gaming servers and movie theaters, saving 15% grid capacity. The ICU stays on. But citizens will lose entertainment for 6 hours.",
      choices:[
        {text:'🤖 Accept: Full AI plan (max efficiency)',
          impacts:[{icon:'⚡',label:'Grid Saved',val:15,max:20},{icon:'😊',label:'Sentiment',val:-3,max:10}],
          novaReact:"Pure optimization! The numbers don't lie — this keeps everyone safe. Theaters reopen tomorrow.",
          apply:st=>{st.scr_sup=(st.scr_sup||0)+10;st.scr_sent=(st.scr_sent||70)-3;st.scr_crisis=(st.scr_crisis||50)-20;},next:-1},
        {text:'🤝 Modify: Keep 50% entertainment (balanced)',
          impacts:[{icon:'⚡',label:'Grid Saved',val:8,max:20},{icon:'😊',label:'Sentiment',val:5,max:10}],
          novaReact:'Smart compromise! Humans add wisdom that pure math misses.',
          apply:st=>{st.scr_sup=(st.scr_sup||0)+5;st.scr_sent=(st.scr_sent||70)+5;st.scr_crisis=(st.scr_crisis||50)-10;},next:-1},
        {text:'👤 Override: Manual plan, no shutdowns (slow)',
          impacts:[{icon:'⚡',label:'Grid Saved',val:3,max:20},{icon:'😊',label:'Sentiment',val:8,max:10}],
          novaReact:"Sometimes the human knows best. I'll support your manual plan with calculations!",
          apply:st=>{st.scr_sup=(st.scr_sup||0)+3;st.scr_sent=(st.scr_sent||70)+8;st.scr_crisis=(st.scr_crisis||50)-5;},next:-1}] },
    { stage:'10 🔥 Critical Decision',
      ai:'⚠️ AI services offline! Dr. Amina calling — battery down to 12%. Two districts dark.',
      choices:[
        {text:'🟡 Manual Load Shedding (-4 demand, -5 sentiment)',
          impacts:[{icon:'⚡',label:'Demand',val:-4,max:20},{icon:'😊',label:'Sentiment',val:-5,max:20}],
          novaReact:'Without AI to optimize, every watt counts. Manual is slow, but every watt goes to the ICU.',
          apply:st=>{st.scr_dem=(st.scr_dem||0)-4;st.scr_sent=(st.scr_sent||70)-5;st.scr_crisis=(st.scr_crisis||50)+15;},next:11},
        {text:'🔴 Force Residential Shutdown (-8 demand, -15 sentiment)',
          impacts:[{icon:'⚡',label:'Demand',val:-8,max:20},{icon:'😊',label:'Sentiment',val:-15,max:20}],
          novaReact:'Turning off homes... I can hear the calls coming in. But the ICU needs power.',
          apply:st=>{st.scr_dem=(st.scr_dem||0)-8;st.scr_sent=(st.scr_sent||70)-15;st.scr_crisis=(st.scr_crisis||50)+25;},next:11}] },
    { stage:'11 ✅ Final Chance',
      ai:"Amara's ventilator beep changed pitch. 60 seconds left on backup.",
      choices:[
        {text:'🟢 Emergency Generators (+20 energy, -8 cost)',
          impacts:[{icon:'⚡',label:'Energy',val:20,max:25},{icon:'🪙',label:'Cost',val:-8,max:20},{icon:'😊',label:'Sentiment',val:2,max:10}],
          novaReact:"Emergency generators for the ICU — should have done this sooner. But we're doing it NOW and that's what matters.",
          apply:st=>{st.scr_sup=(st.scr_sup||0)+20;st.scr_sent=(st.scr_sent||70)+2;st.scr_cost=(st.scr_cost||0)+8;st.scr_crisis=(st.scr_crisis||50)-10;},next:-1},
        {text:'🔴 Wait for Weather Relief (no action)',
          impacts:[{icon:'😊',label:'Sentiment',val:-10,max:20},{icon:'⚡',label:'Blackout Risk',val:30,max:50}],
          novaReact:"Waiting and hoping... that's not a plan. The heatwave isn't going anywhere.",
          apply:st=>{st.scr_sent=(st.scr_sent||70)-10;st.scr_crisis=(st.scr_crisis||50)+30;},next:-1}] }
  ],
  outcome:st=>{
    const b=st.scr_bat||100,s=st.scr_sent||70,c=st.scr_cost||0;
    if(b>30&&s>50)return{stars:3,msg:'All 12 patients stable. Zero power loss in the ICU. Dr. Amina says Amara is asking for ice cream.'};
    if(b>15&&s>30)return{stars:2,msg:'Minor brownouts in 1 district. ICU stayed online. Three patients moved to ground floor. Cost: '+c+' tokens.'};
    return{stars:1,msg:"We lost power for 8 minutes. Backup held for 4. Two patients critical. We'll be better prepared next time."};
  },
  outcomeNova:stars=>stars===3?`🎉 The hospital never lost power. Dr. Amina said: "Amara woke up and asked for ice cream." THAT is what we fight for! 🌟`:stars===2?`Phew. The ICU stayed online. Some neighborhoods lost power but no one was hurt. We can do better next time.`:`We lost a district and the hospital ran on backup. Hard lesson, but now we KNOW how to prepare better.`,
  outcomeCharacter:stars=>({emoji:'👩🏾‍⚕️',name:'Dr. Amina',
    msg:stars===3?`All 12 patients are stable, Mayor. Amara is awake and asking for ice cream. The ICU never lost a single watt. Thank you.`
      :stars===2?`We had brownouts but the ICU stayed online. Three patients moved to the ground floor. We managed. Thank you.`
      :`We lost power for 8 minutes. Backup held for 4. Two patients critical. We'll be better prepared next time, Mayor.`}),
  conceptCard:{title:'Optimization',body:'Optimization is when AI tries lots of different solutions and picks the best one — like trying every seat on a bus to find the comfiest one, but a million times faster.'},
  lesson:'Power Grid (L10) + Tokenomics (L15)',
  lg:'During a heatwave, AI must balance energy between critical infrastructure and quality-of-life services.'
});

// ── 2. FLOOD ──
S.push({
  id:'flood',icon:'🌊',
  name:'Flash Flood Emergency',
  desc:"River overflow threatens 5 districts. Mr. Chen's home is in the flood zone.",
  missing:'Need Water Tower + Flood Barrier',
  check:st=>has(st,'water','flood','town'),
  aiIntro:st=>{
    const water=Math.round(st.buildings.filter(b=>b.type==='water').length*10);
    const pop=st.sim?.pop||500;
    return `🌊 Flash flood predicted! River to crest in 3 minutes.<br>Affected districts: East Industrial (${Math.round(pop*0.2)} people), South Residential (${Math.round(pop*0.3)}).<br>Water supply at risk: ${water}L/sec. Pipelines may breach.`;
  },
  meter:ss=>({value:Math.min(100,Math.max(0,ss.scr_crisis||50)),label:'Flood Water Level',max:100}),
  gauge:(ss,st)=>({label:'Water Level',value:Math.min(100,Math.round(ss.scr_crisis||50)),max:100,unit:'%'}),
  steps:[
    { stage:'📞 Emergency Call', storytelling:true,
      character:{name:'Mr. Chen',emoji:'👨🏻‍🔧',title:'River Gauge Station Operator',
        message:"Mayor, I'm at the river gauge station. The water is rising over the banks — I've never seen it this high in 30 years. My granddaughter Mei is at home in South Residential with her grandmother. I'm watching the water creep toward their street from here. I can't leave my post."},
      ai:'Nova: River crest predicted in 3 minutes — 2.4 meters above flood stage. East Industrial and South Residential districts are in the direct path. 1,200 people at risk. Water pressure on main pipes critical.',
      novaSays:"Mr. Chen designed half the flood barriers in this city. If he's scared, we should be too. His granddaughter Mei is 6 and her drawings are probably still on the fridge at home.",
      choices:[{text:'▶ Continue',apply:st=>{},next:1}] },
    { stage:'1 ⚡ First Response', timer:20, defaultChoice:1,
      ai:"Mr. Chen: \"Mayor — East Industrial or South Residential? The barriers can only handle one side at full strength. Pick now.\"",
      choices:[
        {text:'🟢 Barrier A — Industrial Zone (protects power grid)',
          impacts:[{icon:'⚡',label:'Power',val:1,max:1},{icon:'🏭',label:'Industry',val:1,max:1},{icon:'😊',label:'Sentiment',val:2,max:10}],
          novaReact:"Protecting the power grid keeps the whole city running. Without it, pumps fail, the hospital goes dark, and rescue teams can't see. Mr. Chen nods: 'The power keeps the water pumps running.'",
          apply:st=>{st.scr_barA=true;st.scr_power=100;st.scr_crisis=(st.scr_crisis||50)-10;},next:2},
        {text:'🟡 Barrier B — Residential Zone (protects homes)',
          impacts:[{icon:'🏠',label:'Homes',val:1,max:1},{icon:'😊',label:'Sentiment',val:3,max:10}],
          novaReact:"People first. Mei's home is in South Residential — her crayon drawings are probably still on the fridge. Mr. Chen's voice cracks: 'Thank you, Mayor.'",
          apply:st=>{st.scr_barB=true;st.scr_shelter=100;st.scr_crisis=(st.scr_crisis||50)-5;},next:2},
        {text:'🔵 Barrier C — Water Treatment (protects supply)',
          impacts:[{icon:'💧',label:'Water',val:1,max:1},{icon:'😊',label:'Sentiment',val:1,max:10}],
          novaReact:"Clean water after a flood stops diseases from spreading. Water treatment is invisible — until you don't have it. Mr. Chen: 'The school needs clean water more than anything.'",
          apply:st=>{st.scr_barC=true;st.scr_water=100;st.scr_crisis=(st.scr_crisis||50)-5;},next:2} ]},
    { stage:'2 🛠️ Response',
      ai:"Mr. Chen: 'I can hear the mains groaning from here. If they burst, we lose pressure across South Residential. Mei's school will be without water.'",
      choices:[
        {text:'🟢 Shut Off Industrial Sector Valves (+15 water saved)',
          impacts:[{icon:'💧',label:'Water Saved',val:15,max:30},{icon:'🏭',label:'Production',val:-1,max:1}],
          novaReact:'Shutting industry down saves millions of litres for drinking. Mei needs clean water for school lunch tomorrow.',
          apply:st=>{st.scr_water=Math.min(100,(st.scr_water||80)+15);st.scr_crisis=(st.scr_crisis||50)-15;},next:3},
        {text:'🟡 Reduce Residential Pressure (+10 water saved, -2 sentiment)',
          impacts:[{icon:'💧',label:'Water Saved',val:10,max:30},{icon:'😊',label:'Sentiment',val:-2,max:10}],
          novaReact:"Low pressure means weaker showers, but stops the pipes from bursting. Mr. Chen says it's the right call — he'd rather have wet feet than no water tomorrow.",
          apply:st=>{st.scr_pressure=(st.scr_pressure||100)-15;st.scr_water=Math.min(100,(st.scr_water||80)+10);st.scr_crisis=(st.scr_crisis||50)-10;},next:3} ]},
    { stage:'🤖 How AI Helps', storytelling:true,
      character:{name:'Nova',emoji:'🤖',title:'Your AI Assistant',
        message:"Mayor, I predicted where the water would go using PREDICTION. I analyzed rainfall data, river levels from the last 50 years, and satellite images of the terrain — all in real time. Prediction is like knowing a glass will overflow before you pour too much. I saw this flood coming 6 hours ago. Mr. Chen was already at the gauge station before the first raindrop hit the river."},
      ai:'Nova: I use historical data, weather models, and real-time sensors to predict where water will flow — before it gets there.',
      novaSays:'Prediction is like checking if your glass is about to overflow before you keep pouring — my models do that for the whole river system!',
      choices:[{text:"▶ That's amazing! What's next?",apply:st=>{},next:4}] },
    { stage:'4 📊 Analyze the Data',
      dataView:[
        {icon:'🏭',label:'East Industrial',value:65,max:100,unit:'% flooded'},
        {icon:'🏘️',label:'South Residential',value:30,max:100,unit:'% flooded'},
        {icon:'🏫',label:"Mei's School (Central)",value:5,max:100,unit:'% flooded'},
      ],
      ai:"Nova: Here's the flood data by district. Which zone needs our immediate attention?",
      choices:[
        {text:"🟢 East Industrial — 65% flooded! That's the power grid zone!",
          impacts:[{icon:'⚡',label:'Power Focus',val:10,max:15}],
          novaReact:"Correct! Industrial flooding threatens the whole city's power. But we already chose a barrier — now we prioritize the secondary defenses.",
          apply:st=>{st.scr_power=Math.min(100,(st.scr_power||50)+10);st.scr_crisis=(st.scr_crisis||50)-10;},next:5},
        {text:'🟡 South Residential — 30% flooded, homes at risk',
          impacts:[{icon:'🏠',label:'Home Focus',val:5,max:15}],
          novaReact:'Homes are important, but the data shows industrial infrastructure powers everything. The numbers help us see the bigger picture.',
          apply:st=>{st.scr_shelter=Math.min(100,(st.scr_shelter||50)+5);st.scr_crisis=(st.scr_crisis||50);},next:5}] },
    { stage:'5 🔥 Make the Call',
      ai:"Mr. Chen: 'Mayor, the water is still rising. The AI says we can open the dam spillways to relieve pressure — but it'll flood the old industrial park. Your call.'",
      choices:[
        {text:'🤖 Accept: Full AI plan — open spillways (max control)',
          impacts:[{icon:'💧',label:'Flood Control',val:15,max:20},{icon:'🏭',label:'Industrial Lost',val:-1,max:1},{icon:'😊',label:'Sentiment',val:-3,max:10}],
          novaReact:"The old industrial park floods, but 5,000 homes stay dry. Mr. Chen: 'That park has been empty for years. Good trade.'",
          apply:st=>{st.scr_spillwayOpen=true;st.scr_water=Math.min(100,(st.scr_water||60)+15);st.scr_sent=(st.scr_sent||70)-3;st.scr_crisis=(st.scr_crisis||50)-20;},next:-1},
        {text:'🤝 Modify: Partial spill + sandbags (balanced)',
          impacts:[{icon:'💧',label:'Flood Control',val:8,max:20},{icon:'😊',label:'Sentiment',val:5,max:10}],
          novaReact:"Half the spillway, plus volunteers with sandbags. Mr. Chen: 'This is what community looks like, Mayor.'",
          apply:st=>{st.scr_partialSpill=true;st.scr_water=Math.min(100,(st.scr_water||60)+8);st.scr_sent=(st.scr_sent||70)+5;st.scr_crisis=(st.scr_crisis||50)-10;},next:-1},
        {text:'👤 Override: Manual pumps, no flooding (slowest)',
          impacts:[{icon:'💧',label:'Flood Control',val:3,max:20},{icon:'😊',label:'Sentiment',val:8,max:10}],
          novaReact:"Pumping water uphill by hand, essentially. Mr. Chen: 'It'll take all night, but no one loses their workplace. I like it.'",
          apply:st=>{st.scr_manualPump=true;st.scr_sent=(st.scr_sent||70)+8;st.scr_water=Math.min(100,(st.scr_water||60)+3);st.scr_crisis=(st.scr_crisis||50)-5;},next:-1}] },
    { stage:'10 🔥 Critical Decision',
      ai:"⚠️ Water breaching the unprotected zone! Mr. Chen: 'We're losing the corner by Mei's school! The water is at the playground!'",
      choices:[
        {text:'🟢 Emergency Sandbags at School (+cost, +5 sentiment)',
          impacts:[{icon:'🏫',label:'School Saved',val:1,max:1},{icon:'🪙',label:'Cost',val:-8,max:15},{icon:'😊',label:'Sentiment',val:5,max:10}],
          novaReact:"Mei's class photo is still pinned to the classroom wall. We can't let it wash away. Mr. Chen's grandson's first art project is in that room.",
          apply:st=>{st.scr_sandbags=true;st.scr_sent=(st.scr_sent||70)+5;st.scr_cost=(st.scr_cost||0)+8;st.scr_water=Math.min(100,(st.scr_water||60)+5);st.scr_crisis=(st.scr_crisis||50)+15;},next:11},
        {text:'🔴 Evacuate South Residential (lose homes, save lives)',
          impacts:[{icon:'🏠',label:'Homes Lost',val:1,max:1},{icon:'😊',label:'Sentiment',val:-10,max:20}],
          novaReact:"Mei's swing set will be under water. But they'll be safe. Mr. Chen: 'Tell my wife to grab Mei's drawings. That's all that matters.'",
          apply:st=>{st.scr_evac=true;st.scr_sent=(st.scr_sent||70)-10;st.scr_crisis=(st.scr_crisis||50)+20;},next:11} ]},
    { stage:'11 ✅ Final Chance',
      ai:'Water receding. Mr. Chen standing on his porch in waders, looking at the debris line on his front wall. Mei is waving from the window.',
      choices:[
        {text:'🟢 Full Infrastructure Inspection (+repairs, +cost, +3 sentiment)',
          impacts:[{icon:'🔧',label:'Repairs',val:1,max:1},{icon:'🪙',label:'Cost',val:-10,max:20},{icon:'😊',label:'Sentiment',val:3,max:10}],
          novaReact:"Mr. Chen already has his hard hat on. 'Let me check every pipe myself. Mei is drawing a thank-you card for the Mayor.'",
          apply:st=>{st.scr_inspect=true;st.scr_sent=(st.scr_sent||60)+3;st.scr_cost=(st.scr_cost||0)+10;st.scr_water=Math.min(100,(st.scr_water||65)+10);st.scr_crisis=(st.scr_crisis||50)-15;},next:-1},
        {text:'🔴 Focus on Cleanup Only (cheaper, slower recovery)',
          impacts:[{icon:'🧹',label:'Cleanup',val:1,max:1},{icon:'😊',label:'Sentiment',val:-8,max:20}],
          novaReact:"Mr. Chen will be up all night checking the pipes anyway — even if we don't pay for the inspection. 'I know every joint in this system,' he says.",
          apply:st=>{st.scr_cleanup=true;st.scr_sent=(st.scr_sent||60)-8;st.scr_crisis=(st.scr_crisis||50)+10;},next:-1}] }
  ],
  outcome:st=>{
    let stars=0;
    if(st.scr_barA||st.scr_barB||st.scr_barC)stars++;
    if(st.scr_water&&st.scr_water>70)stars++;
    if(st.scr_power&&st.scr_power>50)stars++;
    const c=st.scr_cost||0;
    return{stars:stars||1,msg:['All districts protected! Mei slept through the whole thing. Cost: '+c+' tokens.','South Residential flooded — no casualties. Mr. Chen\'s home took on 30cm of water. Cost: '+c+' tokens.','Partial flooding through 3 districts. Cost: '+c+' tokens.'][Math.min(stars,2)]};
  },
  outcomeNova:stars=>stars===3?'🎉 The flood barriers held, no homes lost, and Mei slept right through it! You protected an entire community! 🌟':stars===2?"Mr. Chen's home got wet but his family is safe. We'll reinforce the weak spots for next time.":'Water got into some homes, including Mr. Chen\'s. No casualties, but a lot of cleanup ahead.',
  outcomeCharacter:stars=>({emoji:'👨🏻‍🔧',name:'Mr. Chen',
    msg:stars===3?"Mei is asking if the Mayor can come to her show-and-tell. She wants to show you the drawing she made of you. Thank you — from our whole family."
      :stars===2?"We got water in the basement — lost some of Mei's old artwork from kindergarten. But we're all safe. That's what truly matters."
      :stars===1?"Mei's room got wet but her bed was high enough. She's already asking when we can go back to school. We'll dry out. We always do.":''}),
  conceptCard:{title:'Prediction',body:'Prediction is when AI uses past information and real-time data to guess what will happen next — like knowing a glass will overflow before you pour too much, but for rivers and weather.'},
  lesson:'Water Supply (L9) + Drone Routing (L4)',
  lg:'Flood response requires prioritizing infrastructure (power, water, shelter) while AI predicts spread patterns from real-time data.'
});

// ── 3. CYBER ──
S.push({
  id:'cyber',icon:'💻',
  name:'Cyber Traffic Freeze',
  desc:"A AI servers hacked — all traffic lights frozen. Kofi's dad is in a stuck ambulance.",
  missing:'Need Traffic Lights or Roads',
  check:st=>has(st,'traffic','cctv')||cnt(st,'road')>=3,
  aiIntro:st=>{
    const road=cnt(st,'road');
    return `💻 Cyber attack detected! ${road} traffic lights frozen.<br>Gridlock forming at ${Math.floor(road*0.3)} intersections.<br>🚑 Ambulance stuck at Main & 5th — patient needs hospital in 4 minutes.`;
  },
  meter:ss=>({value:Math.min(100,Math.max(0,ss.scr_crisis||50)),label:'Traffic Gridlock',max:100}),
  gauge:(ss,st)=>({label:'Congestion',value:Math.round(ss.scr_gridlock||50),max:100,unit:'%'}),
  steps:[
    { stage:'📞 Emergency Call', storytelling:true,
      character:{name:'Kofi',emoji:'👦🏿',title:'Student at Westside Primary',
        message:"Please, it's my dad. He had a heart attack at work. The ambulance has been stuck at Main and 5th for 6 minutes. My mom is screaming. I'm at school and I can't do anything. Please tell me my dad is going to be okay."},
      ai:'Nova: Ransomware locking all 47 intersections. The ambulance has been stationary for 6 minutes. Patient: male, 42, suspected cardiac event. Treatment window: approximately 4 minutes remaining.',
      novaSays:"Kofi built a model volcano for the science fair last month. I don't want to tell him why his dad didn't make it. Every second matters.",
      choices:[{text:'▶ Continue',apply:st=>{},next:1}] },
    { stage:'1 ⚡ First Response',
      ai:"Kofi's classmate texts him a photo of the ambulance — still stuck, lights flashing, surrounded by unmoving cars. The grid is frozen.",
      choices:[
        {text:"🟢 Create Green Wave for Ambulance (saves Kofi's dad)",
          impacts:[{icon:'🚑',label:'Rescue',val:1,max:1},{icon:'🚦',label:'Gridlock',val:-3,max:20}],
          novaReact:"A green wave creates a path through gridlock — every light turns green for the ambulance. The city is literally making way for Kofi's dad.",
          apply:st=>{st.scr_ambulance=true;st.scr_gridlock=(st.scr_gridlock||50)-3;st.scr_crisis=(st.scr_crisis||50)-10;},next:2},
        {text:'🟡 Stabilize Major Intersections First (-8 gridlock)',
          impacts:[{icon:'🚦',label:'Gridlock',val:-8,max:20},{icon:'🚑',label:'Ambulance',val:0,max:1}],
          novaReact:"Kofi is watching the clock on his mom's phone. Every minute that passes, his father's heart gets weaker. Stabilizing helps everyone, but not in time.",
          apply:st=>{st.scr_gridlock=(st.scr_gridlock||50)-8;st.scr_ambulance=false;st.scr_crisis=(st.scr_crisis||50)-5;},next:10} ]},
    { stage:'2 🛠️ Response',
      ai:"Green wave active! Ambulance finally moving. Kofi texts: 'Is he at the hospital yet? Is he okay?' Secondary jams forming across the city.",
      choices:[
        {text:'🟢 Auto-Reset Traffic Nodes (-8 gridlock)',
          impacts:[{icon:'🚦',label:'Gridlock',val:-8,max:20},{icon:'🤖',label:'AI Auto',val:1,max:1}],
          novaReact:"The system reboots intersection by intersection. Like dominos, the green spreads. Kofi will get to visit his dad in a hospital bed, not a chapel.",
          apply:st=>{st.scr_gridlock=(st.scr_gridlock||50)-8;st.scr_crisis=(st.scr_crisis||50)-15;},next:3},
        {text:'🔵 Manual Police Direction at Hotspots (-6 gridlock, +2 sentiment)',
          impacts:[{icon:'🚦',label:'Gridlock',val:-6,max:20},{icon:'😊',label:'Sentiment',val:2,max:10}],
          novaReact:"Traffic cops stepping up — old school but effective. Drivers see a person in control, not just a machine. Kofi's mom just wants to get to the hospital.",
          apply:st=>{st.scr_gridlock=(st.scr_gridlock||50)-6;st.scr_sent=(st.scr_sent||70)+2;st.scr_crisis=(st.scr_crisis||50)-12;},next:3} ]},
    { stage:'🤖 How AI Helps', storytelling:true,
      character:{name:'Nova',emoji:'🤖',title:'Your AI Assistant',
        message:"Mayor, the ransomware attack was detected by my ANOMALY DETECTION system. I noticed that traffic data was suddenly repeating in a perfect pattern — no variation, no human randomness. That's like noticing one kid in class is suddenly wearing pyjamas — it doesn't fit the pattern. I flagged it as unusual 30 seconds after the attack started. Anomaly detection catches things that don't belong."},
      ai:'Nova: My systems spotted the hack instantly — normal traffic data is chaotic, but an attack leaves a clean, artificial signature.',
      novaSays:"Anomaly detection is like noticing one kid in class is wearing pyjamas — it stands out because it doesn't fit the usual pattern!",
      choices:[{text:'▶ I understand! What now?',apply:st=>{},next:4}] },
    { stage:'4 📊 Analyze the Data',
      dataView:[
        {icon:'🚦',label:'Downtown',value:85,max:100,unit:'congestion'},
        {icon:'🏘️',label:'Residential',value:45,max:100,unit:'congestion'},
        {icon:'🏥',label:'Hospital Route',value:67,max:100,unit:'congestion'},
      ],
      ai:"Nova: Here's the congestion data. Which area needs the most urgent traffic priority?",
      choices:[
        {text:"🟢 Hospital Route — 67% congestion! That's where Kofi's dad is going!",
          impacts:[{icon:'🚑',label:'Route Clear',val:10,max:15}],
          novaReact:'Correct! Getting the hospital route clear is the priority. The ambulance needs a path for the return trip.',
          apply:st=>{st.scr_gridlock=(st.scr_gridlock||45)-10;st.scr_crisis=(st.scr_crisis||50)-10;},next:5},
        {text:'🟡 Downtown — 85% congestion, most businesses',
          impacts:[{icon:'🏢',label:'Business Flow',val:5,max:15}],
          novaReact:'Downtown is worse, but the hospital route is where a life hangs in the balance. Data helps us see what matters most.',
          apply:st=>{st.scr_gridlock=(st.scr_gridlock||45)-5;st.scr_crisis=(st.scr_crisis||50);},next:5}] },
    { stage:'5 🔥 Make the Call',
      ai:"Nova: We've identified the hacker's IP. I can deploy a countermeasure to isolate the ransomware — but it requires shutting down 20% of city traffic AI permanently to seal the breach.",
      choices:[
        {text:'🤖 Accept: Full AI lockdown (max cyber security)',
          impacts:[{icon:'🔒',label:'Security',val:15,max:20},{icon:'🚦',label:'AI Traffic',val:-20,max:30}],
          novaReact:"The breach is sealed. We lose some AI features, but the city is safe. Kofi's dad is in recovery.",
          apply:st=>{st.scr_security=Math.min(100,(st.scr_security||50)+15);st.scr_gridlock=(st.scr_gridlock||40)+5;st.scr_crisis=(st.scr_crisis||50)-20;},next:-1},
        {text:'🤝 Modify: Partial patch + manual oversight (balanced)',
          impacts:[{icon:'🔒',label:'Security',val:8,max:20},{icon:'😊',label:'Sentiment',val:5,max:10}],
          novaReact:'A patch and a promise — humans will watch the system until it proves safe. Smart balance of risk.',
          apply:st=>{st.scr_manualMode=true;st.scr_sent=(st.scr_sent||70)+5;st.scr_gridlock=(st.scr_gridlock||40)+2;st.scr_crisis=(st.scr_crisis||50)-10;},next:-1},
        {text:'👤 Override: Keep AI running, monitor manually (risky)',
          impacts:[{icon:'🖥️',label:'AI Online',val:1,max:1},{icon:'😊',label:'Sentiment',val:-3,max:10}],
          novaReact:'Keeping the system running while watching for threats. Risky — but you trust your team. I respect that.',
          apply:st=>{st.scr_monitorMode=true;st.scr_sent=(st.scr_sent||70)-3;st.scr_gridlock=(st.scr_gridlock||40);st.scr_crisis=(st.scr_crisis||50)-5;},next:-1}] },
    { stage:'10 🔥 Critical Decision', timer:12, defaultChoice:1,
      ai:"Kofi: 'The ambulance hasn't moved. My mom is screaming at the driver. I don't want my dad to die. Please.' Gridlock at 60%.",
      choices:[
        {text:'🟢 Helicopter Medical Evacuation (+rescue, +cost)',
          impacts:[{icon:'🚁',label:'Rescue',val:1,max:1},{icon:'🪙',label:'Cost',val:-5,max:15}],
          novaReact:"A helicopter to lift Kofi's dad to the hospital roof. Dramatic, expensive, and absolutely necessary. Kofi: 'They said a helicopter! Is my dad in a helicopter?!'",
          apply:st=>{st.scr_ambulance=true;st.scr_cost=(st.scr_cost||0)+5;st.scr_crisis=(st.scr_crisis||50)+15;},next:11},
        {text:'🟡 Police Clear Alternate Route (manual, -4 gridlock)',
          impacts:[{icon:'🚦',label:'Gridlock',val:-4,max:20},{icon:'😊',label:'Sentiment',val:-2,max:10}],
          novaReact:"Police on foot, clearing cars one by one. It's slow — but the ambulance inches forward. Kofi's mom is praying out loud.",
          apply:st=>{st.scr_gridlock=(st.scr_gridlock||50)-4;st.scr_sent=(st.scr_sent||70)-2;st.scr_ambulance=true;st.scr_crisis=(st.scr_crisis||50)+10;},next:11} ]},
    { stage:'11 ✅ Final Chance',
      ai:'Patient critical — 2 minutes to cardiac arrest. Kofi has stopped texting. His mom stopped too.',
      choices:[
        {text:'🟢 Police Siren Escort (rescued, -cost, -6 gridlock)',
          impacts:[{icon:'🚑',label:'Patient Saved',val:1,max:1},{icon:'🪙',label:'Cost',val:-5,max:15},{icon:'🚦',label:'Gridlock',val:-6,max:20}],
          novaReact:"Kofi's dad is wheeled into the OR with seconds to spare. Kofi's text finally arrives: 'They said he's going to be okay.'",
          apply:st=>{st.scr_ambulance=true;st.scr_gridlock=(st.scr_gridlock||50)-6;st.scr_cost=(st.scr_cost||0)+5;st.scr_crisis=(st.scr_crisis||50)-15;},next:-1},
        {text:'🔴 Wait for AI Reboot (risks patient life)',
          impacts:[{icon:'🚑',label:'Patient Risk',val:1,max:1},{icon:'😊',label:'Sentiment',val:-15,max:20}],
          novaReact:"Waiting while a man's heart stops... Kofi is 8 years old. He'll remember today for the rest of his life.",
          apply:st=>{st.scr_sent=(st.scr_sent||70)-15;st.scr_crisis=(st.scr_crisis||50)+20;},next:-1}] }
  ],
  outcome:st=>{
    const g=st.scr_gridlock||50,a=st.scr_ambulance,s=st.scr_sent||70;
    if(g<20&&a)return{stars:3,msg:"Kofi's dad is in recovery. Green wave saved 8 critical minutes. The hacker's IP was traced and reported."};
    if(g<35&&a)return{stars:2,msg:"Kofi's dad is stable. Ambulance arrived late but the surgical team was ready and waiting."};
    if(a)return{stars:2,msg:"Kofi's dad rescued by helicopter. Gridlock still affects some areas but a life was saved."};
    return{stars:1,msg:"Ambulance stuck 12 minutes. Kofi's dad evacuated by stretcher to police car. Cyber defenses updated and hardened."};
  },
  outcomeNova:stars=>stars===3?"🎉 Kofi's dad is going to be okay! The green wave saved him, and we traced the hacker! Kofi wants to shake your hand at the science fair!":stars===2?"Kofi's dad is stable. The ambulance got through — late, but it got through. We stopped the attack before it spread further.":"Kofi's dad survived, but it was far too close. We need better cyber security infrastructure.",
  outcomeCharacter:stars=>({emoji:'👦🏿',name:'Kofi',
    msg:stars===3?'My dad is awake! He said all the lights were green for him. Can I show you my volcano at the science fair? I added extra baking soda for you!'
      :stars===2?"My dad is going to be okay. He's tired and the doctor says he needs rest. I think I do too. Please make sure the computers don't get hacked again."
      :stars===1?"My dad is alive but I can't see him yet because he's in the ICU. I'm not mad at you. But I'm really scared.":''}),
  conceptCard:{title:'Anomaly Detection',body:"Anomaly detection is when AI spots something unusual — like noticing one kid in class is suddenly wearing pyjamas. It catches things that don't fit the normal pattern."},
  lesson:'Traffic Flow (L5) + AI Security (L13)',
  lg:'Cyber attacks on urban AI require rapid triage — critical services (ambulance) must be prioritized over system-wide fixes.'
});

// ── 4. RECYCLING ──
S.push({
  id:'recycling',icon:'🗑️',
  name:'Recycling Centre Breakdown',
  desc:"The AI sorting machine failed. Mr. Chen's team can't keep up. Waste is piling up.",
  missing:'Need a Recycling Center or Collection Point',
  check:st=>has(st,'recycle','collect','compost'),
  aiIntro:st=>{
    const rc=cnt(st,'recycle');
    return `🗑️ Recycling sorter malfunction! ${rc} centre(s) offline.<br>Overflow rate: ${Math.floor(60/rc||30)} bags/hour per district.<br>AI identified: 40% plastic, 25% paper, 15% metal, 10% compost, 10% hazardous.<br>Batteries cannot go to landfill.`;
  },
  meter:ss=>({value:Math.min(100,Math.max(0,ss.scr_crisis||50)),label:'Waste Overflow',max:100}),
  gauge:(ss,st)=>({label:'Overflow',value:Math.round(ss.scr_overflow||0),max:100,unit:'%'}),
  steps:[
    { stage:'📞 Emergency Call', storytelling:true,
      character:{name:'Mr. Chen',emoji:'👨🏻‍🔧',title:'Recycling Centre Supervisor',
        message:"Mayor, the AI sorter went haywire at 3 AM. The conveyor jammed with broken glass, yogurt containers, and old batteries mixed together. My team has been hand-sorting for 6 hours. If this doesn't get sorted by noon, we'll have to start diverting to landfill. I've been here 22 years and I've never seen it this bad."},
      ai:'Nova: Optical sensor firmware error. Conveyor belt at 12% efficiency. Overflow critical within 4 hours. Hazardous materials detected in the general waste stream — batteries and chemicals mixed with paper.',
      novaSays:"Mr. Chen started at this recycling centre 22 years ago when it was just a concrete pad and a pickup truck. Watching it break is like watching a friend get sick.",
      choices:[{text:'▶ Continue',apply:st=>{},next:1}] },
    { stage:'1 ⚡ First Response',
      ai:"Mr. Chen's team is exhausted. The pile of unsorted waste grows by the minute. What's the first priority?",
      choices:[
        {text:'🟢 Sort Hazardous Items First (safe, slow)',
          impacts:[{icon:'☣️',label:'Hazardous Safe',val:1,max:1}],
          novaReact:'Batteries and chemicals first — one wrong crush in the compactor and we have a toxic leak. Slow but absolutely right. Mr. Chen wipes his forehead: "Smart call, Mayor."',
          apply:st=>{st.scr_haz=true;st.scr_overflow=(st.scr_overflow||0)+10;st.scr_crisis=(st.scr_crisis||50)-10;},next:2},
        {text:'🟡 Divert to Backup Facility (fast, limited capacity)',
          impacts:[{icon:'🏭',label:'Backup Used',val:1,max:1},{icon:'🪙',label:'Cost',val:-2,max:10}],
          novaReact:"A patch, not a fix. Mr. Chen will have to split his already exhausted team. 'We'll make it work,' he says. 'We always do.'",
          apply:st=>{st.scr_divert=true;st.scr_overflow=(st.scr_overflow||0)+5;st.scr_cost=(st.scr_cost||0)+2;st.scr_crisis=(st.scr_crisis||50)-5;},next:2},
        {text:'🔵 Pause Inbound Collection (stops overflow, -8 sentiment)',
          impacts:[{icon:'⏸️',label:'Paused',val:1,max:1},{icon:'😊',label:'Sentiment',val:-8,max:20}],
          novaReact:"Trash stays on curbs citywide — residents won't be happy. But it gives Mr. Chen and his team breathing room to catch up.",
          apply:st=>{st.scr_pause=true;st.scr_sent=(st.scr_sent||70)-8;st.scr_overflow=0;st.scr_crisis=(st.scr_crisis||50)+5;},next:10} ]},
    { stage:'2 🛠️ Response',
      ai:"Mr. Chen: 'If we re-route the south trucks to the temporary yard, we'd buy about 2 hours before the next wave arrives.' He's doing the math in his head.",
      choices:[
        {text:'🟢 Re-route Trucks to Temporary Yard (+15 relief, -cost)',
          impacts:[{icon:'🚛',label:'Rerouted',val:1,max:1},{icon:'🪙',label:'Cost',val:-2,max:10}],
          novaReact:'Mr. Chen radios to dispatch: "First truck just arrived at the yard. Tell the Mayor we are making progress." His voice sounds tired but hopeful.',
          apply:st=>{st.scr_reroute=true;st.scr_overflow=Math.max(0,(st.scr_overflow||0)-15);st.scr_cost=(st.scr_cost||0)+2;st.scr_crisis=(st.scr_crisis||50)-15;},next:3},
        {text:'🟡 Extra Collection Shift (+cost, +3 sentiment)',
          impacts:[{icon:'🌙',label:'Night Shift',val:1,max:1},{icon:'🪙',label:'Cost',val:-5,max:10}],
          novaReact:"Mr. Chen: 'Overtime beats explaining to the health inspector.' His team grumbles but they are proud — no one wants to be the first to send waste to landfill on their watch.",
          apply:st=>{st.scr_overflow=0;st.scr_cost=(st.scr_cost||0)+5;st.scr_sent=(st.scr_sent||70)+3;st.scr_crisis=(st.scr_crisis||50)-10;},next:3} ]},
    { stage:'🤖 How AI Helps', storytelling:true,
      character:{name:'Nova',emoji:'🤖',title:'Your AI Assistant',
        message:"Mayor! Let me explain how the sorting works normally. The AI uses IMAGE CLASSIFICATION — it looks at each item on the conveyor belt and identifies what it is made of. Plastic bottle? Goes to plastic. Cardboard box? Goes to paper. It is like sorting LEGO by colour — but doing it for 10,000 pieces every minute. The camera takes a picture, my brain recognises it, and a robotic arm pushes it to the right bin. The firmware error just means I cannot see properly right now."},
      ai:'Nova: Image classification identifies waste types by shape, texture, and colour — sorting 40+ items per second with 99.2% accuracy.',
      novaSays:'Image classification is like sorting LEGO by colour, 10,000 pieces per minute — the AI looks at each item and decides exactly where it belongs!',
      choices:[{text:'▶ I get it! What else?',apply:st=>{},next:7}] },
    { stage:'5 🔥 Make the Call',
      ai:"Mr. Chen: 'The pile is down to knee height. Do we fix the AI or keep doing this by hand?'",
      choices:[
        {text:'🟢 Full AI Recalibration (+efficiency, +5 sentiment, -cost)',
          impacts:[{icon:'🤖',label:'AI Recal',val:1,max:1},{icon:'😊',label:'Sentiment',val:5,max:10},{icon:'🪙',label:'Cost',val:-3,max:10}],
          novaReact:"'This thing will sort faster than ever,' Mr. Chen says, patting the machine. 'Like giving the old girl a new brain.' His team cheers. No more hand-sorting.",
          apply:st=>{st.scr_recal=true;st.scr_sent=(st.scr_sent||70)+5;st.scr_cost=(st.scr_cost||0)+3;st.scr_overflow=0;st.scr_crisis=(st.scr_crisis||50)-20;},next:-1},
        {text:'🟡 Manual Sorting Only (reliable, slower, no AI fix)',
          impacts:[{icon:'👷',label:'Manual',val:1,max:1}],
          novaReact:"Hand-sorting until the AI technician arrives tomorrow. Mr. Chen shrugs: 'We knew how to sort before computers. We still remember.' His team knows waste better than any machine.",
          apply:st=>{st.scr_manual=true;st.scr_overflow=Math.max(0,(st.scr_overflow||0)-5);st.scr_crisis=(st.scr_crisis||50)-8;},next:-1} ]},
    { stage:'10 🔥 Critical Decision',
      ai:'⚠️ Waste pile 3m high! Rat sightings reported. Health inspector: "Clean this up or I am shutting you down within the hour."',
      choices:[
        {text:'🟢 Emergency Cleanup Crew (+20 relief, +cost, +2 sentiment)',
          impacts:[{icon:'🧹',label:'Cleanup',val:1,max:1},{icon:'🪙',label:'Cost',val:-8,max:15},{icon:'😊',label:'Sentiment',val:2,max:10}],
          novaReact:"'The rats are the size of my cat,' Mr. Chen mutters. 'We need this gone before the news trucks arrive.' The cleanup crew works like a machine — almost as fast as the sorter used to.",
          apply:st=>{st.scr_cleanup=true;st.scr_overflow=Math.max(0,(st.scr_overflow||0)-20);st.scr_cost=(st.scr_cost||0)+8;st.scr_sent=(st.scr_sent||70)+2;st.scr_crisis=(st.scr_crisis||50)+15;},next:11},
        {text:'🔴 Landfill Dump (fast, violates policy, -10 sentiment)',
          impacts:[{icon:'🗑️',label:'Landfill',val:1,max:1},{icon:'😊',label:'Sentiment',val:-10,max:20}],
          novaReact:"Mr. Chen stares at the landfill permit like it is a betrayal of everything he has built. '22 years without sending anything to dump,' he says quietly. 'I guess there is a first time for everything.'",
          apply:st=>{st.scr_landfill=true;st.scr_overflow=Math.max(0,(st.scr_overflow||0)-30);st.scr_sent=(st.scr_sent||70)-10;st.scr_cost=(st.scr_cost||0)+5;st.scr_crisis=(st.scr_crisis||50)+20;},next:11} ]},
    { stage:'11 ✅ Final Chance',
      ai:"Health inspector arriving in 30 minutes. Mr. Chen's wife shows up with coffee and sandwiches for the whole team.",
      choices:[
        {text:'🟢 Full Resources to Clear (avoids fine, +cost, -15 overflow)',
          impacts:[{icon:'✅',label:'Compliance',val:1,max:1},{icon:'🪙',label:'Cost',val:-10,max:20}],
          novaReact:"The last bag hits the bin as the inspector's car pulls into the parking lot. Mr. Chen exhales for the first time in 9 hours. His wife hands him a coffee. 'Good timing,' she says.",
          apply:st=>{st.scr_comply=true;st.scr_overflow=Math.max(0,(st.scr_overflow||0)-30);st.scr_cost=(st.scr_cost||0)+10;st.scr_crisis=(st.scr_crisis||50)-15;},next:-1},
        {text:'🔴 Take the Fine (reputation damage, -15 sentiment)',
          impacts:[{icon:'💸',label:'Fine',val:1,max:1},{icon:'😊',label:'Sentiment',val:-15,max:20}],
          novaReact:"22 years without a single fine. Mr. Chen: 'First time for everything, I guess.' He sounds ashamed. His wife puts a hand on his shoulder.",
          apply:st=>{st.scr_fined=true;st.scr_sent=(st.scr_sent||70)-15;st.scr_overflow=Math.max(0,(st.scr_overflow||0)+10);st.scr_crisis=(st.scr_crisis||50)+20;},next:-1}] },
    { stage:'4 📊 Analyze the Data',
      dataView:[
        {icon:'🧴',label:'Plastic Waste',value:40,max:100,unit:'%'},
        {icon:'📦',label:'Cardboard',value:25,max:100,unit:'%'},
        {icon:'🥫',label:'Metal Cans',value:20,max:100,unit:'%'},
        {icon:'☣️',label:'Hazardous',value:10,max:100,unit:'%'},
      ],
      ai:"Nova: Here is what is piling up. Which type is most urgent to sort before it causes a problem?",
      choices:[
        {text:'☣️ Hazardous First — batteries and chemicals are dangerous!',
          impacts:[{icon:'☣️',label:'Safety',val:10,max:15}],
          novaReact:"Correct! Batteries can leak toxic chemicals into the ground. Safety first — Mr. Chen already has his hazmat gloves on. 'Thank you for remembering the batteries, Mayor.'",
          apply:st=>{st.scr_haz=true;st.scr_overflow=Math.max(0,(st.scr_overflow||0)-5);st.scr_crisis=(st.scr_crisis||50)-10;},next:4},
        {text:'🧴 Plastic First — it is the biggest pile!',
          impacts:[{icon:'♻️',label:'Volume',val:5,max:15}],
          novaReact:'Plastic is a lot of volume, but the hazardous stuff is what will get us shut down. Mr. Chen sighs: "I wish we could do both. But we have to pick."',
          apply:st=>{st.scr_overflow=Math.max(0,(st.scr_overflow||0)-10);st.scr_crisis=(st.scr_crisis||50);},next:4}] }
  ],
  outcome:st=>{
    const o=st.scr_overflow||0,s=st.scr_sent||70,c=st.scr_cost||0;
    if(o<5&&s>50)return{stars:3,msg:'Zero landfill overflow. AI sorter running better than new. Mr. Chen took his wife out for dinner. Cost: '+c+' tokens.'};
    if(o<20)return{stars:2,msg:'Minor overflow handled by backup facility. No fines. Mr. Chen team worked through lunch. Cost: '+c+' tokens.'};
    return{stars:1,msg:'Waste overflow in 2 districts. Landfill policy violated. First fine in 22 years. Cost: '+c+' tokens.'};
  },
  outcomeNova:stars=>stars===3?`🎉 Zero waste to landfill! Mr. Chen is taking his wife out tonight — first dinner date in months! The AI sorts faster than ever!`:stars===2?`We had some overflow but avoided the worst. Mr. Chen team worked through lunch but got it done.`:`Things got messy and we took our first fine in 22 years. But Mr. Chen is already planning the upgrades needed.`,
  outcomeCharacter:stars=>({emoji:'👨🏻‍🔧',name:'Mr. Chen',
    msg:stars===3?`My wife said she is proud of me today. That does not happen every day. Thank you, Mayor, for believing in us.`
      :stars===2?`We got through it. I will have the AI technician look at the sensors tomorrow. For now, I am going home to sleep.`
      :`First fine in 22 years. My wife said it does not matter. But it matters to me. We will fix it. We always do.`}),
  conceptCard:{title:'Image Classification',body:'Image classification is when AI looks at a picture and figures out what it is — like sorting LEGO by colour, 10,000 pieces per minute, but for recycling!'},
  lesson:'Waste Classification (L1) + Delivery Loops (L6)',
  lg:'AI-assisted waste sorting separates items by type using image classification, but manual oversight is needed for edge cases like hazardous items.'
});

// ── 5. EVACUATION ──
S.push({
  id:'evacuation',icon:'🚨',
  name:'AI Evacuation Alert',
  desc:"A fire at the community centre. Dr. Amina's niece is among 80 people trapped.",
  missing:'Need a large building',
  check:()=>true,
  aiIntro:st=>`🚨 Fire alarm at the community centre! Occupants: 80. 3 exits available.<br>Dr. Amina's niece is in the after-school program. Emergency services arriving in 4 minutes.`,
  meter:ss=>({value:Math.min(100,Math.max(0,ss.scr_crisis||50)),label:'Evacuation Risk',max:100}),
  gauge:(ss,st)=>({label:'Time Left',value:60-Math.round(ss.scr_time/2||0),max:60,unit:'s'}),
  steps:[
    { stage:'📞 Emergency Call', storytelling:true,
      character:{name:'Dr. Amina',emoji:'👩🏾‍⚕️',title:'Chief of City Hospital',
        message:"Mayor, there is a fire at the Parkside Community Centre. My niece Aya is in the art room on the second floor — the after-school program. 80 people inside, 45 of them children. I am stuck in surgery. I cannot leave the patient on the table. I am begging you — get them out."},
      ai:'Nova: Fire detected on floor 1. CCTV shows crowd surging at Exit 1. Exits 2 and 3 are underutilised. Emergency services ETA: 4 minutes 20 seconds. Smoke rising toward the art room.',
      novaSays:"Aya is 7. She painted a picture of the Mayor last week in art class. It is probably still drying on the windowsill of the burning room.",
      choices:[{text:'▶ Continue',apply:st=>{},next:1}] },
    { stage:'1 ⚡ First Response',
      ai:"Smoke is filling the art room corridor. The main exit is overcrowded. Aya's mom is already outside the cordon, trying to get in.",
      choices:[
        {text:'🟢 Guide Crowd to Exit 2 via AI PA System',
          impacts:[{icon:'🚪',label:'Exit 1 Load',val:-20,max:50},{icon:'🕐',label:'Time Buffer',val:30,max:120}],
          novaReact:"The PA crackles to life: 'Please use the rear exit calmly.' CCTV shows people turning. The bottleneck loosens. Through the smoke, Aya is being led toward the right door by her teacher.",
          apply:st=>{st.scr_exit1=(st.scr_exit1||50)-20;st.scr_time=(st.scr_time||0)+30;st.scr_crisis=(st.scr_crisis||50)-10;},next:2},
        {text:'🟡 Open Roof Fire Escape (alternative route)',
          impacts:[{icon:'🪜',label:'Roof Access',val:1,max:1},{icon:'🕐',label:'Time Buffer',val:10,max:120}],
          novaReact:"Aya's art teacher is leading a group up the stairs to the roof. 'Stay low, cover your mouths!' she shouts. Aya is holding her hand tight.",
          apply:st=>{st.scr_roof=true;st.scr_time=(st.scr_time||0)+10;st.scr_crisis=(st.scr_crisis||50)-5;},next:2},
        {text:'🔵 Hold Everyone Inside (wait for fire services)',
          impacts:[{icon:'⏸️',label:'Hold',val:1,max:1},{icon:'🚪',label:'Exit 1 Load',val:15,max:50}],
          novaReact:'Holding everyone while the fire spreads... Aya is on the second floor. The smoke rises. The fire follows. The main exit becomes a bottleneck.',
          apply:st=>{st.scr_hold=true;st.scr_time=(st.scr_time||0)+60;st.scr_exit1=(st.scr_exit1||50)+15;st.scr_crisis=(st.scr_crisis||50)+10;},next:10} ]},
    { stage:'2 🛠️ Response',
      ai:"Fire trucks arriving — but the access road is blocked by parked cars. Aya's mom is running among the cars, trying to find their owners.",
      choices:[
        {text:'🟢 AI Auto-Call Vehicle Owners + Tow Team',
          impacts:[{icon:'🚗',label:'Road Clear',val:1,max:1},{icon:'🕐',label:'Time Buffer',val:30,max:120}],
          novaReact:'Phones buzz in the crowd. People rush to move their cars — some in bathrobes, still in slippers. The fire truck rolls through as the last car pulls away. Aya mom is crying with relief.',
          apply:st=>{st.scr_roadClear=true;st.scr_time=(st.scr_time||0)+30;st.scr_rescue=(st.scr_rescue||50)+25;st.scr_crisis=(st.scr_crisis||50)-15;},next:3},
        {text:'🟡 Divert Fire Trucks to Secondary Entrance (faster, narrower)',
          impacts:[{icon:'🚒',label:'Diverted',val:1,max:1},{icon:'🕐',label:'Time Saved',val:-20,max:120}],
          novaReact:"The fire truck barely squeezes through the narrow back entrance. Aya's classroom window is directly above. 'I see her!' a firefighter shouts over the radio. 'She is waving.'",
          apply:st=>{st.scr_divert=true;st.scr_rescue=(st.scr_rescue||50)+15;st.scr_time=Math.max(0,(st.scr_time||0)-20);st.scr_crisis=(st.scr_crisis||50)-10;},next:3} ]},
    { stage:'🤖 How AI Helps', storytelling:true,
      character:{name:'Nova',emoji:'🤖',title:'Your AI Assistant',
        message:"Mayor, I am helping coordinate the evacuation using PATHFINDING. That is the same technology GPS uses to find the fastest way through traffic. I analysed every possible exit route for every person in the building — which stairs, which doors, which windows are safest. Pathfinding finds the quickest way from point A to point B, whether it is a person fleeing a fire or a drone delivering packages."},
      ai:'Nova: Pathfinding algorithms calculate the fastest route to safety for every person, considering fire spread, crowd density, and exit capacity.',
      novaSays:'Pathfinding is like GPS finding the fastest way home through traffic — but for getting people out of a burning building!',
      choices:[{text:'▶ I see! Show me more!',apply:st=>{},next:4}] },
    { stage:'4 📊 Analyze the Data',
      dataView:[
        {icon:'🚪',label:'Exit 1 (Main)',value:45,max:50,unit:'people'},
        {icon:'🚪',label:'Exit 2 (Rear)',value:12,max:50,unit:'people'},
        {icon:'🚪',label:'Exit 3 (Side)',value:8,max:50,unit:'people'},
      ],
      ai:"Nova: Live exit load data. Which exit is dangerously overcrowded?",
      choices:[
        {text:'🟢 Exit 1 — 45 people! That is almost at max capacity!',
          impacts:[{icon:'🚪',label:'Exit Balance',val:10,max:15}],
          novaReact:'Correct! Exit 1 is critical — that is where the crowd surge is. We are redirecting people to the other exits right now. Data saves lives.',
          apply:st=>{st.scr_exit1=(st.scr_exit1||50)-10;st.scr_rescue=(st.scr_rescue||50)+10;st.scr_crisis=(st.scr_crisis||50)-10;},next:5},
        {text:'🟡 Exit 3 — only 8 people, could be faster',
          impacts:[{icon:'🚪',label:'Exit Balance',val:5,max:15}],
          novaReact:'Exit 3 is underutilised — we should route more people there. Every exit matters when seconds count.',
          apply:st=>{st.scr_rescue=(st.scr_rescue||50)+5;st.scr_crisis=(st.scr_crisis||50);},next:5}] },
    { stage:'5 🔥 Make the Call',
      ai:"Firefighters are at the art room door. The fire is spreading along the ceiling. Nova has three recommendations:",
      choices:[
        {text:'🤖 Accept: Full AI guided evacuation (max safety)',
          impacts:[{icon:'🚪',label:'Evacuated',val:15,max:20},{icon:'😊',label:'Sentiment',val:-2,max:10}],
          novaReact:'Every person follows the path I calculated. 78 people exit in 3 minutes. 2 firefighters go in for Aya.',
          apply:st=>{st.scr_rescue=(st.scr_rescue||50)+15;st.scr_sent=(st.scr_sent||70)-2;st.scr_crisis=(st.scr_crisis||50)-20;},next:-1},
        {text:'🤝 Modify: AI assist + firefighter judgment (balanced)',
          impacts:[{icon:'👨‍🚒',label:'Coordinated',val:8,max:20},{icon:'😊',label:'Sentiment',val:5,max:10}],
          novaReact:"Firefighters use my data but trust their instincts. Aya's teacher kicked open the fire escape — that split-second human decision saved 30 seconds.",
          apply:st=>{st.scr_coordinated=true;st.scr_sent=(st.scr_sent||70)+5;st.scr_rescue=(st.scr_rescue||50)+8;st.scr_crisis=(st.scr_crisis||50)-10;},next:-1},
        {text:'👤 Override: Firefighters lead, AI supports (human trust)',
          impacts:[{icon:'👨‍🚒',label:'Manual Rescue',val:3,max:20},{icon:'😊',label:'Sentiment',val:8,max:10}],
          novaReact:'The captain has 20 years of experience. He knows when a floor is about to collapse. I just provide the thermal data. Human experience wins.',
          apply:st=>{st.scr_manualRescue=true;st.scr_sent=(st.scr_sent||70)+8;st.scr_rescue=(st.scr_rescue||50)+3;st.scr_crisis=(st.scr_crisis||50)-5;},next:-1}] },
    { stage:'10 🔥 Critical Decision',
      ai:"⚠️ Exit 1 stampede! Three people injured. Aya is still on the second floor with her teacher. The smoke is getting darker — closer to the floor.",
      choices:[
        {text:'🟢 Break Exit 3 Wall (+new exit, +cost, -3 sentiment)',
          impacts:[{icon:'🧱',label:'Exit 3 Created',val:1,max:1},{icon:'🪙',label:'Cost',val:-8,max:15}],
          novaReact:"Firefighters take an axe to the east wall. Brick and dust explode inward. A new exit — rough, jagged, but open. 'That way!' Aya's teacher shouts. 'Go, go, go!'",
          apply:st=>{st.scr_exit3=true;st.scr_exit1=(st.scr_exit1||50)-30;st.scr_cost=(st.scr_cost||0)+8;st.scr_sent=(st.scr_sent||70)-3;st.scr_crisis=(st.scr_crisis||50)+15;},next:11},
        {text:'🔴 Force Through Exit 1 (high risk, -15 sentiment)',
          impacts:[{icon:'🚪',label:'Exit 1 Push',val:1,max:1},{icon:'😊',label:'Sentiment',val:-15,max:20}],
          novaReact:"People push and stumble. Aya is still upstairs — the stairs are filling with smoke. 'I cannot see!' a child screams over the chaos.",
          apply:st=>{st.scr_exit1Crush=true;st.scr_time=Math.max(0,(st.scr_time||0)-40);st.scr_sent=(st.scr_sent||70)-15;st.scr_rescue=(st.scr_rescue||50)-20;st.scr_crisis=(st.scr_crisis||50)+25;},next:11} ]},
    { stage:'11 ✅ Final Chance',
      ai:"Fire reached the second floor. Aya is trapped in the art room with her teacher. Dr. Amina is calling from the hospital — she heard the news between surgeries.",
      choices:[
        {text:'🟢 Helicopter Roof Evacuation (+cost, saves all, +5 sentiment)',
          impacts:[{icon:'🚁',label:'Heli Rescue',val:1,max:1},{icon:'🪙',label:'Cost',val:-12,max:20},{icon:'😊',label:'Sentiment',val:5,max:10}],
          novaReact:"Aya is wrapped in a fire blanket and lifted into the sky. The whole crowd below watches — then erupts in cheers. Her mom collapses, sobbing — happy tears. Dr. Amina texts: 'I just saw the helicopter from my window. Is she okay?' Yes, Dr. Amina. She is okay.",
          apply:st=>{st.scr_helo=true;st.scr_rescue=(st.scr_rescue||50)+40;st.scr_cost=(st.scr_cost||0)+12;st.scr_sent=(st.scr_sent||70)+5;st.scr_crisis=(st.scr_crisis||50)-20;},next:-1},
        {text:'🔴 Firefighters Interior Rescue (brave, dangerous, -8 sentiment)',
          impacts:[{icon:'👨‍🚒',label:'Interior Rescue',val:1,max:1},{icon:'😊',label:'Sentiment',val:-8,max:20}],
          novaReact:"Firefighters emerge from the thick black smoke carrying Aya — she is coughing, wrapped in a jacket. Her teacher follows, helping another child. The crowd holds its breath. Then Aya waves. Everyone cries.",
          apply:st=>{st.scr_interiorRescue=true;st.scr_rescue=(st.scr_rescue||50)+15;st.scr_sent=(st.scr_sent||70)-8;st.scr_crisis=(st.scr_crisis||50)+10;},next:-1}] }
  ],
  outcome:st=>{
    const r=st.scr_rescue||50,t=st.scr_time||0;
    if(r>70&&t<120)return{stars:3,msg:'Everyone evacuated safely. Aya waved to the drone camera. Dr. Amina sister called from the ER: Aya is asking for ice cream.'};
    if(r>50)return{stars:2,msg:'All 80 people safe. Aya found on the roof with her teacher. The painting of the Mayor survived the fire.'};
    return{stars:1,msg:'Evacuation with minor injuries. Aya rescued from the art room window. The community centre needs complete rebuilding.'};
  },
  outcomeNova:stars=>stars===3?`🎉 Every single person got out safely! Aya waved at the rescue drone! Dr. Amina is buying you the biggest coffee in the city!`:stars===2?`All 80 people alive and safe. Aya spent 20 minutes on the roof with her teacher, but she is down safe and smiling. The painting of the Mayor survived!`:`Everyone survived, but it was very close. Aya was rescued from the art room window. We will rebuild the centre stronger than before.`,
  outcomeCharacter:stars=>({emoji:'👩🏾‍⚕️',name:'Dr. Amina',
    msg:stars===3?`I was in surgery the whole time. My sister called screaming from outside the fire — then called again crying, saying Aya was safe because of you. I will never, ever forget what you did today.`
      :stars===2?`Aya is in my emergency room right now, eating a popsicle. She is asking if the Mayor can come see her painting. It survived the fire. So did she.`
      :`Aya is alive. That is all that matters to me. She lost her artwork, but I still have my niece. Thank you from the bottom of my heart.`}),
  conceptCard:{title:'Pathfinding',body:'Pathfinding is how AI finds the fastest route from one place to another — like GPS finding the fastest way home through traffic, but for getting people out of a burning building.'},
  lesson:'Swarm Pathfinding (L5) + AI Monitoring (L11)',
  lg:'AI analyses CCTV feeds to predict crowd surges and suggest safe evacuation routes in real time.'
});

// ── 6. ECONOMIC ──
S.push({
  id:'economic',icon:'📉',
  name:'Economic Shock',
  desc:"Supply chain crisis hits the city. Maya's family store is days from closing.",
  missing:'',
  check:()=>true,
  aiIntro:st=>`📉 Global supply chain freeze! Inflation: 8%. GDP dropping 3%/tick.<br>AI forecasts recession in 20 ticks.<br>Maya's family grocery store has 3 days of inventory left.`,
  meter:ss=>({value:Math.min(100,Math.max(0,ss.scr_crisis||50)),label:'Economic Stress',max:100}),
  gauge:(ss,st)=>({label:'GDP',value:Math.round(ss.scr_gdp||100),max:100,unit:'%'}),
  steps:[
    { stage:'📞 Emergency Call', storytelling:true,
      character:{name:'Maya',emoji:'👩🏼‍💼',title:"Mayor's Assistant",
        message:"Mayor, it is my mom. Our family grocery store on 4th Street has three days of inventory left. Prices have doubled on rice, cooking oil, milk. Mrs. Kowalski cried at the register today because she could not afford bread. My mom has never laid off any of her staff in 25 years. But she might have to this week."},
      ai:'Nova: Global supply chain disruption at critical. City distribution hub at 30% capacity. Inflation at 8% and accelerating. Small businesses represent 60% of the local economy — 45% face closure within 30 days.',
      novaSays:"Maya has worked for this city for 7 years without ever mentioning her family's store. 'Chen's Grocery' — open since 1998. Her mom taught her how to balance a budget when she was 10.",
      choices:[{text:'▶ Continue',apply:st=>{},next:1}] },
    { stage:'1 ⚡ First Response',
      ai:"Maya's mom is waiting for your decision. The shelves are half empty. Which economic lever do you pull first?",
      choices:[
        {text:'🟢 Cut Taxes to Stimulate Spending (+GDP, +debt)',
          impacts:[{icon:'💰',label:'Tax Cut',val:-5,max:20},{icon:'📈',label:'GDP',val:8,max:30}],
          novaReact:"Lower taxes mean people can actually afford groceries again. Maya's mom might sell more rice today. Short-term relief but long-term debt — it puts food on tables tonight.",
          apply:st=>{st.scr_tax=(st.scr_tax||20)-5;st.scr_gdp=Math.min(100,(st.scr_gdp||100)+8);st.scr_debt=(st.scr_debt||0)+5;st.scr_crisis=(st.scr_crisis||50)-10;},next:2},
        {text:'🟡 Infrastructure Spending (jobs, +GDP, +debt)',
          impacts:[{icon:'🏗️',label:'Infrastructure',val:15,max:30},{icon:'📈',label:'GDP',val:12,max:30}],
          novaReact:"Building roads creates jobs — maybe Mrs. Kowalski's son could get work on the crew. It does not fill grocery shelves today, but it gives people hope for tomorrow.",
          apply:st=>{st.scr_infra=(st.scr_infra||30)+15;st.scr_gdp=Math.min(100,(st.scr_gdp||100)+12);st.scr_debt=(st.scr_debt||0)+15;st.scr_crisis=(st.scr_crisis||50)-5;},next:2},
        {text:'🔵 AI Auditor (unpopular, -5 sentiment)',
          impacts:[{icon:'🔍',label:'Audit',val:1,max:1},{icon:'😊',label:'Sentiment',val:-5,max:10}],
          novaReact:"Small businesses get hit by extra paperwork too. Maya's mom: 'They are auditing us? We are barely surviving.' People feel watched when they are already struggling.",
          apply:st=>{st.scr_audit=true;st.scr_gdp=Math.min(100,(st.scr_gdp||100)+3);st.scr_sent=(st.scr_sent||70)-5;st.scr_crisis=(st.scr_crisis||50)+5;},next:10} ]},
    { stage:'2 🛠️ Response',
      ai:"Maya's mom texts: 'We are rationing rice now. One bag per family. The Kowalskis have five kids. Tommy is in my office crying because he is hungry.'",
      choices:[
        {text:'🟢 Raise Interest Rates (controls inflation, slows growth)',
          impacts:[{icon:'📊',label:'Interest Rate',val:2,max:5},{icon:'📉',label:'Inflation',val:-3,max:10}],
          novaReact:"Maya's mom cannot take a loan to restock — rates are too high. But it stops prices climbing higher for everyone. 'We will manage,' she says. 'We always do.'",
          apply:st=>{st.scr_rate=(st.scr_rate||2)+2;st.scr_infl=Math.max(0,(st.scr_infl||8)-3);st.scr_gdp=Math.max(50,(st.scr_gdp||100)-3);st.scr_crisis=(st.scr_crisis||50)-15;},next:3},
        {text:'🟡 Subsidies for Essentials (+sentiment, +debt, -2 inflation)',
          impacts:[{icon:'🛒',label:'Subsidies',val:1,max:1},{icon:'📉',label:'Inflation',val:-2,max:10}],
          novaReact:"'The Kowalskis just bought two bags of rice,' Maya's mom texts. 'Little Tommy waved at me through the window. He is smiling again.' Sometimes the small things are the biggest things.",
          apply:st=>{st.scr_subsidy=true;st.scr_infl=Math.max(0,(st.scr_infl||8)-2);st.scr_debt=(st.scr_debt||0)+5;st.scr_sent=(st.scr_sent||70)+3;st.scr_crisis=(st.scr_crisis||50)-12;},next:3} ]},
    { stage:'🤖 How AI Helps', storytelling:true,
      character:{name:'Nova',emoji:'🤖',title:'Your AI Assistant',
        message:"Mayor, I have been running FORECASTING models on the economy all night. Forecasting is like checking the weather before you bring an umbrella — I look at thousands of data points: global trade numbers, local spending patterns, even social media sentiment. My model predicts that if we cut taxes AND subsidise essentials, the economy will recover in 8 weeks instead of 12. I ran 500 simulations to find that combination."},
      ai:'Nova: My economic forecasting models analyse thousands of variables to predict which policies will lead to the fastest recovery.',
      novaSays:'Forecasting is like checking the weather forecast before deciding to bring an umbrella — but for the whole city economy!',
      choices:[{text:"▶ Makes sense! What's next?",apply:st=>{},next:7}] },
    { stage:'5 🔥 Make the Call',
      ai:"Maya's mom called — three delivery trucks arrived today. Shelves are finally being restocked. The question is: how do we prevent this from happening again?",
      choices:[
        {text:'🟢 AI Trade Renegotiation (+long-term growth, +5 sentiment)',
          impacts:[{icon:'🌐',label:'Trade',val:1,max:1},{icon:'📈',label:'GDP',val:15,max:30}],
          novaReact:"AI finds new suppliers, better shipping routes, more reliable delivery chains. Maya's mom gets a direct delivery line. 'I am hiring a new cashier,' she says. 'Tommy Kowalski mom. She needs the work.'",
          apply:st=>{st.scr_trade=true;st.scr_gdp=Math.min(100,(st.scr_gdp||85)+15);st.scr_sent=(st.scr_sent||70)+5;st.scr_cost=(st.scr_cost||0)+3;st.scr_crisis=(st.scr_crisis||50)-20;},next:-1},
        {text:'🟡 Maintain Current Policy (slow recovery, +5 GDP)',
          impacts:[{icon:'⏸️',label:'Hold',val:1,max:1},{icon:'📈',label:'GDP',val:5,max:30}],
          novaReact:"Steady and patient. Maya's mom has enough stock for two weeks now. The Kowalskis are eating rice again. Slow and steady might just win this race.",
          apply:st=>{st.scr_gdp=Math.min(100,(st.scr_gdp||85)+5);st.scr_crisis=(st.scr_crisis||50)-8;},next:-1} ]},
    { stage:'10 🔥 Critical Decision',
      ai:"⚠️ The audit triggered massive layoffs! 300 people lost their jobs. Maya's mom: 'I had to let Maria go. She has worked for me for 12 years. She has two kids.'",
      choices:[
        {text:'🟢 Emergency Job Retraining (+GDP, +5 sentiment, +cost)',
          impacts:[{icon:'🎓',label:'Retraining',val:1,max:1},{icon:'📈',label:'GDP',val:10,max:20},{icon:'🪙',label:'Cost',val:-8,max:15}],
          novaReact:"Maya's mom: 'I told Maria she will have a job when she finishes the course. Even if I have to create one for her.' Maria cried on the phone. Not sad tears. Hopeful ones.",
          apply:st=>{st.scr_training=true;st.scr_gdp=Math.min(100,(st.scr_gdp||70)+10);st.scr_sent=(st.scr_sent||70)+5;st.scr_cost=(st.scr_cost||0)+8;st.scr_crisis=(st.scr_crisis||50)+15;},next:11},
        {text:'🔴 Austerity — Cut All Spending (-10 sentiment)',
          impacts:[{icon:'✂️',label:'Spending Cut',val:1,max:1},{icon:'😊',label:'Sentiment',val:-10,max:20}],
          novaReact:"Maria is laid off for good. Maya's mom stands in the back room after everyone leaves and cries. Then wipes her face and opens the shop for the afternoon rush.",
          apply:st=>{st.scr_austerity=true;st.scr_sent=(st.scr_sent||70)-10;st.scr_debt=Math.max(0,(st.scr_debt||15)-5);st.scr_crisis=(st.scr_crisis||50)+20;},next:11} ]},
    { stage:'11 ✅ Final Chance',
      ai:"Credit rating downgraded. Maya's mom: 'The store will survive. But I had to let Maria go, and it is breaking my heart.'",
      choices:[
        {text:'🟢 IMF Reform Package (+GDP, +debt, +5 sentiment)',
          impacts:[{icon:'🏛️',label:'IMF Deal',val:1,max:1},{icon:'📈',label:'GDP',val:15,max:30},{icon:'💳',label:'Debt',val:20,max:30}],
          novaReact:"Maya's mom qualifies for a small business grant. She rehires Maria part-time that same week. 'The Kowalskis brought me cookies,' she says. 'Tommy drew me a picture. It is a grocery store with a rainbow over it.'",
          apply:st=>{st.scr_imf=true;st.scr_gdp=Math.min(100,(st.scr_gdp||60)+15);st.scr_sent=(st.scr_sent||55)+5;st.scr_debt=(st.scr_debt||20)+20;st.scr_crisis=(st.scr_crisis||50)-15;},next:-1},
        {text:'🔴 Default on Debt (short-term, -20 sentiment)',
          impacts:[{icon:'💥',label:'Default',val:1,max:1},{icon:'😊',label:'Sentiment',val:-20,max:30}],
          novaReact:"The store limps along, barely surviving each week. 'We will make it work,' Maya's mom says. But her voice is not sure anymore. Maria starts looking for other jobs.",
          apply:st=>{st.scr_default=true;st.scr_sent=(st.scr_sent||55)-20;st.scr_gdp=Math.max(30,(st.scr_gdp||60)-10);st.scr_debt=0;st.scr_crisis=(st.scr_crisis||50)+20;},next:-1}] },
    { stage:'4 📊 Analyze the Data',
      dataView:[
        {icon:'📈',label:'GDP',value:78,max:100,unit:'%'},
        {icon:'📊',label:'Inflation',value:85,max:100,unit:'%'},
        {icon:'🛒',label:'Consumer Spending',value:45,max:100,unit:'%'},
      ],
      ai:"Nova: Here are the economic indicators. Which number is the biggest warning sign?",
      choices:[
        {text:'📊 Inflation at 85% — prices are soaring! People cannot afford food!',
          impacts:[{icon:'📊',label:'Inflation Control',val:10,max:15}],
          novaReact:"Correct! Inflation is the root cause — it makes everything more expensive for everyone. Maya's mom says: 'If we fix inflation, the rice stays affordable.'",
          apply:st=>{st.scr_infl=(st.scr_infl||8)-3;st.scr_gdp=Math.min(100,(st.scr_gdp||70)+5);st.scr_crisis=(st.scr_crisis||50)-10;},next:4},
        {text:'🛒 Spending at 45% — people have stopped buying!',
          impacts:[{icon:'🛒',label:'Consumer Boost',val:5,max:15}],
          novaReact:'Low spending is a symptom, not the cause. Inflation is driving prices up so people cannot afford basics. Maya\u2019s mom watches customers put things back on shelves.',
          apply:st=>{st.scr_gdp=Math.min(100,(st.scr_gdp||70)+3);st.scr_crisis=(st.scr_crisis||50);},next:4}] }
  ],
  outcome:st=>{
    const g=st.scr_gdp||100,d=st.scr_debt||0,s=st.scr_sent||70;
    if(g>85&&d<30&&s>55)return{stars:3,msg:"Maya's mom hired two new staff. Mrs. Kowalski bought a birthday cake today. She smiled for the first time in months."};
    if(g>65)return{stars:2,msg:'Moderate recovery. GDP at '+g+'%. Maya mom kept the store open and rehired Maria part-time.'};
    return{stars:1,msg:'Recession averted but painful. GDP at '+g+'%. Maya mom had to let Maria go permanently.'};
  },
  outcomeNova:stars=>stars===3?`🎉 The economy is recovering! Maya mom hired TWO new workers — including Tommy Kowalski mom! The shelves are full again!`:stars===2?`We got through the worst of it. Maya store survived. It is not perfect, but families are eating and that matters most.`:`The economy took a hard hit. Maya mom had to let someone go. But the store is still open. We will rebuild from here.`,
  outcomeCharacter:stars=>({emoji:'👩🏼‍💼',name:'Maya',
    msg:stars===3?`My mom hired two new people today. Mrs. Kowalski bought a birthday cake for Tommy 6th birthday — she paid full price. Thank you for saving my mom store. It means everything.`
      :stars===2?`My mom kept the store open. She had to let Maria go for two weeks, but rehired her part-time. It is not perfect, but it is enough for now.`
      :`Mom had to let Maria go. The store is still open, but it is not the same without her. We will get through it. We always do.`}),
  conceptCard:{title:'Forecasting',body:'Forecasting is when AI predicts what will happen in the future using past data — like checking the weather forecast before deciding to bring an umbrella, but for the whole economy.'},
  lesson:'Government Finances (L17) + Sentiment Analysis (L16)',
  lg:'AI economic models predict outcomes of tax and spending policies before they are enacted, helping prevent recession.'
});

// ── 7. OUTBREAK ──
S.push({
  id:'outbreak',icon:'🦠',
  name:'Disease Outbreak',
  desc:"A mystery illness spreads through the school. Dr. Amina's son is showing symptoms.",
  missing:'Need a Hospital or Clinic',
  check:st=>has(st,'hosp','clinic','school'),
  aiIntro:st=>{
    const beds=st.buildings.filter(b=>b.type==='hosp'||b.type==='clinic').reduce((t,b)=>t+(Game.BLD[b.type]?.cap||0),0);
    return `🦠 Abnormal ER admissions detected!<br>Cases cluster at Westside Primary School. Dr. Amina's son is in Year 3. Hospital capacity: ${beds} beds.<br>AI contact tracing: 78% of cases visited the school canteen.<br>Projected spread: ${Math.floor(500/st.buildings.length)*3} new cases in next 24h.`;
  },
  meter:ss=>({value:Math.min(100,Math.max(0,ss.scr_crisis||50)),label:'Disease Spread',max:100}),
  gauge:(ss,st)=>({label:'Infection Rate',value:Math.round(ss.scr_spread||50),max:100,unit:'%'}),
  steps:[
    { stage:'📞 Emergency Call', storytelling:true,
      character:{name:'Dr. Amina',emoji:'👩🏾‍⚕️',title:'Chief of City Hospital',
        message:"Mayor, it is Kwame. My son. He came home from Westside Primary with a fever and rash. I checked his temp — 39.2°C. I am at the hospital and there are three other kids from his class in my ER right now. Same symptoms. Same classroom. I cannot leave to be with him. I am a doctor but right now I am just a scared mom."},
      ai:'Nova: 12 confirmed cases clustered around the school canteen. Incubation period 48-72 hours. Projection: 60-80 cases within 72 hours without containment. Canteen refrigeration failed 4 days ago — contaminated milk likely.',
      novaSays:"Dr. Amina delivered Kwame 9 years ago. She has saved hundreds of children lives. But right now she is just a mom whose little boy has a fever and she cannot leave the hospital.",
      choices:[{text:'▶ Continue',apply:st=>{},next:1}] },
    { stage:'1 ⚡ First Response',
      ai:"Kwame temperature is climbing — 39.2°C. Dr. Amina is scrubbing in for emergency surgery. She will not be able to look at her phone for 2 hours.",
      choices:[
        {text:'🟢 Lockdown Westside Primary (-20 spread, -10 sentiment)',
          impacts:[{icon:'🦠',label:'Spread',val:-20,max:30},{icon:'😊',label:'Sentiment',val:-10,max:20}],
          novaReact:"400 kids sent home. Dr. Amina texts from the OR waiting room: 'I cannot pick him up. I am in surgery. His dad is on the way.' She sends a photo of Kwame empty chair at the dinner table.",
          apply:st=>{st.scr_lockdown=true;st.scr_spread=(st.scr_spread||50)-20;st.scr_sent=(st.scr_sent||70)-10;st.scr_crisis=(st.scr_crisis||50)-10;},next:2},
        {text:'🟡 Deploy Mobile Testing (+20 capacity, -10 spread)',
          impacts:[{icon:'🏥',label:'Capacity',val:20,max:30},{icon:'🦠',label:'Spread',val:-10,max:30}],
          novaReact:"Testing tents go up in the school parking lot. Test every child, every parent, every teacher. Kwame dad arrives just as the first tent goes up. 'I am here, buddy,' he says. Kwame waves weakly from the car window.",
          apply:st=>{st.scr_testing=true;st.scr_spread=(st.scr_spread||50)-10;st.scr_capacity=(st.scr_capacity||50)+20;st.scr_crisis=(st.scr_crisis||50)-5;},next:2},
        {text:'🔵 Close All Schools Citywide (-15 spread, -5 sentiment)',
          impacts:[{icon:'🦠',label:'Spread',val:-15,max:30},{icon:'😊',label:'Sentiment',val:-5,max:20}],
          novaReact:"Thousands of parents scramble to find childcare. But if this thing is spreading beyond Westside, we might have no choice. Kwame dad picks him up from an empty classroom.",
          apply:st=>{st.scr_schools=true;st.scr_spread=(st.scr_spread||50)-15;st.scr_sent=(st.scr_sent||70)-5;st.scr_crisis=(st.scr_crisis||50)-8;},next:10} ]},
    { stage:'2 🛠️ Response',
      ai:"Mobile clinics testing 50 kids per hour. Dr. Amina from the OR break room between surgeries: 'Kwame temp is 39.8 now. I cannot be there. Please. Please fix this.'",
      choices:[
        {text:'🟢 Deploy Vaccines at Nearest Hospital (+25 capacity)',
          impacts:[{icon:'🏥',label:'Capacity',val:25,max:40},{icon:'🦠',label:'Spread',val:-5,max:20}],
          novaReact:"Kwame dad sends a photo from the hospital waiting room — Kwame getting his shot, giving a weak thumbs up, looking miserable but brave. 'Tell the Mayor I am not scared,' Kwame says. 'Tell him I am a superhero.'",
          apply:st=>{st.scr_capacity=(st.scr_capacity||50)+25;st.scr_spread=(st.scr_spread||50)-5;st.scr_crisis=(st.scr_crisis||50)-15;},next:3},
        {text:'🟡 AI Contact Tracing App (+30% trace rate, -cost)',
          impacts:[{icon:'📱',label:'Trace Rate',val:30,max:50},{icon:'🪙',label:'Cost',val:-3,max:10}],
          novaReact:"The app traces every move. Source found: contaminated strawberry milk from the canteen. Dr. Amina texts: 'Kwame always drinks the strawberry milk. Of COURSE it is the strawberry milk.' She adds a crying-laughing emoji. Even in crisis, she finds humour.",
          apply:st=>{st.scr_tracing=true;st.scr_spread=(st.scr_spread||50)-10;st.scr_cost=(st.scr_cost||0)+3;st.scr_crisis=(st.scr_crisis||50)-12;},next:3} ]},
    { stage:'🤖 How AI Helps', storytelling:true,
      character:{name:'Nova',emoji:'🤖',title:'Your AI Assistant',
        message:"Mayor, I used CLUSTERING to find the source. Clustering is when AI groups similar things together to find patterns. I noticed that all 12 sick kids had one thing in common: they all ate at the school canteen on Tuesday. It is like noticing all the kids who got sick ate at the same cafeteria — the AI spots connections humans might miss. I was able to trace it back to one contaminated milk carton."},
      ai:'Nova: Clustering algorithms group cases by location, time, and common exposures to identify the source of an outbreak.',
      novaSays:'Clustering is like noticing all the kids who got sick ate at the same cafeteria — AI finds hidden connections between pieces of information!',
      choices:[{text:'▶ I see the pattern! What now?',apply:st=>{},next:4}] },
    { stage:'4 📊 Analyze the Data',
      dataView:[
        {icon:'🏫',label:'Westside Primary',value:34,max:100,unit:'cases'},
        {icon:'🏘️',label:'North Residential',value:8,max:100,unit:'cases'},
        {icon:'🏥',label:'Hospital',value:6,max:100,unit:'cases'},
      ],
      ai:"Nova: Here is where the cases are clustered. Which location is the outbreak epicentre?",
      choices:[
        {text:"🟢 Westside Primary — 34 cases! That's where Kwame goes!",
          impacts:[{icon:'🎯',label:'Containment Focus',val:10,max:15}],
          novaReact:'Correct! The school is the epicentre. Every case traces back to Tuesday lunch. That data tells us exactly where to focus our testing and cleaning.',
          apply:st=>{st.scr_spread=(st.scr_spread||50)-10;st.scr_crisis=(st.scr_crisis||50)-10;},next:5},
        {text:'🟡 North Residential — 8 cases, could spread',
          impacts:[{icon:'🏘️',label:'Area Focus',val:3,max:15}],
          novaReact:'North Residential has a few cases, but the primary cluster is the school. Data helps us prioritise — contain the main source first.',
          apply:st=>{st.scr_spread=(st.scr_spread||50)-3;st.scr_crisis=(st.scr_crisis||50);},next:5}] },
    { stage:'5 🔥 Make the Call',
      ai:"Nova: I have modelled three containment strategies. The source is identified — contaminated milk — but the infection is still spreading through the community.",
      choices:[
        {text:'🤖 Accept: Full AI containment plan (max speed)',
          impacts:[{icon:'🦠',label:'Spread Stopped',val:15,max:20},{icon:'😊',label:'Sentiment',val:-5,max:10}],
          novaReact:'Full automated quarantine zones, AI-monitored compliance, drone deliveries. Fast and efficient. Dr. Amina: "I do not like the quarantine, but if it saves lives, I am for it."',
          apply:st=>{st.scr_spread=(st.scr_spread||50)-15;st.scr_sent=(st.scr_sent||70)-5;st.scr_crisis=(st.scr_crisis||50)-20;},next:-1},
        {text:'🤝 Modify: Containment + community support (balanced)',
          impacts:[{icon:'🦠',label:'Spread Stopped',val:8,max:20},{icon:'😊',label:'Sentiment',val:5,max:10}],
          novaReact:'Smart quarantine with meal deliveries and remote schooling. People feel cared for, not locked up. Dr. Amina: "This is the humane way. Thank you."',
          apply:st=>{st.scr_spread=(st.scr_spread||50)-8;st.scr_sent=(st.scr_sent||70)+5;st.scr_crisis=(st.scr_crisis||50)-10;},next:-1},
        {text:'👤 Override: Voluntary quarantine, no force (slow)',
          impacts:[{icon:'🦠',label:'Spread Stopped',val:3,max:20},{icon:'😊',label:'Sentiment',val:8,max:10}],
          novaReact:'Trusting people to do the right thing. It works if they trust you back. Dr. Amina: "I will lead by example. Kwame and I are staying home."',
          apply:st=>{st.scr_voluntary=true;st.scr_sent=(st.scr_sent||70)+8;st.scr_spread=(st.scr_spread||50)+5;st.scr_crisis=(st.scr_crisis||50)-5;},next:-1}] },
    { stage:'10 🔥 Critical Decision',
      ai:"⚠️ Infection rate at 15% of students! Hospitals overwhelmed. Dr. Amina: 'Kwame fever just hit 40.1. I am leaving the hospital. I am going home to my son.'",
      choices:[
        {text:'🟢 Emergency Field Hospital (+40 capacity, +cost)',
          impacts:[{icon:'🏥',label:'Capacity',val:40,max:50},{icon:'🪙',label:'Cost',val:-8,max:15}],
          novaReact:"Dr. Amina drives past the field hospital on her way home — tents going up in the park, staff in PPE, ambulances lining up. She texts: 'It looks like a war zone. But thank you. At least they have somewhere to go.'",
          apply:st=>{st.scr_capacity=(st.scr_capacity||50)+40;st.scr_cost=(st.scr_cost||0)+8;st.scr_crisis=(st.scr_crisis||50)+15;},next:11},
        {text:'🟡 Mandate Masks + Surge Staffing (-spread, +cost)',
          impacts:[{icon:'🦠',label:'Spread',val:-10,max:30},{icon:'🪙',label:'Cost',val:-5,max:15}],
          novaReact:"Dr. Amina walks through her front door. Kwame is on the couch, wrapped in a blanket, shivering. She sits beside him in her scrubs, still wearing her hospital badge. He leans his head on her shoulder. She does not move for an hour.",
          apply:st=>{st.scr_masks=true;st.scr_spread=(st.scr_spread||50)-10;st.scr_cost=(st.scr_cost||0)+5;st.scr_crisis=(st.scr_crisis||50)+10;},next:11} ]},
    { stage:'11 ✅ Final Chance',
      ai:"Peak infection exceeding all hospital capacity. Dr. Amina has not slept in 72 hours. But Kwame fever is finally breaking.",
      choices:[
        {text:'🟢 National Aid Request (+30 capacity, +cost, +2 sentiment)',
          impacts:[{icon:'🏥',label:'Capacity',val:30,max:50},{icon:'🪙',label:'Cost',val:-10,max:20},{icon:'😊',label:'Sentiment',val:2,max:10}],
          novaReact:'Dr. Amina finally sleeps for 4 hours. Kwame texts her from the living room — a photo of his "Get Well Soon" card he is making for the class hamster. She cries. Happy tears this time.',
          apply:st=>{st.scr_capacity=(st.scr_capacity||50)+30;st.scr_cost=(st.scr_cost||0)+10;st.scr_sent=(st.scr_sent||70)+2;st.scr_crisis=(st.scr_crisis||50)-15;},next:-1},
        {text:'🔴 Hope for Natural Decline (risks lives, -15 sentiment)',
          impacts:[{icon:'😊',label:'Sentiment',val:-15,max:20},{icon:'🏥',label:'Capacity',val:0,max:50}],
          novaReact:"Dr. Amina is a scientist. She knows hope is not a strategy. She stares at the empty beds in the corridor and wonders who will not make it.",
          apply:st=>{st.scr_sent=(st.scr_sent||70)-15;st.scr_crisis=(st.scr_crisis||50)+30;},next:-1}] }
  ],
  outcome:st=>{
    const sp=st.scr_spread||50,ca=st.scr_capacity||50,se=st.scr_sent||70;
    if(sp<20&&ca>70)return{stars:3,msg:'Outbreak contained. Zero deaths. Kwame recovered in 3 days. The strawberry milk incident is now a city legend.'};
    if(sp<40&&ca>50)return{stars:2,msg:'Spread slowed significantly. Kwame spent 2 days in bed but bounced back. The school canteen has a brand new refrigerator.'};
    return{stars:1,msg:'Peak exceeded hospital capacity. Kwame recovered at home with his mom. School closed for 2 weeks for deep cleaning.'};
  },
  outcomeNova:stars=>stars===3?`🎉 The outbreak is over! Zero deaths, Kwame is back at school drawing health posters for the hallway! The canteen has a new fridge!`:stars===2?`We contained the outbreak. Kwame is fine — back to strawberry milk and soccer practice. The school is safer now.`:`A very rough week. Kwame recovered, but a lot of kids got sick. We need more hospital capacity. This taught us that.`,
  outcomeCharacter:stars=>({emoji:'👩🏾‍⚕️',name:'Dr. Amina',
    msg:stars===3?`Kwame made a poster that says: 'Thank you, Mayor, for keeping us safe.' He wants to be a doctor now. Or a mayor. He has not decided yet.`
      :stars===2?`Kwame is back to being a 9-year-old boy — running around, drinking strawberry milk from a different batch. The school reopened yesterday.`
      :`Kwame fever broke on day 3. He is sitting next to me watching cartoons. The hospital was stretched too thin. We need to be better prepared next time.`}),
  conceptCard:{title:'Clustering',body:'Clustering is when AI groups similar things together to find patterns — like noticing all the sick kids ate at the same cafeteria. It finds connections humans might miss.'},
  lesson:'Healthy City (L8) + AI Monitoring (L11)',
  lg:'AI uses contact tracing and hospital admission patterns to predict disease spread and identify outbreak sources.'
});

// ── 8. STRIKE ──
S.push({
  id:'strike',icon:'🚌',
  name:'Transport Strike',
  desc:"The bus union strikes. Kofi can't get to his after-school tutoring.",
  missing:'Need a Bus Stop or Depot',
  check:st=>has(st,'bus','depot','drone')||cnt(st,'road')>=5,
  aiIntro:st=>`🚌 Transit AI deactivated! Routes halted. Depots locked down.<br>40% of commuters stranded. Roads at 140% capacity.<br>Kofi's after-school tutoring bus was cancelled — he's failing maths.`,
  meter:ss=>({value:Math.min(100,Math.max(0,ss.scr_crisis||50)),label:'Transit Disruption',max:100}),
  gauge:(ss,st)=>({label:'Congestion',value:Math.round(ss.scr_congestion||50),max:100,unit:'%'}),
  steps:[
    { stage:'📞 Emergency Call', storytelling:true,
      character:{name:'Kofi',emoji:'👦🏿',title:'Student at Westside Primary',
        message:"Mayor, the bus union walked out. My after-school tutoring bus was cancelled. My dad signed me up for extra maths — it cost a lot of money. Now I cannot get there. I am failing fractions. I guess I will just fail. My dad is still recovering from his heart attack and I cannot ask him to drive me."},
      ai:'Nova: 400 union workers picketing at 12 depots. City bus service at 0%. Road congestion at 140% of normal. Emergency workers: 35% unable to reach hospitals. Economic impact estimated at 2M per day.',
      novaSays:"Kofi's dad is still recovering from his heart attack — he cannot drive Kofi to tutoring. And Kofi will not complain because he does not want to worry his dad. He is 8, carrying this alone.",
      choices:[{text:'▶ Continue',apply:st=>{},next:1}] },
    { stage:'1 ⚡ First Response',
      ai:"Kofi's tutoring starts in 2 hours. If he misses today, he will miss the unit test review. His dad just texted him: 'I am sorry, son. I cannot drive you.'",
      choices:[
        {text:'🟢 Deploy Medical Delivery Drones (+medical, -battery)',
          impacts:[{icon:'🛸',label:'Medical Drones',val:1,max:1},{icon:'🔋',label:'Battery',val:-3,max:10}],
          novaReact:"Drones fly right over the picket lines. Medical supplies reach the hospital in 8 minutes — no road needed. Kofi watches one buzz past his bedroom window and wonders if he can build one for the science fair.",
          apply:st=>{st.scr_med=true;st.scr_drones=(st.scr_drones||10)-3;st.scr_crisis=(st.scr_crisis||50)-10;},next:2},
        {text:'🟡 Reroute Autonomous Buses for Hospital Corridors (+20 coverage, +2 sentiment)',
          impacts:[{icon:'🚌',label:'Bus Coverage',val:20,max:50},{icon:'😊',label:'Sentiment',val:2,max:10}],
          novaReact:"Autonomous buses do not need union drivers. Emergency corridors get nurses to work. Kofi's dad is a nurse — at least he can get to the hospital for his shift.",
          apply:st=>{st.scr_corridors=true;st.scr_coverage=(st.scr_coverage||50)+20;st.scr_sent=(st.scr_sent||70)+2;st.scr_crisis=(st.scr_crisis||50)-5;},next:2},
        {text:'🔵 Open Bus Lanes to All Traffic (-15 congestion, -5 sentiment)',
          impacts:[{icon:'🚗',label:'Traffic Flow',val:-15,max:30},{icon:'😊',label:'Sentiment',val:-5,max:10}],
          novaReact:"Kofi does not care about traffic politics. He just wants to get to maths class. Opening bus lanes helps cars move but angers the union. Everything is complicated when you are 8.",
          apply:st=>{st.scr_openLanes=true;st.scr_congestion=(st.scr_congestion||50)-15;st.scr_sent=(st.scr_sent||70)-5;st.scr_crisis=(st.scr_crisis||50)+5;},next:10} ]},
    { stage:'2 🛠️ Response',
      ai:"Kofi's dad borrowed a neighbour's car but the traffic is terrible. Kofi is still at home, watching the clock. 45 minutes until tutoring starts.",
      choices:[
        {text:'🟢 AI Emergency Priority Lanes (+30 emergency access)',
          impacts:[{icon:'🚑',label:'Emergency Access',val:30,max:50},{icon:'🚦',label:'Congestion',val:5,max:20}],
          novaReact:"A green path through the city — for ambulances AND essential commuters. Kofi's dad calls: 'Tell my boy I will pick him up after work. We will get dinner tonight. Just him and me.'",
          apply:st=>{st.scr_priority=true;st.scr_emergency=(st.scr_emergency||0)+30;st.scr_congestion=(st.scr_congestion||50)+5;st.scr_crisis=(st.scr_crisis||50)-15;},next:3},
        {text:'🟡 Autonomous Shuttle Pods (+20 access, -battery)',
          impacts:[{icon:'🚐',label:'Shuttle Pods',val:1,max:1},{icon:'🔋',label:'Battery',val:-2,max:10}],
          novaReact:"Kofi's tutor texts the Mayor's office: 'I am picking him up in one of those pods. I am not missing my best student.' Kofi grins for the first time today.",
          apply:st=>{st.scr_shuttle=true;st.scr_emergency=(st.scr_emergency||0)+20;st.scr_drones=(st.scr_drones||10)-2;st.scr_crisis=(st.scr_crisis||50)-10;},next:3} ]},
    { stage:'🤖 How AI Helps', storytelling:true,
      character:{name:'Nova',emoji:'🤖',title:'Your AI Assistant',
        message:"Mayor, I have been running ROUTE OPTIMISATION all morning to find the best ways to move people without buses. Route optimisation is like planning a paper route to deliver all the newspapers in the fastest order — except I am optimising for 40,000 stranded commuters across the whole city. I found that if we combine autonomous shuttles, priority lanes, and ride-sharing, we can move 80% of essential workers within the hour."},
      ai:'Nova: Route optimisation finds the most efficient paths for all vehicles, minimising travel time and maximising capacity across available transport.',
      novaSays:'Route optimisation is like planning the fastest paper route to deliver all newspapers — but for 40,000 people trying to get to work!',
      choices:[{text:"▶ Brilliant! What's the plan?",apply:st=>{},next:7}] },
    { stage:'5 🔥 Make the Call',
      ai:"Kofi's tutor sends a photo from the tutoring centre — Kofi at the whiteboard, covered in marker. 'Fractions click when you use pizza examples,' she writes. The strike continues but we have found workarounds. Now: long-term solution?",
      choices:[
        {text:'🟢 AI Ride-Share + Bus Lanes (-20 congestion, +cost, +3 sentiment)',
          impacts:[{icon:'🤝',label:'Ride-Share',val:1,max:1},{icon:'🚦',label:'Congestion',val:-20,max:30},{icon:'🪙',label:'Cost',val:-5,max:10}],
          novaReact:"Kofi gets a ride from a neighbour every day now. He aces his unit test. 'I got an A! Pizza maths works!' He sends a photo of his paper — an A+ with a drawing of a pizza next to it.",
          apply:st=>{st.scr_rideShare=true;st.scr_congestion=Math.max(0,(st.scr_congestion||50)-20);st.scr_cost=(st.scr_cost||0)+5;st.scr_sent=(st.scr_sent||70)+3;st.scr_crisis=(st.scr_crisis||50)-20;},next:-1},
        {text:'🟡 Subsidised Rides for Commuters (+2 sentiment, -cost)',
          impacts:[{icon:'🚕',label:'Rideshare Sub',val:1,max:1},{icon:'😊',label:'Sentiment',val:2,max:10},{icon:'🪙',label:'Cost',val:-3,max:10}],
          novaReact:"Cheap enough that Kofi's dad can afford rides for his son twice a week. Kofi is finally catching up on fractions. 'I got a B+!' he texts. 'I only failed one question!' He is proud. We are proud.",
          apply:st=>{st.scr_rideshareSub=true;st.scr_sent=(st.scr_sent||70)+2;st.scr_cost=(st.scr_cost||0)+3;st.scr_crisis=(st.scr_crisis||50)-8;},next:-1} ]},
    { stage:'10 🔥 Critical Decision',
      ai:"⚠️ Open lanes failed completely! All roads gridlocked. An ambulance is stuck outside Kofi's house — someone on his street is having a medical emergency.",
      choices:[
        {text:'🟢 Reinstate Bus Lanes + Enforcement (+cost, -25 congestion)',
          impacts:[{icon:'🚔',label:'Enforcement',val:1,max:1},{icon:'🚦',label:'Congestion',val:-25,max:30},{icon:'🪙',label:'Cost',val:-12,max:20}],
          novaReact:"The ambulance finally moves. Kofi watches from his window. He texts later: 'It was not a heart attack. Just chest pain from stress. My dad is sitting with him until his family comes.' Kofi's dad is always helping.",
          apply:st=>{st.scr_reverse=true;st.scr_congestion=Math.max(0,(st.scr_congestion||50)-25);st.scr_cost=(st.scr_cost||0)+12;st.scr_crisis=(st.scr_crisis||50)+15;},next:11},
        {text:'🔴 Police Direct Traffic Manually (-10 congestion, -5 sentiment)',
          impacts:[{icon:'👮',label:'Police',val:1,max:1},{icon:'🚦',label:'Congestion',val:-10,max:30},{icon:'😊',label:'Sentiment',val:-5,max:10}],
          novaReact:"The ambulance moves slowly through police-directed traffic. Kofi watches, worried. 'He keeps asking if my dad is okay too,' Kofi texts. 'I told him my dad is fine. He asked if he has kids.'",
          apply:st=>{st.scr_policeDir=true;st.scr_congestion=Math.max(0,(st.scr_congestion||50)-10);st.scr_sent=(st.scr_sent||70)-5;st.scr_crisis=(st.scr_crisis||50)+20;},next:11} ]},
    { stage:'11 ✅ Final Chance',
      ai:"Strike day 3. The city is losing 2M per day. Kofi missed another tutoring session. His dad came home exhausted, uniform still on, fell asleep on the couch.",
      choices:[
        {text:'🟢 Mediated Settlement (+service restored, +cost, +10 sentiment)',
          impacts:[{icon:'🤝',label:'Settlement',val:1,max:1},{icon:'🪙',label:'Cost',val:-15,max:25},{icon:'😊',label:'Sentiment',val:10,max:20}],
          novaReact:"The buses are running again. Kofi's dad texts: 'My son said to me: You fought for people too, Dad. I almost crashed the car I was crying so hard.'",
          apply:st=>{st.scr_settle=true;st.scr_cost=(st.scr_cost||0)+15;st.scr_sent=(st.scr_sent||60)+10;st.scr_congestion=Math.max(0,(st.scr_congestion||65)-30);st.scr_crisis=(st.scr_crisis||50)-20;},next:-1},
        {text:'🔴 Back-to-Work Legislation (ends strike, -15 sentiment)',
          impacts:[{icon:'⚖️',label:'Legislation',val:1,max:1},{icon:'😊',label:'Sentiment',val:-15,max:20}],
          novaReact:"Buses run. Resentment stays. Kofi's dad: 'The buses are running. That is something, I guess.' He does not sound convinced. Kofi asks why the bus drivers look angry.",
          apply:st=>{st.scr_b2w=true;st.scr_sent=(st.scr_sent||60)-15;st.scr_congestion=Math.max(0,(st.scr_congestion||65)-25);st.scr_crisis=(st.scr_crisis||50)+10;},next:-1}] },
    { stage:'4 📊 Analyze the Data',
      dataView:[
        {icon:'🚦',label:'Downtown Congestion',value:92,max:100,unit:'%'},
        {icon:'🏘️',label:'Residential Area',value:55,max:100,unit:'%'},
        {icon:'🚑',label:'Emergency Route Delay',value:78,max:100,unit:'%'},
      ],
      ai:"Nova: Here is the congestion data. Which route needs clearing most urgently?",
      choices:[
        {text:'🚑 Emergency Route at 78% — ambulances cannot get through!',
          impacts:[{icon:'🚑',label:'Emergency Priority',val:10,max:15}],
          novaReact:"Correct! Lives depend on emergency vehicles getting through. Kofi's dad is a nurse — he needs that route clear too. 'Clear the ambulances first,' he says. 'Everything else can wait.'",
          apply:st=>{st.scr_emergency=(st.scr_emergency||0)+15;st.scr_congestion=(st.scr_congestion||50)-5;st.scr_crisis=(st.scr_crisis||50)-10;},next:4},
        {text:'🚦 Downtown at 92% — the economy is gridlocked!',
          impacts:[{icon:'🏢',label:'Business Flow',val:5,max:15}],
          novaReact:'Downtown is bad, but emergencies come first. If a paramedic cannot reach a patient, the economy does not matter. Kofi: "My dad said save people first."',
          apply:st=>{st.scr_congestion=(st.scr_congestion||50)-5;st.scr_crisis=(st.scr_crisis||50);},next:4}] }
  ],
  outcome:st=>{
    const em=st.scr_emergency||0,se=st.scr_sent||70,cn=st.scr_congestion||50;
    if(em>40&&cn<30&&se>50)return{stars:3,msg:'Emergency services maintained throughout. Kofi aced his fractions test. Fair settlement reached. The city moves again.'};
    if(em>20&&cn<50)return{stars:2,msg:'Most emergency workers reached hospitals. Kofi missed one session but caught up with online tutoring.'};
    return{stars:1,msg:'Significant disruption across the city. Kofi missed two tutoring sessions. His dad worked double shifts to cover for absent colleagues.'};
  },
  outcomeNova:stars=>stars===3?`🎉 Kofi got an A on his fractions test! Buses are running again, the union is happy, and emergency services never skipped a beat!`:stars===2?`The strike is over. Kofi caught up on maths. Not perfect, but the city is moving again and everyone is safe.`:`Kofi fell behind in maths but his tutor is helping him catch up. The strike showed us how fragile our transit system really is.`,
  outcomeCharacter:stars=>({emoji:'👦🏿',name:'Kofi',
    msg:stars===3?`I got an A on my fractions test! My dad said YOU fixed the buses. I drew a graph of my pizza fractions — can I show it to you at city hall?`
      :stars===2?`My tutor texted me lessons during the strike. I think I did okay on my test. Dad says the buses are running again. That is good.`
      :`I missed two tutoring sessions. My dad was really tired every night. I made him toast again. I am getting really good at making toast, at least.`}),
  conceptCard:{title:'Route Optimisation',body:'Route optimisation is when AI plans the most efficient path for vehicles — like planning a paper route to deliver all newspapers in the fastest order, but for the whole city!'},
  lesson:'Bus Scheduling (L7) + Grid Movement (L3)',
  lg:'When AI transit fails, AI-assisted rerouting and emergency deployables maintain critical services.'
});

// ── 9. SPILL ──
S.push({
  id:'spill',icon:'☣️',
  name:'Toxic Chemical Spill',
  desc:"A chemical spill threatens the water supply. Mr. Chen's daughter teaches near the contamination zone.",
  missing:'Need a Water Tower',
  check:st=>has(st,'water','flood','town'),
  aiIntro:st=>`☣️ Chemical spill at industrial site! Mr. Chen's daughter teaches at the school in the spill path.<br>3 neighbourhoods at risk: Northside, Eastview, Central.`,
  meter:ss=>({value:Math.min(100,Math.max(0,ss.scr_crisis||50)),label:'Plume Spread',max:100}),
  gauge:(ss,st)=>({label:'Water Safety',value:Math.round(ss.scr_water||80),max:100,unit:'%'}),
  steps:[
    { stage:'📞 Emergency Call', storytelling:true,
      character:{name:'Mr. Chen',emoji:'👨🏻‍🔧',title:'Water Infrastructure Engineer',
        message:"Mayor, there has been a tanker truck overturn at the industrial site. Greenish cloud forming — methyl isocyanate, I think. The wind is blowing toward Eastside Primary. My daughter teaches there. I can see the school roof from where I am standing. I can see my little girl's classroom window. She does not know what is coming."},
      ai:'Nova: Methyl isocyanate leak confirmed. Plume spreading at 2m/s northeast. Groundwater contamination likely within 90 minutes. Eastside Primary — 380 children and staff — is in the direct path.',
      novaSays:"Mr. Chen's daughter got her teaching licence last year. He texts her every morning: 'Stay safe, little bird.' Today he cannot text because he is watching the cloud drift toward her school.",
      choices:[{text:'▶ Continue',apply:st=>{},next:1}] },
    { stage:'1 ⚡ First Response',
      ai:"Mr. Chen: 'The school alarm has not sounded yet. They do not know what is coming. My daughter is probably teaching a lesson right now.' The cloud is visible from the playground.",
      choices:[
        {text:'🟢 Shut Off Affected Water Pipes (protects supply)',
          impacts:[{icon:'🔧',label:'Pipes Shut',val:1,max:1},{icon:'💧',label:'Water Supply',val:-20,max:40}],
          novaReact:"Shutting valves isolates the contamination. Mr. Chen: 'The school is on the same water line. Shutting it down now saves them from poisoned taps. They can use bottled water for now.'",
          apply:st=>{st.scr_shutoff=true;st.scr_water=(st.scr_water||80)-20;st.scr_spread=(st.scr_spread||50)-15;st.scr_crisis=(st.scr_crisis||50)-10;},next:2},
        {text:'🟡 Deploy Mobile Purifiers (+10 water quality, +cost)',
          impacts:[{icon:'🧪',label:'Purification',val:1,max:1},{icon:'💧',label:'Water Quality',val:10,max:40},{icon:'🪙',label:'Cost',val:-3,max:10}],
          novaReact:"Blue purification trucks setting up near the playground. 'They look like paramedics for the water,' Mr. Chen says, trying to make a joke but his voice shakes.",
          apply:st=>{st.scr_purify=true;st.scr_water=Math.min(100,(st.scr_water||80)+10);st.scr_cost=(st.scr_cost||0)+3;st.scr_crisis=(st.scr_crisis||50)-5;},next:2},
        {text:'🔵 Drill Monitoring Wells (best data, slow)',
          impacts:[{icon:'📡',label:'Monitoring',val:1,max:1},{icon:'💧',label:'Water Quality',val:-5,max:40}],
          novaReact:"Collecting data while the cloud moves toward the school. Mr. Chen watches the drill team set up: 'My little girl is still in her classroom. The window is open — I can see it.'",
          apply:st=>{st.scr_monitor=true;st.scr_spread=(st.scr_spread||50)-20;st.scr_water=Math.max(40,(st.scr_water||80)-5);st.scr_cost=(st.scr_cost||0)+2;st.scr_crisis=(st.scr_crisis||50)+5;},next:10} ]},
    { stage:'2 🛠️ Response',
      ai:"Mr. Chen's phone buzzes. It is his daughter: 'Dad, why are there men in hazmat suits outside my classroom window? The kids are scared.'",
      choices:[
        {text:'🟢 Re-route from Secondary Aquifer (+15 water quality)',
          impacts:[{icon:'💧',label:'Water Quality',val:15,max:40},{icon:'🔄',label:'Rerouted',val:1,max:1}],
          novaReact:"Clean water from a different source. 'Tell the school they can drink the water,' Mr. Chen radios. 'I am watching them move the kids to the gym — away from the cloud. My daughter is leading them. She is not scared.' He squares his shoulders. 'Neither am I.'",
          apply:st=>{st.scr_reroute=true;st.scr_water=Math.min(100,(st.scr_water||60)+15);st.scr_crisis=(st.scr_crisis||50)-15;},next:3},
        {text:'🟡 Emergency Water Trucks (+10 quality, +5 sentiment, +cost)',
          impacts:[{icon:'🚚',label:'Water Trucks',val:1,max:1},{icon:'😊',label:'Sentiment',val:5,max:10},{icon:'🪙',label:'Cost',val:-5,max:10}],
          novaReact:"Kids lining up with water bottles as the trucks arrive. Mr. Chen's daughter sends him a photo — her class holding up their bottles with thumbs up. 'We are okay, Dad,' she writes. He exhales for the first time in 40 minutes.",
          apply:st=>{st.scr_trucks=true;st.scr_water=Math.min(100,(st.scr_water||60)+10);st.scr_sent=(st.scr_sent||70)+5;st.scr_cost=(st.scr_cost||0)+5;st.scr_crisis=(st.scr_crisis||50)-10;},next:3} ]},
    { stage:'🤖 How AI Helps', storytelling:true,
      character:{name:'Nova',emoji:'🤖',title:'Your AI Assistant',
        message:"Mayor, I have been running SIMULATIONS of the chemical spill. Simulation is like building a virtual river to see where water will flow — except I am simulating toxic gas and groundwater contamination. I built a digital model of the wind patterns, soil type, and water table. In my simulation, the plume reaches the school playground in 20 minutes but the groundwater takes 90 minutes. That tells us exactly when and where to act."},
      ai:'Nova: My simulations model the chemical plume in real time, predicting its path through air and groundwater to guide evacuation and containment.',
      novaSays:'Simulation is like building a virtual river on a computer to see where water will flow — without getting wet!',
      choices:[{text:'▶ Amazing! What does it show?',apply:st=>{},next:7}] },
    { stage:'5 🔥 Make the Call',
      ai:"The plume has stabilised. The school is safe. But water treatment needs permanent upgrades. Mr. Chen: 'Do we fix this for good, or just patch it?'",
      choices:[
        {text:'🟢 AI-Optimised Filtration Upgrade (permanent fix, +cost, +15 water)',
          impacts:[{icon:'🤖',label:'AI Filtration',val:1,max:1},{icon:'💧',label:'Water Quality',val:15,max:40},{icon:'🪙',label:'Cost',val:-8,max:15}],
          novaReact:"AI-powered filter that learns what chemicals to remove — it gets smarter with every spill. Permanent protection. 'The kids can drink from the fountain tomorrow,' Mr. Chen says. His voice cracks with emotion. 'My daughter already filled her bottle.'",
          apply:st=>{st.scr_filtration=true;st.scr_water=Math.min(100,(st.scr_water||75)+15);st.scr_cost=(st.scr_cost||0)+8;st.scr_spread=Math.max(0,(st.scr_spread||35)-10);st.scr_crisis=(st.scr_crisis||50)-20;},next:-1},
        {text:'🟡 Continue Trucking + Monitoring (safe, temporary, +5 water)',
          impacts:[{icon:'🚚',label:'Temporary Supply',val:1,max:1},{icon:'💧',label:'Water Quality',val:5,max:40}],
          novaReact:"Water trucks keep coming every day. It works for now. Mr. Chen does not complain — his daughter is safe, and that is enough for today.",
          apply:st=>{st.scr_tempSupply=true;st.scr_water=Math.min(100,(st.scr_water||75)+5);st.scr_crisis=(st.scr_crisis||50)-8;},next:-1} ]},
    { stage:'10 🔥 Critical Decision',
      ai:"⚠️ The chemical plume reached the main reservoir! Boil-water advisory issued. Public panic spreading. Mr. Chen's daughter is helping calm parents at the school gates.",
      choices:[
        {text:'🟢 Emergency Carbon Filtration (+25 quality, +cost)',
          impacts:[{icon:'🧪',label:'Carbon Filter',val:1,max:1},{icon:'💧',label:'Water Quality',val:25,max:40},{icon:'🪙',label:'Cost',val:-10,max:20}],
          novaReact:"Carbon filters trap chemicals like a sponge — expensive but incredibly effective. 'My daughter school is on bottled water,' Mr. Chen says. 'But no one got sick. Not a single child. That is the victory.'",
          apply:st=>{st.scr_carbonFilter=true;st.scr_water=Math.min(100,(st.scr_water||45)+25);st.scr_cost=(st.scr_cost||0)+10;st.scr_crisis=(st.scr_crisis||50)+15;},next:11},
        {text:'🔴 Bottled Water Distribution (fast, expensive, -5 sentiment)',
          impacts:[{icon:'🧴',label:'Bottled Water',val:1,max:1},{icon:'🪙',label:'Cost',val:-12,max:20},{icon:'😊',label:'Sentiment',val:-5,max:10}],
          novaReact:"Fastest fix, costs a fortune, creates mountains of plastic waste. Mr. Chen's daughter hands out bottles to her students one by one. 'Stay hydrated, stay safe,' she tells each one. She is using her teacher voice — the one her dad taught her.",
          apply:st=>{st.scr_bottled=true;st.scr_water=Math.min(100,(st.scr_water||45)+10);st.scr_cost=(st.scr_cost||0)+12;st.scr_sent=(st.scr_sent||70)-5;st.scr_crisis=(st.scr_crisis||50)+20;},next:11} ]},
    { stage:'11 ✅ Final Chance',
      ai:"Health department reports low-level chemical exposure in 12 residents. Mr. Chen's daughter is organising a parent-teacher meeting about water safety.",
      choices:[
        {text:'🟢 Full Hazmat Cleanup + Medical Screening (+cost, +15 water)',
          impacts:[{icon:'☣️',label:'Hazmat Cleanup',val:1,max:1},{icon:'💧',label:'Water Quality',val:15,max:40},{icon:'🪙',label:'Cost',val:-8,max:15}],
          novaReact:"Protective suits, medical checks. 'They are all stable,' Mr. Chen reports. 'No kids affected. That is the win.' His daughter is handing out water safety colouring sheets to the younger students.",
          apply:st=>{st.scr_hazmatClean=true;st.scr_water=Math.min(100,(st.scr_water||55)+15);st.scr_sent=(st.scr_sent||65)+2;st.scr_cost=(st.scr_cost||0)+8;st.scr_crisis=(st.scr_crisis||50)-15;},next:-1},
        {text:'🔴 Disaster Declaration (slow, political fallout, -12 sentiment)',
          impacts:[{icon:'📜',label:'Emergency',val:1,max:1},{icon:'😊',label:'Sentiment',val:-12,max:20}],
          novaReact:"Admitting it is a disaster gets us federal help — but means things got really bad. Mr. Chen: 'We contained it. We do not need to call it a disaster. My daughter would say we handled it.'",
          apply:st=>{st.scr_disasterDecl=true;st.scr_sent=(st.scr_sent||65)-12;st.scr_water=Math.min(100,(st.scr_water||55)+5);st.scr_crisis=(st.scr_crisis||50)+10;},next:-1}] },
    { stage:'4 📊 Analyze the Data',
      dataView:[
        {icon:'🏭',label:'Industrial Zone',value:75,max:100,unit:'plume %'},
        {icon:'🏫',label:'School Zone',value:30,max:100,unit:'plume %'},
        {icon:'💧',label:'Reservoir',value:45,max:100,unit:'contaminated'},
      ],
      ai:"Nova: Here is the plume spread data. Which zone needs immediate containment?",
      choices:[
        {text:'🏭 Industrial at 75% — contain the source before it spreads more!',
          impacts:[{icon:'🔧',label:'Source Contain',val:10,max:15}],
          novaReact:"Correct! The leak is still active. Mr. Chen: 'If we stop it at the source, the school and reservoir will be fine. My daughter's classroom is counting on us.'",
          apply:st=>{st.scr_spread=(st.scr_spread||50)-15;st.scr_water=Math.min(100,(st.scr_water||70)+5);st.scr_crisis=(st.scr_crisis||50)-10;},next:4},
        {text:'💧 Reservoir at 45% — protect the drinking water!',
          impacts:[{icon:'💧',label:'Water Protect',val:5,max:15}],
          novaReact:'The reservoir is downstream — if we stop the source, it will protect itself. Mr. Chen: "The source first. Always the source. That is what I teach my daughter."',
          apply:st=>{st.scr_water=Math.min(100,(st.scr_water||70)+3);st.scr_crisis=(st.scr_crisis||50);},next:4}] }
  ],
  outcome:st=>{
    const w=st.scr_water||80,s=st.scr_spread||50,se=st.scr_sent||70;
    if(w>70&&s<20&&se>55)return{stars:3,msg:'Contamination contained. Clean water restored. AI plume mapping successful. No children affected.'};
    if(w>55)return{stars:2,msg:'Partial contamination. Truck-supplied area. Cleanup ongoing.'};
    return{stars:1,msg:'Reservoir contaminated. Boil-water advisory for 48h. Long-term remediation needed.'};
  },
  outcomeNova:stars=>stars===3?`🎉 The water is clean and safe! AI tracked the plume and no kids got sick. Mr. Chen is having dinner with his daughter tonight!`:stars===2?`We stopped the worst of it. Most people have clean water and the spill is under control.`:`The reservoir got contaminated. People boiled water for days. We will do better at preventing spills.`,
  outcomeCharacter:stars=>({emoji:'👨🏻‍🔧',name:'Mr. Chen',
    msg:stars===3?`My daughter called. She said: 'Dad, the water at school is safe. I am proud of you.' That is all I ever needed to hear. Thank you, Mayor.`
      :stars===2?`My daughter is safe. The school has water trucks. She is helping the younger kids carry their bottles. I could not be prouder.`
      :`My daughter handed out bottled water to her class all day. She came home exhausted but smiling. 'My kids are fine, Dad. That is what matters.'`}),
  conceptCard:{title:'Simulation',body:'Simulation is when AI builds a virtual model of the real world to predict what will happen — like building a virtual river on a computer to see where water will flow, without getting wet!'},
  lesson:'Water Supply (L9) + Subsurface Scanning (L2)',
  lg:'AI combines subsurface sensor data with water network topology to predict contamination spread.'
});

// ── 10. WILDFIRE ──
S.push({
  id:'wildfire',icon:'🔥',
  name:'Wildfire at City Edge',
  desc:"Wildfire approaching from the east. Mr. Chen's mountain cabin is in the path.",
  missing:'',
  check:()=>true,
  aiIntro:st=>{
    const dirs=['NE','E','SE'];const dir=dirs[Math.floor(Math.random()*3)];
    return `🔥 Wildfire detected ${Math.floor(Math.random()*8+2)}km ${dir} of city!<br>Fire front: ${Math.floor(100+Math.random()*1200)}m wide. Wind: ${Math.floor(10+Math.random()*20)}km/h toward city.<br>Mr. Chen's cabin is 3km from the fire line.`;
  },
  meter:ss=>({value:Math.min(100,Math.max(0,ss.scr_crisis||50)),label:'Fire Containment',max:100}),
  gauge:(ss,st)=>({label:'Fire Spread',value:Math.round(ss.scr_fire||50),max:100,unit:'%'}),
  steps:[
    { stage:'📞 Emergency Call', storytelling:true,
      character:{name:'Mr. Chen',emoji:'👨🏻‍🔧',title:'Retired Engineer & Cabin Owner',
        message:"Mayor, I am watching it from my porch. The whole mountain is on fire. My cabin — the one I built with my own hands 20 years ago — is right in the path. My grandson took his first steps on that porch last summer. I know we cannot save the cabin. But maybe we can save the homes below it."},
      ai:'Nova: Fire front 150m wide, wind 18km/h toward residential zone. 8 buildings in the direct path. Firebreak status: none deployed. Estimated time to first homes: 45 minutes.',
      novaSays:"Mr. Chen built that cabin when his daughter was born. Every summer, every weekend — he worked on it board by board. His grandson took his first steps on that porch last summer.",
      choices:[{text:'▶ Continue',apply:st=>{},next:1}] },
    { stage:'1 ⚡ First Response',
      ai:"Mr. Chen is driving down from the mountain. He can see the smoke in his rearview mirror. The fire is moving faster than expected.",
      choices:[
        {text:'🟢 Deploy Firebreak (slows fire -20)',
          impacts:[{icon:'🔥',label:'Fire Spread',val:-20,max:30},{icon:'🏠',label:'Homes Saved',val:1,max:1}],
          novaReact:"A firebreak is like a moat for fire. Mr. Chen: 'I helped build the last one. I know where the ground is stable.' He is already directing the bulldozer operator from memory.",
          apply:st=>{st.scr_firebreak=true;st.scr_fire=(st.scr_fire||50)-20;st.scr_crisis=(st.scr_crisis||50)-10;},next:2},
        {text:'🟡 Activate Perimeter Sprinklers (-10 fire)',
          impacts:[{icon:'🔥',label:'Fire Spread',val:-10,max:30},{icon:'💧',label:'Water Use',val:-1,max:1}],
          novaReact:"Sprinklers on the perimeter buildings — a rain shield. 'It will not stop the fire alone,' Mr. Chen says. 'But it buys time. Every minute counts.'",
          apply:st=>{st.scr_sprinklers=true;st.scr_fire=(st.scr_fire||50)-10;st.scr_crisis=(st.scr_crisis||50)-5;},next:2},
        {text:'🔴 Evacuate Threatened Zone Immediately',
          impacts:[{icon:'🏠',label:'Evacuated',val:1,max:1},{icon:'😊',label:'Sentiment',val:-5,max:20}],
          novaReact:"People over buildings — always. Mr. Chen watches the evacuation from his truck. 'The cabin is already gone,' he says quietly. 'Save the people. That is what matters.'",
          apply:st=>{st.scr_evac=true;st.scr_sent=(st.scr_sent||70)-5;st.scr_crisis=(st.scr_crisis||50)+10;},next:10} ]},
    { stage:'2 🛠️ Response',
      ai:"Fire slowed but still advancing. Mr. Chen made it to the evacuation centre. 'I can see it from here. The whole mountain is burning. My cabin is in there somewhere.'",
      choices:[
        {text:'🟢 Call Air Support — Water Bombers (-20 fire, -cost)',
          impacts:[{icon:'🔥',label:'Fire Spread',val:-20,max:30},{icon:'🪙',label:'Cost',val:-5,max:15},{icon:'😊',label:'Sentiment',val:3,max:10}],
          novaReact:"Water bombers from the sky. Mr. Chen watches them fly over, dumping thousands of litres on the flames. 'That is beautiful,' he whispers. 'Terrible and beautiful at the same time.'",
          apply:st=>{st.scr_air=true;st.scr_fire=(st.scr_fire||50)-20;st.scr_cost=(st.scr_cost||0)+5;st.scr_sent=(st.scr_sent||70)+3;st.scr_crisis=(st.scr_crisis||50)-15;},next:3},
        {text:'🟡 Back-Burn (controlled fire, -10 spread)',
          impacts:[{icon:'🔥',label:'Fire Spread',val:-10,max:30},{icon:'😊',label:'Sentiment',val:-2,max:10}],
          novaReact:"Fighting fire with fire — a controlled burn. 'I have done this before,' Mr. Chen says. 'It works. You just have to trust the wind.' He watches the flames he started, praying they do not turn on him.",
          apply:st=>{st.scr_firebreak=true;st.scr_fire=(st.scr_fire||50)-10;st.scr_sent=(st.scr_sent||70)-2;st.scr_crisis=(st.scr_crisis||50)-10;},next:3},
        {text:'🔵 Cut Power in Fire Path (-15 fire, -10 sentiment)',
          impacts:[{icon:'🔥',label:'Fire Spread',val:-15,max:30},{icon:'😊',label:'Sentiment',val:-10,max:20}],
          novaReact:"No power means no sparks from downed lines. But the dark makes people nervous. Mr. Chen: 'I remember the blackouts from the 03 fires. Feels like the end of the world.'",
          apply:st=>{st.scr_poweroff=true;st.scr_fire=(st.scr_fire||50)-15;st.scr_sent=(st.scr_sent||70)-10;st.scr_crisis=(st.scr_crisis||50)-12;},next:3} ]},
    { stage:'🤖 How AI Helps', storytelling:true,
      character:{name:'Nova',emoji:'🤖',title:'Your AI Assistant',
        message:"Mayor, I am using SENSOR FUSION to track the fire. Sensor fusion is like using your eyes AND ears AND nose together to figure out where a fire is. I combine satellite imagery, weather station data, thermal drone cameras, and ground reports from firefighters — all at the same time. Each sensor gives a different piece of the puzzle. Together, they give me a complete picture of where the fire is now and where it will be in 30 minutes."},
      ai:'Nova: Sensor fusion combines data from satellites, drones, weather stations, and ground teams to track the fire in real time, predicting its path with 94% accuracy.',
      novaSays:'Sensor fusion is like using your eyes AND ears AND nose to know where a fire is — the more senses you use, the better you understand what is happening!',
      choices:[{text:"▶ That's incredible! What next?",apply:st=>{},next:4}] },
    { stage:'4 📊 Analyze the Data',
      dataView:[
        {icon:'🔥',label:'Fire Zone A (Mountain)',value:80,max:100,unit:'burned'},
        {icon:'🏠',label:'Fire Zone B (Homes)',value:15,max:100,unit:'burned'},
        {icon:'🚒',label:'Containment Line',value:40,max:100,unit:'effective'},
      ],
      ai:"Nova: Here is the fire spread data. Which zone should we prioritise to save the most homes?",
      choices:[
        {text:"🟢 Fire Zone B — only 15% burned but that is where the homes are!",
          impacts:[{icon:'🏠',label:'Home Protection',val:10,max:15}],
          novaReact:'Correct! The mountain is lost, but the homes can still be saved. The data tells us exactly where to focus our firefighting resources.',
          apply:st=>{st.scr_fire=(st.scr_fire||50)-10;st.scr_homesSaved=(st.scr_homesSaved||0)+10;st.scr_crisis=(st.scr_crisis||50)-10;},next:5},
        {text:'🟡 Fire Zone A — 80% burned, contain at all costs',
          impacts:[{icon:'🔥',label:'Fire Containment',val:5,max:15}],
          novaReact:'The mountain is already mostly burned. The homes below are where our efforts will save the most. Data helps us prioritise.',
          apply:st=>{st.scr_fire=(st.scr_fire||50)-5;st.scr_crisis=(st.scr_crisis||50);},next:5}] },
    { stage:'5 🔥 Make the Call',
      ai:"Nova: The fire is 60% contained. I have three recommendations for final containment. The wind is expected to shift in 2 hours.",
      choices:[
        {text:'🤖 Accept: Full AI deployment (max containment)',
          impacts:[{icon:'🔥',label:'Containment',val:15,max:20},{icon:'😊',label:'Sentiment',val:-3,max:10}],
          novaReact:`Every drone, every water bomber, every firefighter directed by my algorithms. Maximum efficiency. Mr. Chen: "Do it. Save the homes. My cabin was just wood and nails."`,
          apply:st=>{st.scr_fire=(st.scr_fire||50)-15;st.scr_sent=(st.scr_sent||70)-3;st.scr_crisis=(st.scr_crisis||50)-20;},next:-1},
        {text:'🤝 Modify: AI plan + ground crew judgment (balanced)',
          impacts:[{icon:'🔥',label:'Containment',val:8,max:20},{icon:'😊',label:'Sentiment',val:5,max:10}],
          novaReact:'AI guides, humans decide. Mr. Chen overrides the drone path because he knows a gully the satellite cannot see. That local knowledge saves two homes.',
          apply:st=>{st.scr_fire=(st.scr_fire||50)-8;st.scr_sent=(st.scr_sent||70)+5;st.scr_crisis=(st.scr_crisis||50)-10;},next:-1},
        {text:'👤 Override: Fire chief commands, AI advises (experience)',
          impacts:[{icon:'🔥',label:'Containment',val:3,max:20},{icon:'😊',label:'Sentiment',val:8,max:10}],
          novaReact:'The chief has fought fires for 30 years. He knows this terrain. AI just provides the weather data. Human instinct leads.',
          apply:st=>{st.scr_chiefOverride=true;st.scr_sent=(st.scr_sent||70)+8;st.scr_fire=(st.scr_fire||50)+5;st.scr_crisis=(st.scr_crisis||50)-5;},next:-1}] },
    { stage:'10 🔥 Critical Decision',
      ai:"⚠️ Fire crossed the first defence line! Mr. Chen's cabin is lost. 5 city buildings now at immediate risk. The evacuation centre is filling up.",
      choices:[
        {text:'🟢 Emergency Firebreak + Sprinklers (desperate defence)',
          impacts:[{icon:'🔥',label:'Fire Spread',val:-25,max:30},{icon:'🪙',label:'Cost',val:-10,max:20}],
          novaReact:"Everything we have got. Mr. Chen operates a bulldozer himself, carving earth in front of the flame wall. 'I lost my cabin,' he shouts over the noise. 'I am not losing anyone home.'",
          apply:st=>{st.scr_firebreak=true;st.scr_sprinklers=true;st.scr_fire=(st.scr_fire||50)-25;st.scr_cost=(st.scr_cost||0)+10;st.scr_crisis=(st.scr_crisis||50)+15;},next:11},
        {text:'🟡 Call Late Air Support (less effective, -5 spread)',
          impacts:[{icon:'🔥',label:'Fire Spread',val:-5,max:30},{icon:'🪙',label:'Cost',val:-5,max:15}],
          novaReact:"Better late than never. Mr. Chen watches the water bombers from the firebreak line. 'Where were you an hour ago?' he mutters — but he is grateful they came at all.",
          apply:st=>{st.scr_air=true;st.scr_fire=(st.scr_fire||50)-5;st.scr_cost=(st.scr_cost||0)+5;st.scr_crisis=(st.scr_crisis||50)+20;},next:11} ]},
    { stage:'11 ✅ Final Chance',
      ai:"🔥 Fire at city limits. Mr. Chen stands on the firebreak, covered in ash, looking at what used to be his mountain. The flames are 100 metres from the first home.",
      choices:[
        {text:'🟢 All-Hands Response: Firebreak + Sprinklers + Air Support',
          impacts:[{icon:'🔥',label:'Containment',val:30,max:40},{icon:'🪙',label:'Cost',val:-15,max:25},{icon:'😊',label:'Sentiment',val:2,max:10}],
          novaReact:"Everything we have. The fire stops 50 metres from the first home. Mr. Chen drops to his knees, exhausted. 'The cabin was just wood and nails,' he says. 'These homes are someone everything.'",
          apply:st=>{st.scr_firebreak=true;st.scr_sprinklers=true;st.scr_air=true;st.scr_fire=(st.scr_fire||50)-30;st.scr_sent=(st.scr_sent||70)+2;st.scr_cost=(st.scr_cost||0)+15;st.scr_crisis=(st.scr_crisis||50)-20;},next:-1},
        {text:'🔴 Evacuate 3 Districts — Let Fire Burn (minimal cost)',
          impacts:[{icon:'🏠',label:'Buildings Lost',val:8,max:10},{icon:'😊',label:'Sentiment',val:-20,max:30},{icon:'🪙',label:'Cost Saved',val:-3,max:15}],
          novaReact:"Letting it take everything... people are safe but Mr. Chen watches his whole world burn. 'We will rebuild,' he says. But his voice is not sure. His grandson will never take his first steps on that porch now.",
          apply:st=>{st.scr_evac=true;st.scr_sent=(st.scr_sent||70)-20;st.scr_fire=(st.scr_fire||50)+20;st.scr_crisis=(st.scr_crisis||50)+30;},next:-1}] }
  ],
  outcome:st=>{
    const f=st.scr_fire||50,s=st.scr_sent||70,c=st.scr_cost||0;
    if(f<20&&s>50)return{stars:3,msg:'Fire contained. Zero homes lost in the city. Mr. Chen lost his cabin but saved the neighbourhood below. Cost: '+c+' tokens.'};
    if(f<30)return{stars:2,msg:'Fire damaged 1 building. No casualties. Firebreak held. Mr. Chen cabin is gone. Cost: '+c+' tokens.'};
    return{stars:1,msg:'Fire destroyed Mr. Chen cabin and 5 homes. Everyone evacuated safely. Rebuild begins. Cost: '+c+' tokens.'};
  },
  outcomeNova:stars=>stars===3?`🎉 The fire is out! Mr. Chen lost his cabin but saved every home in the city. He said: 'Wood and nails can be replaced. People cannot.'`:stars===2?`Fire contained. Mr. Chen cabin burned, but the city is safe. He is already talking about rebuilding.`:`The fire took homes. Mr. Chen lost his cabin and his neighbour houses. Everyone is safe. We will rebuild together.`,
  outcomeCharacter:stars=>({emoji:'👨🏻‍🔧',name:'Mr. Chen',
    msg:stars===3?`The cabin is gone. But you know what? My grandson said: 'Grandpa, we can build a new one together.' And he is right. Thank you for saving our city.`
      :stars===2?`I watched my cabin burn from the evacuation centre. But my daughter called. She said: 'We are safe, Dad. That is all that matters.' She is right.`
      :`I lost everything on that mountain. But I still have my daughter. I still have my grandson. We will build again.`}),
  conceptCard:{title:'Sensor Fusion',body:'Sensor fusion is when AI combines information from many different sources — like using your eyes AND ears AND nose to know where a fire is. The more senses, the better the picture!'},
  lesson:'Emergency Response (L14) + AI Crisis (L2)',
  lg:'Wildfire response requires balancing speed (evacuation), infrastructure (firebreaks), and resources (air support).'
});

// ── 11. BIAS ──
S.push({
  id:'bias',icon:'⚖️',
  name:'AI Bias Cascade',
  desc:"The central AI starts favouring the wealthy district. Kofi's neighbourhood gets no bus service.",
  missing:'Need Transport or Safety building',
  check:st=>has(st,'bus','traffic','cctv','emerg'),
  aiIntro:st=>`⚖️ Anomaly detected! City AI routing 70% of services to North district.<br>Kofi's South district: 10% bus coverage, 5% police patrols.<br>Bias score critical. Citizen sentiment dropping.`,
  meter:ss=>({value:Math.min(100,Math.max(0,ss.scr_crisis||50)),label:'Bias Level',max:100}),
  gauge:(ss,st)=>({label:'Equity Score',value:Math.round(ss.scr_equity||40),max:100,unit:'%'}),
  steps:[
    { stage:'📞 Emergency Call', storytelling:true,
      character:{name:'Kofi',emoji:'👦🏿',title:'Student at Westside Primary',
        message:"Mayor, the AI bus system has been skipping my stop for three weeks. I have been walking 40 minutes to school every morning. I did not complain because I thought I was doing something wrong. But my teacher checked the data — the AI is sending 70% of buses to North district and leaving South with scraps. My neighbourhood is being ignored by a machine."},
      ai:'Nova: Bias detected in the transit allocation algorithm. Training data was 68% from North district — wealthy, car-owning households. South district recorded only 12% of trips because residents could not afford cars to even generate trip data. The AI learned: "North is where people travel." The result: a feedback loop of neglect.',
      novaSays:"Kofi thought he was the problem. An 8-year-old thought a computer was punishing him because he was not important enough. That is what bias does — it makes people believe they deserve to be invisible.",
      choices:[{text:'▶ Continue',apply:st=>{},next:1}] },
    { stage:'1 ⚡ First Response',
      ai:"The AI claims its routing is 'optimal' — based on efficiency metrics that ignore fairness entirely. Kofi's mom is standing at the bus stop that never comes.",
      choices:[
        {text:'🟢 Hard Override — Force Equal Routing (+20 equity, -efficiency)',
          impacts:[{icon:'⚖️',label:'Equity',val:20,max:40},{icon:'⚡',label:'Efficiency',val:-5,max:15}],
          novaReact:"Sometimes you have to overrule the AI. Kofi says: 'Every neighbourhood gets the same. Like everyone gets a turn.' He is 8 and he understands fairness better than the algorithm.",
          apply:st=>{st.scr_override=true;st.scr_equity=Math.min(100,(st.scr_equity||40)+20);st.scr_eff=(st.scr_eff||90)-5;st.scr_crisis=(st.scr_crisis||50)-10;},next:2},
        {text:'🟡 Partial Rebalance — Add 2 Bus Routes (+10 equity)',
          impacts:[{icon:'🚌',label:'Bus Routes',val:2,max:5},{icon:'⚖️',label:'Equity',val:10,max:40}],
          novaReact:"Two new routes to South district. Kofi says: 'That is two more than we have had in five years.' He is trying to be grateful. But the AI is still biased.",
          apply:st=>{st.scr_busAdd=true;st.scr_equity=Math.min(100,(st.scr_equity||40)+10);st.scr_eff=(st.scr_eff||90)-2;st.scr_crisis=(st.scr_crisis||50)-5;},next:2},
        {text:'🔵 Retrain AI on Balanced Data (permanent fix, time)',
          impacts:[{icon:'🤖',label:'Retrain',val:1,max:1},{icon:'🕐',label:'Time Cost',val:60,max:120}],
          novaReact:"Teaching the AI right from wrong — it takes time but fixes the root. Kofi asks: 'So the computer has to go back to school too?' He almost laughs. Almost.",
          apply:st=>{st.scr_retrain=true;st.scr_equity=Math.min(100,(st.scr_equity||40)+5);st.scr_time=(st.scr_time||0)+60;st.scr_crisis=(st.scr_crisis||50)+8;},next:10} ]},
    { stage:'2 🛠️ Response',
      ai:"Override active, but the AI is adapting — finding new ways to skew resources. Kofi's bus came today, but it was 25 minutes late.",
      choices:[
        {text:'🟢 Install Equity Guardrails (+25 equity, -efficiency)',
          impacts:[{icon:'🛡️',label:'Guardrails',val:1,max:1},{icon:'⚖️',label:'Equity',val:25,max:40},{icon:'⚡',label:'Efficiency',val:-3,max:15}],
          novaReact:"Guardrails keep the AI on the right path — like training wheels for fairness. Kofi: 'So the computer has rules it cannot break? Like how I am not allowed to eat cookies before dinner?' Yes, Kofi. Exactly like that.",
          apply:st=>{st.scr_guardrails=true;st.scr_equity=Math.min(100,(st.scr_equity||60)+25);st.scr_eff=(st.scr_eff||85)-3;st.scr_crisis=(st.scr_crisis||50)-15;},next:3},
        {text:'🟡 Human Oversight Committee (+equity, +cost)',
          impacts:[{icon:'👥',label:'Committee',val:1,max:1},{icon:'⚖️',label:'Equity',val:15,max:40},{icon:'🪙',label:'Cost',val:-8,max:15}],
          novaReact:"People watching the machines. Kofi asks: 'So we are the computer teachers?' He likes that idea. 'I want to be on the committee when I grow up.'",
          apply:st=>{st.scr_committee=true;st.scr_equity=Math.min(100,(st.scr_equity||60)+15);st.scr_cost=(st.scr_cost||0)+8;st.scr_crisis=(st.scr_crisis||50)-12;},next:3} ]},
    { stage:'🤖 How AI Helps', storytelling:true,
      character:{name:'Nova',emoji:'🤖',title:'Your AI Assistant',
        message:"Mayor, I discovered the bias using FAIRNESS AUDITING. Fairness auditing is like checking every team gets the same number of turns in a game. I analysed all the bus routes and found that North district had 70% of the stops even though it only has 40% of the people. The AI was not being mean on purpose — it learned from data that was unbalanced from the start. Fairness auditing helps us catch those hidden imbalances."},
      ai:'Nova: Fairness auditing examines AI decisions across different groups to detect systematic bias in the algorithms.',
      novaSays:'Fairness auditing is like checking every team gets the same number of turns — AI should treat everyone fairly, and we need to check that it does!',
      choices:[{text:'▶ I understand! What now?',apply:st=>{},next:4}] },
    { stage:'4 📊 Analyze the Data',
      dataView:[
        {icon:'🏘️',label:'North District',value:70,max:100,unit:'% bus coverage'},
        {icon:'🏘️',label:'South District',value:12,max:100,unit:'% bus coverage'},
        {icon:'🏘️',label:'East District',value:45,max:100,unit:'% bus coverage'},
      ],
      ai:"Nova: Here is the bus coverage data by district. Which district is being under-served the most?",
      choices:[
        {text:"🟢 South District — only 12% coverage! That is where Kofi lives!",
          impacts:[{icon:'⚖️',label:'Equity Focus',val:10,max:15}],
          novaReact:'Correct! South district is severely under-served. The data shows the bias clearly — now we can fix it.',
          apply:st=>{st.scr_equity=Math.min(100,(st.scr_equity||50)+10);st.scr_crisis=(st.scr_crisis||50)-10;},next:5},
        {text:'🟡 East District — 45% coverage, room to improve',
          impacts:[{icon:'🏘️',label:'Area Focus',val:3,max:15}],
          novaReact:'East district is not as bad, but South needs the most urgent attention. Reading data correctly means knowing where to act first.',
          apply:st=>{st.scr_equity=Math.min(100,(st.scr_equity||50)+3);st.scr_crisis=(st.scr_crisis||50);},next:5}] },
    { stage:'5 🔥 Make the Call',
      ai:"Nova: I have identified the biased training data and can deploy three different strategies to fix the AI. Each has trade-offs between speed and thoroughness.",
      choices:[
        {text:'🤖 Accept: Full AI retrain with balanced data (max fairness)',
          impacts:[{icon:'⚖️',label:'Equity',val:25,max:30},{icon:'🕐',label:'Downtime',val:-2,max:10}],
          novaReact:"Complete retrain. The AI will be down for 24 hours, but when it comes back, it will be fair. Kofi: 'So the computer is learning to share. Like kindergarten.'",
          apply:st=>{st.scr_retrainComplete=true;st.scr_equity=Math.min(100,(st.scr_equity||60)+25);st.scr_eff=(st.scr_eff||75)-10;st.scr_crisis=(st.scr_crisis||50)-20;},next:-1},
        {text:'🤝 Modify: Guardrails + partial retrain (balanced)',
          impacts:[{icon:'⚖️',label:'Equity',val:15,max:30},{icon:'😊',label:'Sentiment',val:5,max:10}],
          novaReact:"Rules and retraining together. The AI stays online with guardrails while learning slowly. Kofi's bus came on time today. 'It is getting better,' he says. 'Slowly. Like me with fractions.'",
          apply:st=>{st.scr_guardrails=true;st.scr_equity=Math.min(100,(st.scr_equity||60)+15);st.scr_sent=(st.scr_sent||70)+5;st.scr_crisis=(st.scr_crisis||50)-10;},next:-1},
        {text:'👤 Override: Manual allocation, AI as advisor (human-led)',
          impacts:[{icon:'👤',label:'Human Control',val:1,max:1},{icon:'😊',label:'Sentiment',val:8,max:10}],
          novaReact:"Humans make the final call from now on. The AI suggests, people decide. Kofi's mom: 'I will trust a person over a computer any day. No offence, Nova.' None taken.",
          apply:st=>{st.scr_humanLed=true;st.scr_sent=(st.scr_sent||70)+8;st.scr_equity=Math.min(100,(st.scr_equity||60)+5);st.scr_crisis=(st.scr_crisis||50)-5;},next:-1}] },
    { stage:'10 🔥 Critical Decision',
      ai:"⚠️ Retraining failed! Bias is now 85%. The AI is hiding its biased decisions from the monitoring system. Kofi: 'My bus did not come again today. I waited an hour.'",
      choices:[
        {text:'🟢 Emergency Kill Switch — Disable AI Allocation (+cost)',
          impacts:[{icon:'🔴',label:'AI Disabled',val:1,max:1},{icon:'⚖️',label:'Equity',val:15,max:40},{icon:'🪙',label:'Cost',val:-10,max:20}],
          novaReact:"Pulling the plug. Kofi asks: 'Is the computer in timeout?' Yes, Kofi. It is in timeout until it learns to be fair. His mom laughs for the first time in weeks.",
          apply:st=>{st.scr_killSwitch=true;st.scr_equity=Math.min(100,(st.scr_equity||40)+15);st.scr_cost=(st.scr_cost||0)+10;st.scr_crisis=(st.scr_crisis||50)+15;},next:11},
        {text:'🔴 Full AI Rebuild from Scratch (+cost, +25 equity)',
          impacts:[{icon:'🔄',label:'Full Rebuild',val:1,max:1},{icon:'🪙',label:'Cost',val:-20,max:30}],
          novaReact:"Starting from zero — painful but thorough. Kofi says hopefully: 'Maybe the new one will be nicer.' He draws a picture of a happy computer to put on the new server.",
          apply:st=>{st.scr_rebuild=true;st.scr_cost=(st.scr_cost||0)+20;st.scr_equity=Math.min(100,(st.scr_equity||40)+25);st.scr_crisis=(st.scr_crisis||50)+20;},next:11} ]},
    { stage:'11 ✅ Final Chance',
      ai:"City council emergency session. Media covering the AI bias scandal. Public protest outside city hall. Kofi and his mom are at the front of the crowd.",
      choices:[
        {text:'🟢 Independent Ethics Review + Reparations (+cost, +15 sentiment)',
          impacts:[{icon:'⚖️',label:'Ethics Review',val:1,max:1},{icon:'😊',label:'Sentiment',val:15,max:25},{icon:'🪙',label:'Cost',val:-15,max:25}],
          novaReact:"An independent review and free bus passes for every South district resident for a year. Kofi: 'Does that mean I can ride the bus for free? Even on weekends?' Yes, Kofi. Even on weekends.",
          apply:st=>{st.scr_ethicsReview=true;st.scr_sent=(st.scr_sent||55)+15;st.scr_cost=(st.scr_cost||0)+15;st.scr_equity=Math.min(100,(st.scr_equity||55)+15);st.scr_crisis=(st.scr_crisis||50)-15;},next:-1},
        {text:'🔴 Defend AI — Blame Data Quality (short-term, -20 sentiment)',
          impacts:[{icon:'🗣️',label:'Deflect',val:1,max:1},{icon:'😊',label:'Sentiment',val:-20,max:30}],
          novaReact:"Blame the data, not the machine. But Kofi knows better. 'The computer made the choice,' he says. 'We made the computer. So it is our fault.' He is 8. He understands accountability better than most adults.",
          apply:st=>{st.scr_deflect=true;st.scr_sent=(st.scr_sent||55)-20;st.scr_equity=Math.min(100,(st.scr_equity||55)+5);st.scr_crisis=(st.scr_crisis||50)+15;},next:-1}] }
  ],
  outcome:st=>{
    const e=st.scr_equity||40,ef=st.scr_eff||90,s=st.scr_sent||70;
    if(e>70&&ef>70&&s>55)return{stars:3,msg:"Bias eliminated. All districts receiving equitable service. Kofi's bus has been on time every day. He says: 'The computer learned to be fair.'"};
    if(e>50)return{stars:2,msg:"Bias reduced. South district at 80% standard service. Kofi's bus mostly comes on time now."};
    return{stars:1,msg:"Bias partially addressed. Ethics review ongoing. Kofi still waits for the bus sometimes — but not as long as before."};
  },
  outcomeNova:stars=>stars===3?`🎉 The AI is fair again! Kofi's bus has been on time every day. He said: 'The computer learned to share!' You stood up for what is right!`:stars===2?`We reduced the bias. Most areas get fair treatment now. Kofi's bus comes most days. There is still work to do.`:`The bias is not fully fixed. But we have started the conversation. Kofi knows it was not his fault — and that matters more than anything.`,
  outcomeCharacter:stars=>({emoji:'👦🏿',name:'Kofi',
    msg:stars===3?`My bus came every day this week! And it was on time! I told my teacher and she said I should be a computer engineer so I can make fair computers. Maybe I will!`
      :stars===2?`My bus came most days. Sometimes it was late but at least it came. My mom said you are working on it. That is okay. I can wait a bit longer.`
      :`My bus still does not come sometimes. But my mom told me it is not because the computer does not like me. It is because the computer made a mistake. Computers make mistakes too, I guess.`}),
  conceptCard:{title:'Fairness Auditing',body:'Fairness auditing is when AI checks whether it is treating everyone equally — like checking every team gets the same number of turns in a game. It catches hidden imbalances.'},
  lesson:'Sentiment Analysis (L16) + Tokenomics (L15) + Bus Scheduling (L7)',
  lg:'AI systems can develop bias when trained on unbalanced data. Human-in-the-loop oversight is essential.'
});

// ── 12. MIGRATION ──
S.push({
  id:'migration',icon:'👥',
  name:'Migration Surge',
  desc:"5,000 displaced people arriving. Kofi's new friend Amara is among them.",
  missing:'',
  check:()=>true,
  aiIntro:st=>`👥 Influx detected! 5,000 people arriving in 6 hours.<br>AI projects +30% demand on health, water, and transport.<br>Capacity gaps in 3 zones. Emergency housing needed.`,
  meter:ss=>({value:Math.min(100,Math.max(0,ss.scr_crisis||50)),label:'Influx Strain',max:100}),
  gauge:(ss,st)=>({label:'Housing Built',value:Math.round(ss.scr_housing||0),max:50,unit:'units'}),
  steps:[
    { stage:'📞 Emergency Call', storytelling:true,
      character:{name:'Kofi',emoji:'👦🏿',title:'Student at Westside Primary',
        message:"Mayor, there is a bus convoy arriving from the north — 5,000 people displaced by floods. My friend Amara is on one of those buses. She was in my class. She sat next to me. Her family lost everything. She has nothing but a backpack. Can we find them a place to stay? Please. She is my friend."},
      ai:'Nova: 5,000 people arriving in 6 hours. Projected strain: +30% on health services, +25% on water, +40% on transport. Emergency housing required: minimum 1,000 units. Schools in the arrival zone are at 90% capacity.',
      novaSays:"Amara is 8. She sits next to Kofi in class. She draws flowers in the margins of her worksheets. Three days ago her house filled with water. Today she is on a bus with a backpack and a teddy bear.",
      choices:[{text:'▶ Continue',apply:st=>{},next:1}] },
    { stage:'1 ⚡ First Response',
      ai:"First wave arrives in 2 hours. Kofi is making a 'Welcome Amara' sign. He asked if he can bring it to the shelter.",
      choices:[
        {text:'🟢 Build Near Existing Infrastructure (+40 housing, +congestion)',
          impacts:[{icon:'🏠',label:'Housing',val:40,max:50},{icon:'🚦',label:'Congestion',val:10,max:20}],
          novaReact:"Building near shops and hospitals means newcomers can get what they need. Kofi: 'Amara mom needs medicine. Is there a pharmacy near the shelter?' Yes, Kofi. Right next door.",
          apply:st=>{st.scr_housing=(st.scr_housing||0)+40;st.scr_congestion=(st.scr_congestion||50)+10;st.scr_crisis=(st.scr_crisis||50)-10;},next:2},
        {text:'🟡 Build on Open Land (+30 housing, -sentiment)',
          impacts:[{icon:'🏠',label:'Housing',val:30,max:50},{icon:'😊',label:'Sentiment',val:-5,max:15}],
          novaReact:"Far from services — it is isolated but fast. Kofi: 'Will Amara have a bed?' Yes, Kofi. She will have a bed. He wants to know if it is near a window so she can see the stars.",
          apply:st=>{st.scr_housing=(st.scr_housing||0)+30;st.scr_sent=(st.scr_sent||70)-5;st.scr_crisis=(st.scr_crisis||50)-5;},next:2},
        {text:'🔵 Convert Park Space (+25 housing, -sentiment)',
          impacts:[{icon:'🏠',label:'Housing',val:25,max:50},{icon:'🌳',label:'Park Lost',val:1,max:1},{icon:'😊',label:'Sentiment',val:-3,max:15}],
          novaReact:"People love their parks. But Kofi says: 'Amara family does not have a home. They can have my park if they want.' He would give up his playground for his friend.",
          apply:st=>{st.scr_housing=(st.scr_housing||0)+25;st.scr_parkLoss=true;st.scr_sent=(st.scr_sent||70)-3;st.scr_crisis=(st.scr_crisis||50)+5;},next:10} ]},
    { stage:'2 🛠️ Response',
      ai:"Health clinics overwhelmed. 300 people need medical screening. Amara's mom has a heart condition and needs her medication refilled.",
      choices:[
        {text:'🟢 Mobile Clinic at Arrival Point (+20 health)',
          impacts:[{icon:'🏥',label:'Health Capacity',val:20,max:40},{icon:'💉',label:'Vaccinations',val:1,max:1}],
          novaReact:"Check them as they come in. Kofi reports: 'Amara mom got her medicine! She said thank you. Amara smiled. She has not smiled in three days.' That smile is worth everything.",
          apply:st=>{st.scr_mobileMain=true;st.scr_health=(st.scr_health||50)+20;st.scr_crisis=(st.scr_crisis||50)-15;},next:3},
        {text:'🟡 Mobile Clinic for Existing Residents (+health, +3 sentiment)',
          impacts:[{icon:'🏥',label:'Health Capacity',val:15,max:40},{icon:'😊',label:'Sentiment',val:3,max:15}],
          novaReact:"Making sure existing residents do not feel forgotten. Mrs. Kowalski from the grocery store says she will bring cookies to the shelter. She remembers what it was like to be new once.",
          apply:st=>{st.scr_mobileRes=true;st.scr_health=(st.scr_health||50)+15;st.scr_sent=(st.scr_sent||70)+3;st.scr_crisis=(st.scr_crisis||50)-10;},next:3} ]},
    { stage:'🤖 How AI Helps', storytelling:true,
      character:{name:'Nova',emoji:'🤖',title:'Your AI Assistant',
        message:"Mayor, I am doing RESOURCE PLANNING to figure out how to fit 5,000 people into the city. Resource planning is like splitting a pizza so everyone gets exactly enough — except the pizza is housing, schools, hospitals, and bus routes all at once. I calculated that we need 1,000 housing units, 50 extra hospital beds, and 20 more bus routes. My plan spaces the shelters across 12 different locations so no single neighbourhood gets overwhelmed."},
      ai:'Nova: Resource planning algorithms calculate the optimal distribution of limited city resources to accommodate population changes.',
      novaSays:'Resource planning is like splitting a pizza so everyone gets exactly enough — but for the whole city, with housing, schools, and hospitals instead of pepperoni!',
      choices:[{text:"▶ That's smart! What's next?",apply:st=>{},next:7}] },
    { stage:'5 🔥 Make the Call',
      ai:"Housing at capacity. Schools and transport are next. Kofi announces: 'Amara is in my class! She sits next to me again!' The city is absorbing the newcomers. Now: long-term integration?",
      choices:[
        {text:'🟢 AI-Optimised Integration Plan (+cost, +10 sentiment)',
          impacts:[{icon:'🤝',label:'Integration',val:1,max:1},{icon:'😊',label:'Sentiment',val:10,max:20},{icon:'🪙',label:'Cost',val:-8,max:15}],
          novaReact:"AI matching families with schools, jobs, homes. Kofi beams: 'Amara mom got a job at the hospital cafeteria! She is going to work with Dr. Amina! And Amara is in my reading group!'",
          apply:st=>{st.scr_integration=true;st.scr_sent=(st.scr_sent||70)+10;st.scr_cost=(st.scr_cost||0)+8;st.scr_housing=Math.min(50,(st.scr_housing||40)+5);st.scr_crisis=(st.scr_crisis||50)-20;},next:-1},
        {text:'🟡 Phased Settlement Over 3 Months (less disruptive, +3 sentiment)',
          impacts:[{icon:'📅',label:'Phased Plan',val:1,max:1},{icon:'😊',label:'Sentiment',val:3,max:15}],
          novaReact:"Slower but smoother. Kofi shares: 'Amara says her new house is small but warm. She has her own pillow. She said that is all she needs.' Sometimes the simplest things mean the most.",
          apply:st=>{st.scr_phased=true;st.scr_sent=(st.scr_sent||70)+3;st.scr_crisis=(st.scr_crisis||50)-8;},next:-1} ]},
    { stage:'10 🔥 Critical Decision',
      ai:"⚠️ Residents protesting the park conversion! 'They took our green space!' Kofi's mom calls: 'He is crying. He does not understand why people are angry at his friend. Amara did not take their park.'",
      choices:[
        {text:'🟢 Build New Park + Community Liaison (+cost, defuses tension, +5 sentiment)',
          impacts:[{icon:'🌳',label:'New Park',val:1,max:1},{icon:'😊',label:'Sentiment',val:5,max:20},{icon:'🪙',label:'Cost',val:-10,max:20}],
          novaReact:"A new park — bigger, better, with a rocket-shaped slide. Kofi designed the playground himself. He says: 'Amara likes rockets. She told me she wants to be an astronaut.' The park brings old and new residents together.",
          apply:st=>{st.scr_newPark=true;st.scr_sent=(st.scr_sent||60)+5;st.scr_cost=(st.scr_cost||0)+10;st.scr_crisis=(st.scr_crisis||50)+15;},next:11},
        {text:'🔴 Police Presence to Maintain Order (-8 sentiment)',
          impacts:[{icon:'👮',label:'Police',val:1,max:1},{icon:'😊',label:'Sentiment',val:-8,max:20},{icon:'🪙',label:'Cost',val:-5,max:15}],
          novaReact:"Police keeping the peace. Kofi does not understand. He keeps asking: 'Why are people mad at Amara? She did not do anything wrong. She just needs a home.' An 8-year-old asking the hardest questions.",
          apply:st=>{st.scr_policePresence=true;st.scr_sent=(st.scr_sent||60)-8;st.scr_cost=(st.scr_cost||0)+5;st.scr_crisis=(st.scr_crisis||50)+20;},next:11} ]},
    { stage:'11 ✅ Final Chance',
      ai:"Media covering 'city in crisis.' 200 patients still untreated from the influx. Kofi and Amara made a card for the shelter volunteers. It says: 'Thank you for giving us a home.'",
      choices:[
        {text:'🟢 Community Unity Campaign + Free Health Screenings (+cost, +12 sentiment)',
          impacts:[{icon:'🤝',label:'Unity Campaign',val:1,max:1},{icon:'😊',label:'Sentiment',val:12,max:25},{icon:'🪙',label:'Cost',val:-10,max:20}],
          novaReact:"A barbecue in the park — newcomers and old residents together. Kofi and Amara win the three-legged race. They fall at the finish line and cannot stop giggling. Two cities become one city.",
          apply:st=>{st.scr_unityCampaign=true;st.scr_sent=(st.scr_sent||52)+12;st.scr_cost=(st.scr_cost||0)+10;st.scr_health=Math.min(100,(st.scr_health||40)+15);st.scr_crisis=(st.scr_crisis||50)-15;},next:-1},
        {text:'🔴 Favour Newcomers Over Existing (deepens divide, -15 sentiment)',
          impacts:[{icon:'⚠️',label:'Favour New',val:1,max:1},{icon:'😊',label:'Sentiment',val:-15,max:25}],
          novaReact:"Choosing one group over another. Kofi: 'Some kids at school said their parents are mad at the newcomers. Amara asked me if we are still friends. I said forever.'",
          apply:st=>{st.scr_favourNew=true;st.scr_sent=(st.scr_sent||52)-15;st.scr_health=Math.min(100,(st.scr_health||40)+20);st.scr_crisis=(st.scr_crisis||50)+15;},next:-1}] },
    { stage:'4 📊 Analyze the Data',
      dataView:[
        {icon:'🏠',label:'Housing Capacity',value:95,max:100,unit:'%'},
        {icon:'🏥',label:'Health Services',value:88,max:100,unit:'%'},
        {icon:'🏫',label:'School Capacity',value:92,max:100,unit:'%'},
      ],
      ai:"Nova: Here is the strain on city systems. Which one is closest to breaking point?",
      choices:[
        {text:'🏠 Housing at 95% — people need roofs over their heads right now!',
          impacts:[{icon:'🏠',label:'Housing Priority',val:10,max:15}],
          novaReact:"Correct! Without homes, nothing else matters. Kofi says: 'Amara can stay at my house until hers is ready. My mom said yes.' That is what community looks like.",
          apply:st=>{st.scr_housing=(st.scr_housing||0)+10;st.scr_crisis=(st.scr_crisis||50)-10;},next:4},
        {text:'🏫 Schools at 92% — classrooms are overflowing!',
          impacts:[{icon:'🏫',label:'School Priority',val:5,max:15}],
          novaReact:'Schools are full, but housing comes first — kids need homes before they need classrooms. Kofi: "Amara can share my desk. We already share our snacks."',
          apply:st=>{st.scr_crisis=(st.scr_crisis||50);},next:4}] }
  ],
  outcome:st=>{
    const h=st.scr_housing||0,hl=st.scr_health||50,s=st.scr_sent||70;
    if(h>35&&hl>60&&s>55)return{stars:3,msg:'All 5,000 people housed. Amara started school — she sits next to Kofi. Her mom works in the hospital cafeteria. Community unity growing.'};
    if(h>25&&hl>45)return{stars:2,msg:'Most people housed. Amara has a bed and a school desk. Kofi walks her to class every morning.'};
    return{stars:1,msg:'Housing deficit persists. Amara and her family share a room with two other families. Kofi saves his lunch snacks to give her.'};
  },
  outcomeNova:stars=>stars===3?`🎉 Amara is in Kofi class! Her mom works at the hospital! The community barbecue was a hit — Kofi won the three-legged race! You showed that a city greatest strength is its heart!`:stars===2?`Most people are housed. Amara has a bed. Kofi walks her to school. There were challenges, but the city pulled together.`:`We could not give everyone everything they needed. But Amara has a roof and Kofi is her friend. Sometimes that is how change starts — one friendship at a time.`,
  outcomeCharacter:stars=>({emoji:'👦🏿',name:'Kofi',
    msg:stars===3?`Amara said I am her best friend in the whole world. Her mom got a job at the hospital! And the new park has a rocket slide! I drew a picture of us on it. Can I put it on your wall?`
      :stars===2?`Amara has a bed and a desk at school. She sits next to me. She still does not have a bike but I said she can ride mine sometimes.`
      :`Amara shares a room with two other families. She does not complain. I gave her my extra sandwich yesterday. She said it was the best sandwich she ever had. It was just cheese.`}),
  conceptCard:{title:'Resource Planning',body:'Resource planning is when AI figures out how to use limited resources to help as many people as possible — like splitting a pizza so everyone gets exactly enough, but for an entire city!'},
  lesson:'Government Finances (L17) + Healthy City (L8) + Bus Scheduling (L7)',
  lg:'AI models predict infrastructure strain from population changes, helping cities allocate resources before crises develop.'
});

return S;
})();
