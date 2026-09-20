/* intents.js — Nova intents for AI City Architect (advanced) */
const Intents = (() => {
  'use strict';
  const I = [
    { id:'help', p:[/help/i,/how.*play/i], r:['Place 20+ building types across 6 systems. Build causal graphs. Run simulation at 1× to 1M× speed. Handle 4 crisis events.'] },
    { id:'predictive', p:[/predict/i,/future/i,/forecast/i,/year/i,/trend/i], r:['Based on your design, in 5 years the aging population will strain your hospital capacity. Consider adding a clinic in the East district.','Your grid is 80% solar — great for emissions, but cloudy days lose 60% capacity. Add wind or battery storage.'] },
    { id:'cascade', p:[/cascade/i,/chain/i,/ripple/i,/domino/i,/spread/i], r:['When power fails, traffic lights go out → jams → ambulances delayed → health crisis. Every system connects. Watch the red pulses on the map during cascading failures!'] },
    { id:'visual_script', p:[/script/i,/program/i,/block/i,/drone/i,/bus.*logic/i], r:['Use the visual script editor to build drone and bus logic. Start with a Trigger, add Actions. Use Conditions for decision-making.'] },
    { id:'override', p:[/override/i,/overrule/i,/disagree/i,/manual/i,/hilt/i], r:['As the human-in-the-loop, you can override AI decisions. But every choice has trade-offs. The clinic closure saves tokens but hurts the East district.'] },
    { id:'equity', p:[/equity/i,/fair/i,/equal/i,/rich/i,/poor/i,/district/i], r:['AI optimizers naturally favor dense, wealthy areas. Check the equity metrics. You may need to manually redistribute resources.'] },
    { id:'economics', p:[/gdp/i,/inflation/i,/debt/i,/tax/i,/budget/i,/economy/i], r:['GDP grows with infrastructure. Inflation rises with spending. The AI forecast shows dotted lines — use them to plan ahead.'] },
    { id:'crisis', p:[/heatwave/i,/flood/i,/cyber/i,/economic.*shock/i,/surge/i,/crisis/i,/emergency/i], r:['Crises cascade! A heatwave becomes a power crisis becomes a transport crisis. Act fast at the primary source. Every choice has consequences.'] },
    { id:'graph', p:[/graph/i,/feedback.*loop/i,/cause/i,/effect/i,/relation/i], r:['Your knowledge graph maps system interactions. Look for feedback loops — cycles where A affects B and B affects A. Those are leverage points.'] },
    { id:'layers', p:[/layer/i,/toggle/i,/view/i,/overlay/i], r:['Use the layer toggles to view different systems: Power & Utility, Logistics & Waste, or Social & Safety. Each shows different connection types.'] },
    { id:'nova', p:[/nova/i,/hello/i,/hi/i,/hey/i], r:['I am Nova, your AI City Architect co-pilot. I can analyze designs, predict trends, warn about cascading failures, and help with crisis decisions.'] },
  ];
  function match(text) {
    for (const intent of I) {
      for (const p of intent.p) { if (p.test(text)) return intent.r[Math.floor(Math.random()*intent.r.length)]; }
    }
    return null;
  }
  return { match };
})();
