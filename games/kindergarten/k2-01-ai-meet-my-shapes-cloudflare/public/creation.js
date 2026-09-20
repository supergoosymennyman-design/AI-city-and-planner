/**
 * creation.js — DeepSeek API SVG generation + WebLLM fallback + gallery
 * k2-01: AI, Meet My Shapes!
 * DeepSeek API proxy PRIMARY. WebLLM fallback ONLY if proxy SVG is unparseable.
 * 30 categories with dynamic structural prompts.
 */
function CreationPipeline(){this._canvas=null;this._gallery=[]}
CreationPipeline.prototype.setCanvas=function(el){this._canvas=el};

var SVG_SYSTEM_PROMPT="You are an SVG designer for children's games. Return ONLY raw SVG code. No explanations.";

var ITEM_CATEGORIES={
  insect:["butterfly","bee","ladybug","ant","caterpillar","dragonfly","spider","firefly","grasshopper","cricket","mosquito","worm","snail","scorpion","centipede"],
  bird:["bird","owl","eagle","parrot","penguin","duck","chicken","peacock","swan","flamingo","crow","sparrow","woodpecker","hummingbird","seagull","pigeon","robin","canary","vulture","hawk","falcon","ostrich","kiwi"],
  sea:["fish","whale","shark","dolphin","octopus","jellyfish","crab","seahorse","starfish","turtle","eel","ray","clownfish","goldfish","anglerfish","pufferfish","lobster","shrimp","oyster","seal","walrus","otter","pelican"],
  land_mammal:["cat","dog","rabbit","elephant","lion","tiger","bear","monkey","horse","cow","pig","fox","deer","mouse","hippo","zebra","giraffe","kangaroo","panda","koala","sloth","raccoon","squirrel","hedgehog","chipmunk","beaver","otter","badger","wolf","goat","sheep","llama","camel","bison","rhino","gorilla","lemur","armadillo","platypus"],
  reptile:["dinosaur","snake","lizard","crocodile","frog","turtle","chameleon","gecko","iguana","alligator","toad","newt","salamander","tortoise"],
  monster:["dragon","monster","ogre","goblin","orc","troll","giant","vampire","werewolf","demon","devil","cyclops","hydra","basilisk","chimera","kraken","leviathan","cerberus","minotaur","harpy","gorgon","siren","wendigo","chupacabra","godzilla","rodan","mothra","blob","frankenstein","mummy","zombie","skeleton","ghost","yeti","bigfoot","loch ness","witch","wizard","dark elf","necromancer","lich","beholder","mind flayer","displacer beast","owlbear","gelatinous cube","rust monster"],
  person:["robot","alien","snowman","pirate","princess","knight","wizard","fairy","angel","clown","skeleton","ghost","mermaid","ninja","cowboy","superhero","viking","samurai","chef","doctor","firefighter","police","astronaut","king","queen","baby","boy","girl","man","woman"],
  emotion:["happy","sad","angry","surprised","scared","love","silly","shy","proud","sick","tired","excited","calm","brave","lonely"],
  house:["house","castle","tower","igloo","lighthouse","windmill","tent","cabin","barn","pagoda","treehouse","hut","cottage","mansion","palace","fortress","dungeon","temple","pyramid","sphinx"],
  bridge:["bridge","arch","gate","tunnel","viaduct","drawbridge","rope bridge","stone bridge","suspension bridge"],
  city:["building","skyscraper","shop","school","hospital","church","hotel","bank","museum","library","supermarket","factory","stadium","airport","station","parking","garage","apartment","office","restaurant","cafe","bakery","theater","cinema"],
  car:["car","truck","bus","taxi","ambulance","fire truck","police car","jeep","suv","van","pickup","limousine","sports car","race car","monster truck","minivan","electric car","convertible"],
  train:["train","subway","tram","monorail","steam train","bullet train","cargo train","passenger train","locomotive","caboose","railway"],
  air:["airplane","helicopter","hot air balloon","rocket","spaceship","ufo","parachute","jet","glider","biplane","fighter jet","passenger plane","cargo plane","seaplane","space shuttle","satellite","drone","blimp","hang glider"],
  water:["boat","ship","submarine","canoe","sailboat","cruise","yacht","kayak","raft","ferry","tugboat","destroyer","carrier","battleship","pirate ship","viking ship","speedboat","jet ski","rowboat","barge"],
  bike:["bicycle","unicycle","scooter","skateboard","rollerblade","tricycle","motorcycle","moped","scooter","segway"],
  construction:["tractor","bulldozer","crane","excavator","dump truck","forklift","roller","cement mixer","backhoe","plow","harvester","steamroller"],
  tree:["tree","palm tree","pine tree","bush","cactus","bonsai","willow","oak","maple","cherry blossom","apple tree","christmas tree","jungle","forest"],
  flower:["flower","rose","sunflower","tulip","lotus","daisy","orchid","lily","lavender","cherry blossom","hibiscus","dandelion","poppy","bluebell","carnation","iris","violet","marigold","hydrangea","peony"],
  nature:["sun","moon","star","rainbow","cloud","mountain","volcano","island","waterfall","river","ocean","snowflake","lightning","tornado","desert","canyon","cave","cliff","beach","reef","lake","pond","stream","geyser","aurora","eclipse","constellation","meteor","shooting star","nebula"],
  fruit:["apple","watermelon","orange","banana","grape","strawberry","cherry","pineapple","lemon","lime","peach","pear","plum","mango","kiwi","blueberry","raspberry","blackberry","coconut","papaya","dragon fruit","pomegranate","fig","date","olive"],
  food:["cake","pizza","burger","ice cream","cupcake","donut","cookie","candy","lollipop","chocolate","sandwich","fries","pancake","sushi","taco","hot dog","nachos","popcorn","pretzel","waffle","pudding","pie","cheese","egg","bacon","rice","noodles","ramen","burrito","dumpling","spring roll"],
  drink:["juice","milk","soda","coffee","tea","lemonade","milkshake","smoothie","water","hot chocolate","beer","wine","coconut water","iced tea","matcha","boba","slushie"],
  kitchen:["cup","plate","bowl","pot","pan","knife","fork","spoon","kettle","mug","glass","bottle","jar","colander","grater","peeler","ladle","spatula","whisk","measuring cup","mixing bowl","baking tray","cutting board"],
  clothing:["hat","shoe","boot","sandal","slipper","shirt","t-shirt","pants","shorts","skirt","dress","jacket","coat","vest","sweater","scarf","glove","sock","belt","tie","bow","ribbon","crown","mask","glasses","sunglasses","watch","necklace","ring","earring","bracelet","backpack","purse","wallet","umbrella","diaper","apron","uniform","swimsuit","pajama","robe"],
  sport:["ball","soccer ball","basketball","tennis ball","baseball","football","volleyball","bowling","goal","racket","bat","skate","surfboard","snowboard","ski","hockey","golf","badminton","ping pong","cricket","rugby","dart","frisbee","jump rope","hula hoop","trophy","medal","whistle","stopwatch"],
  music:["guitar","piano","drum","violin","trumpet","flute","harp","microphone","saxophone","xylophone","maraca","tambourine","bell","accordion","banjo","cello","clarinet","tuba","trombone","organ","ukulele","harmonica","bagpipes","didgeridoo","triangle","cymbals","kazoo"],
  art:["paintbrush","pencil","crayon","scissors","ruler","book","notebook","camera","palette","easel","canvas","paint","marker","chalk","pastel","clay","origami","glue","tape","stapler","paperclip","eraser","sharpener","compass","protractor","backpack"],
  furniture:["chair","table","desk","bed","sofa","couch","stool","bench","shelf","bookcase","wardrobe","cabinet","drawer","nightstand","dresser","mirror","lamp","clock","carpet","rug","pillow","cushion","blanket","curtain","chandelier","fan","heater","trash can","basket","hanger","coat rack","umbrella stand"],
  toy:["teddy bear","doll","balloon","kite","top","yo-yo","puzzle","blocks","train toy","lego","slime","action figure","stuffed animal","rubber duck","play dough","bubble","pinwheel","marble","magnet","building blocks","jigsaw","card","board game","video game","controller"],
  tool:["hammer","screwdriver","wrench","saw","axe","shovel","rake","ladder","bucket","rope","nail","screw","drill","tape","level","pliers","file","chisel","plane","mallet","crowbar","paint roller","brush","sponge","broom","mop","dustpan","ladder","wheelbarrow","hose","nozzle"],
  fantasy:["unicorn","phoenix","griffin","pegasus","centaur","elf","dwarf","fairy","pixie","gnome","leprechaun","angel","valkyrie","pegasus","hippogriff","sphinx","mermaid"]
};

