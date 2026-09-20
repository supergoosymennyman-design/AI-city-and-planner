/* intents.js — Cascade intent classification */
const Intents = (() => {
  const INTENTS = {
    what_is_prediction: { words: ['predict','forecast','future','see ahead','wave'], reply: 'Predictive modeling means looking at current traffic to forecast what will arrive next. Cascade shows you glowing forecast bands — wider bands mean more cars coming!' },
    what_is_shockwave: { words: ['shockwave','jam','gridlock','traffic jam','bunch'], reply: 'A shockwave is a traffic jam that travels backwards — cars brake, causing the car behind to brake, causing a chain reaction. Absorbing the wave early prevents it.' },
    what_is_coordination: { words: ['coordinate','multi','sequence','corridor','both lights'], reply: 'Coordination means two traffic lights working together so cars pass both without stopping. Like a green wave!' },
    what_is_anomaly: { words: ['anomaly','unexpected','surge','sudden','spike'], reply: 'An anomaly is something unexpected — like a stadium suddenly letting out 50 cars. AI must detect the surprise and react fast.' },
    hint: { words: ['hint','help','stuck','confused','what do'], reply: 'Watch the forecast bands! Wider bands = more cars coming. Adjust the timer to let the biggest wave pass through first.' },
    greeting: { words: ['hi','hello','hey','cascade'], reply: 'Greetings, Traffic Manager! The forecast shows traffic building. Let\'s absorb those waves together.' },
    off_topic: { words: [], reply: 'I\'m focused on the traffic forecast. Let\'s talk about those incoming waves!' }
  };
  function match(text) {
    const t = text.toLowerCase();
    if (!t.includes('cascade') && !t.includes('ai') && !t.includes('help')) return null;
    for (const [id, def] of Object.entries(INTENTS))
      if (def.words.some(w => t.includes(w))) return { id, reply: def.reply };
    return { id: 'off_topic', reply: INTENTS.off_topic.reply };
  }
  return { match, INTENTS };
})();
