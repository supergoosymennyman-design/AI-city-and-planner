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

return S;
})();