var CATEGORY_PROMPTS={
  insect:"Build from HEAD → BODY → WINGS/LEGS. Use a circle for head, a smaller rect for body, small thin rects for legs, polygon or circle for wings.",
  bird:"Build from HEAD → BODY → TAIL/WINGS. Use a circle for head, a larger rect for body, a triangle/polygon for beak, polygon shapes for wings and tail feathers.",
  sea:"Build from HEAD (left) → BODY (middle) → TAIL (right). Use a large rect or circle for body, a triangle/polygon for tail fin. Add small accent shapes for scales or fins.",
  land_mammal:"Build from HEAD (top-left) → BODY (middle) → LEGS (bottom). Use a circle for head, a large rect for body, 4 small rects for legs, a polygon or small rect for ears.",
  reptile:"Build from HEAD → BODY → TAIL. Use a circle or rect for head, a long rect for body, a tapering polygon for tail, small rects for legs, accent circles for scales.",
  monster:"Build from BIG HEAD (top) → BODY (middle) → LONG TAIL (bottom). Use a large circle for the head. Add a wide polygon for the MOUTH with sharp triangle teeth. Use a large rect for the body, a long tapering polygon for the tail, short thick rects for arms and legs.",
  person:"Build from HEAD (top) → BODY (middle) → LEGS (bottom). Use a circle for head, a large rect for body, two small rects for legs, two small rects for arms.",
  emotion:"Build a simple face. Use a large circle for the face, two circles for eyes, and a polygon or rect for the mouth expression. Add rosy cheek circles.",
  house:"Build from ROOF (top) → WALLS (middle) → DOOR (bottom). Use a large triangle/polygon for roof, a large square/rect for walls, a small rect for door, small square/circle for window, a small rect for chimney. Add details like flower boxes or a welcome mat.",
  bridge:"Build an ARCH from left to right. Use a large wide rect for the road, smaller rects for pillars/supports, accent shapes for railings. Add decorations like flags or lanterns.",
  city:"Build from ROOF (top) → FLOORS (middle) → ENTRANCE (bottom). Use a tall rect for the main tower, many small rects for windows stacked vertically, a triangle or rectangle for the roof peak. Add details like window boxes or a little door.",
  car:"Build from ROOF (top) → BODY (middle) → WHEELS (bottom). Use a large rect for car body, smaller rect for cabin/windows, two circles for wheels, small rects/circles for headlights.",
  train:"Build from CABIN (front) → CARS (middle) → WHEELS (bottom). Use a large rect for the engine, several smaller rects for cars, circles for wheels, small rects for windows.",
  air:"Build from NOSE (front) → BODY (middle) → WINGS/TAIL (back). Use a large rect for fuselage, a triangle/polygon for wings, a small polygon for tail, small circles for windows.",
  water:"Build from BOW (front) → HULL (middle) → STERN (back). Use a large rect for hull, a triangle/polygon for sail, small rects or circles for windows/details.",
  bike:"Build from HANDLEBARS (top) → FRAME (middle) → WHEELS (bottom). Use circles for two wheels, thin rects/polygons for the frame, small accent circles for pedals. Add details like a bell or streamers.",
  construction:"Build from CAB (top) → ARM (middle) → WHEELS (bottom). Use a large rect for the main body, a polygon or rect for the digging arm, large circles for wheels.",
  tree:"Build from TOP (canopy) → TRUNK (middle) → ROOTS (bottom). Use a circle or polygon for the leafy top, a tall thin rect for trunk, small rects/circles for roots or fruit.",
  flower:"Build from PETALS (top) → STEM (middle) → LEAVES (bottom). Use circles for petals, a thin rect for stem, small polygon/circle for leaves.",
  nature:"Build from SKY (top) → MAIN (middle) → GROUND (bottom). Use a large circle for sun/moon, a polygon for mountains, wavy rects for clouds, small accent shapes for details.",
  fruit:"Build from TOP (leaf/stem) → BODY (middle) → BOTTOM. Use a large circle for the fruit body, a small polygon for leaf, small circles for seeds or highlights.",
  food:"Build from TOP (topping) → MAIN BODY (middle) → BASE (bottom). Use a large rect or circle for the main food item, smaller circles for toppings, a thin rect for base/crust.",
  drink:"Build from RIM (top) → BODY (middle) → BASE (bottom). Use a tall rect for cup/glass, a small circle for the opening, a thin rect for straw, accent shapes for liquid or ice.",
  kitchen:"Build from HANDLE (side) → BODY (middle) → BASE (bottom). Use a large rect or circle for the utensil body, a small rect for the handle, small accent shapes for details.",
  clothing:"Build from TOP (collar/brim) → BODY (middle) → BOTTOM (hem/sole). Use a large rect for the main garment, smaller rects for straps, buttons, or decorations. Add patterns like stars or hearts.",
  sport:"Build from TOP → MIDDLE → BOTTOM. Use a large circle for balls, a rect or polygon for equipment, small accent circles for seams or patterns.",
  music:"Build from HEAD/NECK (top) → BODY (middle) → BASE (bottom). Use a rect or polygon for the body, a long thin rect for the neck, small circles for pegs or keys.",
  art:"Build from TIP (top) → BODY (middle) → BASE (bottom). Use a thin long rect for shaft, a small polygon or rect for tip/eraser, small accent shapes for grips.",
  furniture:"Build from SURFACE (top) → SUPPORTS (middle) → LEGS (bottom). Use a large rect for seat/surface, thin rects for legs/backrest, small accent circles for details. Add cushions or pillows.",
  toy:"Build from FEATURE (top) → BODY (middle) → BASE (bottom). Use a circle for head, a rect for body, small shapes for arms/legs/details. Keep it squarish and adorable.",
  tool:"Build from HEAD (top) → SHAFT (middle) → HANDLE (bottom). Use a rect or polygon for working head, a long thin rect for shaft, small accent shapes for grip details.",
  fantasy:"Build like an animal or person but with EXTRA features. Add wings, horns, glow, or magical details using small accent shapes."
};

