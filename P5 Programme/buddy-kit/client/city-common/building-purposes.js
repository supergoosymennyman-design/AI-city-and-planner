// Presentation only. Stable type IDs; no lesson, achievement or URL contract.
export const PURPOSES = Object.freeze({
  finance_tower: Object.freeze({"en": "Planning Observatory", "zh": "規劃觀測站", "description": "Read the full saved plan receipt.", "descriptionZh": "查看完整的已存規劃收據。", "actions": ["plan"]}),
  treasury: Object.freeze({"en": "Evidence Archive", "zh": "證據檔案館", "description": "Inspect imported evidence and historical records.", "descriptionZh": "查看匯入的證據和歷史紀錄。", "actions": ["evidence"]}),
  sentiment_lab: Object.freeze({"en": "Visitor Centre", "zh": "遊客中心", "description": "Build a visible Dijkstra guide between two places in your city.", "descriptionZh": "在城市內兩個地點之間建立可見的 Dijkstra 導覽。", "actions": ["guide", "destinations"]}),
  city_central: Object.freeze({"en": "City Hall & My Work", "zh": "市政廳與我的作品", "description": "Your outdoor city, plan, exhibits and evidence.", "descriptionZh": "你的戶外城市、規劃、展品和證據。", "actions": ["plan", "exhibits", "evidence", "save"]}),
  traffic_lab: Object.freeze({"en": "Walking Lab", "zh": "步行實驗站", "description": "Inspect connected paths on the saved city road graph.", "descriptionZh": "查看已存城市道路圖上的連通路徑。", "actions": ["routes"]}),
  traffic_emergency: Object.freeze({"en": "City Help Centre", "zh": "城市支援中心", "description": "Save a Champion File or restore your city from one.", "descriptionZh": "儲存 Champion File 或從檔案還原城市。", "actions": ["save", "restore"]}),
  drone_routing: Object.freeze({"en": "Delivery Test Pad", "zh": "配送測試場", "description": "Test one drone against explicit battery, no-fly, charging and payload rules.", "descriptionZh": "用明確的電量、禁飛、充電和載重規則測試一架無人機。", "actions": ["delivery"]}),
  health: Object.freeze({"en": "Care Landmark", "zh": "關懷地標", "description": "A care-themed exhibit; this landmark does not provide hospital coverage.", "descriptionZh": "關懷主題展品；這座地標不提供醫院覆蓋。", "actions": ["exhibits"]}),
  bus: Object.freeze({"en": "Bus Depot", "zh": "巴士車廠", "description": "Contributes to the existing utility coverage measure.", "descriptionZh": "計入現有的公用設施覆蓋指標。", "actions": ["plan"]}),
  delivery: Object.freeze({"en": "Delivery Depot", "zh": "配送站", "description": "Run the bounded one-drone rule/search demonstration or inspect the city roads.", "descriptionZh": "運行有界的單一無人機規則／搜尋示範，或查看城市道路。", "actions": ["delivery", "routes"]}),
  monitoring: Object.freeze({"en": "Evidence Lookout", "zh": "證據瞭望台", "description": "Inspect available evidence. No camera monitoring runs here.", "descriptionZh": "查看現有證據。這裡不進行攝影機監察。", "actions": ["evidence"]}),
  water: Object.freeze({"en": "Water Utility", "zh": "供水設施", "description": "Contributes to the existing utility coverage measure.", "descriptionZh": "計入現有的公用設施覆蓋指標。", "actions": ["plan"]}),
  power: Object.freeze({"en": "Power Utility", "zh": "供電設施", "description": "Contributes to the existing utility coverage measure.", "descriptionZh": "計入現有的公用設施覆蓋指標。", "actions": ["plan"]}),
  recycling: Object.freeze({"en": "Sorting Exhibit", "zh": "分類展品", "description": "Display imported Stage-1 evidence; no live sorting runs here.", "descriptionZh": "展示匯入的第一階段證據；這裡不執行即時分類。", "actions": ["evidence"]}),
  subsurface: Object.freeze({"en": "Foundations Landmark", "zh": "地基地標", "description": "A foundations-themed landmark, with no underground sensing.", "descriptionZh": "以地基為主題的地標，沒有地下感測功能。", "actions": ["exhibits"]}),
  robot_grid: Object.freeze({"en": "Route Playground Landmark", "zh": "路徑遊樂場地標", "description": "Inspect existing road paths.", "descriptionZh": "查看現有道路路徑。", "actions": ["routes"]}),
  swarm: Object.freeze({"en": "Swarm Landmark", "zh": "蜂群地標", "description": "City drone flights are decorative, not a verified swarm simulation.", "descriptionZh": "城市無人機飛行是裝飾，並非經驗證的蜂群模擬。", "actions": []}),
  atc: Object.freeze({"en": "Skyline Beacon", "zh": "天際線燈塔", "description": "Use this landmark for orientation. It does not control air traffic.", "descriptionZh": "用這座地標辨認方向。它不控制空中交通。", "actions": ["destinations"]}),
});
export function purposeName(type, zh = false) { const p = Object.hasOwn(PURPOSES, type) ? PURPOSES[type] : null; return p ? (zh ? p.zh : p.en) : null; }
export function purposeNameForLanguage(type) {
  let zh = false; try { zh = localStorage.getItem("hk_ai_city_lang_v1") === "zh-Hant"; } catch {}
  return purposeName(type, zh);
}
