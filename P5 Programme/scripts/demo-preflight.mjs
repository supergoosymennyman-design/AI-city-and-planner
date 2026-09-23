/** Presenter-only Buddy probe. Never include credentials or upstream error text in results. */
export async function checkBuddyTurn(worker, env, { timeoutMs = 20000 } = {}) {
  if (!env.DEEPSEEK_API_KEY?.trim()) return { ready:false, reason:'missing-key', message:'DeepSeek API key is missing. Add DEEPSEEK_API_KEY to buddy-kit/server/.env.' };
  const controller = new AbortController();
  let timer;
  try {
    const result = await Promise.race([
      (async () => {
        const response = await worker.fetch(new Request('http://localhost/api/turn', {
        method:'POST', headers:{ 'content-type':'application/json' },
        body:JSON.stringify({ model:'deepseek-v4-flash', buddyName:'Buddy', transcript:[],
          message:'In one short sentence, say hello to a student exploring an AI City.' }), signal:controller.signal,
        }), env);
        if (!response.ok) return { ready:false, reason:'provider-failed', message:'Buddy could not complete an AI reply.' };
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('ndjson')) return { ready:false, reason:'provider-failed', message:'Buddy did not return an AI reply.' };
        const body = await response.text();
        const terminal = body.trim().split('\n').map(line => { try { return JSON.parse(line); } catch { return null; } })
          .findLast(frame => frame?.type === 'done' || frame?.type === 'cut');
        if (terminal?.type === 'done' && terminal.source === 'live' && Number(terminal.spent) > 0
          && typeof terminal.reply === 'string' && terminal.reply.trim()) {
          return { ready:true, reason:'ai-replied', message:'DeepSeek V4 Flash replied.' };
        }
        return { ready:false, reason:'provider-failed', message:'Buddy could not complete an AI reply. Check the key and internet connection.' };
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); }),
    ]);
    return result;
  } catch { /* provider and transport errors have the same safe presenter status */ }
  finally { clearTimeout(timer); controller.abort(); }
  return { ready:false, reason:'provider-failed', message:'Buddy could not complete an AI reply. Check the key and internet connection.' };
}