var CATEGORY_ORDER=["insect","bird","sea","land_mammal","reptile","monster","person","emotion","house","bridge","city","car","train","air","water","bike","construction","tree","flower","nature","fruit","food","drink","kitchen","clothing","sport","music","art","furniture","toy","tool","fantasy"];

var LIVING_CATEGORIES={insect:true,bird:true,sea:true,land_mammal:true,reptile:true,monster:true,person:true,emotion:true,fantasy:true};

var TOY_WITH_FACE=["teddy bear","doll","stuffed animal","action figure","rubber duck","stuffed"];

CreationPipeline.prototype._categorize=function(item){
  item=item.toLowerCase().trim();
  for(var i=0;i<CATEGORY_ORDER.length;i++){
    if(ITEM_CATEGORIES[CATEGORY_ORDER[i]].indexOf(item)!==-1)return CATEGORY_ORDER[i]
  }
  return null
};

CreationPipeline.prototype._makePrompt=function(item){
  var base="Draw a CUTE "+item+" for a children's game. Use ONLY these 4 BASIC shapes: <rect> for square/rectangle, <circle> for circle, <polygon> for triangle. "+
    "CRITICAL RULES:\n"+
    "- viewBox='0 0 400 300'\n"+
    "- DO NOT use rx, ry on rects — keep corners sharp\n"+
    "- DO NOT use <ellipse>, <path>, <line>, or any other shape tag\n"+
    "- Use colorful and cheerful design — bright colors, fun layout\n"+
    "- Use the FULL viewBox — spread shapes evenly from top to bottom\n";

  var cat=this._categorize(item);
  var itemLower=item.toLowerCase();

  // Monster sub-categories
  if(cat==="monster"){
    var undead=["zombie","skeleton","mummy","ghost","skeleton","vampire","werewolf","lich","necromancer"];
    var draconic=["dragon","hydra","basilisk","wyvern","drake","beholder","mind flayer","displacer beast","owlbear"];
    if(undead.indexOf(itemLower)!==-1){
      base+="Build an UNDEAD creature: human-shaped body with a tall rect for the torso, a circle for the head, two thin rects for arms, two rects for legs. Add torn clothes or hollow eyes. DO NOT add a tail. Make it spooky but cartoon-friendly.\n"
    }else if(draconic.indexOf(itemLower)!==-1){
      base+="Build a DRAGON: a large circle for the head. Add a wide rect for the snout/mouth area below the eyes. Place small triangle teeth INSIDE the mouth area. Use a large rect for the body, a long tapering polygon for the tail behind the body, polygon shapes for wings, short thick rects for legs. Two small circles for eyes. Make it fierce but kid-friendly.\n"
    }else{
      base+=CATEGORY_PROMPTS[cat]+"\n"
    }
  }else if(cat&&CATEGORY_PROMPTS[cat]){
    base+=CATEGORY_PROMPTS[cat]+"\n"
  }else{
    base+="- Build the item clearly with: one large main shape, medium supporting shapes around it, small accent shapes for details\n"
  }

  // Living vs non-living face/limbs logic
  var isLiving=LIVING_CATEGORIES[cat]||false;
  var isToyWithFace=cat==="toy"&&TOY_WITH_FACE.indexOf(itemLower)!==-1;
  if(isLiving||isToyWithFace){
    base+="- Add a CUTE face: two big circles for eyes with smaller pupil circles inside, a tiny curved smile (use a polygon), and two small pink circles for rosy cheeks\n"+
    "- Add small arms and legs as thin rects or small circles\n"
  }else{
    base+="- Do NOT add eyes, face, arms, or legs — this is NOT a living thing\n"+
    "- Focus on the structure, shape details, and colors instead\n"
  }

  base+="- Use 4-6 different colors from a friendly palette: blue, yellow, pink, green, orange, purple\n"+
    "- At least 20 shapes total — use up to 100 shapes for a detailed, gorgeous look\n"+
    "- Make it look like a "+item+" that a 4-year-old would instantly recognize\n"+
    "Return ONLY valid SVG code. No text, no explanation, no markdown.";
  return base
};

