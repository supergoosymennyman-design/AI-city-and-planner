// Data only: presets do not allocate any rendering resources.
export const TIME_KEY = 'p5_city_time_v1';
export const TIME_ORDER = ['morning','day','sunset','night'];
export const TIME_PRESETS = Object.freeze({
 // These are deliberately lighting-only values: the city layout and its game
 // state remain identical across the cycle.  The colour story moves from a
 // fresh warm morning through a clean noon, amber dusk, then cobalt night.
 morning:{en:'Morning',zh:'早晨',icon:'🌤️',horizon:0xc9dfd9,sky:0x79afd0,skyLight:0xe7eee7,groundLight:0x9a9876,sun:0xffe0b2,rim:0xd3e6e6,window:0xffe2bc,lamp:0xffd69a,ambient:2.12,sunIntensity:2.35,rimIntensity:.28,sunX:-1050,sunY:1050,sunZ:1200,exposure:1.07,fog:.00050,night:.04,starVisibility:0,bloom:.045,bloomThreshold:.74,saturation:1.015,vignette:.14,grassWarmth:.06,grassDayTint:0xffffff,grassDayBrightness:0,cloud:0xe7e7da},
 day:{en:'Day',zh:'日間',icon:'☀️',horizon:0xb9dce4,sky:0x5d9fce,skyLight:0xe8f2f2,groundLight:0x919d7c,sun:0xfff0d2,rim:0xd5e8f1,window:0xddeeff,lamp:0xffe0b6,ambient:2.28,sunIntensity:2.62,rimIntensity:.22,sunX:360,sunY:2350,sunZ:520,exposure:1.02,fog:.00046,night:0,starVisibility:0,bloom:.028,bloomThreshold:.78,saturation:1.025,vignette:.12,grassWarmth:0,grassDayTint:0x6aa447,grassDayBrightness:.16,cloud:0xe9f0ee},
 sunset:{en:'Sunset',zh:'黃昏',icon:'🌇',horizon:0xc4aaa0,sky:0x6c7d9a,skyLight:0xd7d5cf,groundLight:0x928265,sun:0xffbd7d,rim:0xd5b9a6,window:0xffc06d,lamp:0xffbc67,ambient:1.92,sunIntensity:2.18,rimIntensity:.38,sunX:1550,sunY:690,sunZ:1050,exposure:1.09,fog:.00061,night:.62,starVisibility:.5,bloom:.16,bloomThreshold:.70,saturation:1.045,vignette:.17,grassWarmth:.16,grassDayTint:0xffffff,grassDayBrightness:0,cloud:0xd0b39d},
 night:{en:'Night',zh:'夜晚',icon:'🌙',horizon:0x3d526a,sky:0x132947,skyLight:0x89a9cd,groundLight:0x526456,sun:0xb7d4f4,rim:0x82b8d3,window:0xffc875,lamp:0xffca78,ambient:1.48,sunIntensity:.72,rimIntensity:.34,sunX:-980,sunY:1500,sunZ:-460,exposure:1.12,fog:.00068,night:1,starVisibility:1,bloom:.21,bloomThreshold:.66,saturation:1.015,vignette:.21,grassWarmth:-.05,grassDayTint:0xffffff,grassDayBrightness:0,cloud:0x607891},
});
export function validTime(id){return TIME_ORDER.includes(id)?id:'sunset';}
export function nextTime(id){return TIME_ORDER[(TIME_ORDER.indexOf(validTime(id))+1)%TIME_ORDER.length];}
