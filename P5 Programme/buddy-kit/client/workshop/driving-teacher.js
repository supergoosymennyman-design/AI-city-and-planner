// A small physical-readings editor over the existing Data-sense teaching path.
// It never trains automatically, and editing one role never clears the other.
export function mountDrivingTeacher(bar, game) {
  const panel=document.createElement('details');panel.className='driving-teacher';
  const title=document.createElement('summary');title.textContent='Teach steering and speed / 教導轉向及車速';panel.append(title);
  const body=document.createElement('div');body.className='driving-teacher-body';panel.append(body);
  const note=document.createElement('p');note.textContent='These benches provide training and evaluation equipment. The bound Action outputs control the car. Inspect a practice example, change its readings or action, and teach your correction. These are practice examples; the arena tests new situations. / 這些是訓練及評估設備；車輛轉向及車速輸出控制車輛。查看練習例子，更改讀數或動作，再教導你的更正。賽道會測試新的情況。';body.append(note);
  const previews={};
  for(const role of ['steering','speed']){
    const schema=game.Datasets.schema('drive-'+role+'-v2'),rows=game.Datasets.rows(schema.id,42),section=document.createElement('fieldset'),legend=document.createElement('legend');section.dataset.drivingRole=role;legend.textContent=schema.name;section.append(legend);
    const teach=document.createElement('button');teach.type='button';teach.dataset.teachDriving=role;teach.textContent=`Teach ${rows.length} starter examples / 教導 ${rows.length} 個起步例子`;
    const status=document.createElement('p');status.setAttribute('role','status');
    teach.onclick=async()=>{teach.disabled=true;try{const count=await game.teachDrivingExamples(role);status.textContent=count>0?`Taught ${count} examples / 已教導 ${count} 個例子`:count===0?'Already taught; your corrections are kept / 已教導，保留你的更正':'Open the paired driving machine first / 請先開啟轉向及車速機器';}catch(error){status.textContent=error.message;}finally{teach.disabled=false;}};
    const picker=document.createElement('select');picker.setAttribute('aria-label',schema.name+' example / 例子');
    for(const row of rows)picker.add(new Option(`${row.i+1}: ${row.answer}`,String(row.i)));
    const inputs={};section.append(teach,picker);
    for(const field of schema.features){
      const label=document.createElement('label');label.textContent=field.name+' ';
      const input=document.createElement(field.options?'select':'input');
      if(field.options)for(const option of field.options)input.add(new Option(option,option));
      else {input.type='number';input.step='any';input.min=field.min;input.max=field.max;}
      inputs[field.id]=input;label.append(input);section.append(label);
    }
    const answer=document.createElement('select');answer.setAttribute('aria-label','Correct action / 正確動作');
    for(const label of schema.answer.labels)answer.add(new Option(label,label));
    const preview=()=>panel.dispatchEvent(new CustomEvent('driving-preview',{bubbles:true,detail:Object.fromEntries(schema.features.map(f=>[f.id,f.options?inputs[f.id].value:inputs[f.id].valueAsNumber]))}));
    previews[role]=preview;
    section.addEventListener('input',preview);
    const fill=()=>{const row=rows[Number(picker.value)];for(const f of schema.features)inputs[f.id].value=row.features[f.id];answer.value=row.answer;};picker.onchange=()=>{fill();preview();};fill();
    const accept=document.createElement('button');accept.type='button';accept.textContent='Teach this example / 教導這個例子';
    accept.onclick=async()=>{
      const readings=Object.fromEntries(schema.features.map(f=>[f.id,f.options?inputs[f.id].value:inputs[f.id].valueAsNumber]));
      if(schema.features.some(f=>!f.options&&!Number.isFinite(readings[f.id]))){status.textContent='Fill in every reading / 請填寫所有讀數';return;}
      try{const ok=await game.correctDrivingDecision(role,readings,answer.value);status.textContent=ok?'Taught. Try in AI City. / 已教導，到 AI 城市試試。':'Open the paired machine first / 請先開啟轉向及車速機器';}catch(error){status.textContent=error.message;}
    };
    section.append(answer,accept,status);body.append(section);
  }
  panel.addEventListener('toggle',()=>{if(panel.open){const role=panel.querySelector('[data-driving-role]:not([hidden])')?.dataset.drivingRole;previews[role]?.();}});
  bar.append(panel);
  const style=document.createElement('style');style.textContent='.driving-teacher-body{position:absolute;z-index:60;top:100%;left:0;width:min(390px,85vw);max-height:55vh;overflow:auto;padding:12px;background:var(--oil,#10141c);border:1px solid #aaa}.driving-teacher-body p{font-size:13px;line-height:1.5}.driving-teacher fieldset{display:inline-block;vertical-align:top;width:min(330px,90%);margin:8px;padding:12px}.driving-teacher fieldset[hidden]{display:none}.driving-teacher label{display:block;margin:8px 0}.driving-teacher input{width:85px;min-height:36px}.driving-teacher select{max-width:95%;min-height:40px}.driving-teacher button{min-height:44px;margin:6px 0}';document.head.append(style);
  return {preview(role){if(panel.open)previews[role]?.();}};
}