CreationPipeline.prototype._parseSVG=function(raw){
  var svg=raw.replace(/<think>[\s\S]*?<\/think>/gi,"");
  var m=svg.match(/<svg[\s\S]*?<\/svg>/i);
  if(!m){var m2=svg.match(/```(?:svg)?\s*([\s\S]*?)```/i);if(m2)m=m2[1].match(/<svg[\s\S]*?<\/svg>/i)}
  if(!m){var start=svg.indexOf("<svg");if(start!==-1){var end=svg.indexOf("</svg>",start);if(end!==-1)m=["",svg.substring(start,end+6)]}}
  if(!m){var hasShapes=/<(rect|circle|polygon)[^>]*\/?>/gi.test(svg);if(hasShapes){var shapeRegex=/<(rect|circle|polygon)[^>]*\/?>/gi;var shapes=svg.match(shapeRegex);if(shapes&&shapes.length>=2){var wrapped='<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">'+shapes.join("")+'</svg>';m=[wrapped,wrapped]}}}
  if(m){m[0]=m[0].replace(/\s*rx="[^"]*"/g,"").replace(/\s*ry="[^"]*"/g,"")}
  return m
};

CreationPipeline.prototype.buildSVG=function(item,webllmEngine,cb){var s=this;
  var prompt=this._makePrompt(item);

  fetch("/api/generate-svg",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({prompt:prompt})
  }).then(function(r){
    if(!r.ok)throw new Error("Proxy returned "+r.status);
    return r.json()
  }).then(function(data){
    if(data.error)throw new Error(data.error);
    var m=s._parseSVG(data.svg);
    if(m){
      console.log('[buildSVG] DeepSeek SVG generated for:',item);
      s._renderSVG(m[0],item);if(cb)cb(true,m[0])
    }else{
      console.log('[buildSVG] Proxy returned unparseable SVG for:',item);
      s._fallbackToWebLLM(item,webllmEngine,cb)
    }
  }).catch(function(err){
    console.error('[buildSVG] PROXY FAILED:',err.message);
    if(cb)cb(false)
  });
};

