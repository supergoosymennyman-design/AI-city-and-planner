// A presentation shelf; stable library IDs remain the save-file identities.
export const CITY_ESSENTIALS = [
 ['bld_kenney_suburban_a','Garden house','花園小屋'],['bld_kenney_suburban_b','Porch house','門廊小屋'],['bld_kenney_suburban_c','Family house','家庭小屋'],['bld_kenney_suburban_e','Tall-roof house','高屋頂小屋'],['bld_kenney_suburban_g','Courtyard house','庭院小屋'],['bld_kenney_suburban_i','Neighbourhood house','社區小屋'],
 ['bld_kenney_sky_a','Small office tower','小型辦公大樓'],['bld_kenney_sky_b','Office tower','辦公大樓'],['bld_kenney_sky_c','Stepped tower','階梯大樓'],['bld_kenney_c','Corner shops','街角商店'],['bld_kenney_building_h','Neighbourhood centre','社區中心'],['bld_kenney_building_i','Civic building','公共大樓'],
 ['nat_tree_oak','Oak tree','橡樹'],['nat_tree_default','Street tree','行道樹'],['nat_bush_k','Low bush','矮灌木'],['nat_flower_red','Red flowers','紅花'],['nat_flower_yellow','Yellow flowers','黃花'],['prop_bench_k','Park bench','公園長椅'],['nat_planter','Planter','花盆'],['prop_streetlight_k','Street light','路燈'],['prop_bicycle','Bicycle','單車'],['prop_parasol_a','Café parasol','咖啡座太陽傘'],['veh_taxi','Taxi','的士'],['veh_bus_q','Bus','巴士'],
].map(([id,en,zh])=>({id,en,zh}));
// The first screen offers a useful mix rather than four similar houses.
const first=['bld_kenney_suburban_a','prop_bench_k','nat_tree_oak','bld_kenney_sky_a','bld_kenney_c','veh_bus_q','nat_flower_red','prop_streetlight_k'];
CITY_ESSENTIALS.sort((a,b)=>{const rank=id=>first.includes(id)?first.indexOf(id):first.length;return rank(a.id)-rank(b.id);});
const byId=new Map(CITY_ESSENTIALS.map(e=>[e.id,e]));
export function essentialName(item,lang){const e=byId.get(item.id);return e?(lang==='zh-Hant'?e.zh:e.en):item.name;}
export function essentialSearch(item){const e=byId.get(item.id);return e?`${e.en} ${e.zh}`:'';}
