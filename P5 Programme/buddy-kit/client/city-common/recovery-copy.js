// Display strings only: raw section names/values are never rewritten.
const copy = {
 title:['Restore results','還原結果'], heading:['Some sections could not be stored','部分資料未能儲存'],
 note:['Download a backup before retrying or continuing. Absent sections are unchanged.','先下載備份，再重試或繼續。缺少的部分保持不變。'],
 failed:['not stored','未儲存'], restored:['restored','已還原'], previous:['Download previous city','下載還原前備份'],
 imported:['Download imported file','下載匯入資料'], retry:['Retry storage','重試'], continue:['Continue and reload','繼續並重新載入'],
 layout:['City plan','城市規劃'], quests:['Historical activities','歷史活動'], props:['Outdoor exhibits','戶外展品'],
 skin:['Champion appearance','Champion 外觀'], lang:['Language','語言'], caps:['Imported machines','匯入機器'],
 lastdec:['Historical decisions','歷史決策'], milestones:['Historical milestones','歷史里程碑'],
 accessories:['Champion accessories','Champion 配件'], unlockedSkins:['Available appearances','可用外觀'],
 plannerUnlocked:['Planner access','規劃器使用權'], coachSeen:['Planner introduction','規劃器介紹'],
 pregame:['Academy records','學院紀錄'], badges:['Historical badges','歷史徽章'], cityName:['City name','城市名稱'],
 customModels:['My Models settings (re-add files on this device)','我的模型設定（請在此裝置重新加入檔案）'],
  cityLook:['City Look','城市風格'],
  daySky:['Day sky','日間天空'],
  groundTexture:['Ground Texture','地面材質'],
  timeOfDay:['Time of day','時間'],
  trafficVehicles:['Road Traffic','道路交通'],
};
export const recoveryText = (key, lang) => copy[key]?.[lang.startsWith('zh') ? 1 : 0] || key;