CreationPipeline.prototype._fallbackToWebLLM=function(item,webllmEngine,cb){var s=this;
  if(webllmEngine&&webllmEngine._engine&&webllmEngine._loaded){
    console.log('[buildSVG] WebLLM fallback for:',item);
    var prompt=s._makePrompt(item);
    webllmEngine._engine.chat.completions.create({
      messages:[{role:"system",content:SVG_SYSTEM_PROMPT},{role:"user",content:prompt}],
      stream:false,temperature:0.3,max_tokens:1024,extra_body:{enable_thinking:false}
    }).then(function(r){
      var svg=r.choices?.[0]?.message?.content||"";
      var m=s._parseSVG(svg);
      if(m){s._renderSVG(m[0],item);if(cb)cb(true,m[0])}
      else{console.log('[buildSVG] WebLLM also failed for:',item);if(cb)cb(false)}
    }).catch(function(e){console.error('[buildSVG] WebLLM error:',e.message);if(cb)cb(false)})
  }else{console.log('[buildSVG] WebLLM not ready');if(cb)cb(false)}
};

CreationPipeline.prototype._renderSVG=function(svg,item){
  var svgContainer=document.getElementById("creation-svg-container");
  if(!svgContainer)return;
  svgContainer.style.display="block";svgContainer.innerHTML=svg;
  var canvas=document.getElementById("creation-canvas");if(canvas)canvas.style.display="none";
  var shapes=svgContainer.querySelectorAll("circle,rect,polygon");
  for(var i=0;i<shapes.length;i++)shapes[i].style.opacity="0";
  var idx=0;function show(){if(idx<shapes.length){shapes[idx].style.opacity="1";shapes[idx].style.transition="opacity .3s ease";idx++;setTimeout(show,300)}}show();
  this._gallery.push({item:item,svg:svg,time:new Date().toLocaleTimeString()})
};

CreationPipeline.prototype.getGallery=function(){return this._gallery};
CreationPipeline.prototype.clearGallery=function(){this._gallery=[]};