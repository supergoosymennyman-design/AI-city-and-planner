// Client display vocabulary. Never changes catalog objects, IDs or saved strings.
import { CATALOG } from './catalog.js';
import { libraryItem } from './library.js';
import { purposeName } from './building-purposes.js';
const facilities={housing:'住宅',school:'學校',hospital:'醫院',shop:'商場',office:'辦公室',library:'圖書館',stadium:'體育場',fire:'消防局',police:'警署'};
const translatedLibraryNames = new Map(); // Bounded by known library IDs, never saved.
const phrases = {
  'ice cream':'雪糕', 'hot dog':'熱狗', 'junk boat':'中式帆船', 'air conditioner':'冷氣機',
  'first aid':'急救', 'fire station':'消防局', 'fire truck':'消防車', 'police car':'警車',
  'school bus':'校巴', 'office chair':'辦公椅', 'desk chair':'書桌椅', 'gas station':'加油站',
  'ceiling lamp':'天花燈', 'wall lamp':'壁燈', 'table lamp':'枱燈', 'stop sign':'停車標誌',
  'laundry rack':'晾衣架', 'solar panel':'太陽能板', 'landing pad':'降落平台',
  'orange tree':'橙樹', 'basketball hoop':'籃球架', 'ferris wheel':'摩天輪',
  'station wagon':'旅行車', 'race car':'賽車', 'sports car':'跑車', 'delivery van':'送貨車',
};
// Compositional labels retain variant letters/numbers and proper model names.
const words=Object.fromEntries(`
car:汽車 fi:未來 nat:自然 proto:原型 rpg:火箭筒 access:通道 aid:援助 air:空中 ambulance:救護車 anchor:船錨 antenna:天線 apple:蘋果
arch:拱門 arm:手臂 armchair:扶手椅 arms:手臂 arrow:箭 asteroid:小行星 avocado:牛油果 axe:斧頭 backpack:背包 bacon:煙肉 bag:袋 bags:袋
baguette:法包 ball:球 bamboo:竹 banana:香蕉 bandages:繃帶 banner:旗幟 bar:吧枱 barrel:木桶 barrels:木桶 barrier:路障 bars:欄杆
base:底座 baseball:棒球 basket:籃 basketball:籃球 bat:球棒 bathroom:浴室 bathtub:浴缸 battery:電池 bear:熊 bed:床 bee:蜜蜂
beet:紅菜頭 bell:鐘 bench:長椅 bend:彎道 berry:莓果 bicycle:單車 big:大型 billboard:廣告牌 binoculars:望遠鏡 birch:樺樹 birthday:生日
blender:攪拌機 blob:團塊 board:板 boat:船 body:身體 bomb:炸彈 bone:骨頭 bones:骨頭 bonfire:營火 book:書 bookcase:書櫃 books:書
bookshelf:書架 bottle:瓶 bottles:瓶 bow:弓 bowl:碗 box:箱 boxes:箱 bread:麵包 bricks:磚 bridge:橋 broccoli:西蘭花 broken:破損
broth:湯 bucket:水桶 built:內置 bullet:子彈 bunk:雙層 buns:麵包 burger:漢堡 bus:巴士 bush:灌木 bushlarge:大型灌木 bushsmall:小型灌木
butter:牛油 cabinet:櫃 cactus:仙人掌 cake:蛋糕 campfire:營火 can:罐 candle:蠟燭 candy:糖果 canned:罐頭 cannon:大炮 canoe:獨木舟
cardboard:紙板 cargo:貨物 carpet:地氈 carriage:車廂 carrot:甘筍 cart:手推車 cash:現金 catapult:投石機 catwalk:步道 cauldron:大鍋
ceiling:天花 center:中心 chair:椅 chalice:高腳杯 chandelier:吊燈 character:角色 checkered:格仔 cheese:芝士 cheeseburger:芝士漢堡
cherries:櫻桃 chest:箱 chimney:煙囪 chocolate:朱古力 chopsticks:筷子 clamp:夾 cliff:懸崖 closed:關閉 closet:衣櫃 cloth:布
clover:三葉草 club:球棒 coal:煤 coaster:過山車 coat:外套 coconut:椰子 coffee:咖啡 coffin:棺木 cog:齒輪 coin:硬幣 coins:硬幣 column:柱
comfy:舒適 common:普通 compact:小型 compass:指南針 computer:電腦 conditioner:調節器 cone:圓錐 construction:建築 container:容器
conveyor:輸送帶 cooked:熟食 cookie:曲奇 cooking:烹飪 corn:粟米 corner:角落 couch:梳化 counter:櫃枱 covered:有蓋 craft:飛船 crane:起重機
crate:木箱 cream:忌廉 croissant:牛角包 crop:農作物 cross:十字 crown:皇冠 cruise:郵輪 crypt:地窖 crystal:水晶 cup:杯 cupcake:紙杯蛋糕
curtain:窗簾 curtains:窗簾 curve:彎曲 curved:彎曲 cushion:坐墊 cutlass:彎刀 cutting:切割 dagger:匕首 dead:枯萎 decor:裝飾
decorated:裝飾 delivery:送貨 depot:倉庫 design:設計 desk:書桌 detailed:精細 dim:暗淡 dinner:晚餐 dish:碟 dispatcher:調度員
display:顯示屏 dock:碼頭 dog:狗 dome:圓頂 donut:冬甩 door:門 doors:門 double:雙人 draw:繪畫 drawer:抽屜 drawers:抽屜 drill:鑽
dryer:乾衣機 dummy:人偶 dumpster:垃圾箱 egg:蛋 eggplant:茄子 electric:電動 electricity:電力 employee:員工 empty:空 end:末端
engine:引擎 executioner:劊子手 fair:遊樂場 fan:風扇 fence:圍欄 fern:蕨 ferris:摩天輪 fighter:戰機 fins:鰭 fire:消防 fireplace:壁爐
first:第一 fish:魚 fishbone:魚骨 flag:旗 flamingo:紅鶴 flare:信號彈 flat:平面 flatbed:平板 flatshort:矮平板 flattall:高平板
flintlock:燧發槍 floating:漂浮 floor:地板 flower:花 flowering:開花 flowers:花 flume:滑水道 flying:飛行 food:食物 fortified:加固
fountain:噴泉 frame:框 frappe:冰沙 freezer:冰櫃 freezers:冰櫃 fridge:雪櫃 fries:薯條 frog:青蛙 front:前方 fruit:水果 frying:煎
future:未來 garbage:垃圾 gas:氣體 gate:閘 gauntlet:手甲 gazebo:涼亭 generator:發電機 geodesic:測地線 glass:玻璃 globe:地球儀 go:前進
goal:球門 gold:金 golden:金色 golf:高爾夫 grandstand:看台 grass:草 grave:墳墓 gravestone:墓碑 greatsword:大劍 green:綠色 grove:樹叢
guitar:結他 gun:槍 half:半 hamburger:漢堡 hanging:懸掛 hatch:艙門 hatchback:掀背車 health:健康 heart:心 hedge:樹籬 helicopter:直升機
high:高 highway:公路 hockey:曲棍球 holder:支架 hollow:空心 home:家 hood:罩 hoop:籃框 horse:馬 hospital:醫院 hot:熱 house:房屋
houseplant:室內植物 hydrant:消防栓 ice:冰 imperial:帝國 in:內 ingots:金屬錠 insurgent:反抗者 item:物件 jack:千斤頂 jar:罐 jars:罐
jet:噴射機 junk:帆船 kart:小型賽車 ketchup:茄汁 key:鑰匙 keyboard:鍵盤 keycard:門卡 king:國王 kit:套件 kitchen:廚房 knife:刀 lab:實驗室
ladder:梯 lamp:燈 lander:登陸器 landing:降落 lantern:燈籠 laptop:手提電腦 large:大型 largea:大型A largeb:大型B largec:大型C
laundry:晾衣 lava:熔岩 lettuce:生菜 lifeboat:救生艇 light:燈 lighthouse:燈塔 lights:燈 lily:百合 lit:亮燈 loaf:麵包 locomotive:火車頭
log:木段 logs:木段 lollipop:棒棒糖 long:長 looping:環形 lounge:休閒 low:低 lute:琉特琴 luxury:豪華 machine:機器 mackerel:鯖魚
mailbox:郵箱 maki:壽司卷 maple:楓樹 marker:標記 market:市場 mast:桅杆 match:火柴 matchbox:火柴盒 mayo:蛋黃醬 medium:中型 metal:金屬
meteor:流星 microwave:微波爐 miner:礦工 mineral:礦物 mirror:鏡 mobile:流動 modern:現代 monorail:單軌列車 mossy:苔蘚 motorcycle:電單車
mouse:滑鼠 muffin:鬆餅 mushroom:蘑菇 mustard:芥末 necklace:頸鏈 neon:霓虹 nightstand:床頭櫃 oak:橡樹 of:的 office:辦公室 open:開放
orange:橙色 ottoman:腳凳 oval:橢圓 oven:焗爐 overhead:高架 pack:套裝 pad:平台 paddle:槳 padlock:掛鎖 painting:畫 pallet:貨板
palm:棕櫚 pan:平底鑊 pancakes:班戟 panda:熊貓 panel:板 paper:紙 parasol:太陽傘 parchment:羊皮紙 passenger:乘客 patch:小片 peanut:花生
pebble:小石 pennant:三角旗 pepper:胡椒 phone:電話 pickup:貨車 picnic:野餐 picture:圖片 pile:堆 pillar:柱 pine:松樹 pipe:管 pipes:管
pirate:海盜 pistol:手槍 pizza:薄餅 planet:行星 plant:植物 planter:花槽 plaque:牌 plate:碟 point:點 pole:桿 police:警察 poly:多邊形
popsicle:雪條 post:柱 pot:鍋 potion:藥水 potted:盆栽 pouch:小袋 power:電力 propane:丙烷 pumpkin:南瓜 purple:紫色 purplea:紫色A
purpleb:紫色B race:賽車 racer:賽車 rack:架 radio:收音機 raft:木筏 rect:長方形 rectangle:長方形 red:紅色 reda:紅色A redb:紅色B
register:收銀機 relax:休閒 restaurant:餐廳 revolver:左輪手槍 ribcage:胸骨 rifle:步槍 rig:設備 ring:環 road:道路 robot:機械人 rock:岩石
rocket:火箭 rocks:岩石 round:圓形 rounded:圓角 rover:探測車 row:排 rug:地氈 rugby:欖球 sail:帆 sakura:櫻花 salad:沙律 salmon:三文魚
sand:沙 sandwich:三文治 satellite:衛星 sauce:醬 saucer:飛碟 sausage:香腸 sawmill:鋸木廠 school:學校 sci:科幻 screen:屏幕 scroll:卷軸
sedan:房車 shelf:架 shelves:架 shield:盾 ship:船 shopping:購物 short:短 shotgun:霰彈槍 shovel:鏟 shower:淋浴 shrine:神龕 side:側
siege:圍城 sign:標誌 signs:標誌 simple:簡單 single:單人 sink:洗手盆 skateboard:滑板 skull:骷髏 slice:片 small:小型 smalla:小型A
snowboard:滑雪板 snowflake:雪花 soda:汽水 sofa:梳化 solar:太陽能 soup:湯 soy:大豆 space:太空 spaceship:太空船 speaker:喇叭 spear:矛
speed:高速 speeder:飛行車 sphere:球體 spike:尖刺 spiral:螺旋 spooky:鬼怪 sports:跑車 sprinkle:糖粒 sprout:幼苗 square:方形 stack:堆
stacked:堆疊 stairs:樓梯 stalk:莖 stalls:攤檔 stand:架 standing:直立 star:星 station:站 statue:雕像 steak:牛扒 steam:蒸汽
steamer:蒸籠 stew:燉菜 stick:棍 stone:石 stones:石 stool:凳 stop:停止 stove:爐 straight:直 strawberry:士多啤梨 street:街道
structure:結構 stump:樹樁 stylized:卡通 sub:潛艇 sum:點心 sundae:新地 sushi:壽司 suv:越野車 swirl:旋渦 switch:開關 sword:劍 table:桌
taco:墨西哥夾餅 tall:高 tan:棕色 tank:坦克 target:靶 taxi:的士 tea:茶 telescope:望遠鏡 television:電視 tender:煤水車 tent:帳篷
thunder:雷 toaster:多士爐 toilet:廁所 tomato:番茄 top:頂 torch:火炬 towel:毛巾 tower:塔 track:軌道 tractor:拖拉機 traffic:交通
train:火車 trap:陷阱 trash:垃圾 trashcan:垃圾桶 treasure:寶藏 tree:樹 triple:三重 truck:貨車 tuna:吞拿魚 turbine:渦輪 turnip:蘿蔔
turret:炮塔 tv:電視 twisted:扭曲 upper:上層 van:客貨車 vegetable:蔬菜 vent:通風口 vertical:垂直 viking:維京 waffle:窩夫 wagon:旅行車
wall:牆 warning:警告 washer:洗衣機 water:水 watermelon:西瓜 weapon:武器 wheat:小麥 wheel:輪 white:白色 wide:寬 willow:柳樹 wind:風
window:窗 wine:酒 wireless:無線 wispy:纖細 with:附 wood:木 wooden:木製 wreck:殘骸 yellow:黃色 yellowa:黃色A yellowb:黃色B
`.trim().split(/\s+/).map(pair=>pair.split(':')));
export function displayName(type, lang='en') {
  if (typeof type !== 'string') return '—';
  const purpose=purposeName(type,lang==='zh-Hant');if(purpose)return purpose;
  const item=type.startsWith('lib:')?libraryItem(type.slice(4)):CATALOG[type];
  if(!item)return type;
  if(lang!=='zh-Hant')return item.name;
  if(facilities[type])return facilities[type];
  if (translatedLibraryNames.has(type)) return translatedLibraryNames.get(type);
  let name = item.name;
  for (const [phrase, translation] of Object.entries(phrases)) name = name.replace(new RegExp('\\b'+phrase+'\\b','gi'),translation);
  name = name.replace(/[A-Za-z]+/g,word=>words[word.toLowerCase()] || word).replace(/([\u3400-\u9fff]) +(?=[\u3400-\u9fff])/g,'$1');
  translatedLibraryNames.set(type, name);
  return name;
}
