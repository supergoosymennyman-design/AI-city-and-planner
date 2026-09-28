// An isolated, DOM-free Workshop host. Uses the editor's actual adapters and batch engine.
let host;
export function recyclingHost() {
  if(!host)host=new Promise((resolve,reject)=>{
    const frame=document.createElement('iframe');frame.hidden=true;frame.title='Recycling execution';
    const timeout=setTimeout(()=>{frame.remove();host=null;reject(Error('Workshop runtime could not load.'));},20000);
    frame.onload=()=>{clearTimeout(timeout);const api=frame.contentWindow?.WorkshopRecyclingMachine;if(api)resolve(api);else{frame.remove();host=null;reject(Error('Workshop runtime unavailable.'));}};
    frame.src=new URL('../workshop/recycling-runtime.html',import.meta.url).href;document.body.append(frame);
  });
  return host;
}
export async function runRecyclingMachine(machine,rows){const runtime=await recyclingHost();return runtime.run(structuredClone(machine),structuredClone(rows));}
