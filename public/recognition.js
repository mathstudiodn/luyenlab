function cleanQuestionPaste(raw){
  const text=raw.replace(/\r\n?/g,'\n').replace(/\u00a0|&nbsp;/gi,' ')
    .replace(/&#(x[\da-f]+|\d+);/gi,(literal,code)=>{
      const n=code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code);
      return n>0&&n<=0x10ffff?String.fromCodePoint(n):literal;
    }).replace(/&amp;/g,'&').replace(/(^|[^\\])\\[ \t]*$/gm,'$1')
    .replace(/\*\*/g,'').trim();
  const title=/^(?:Câu đúng sai|Câu trắc nghiệm nhiều lựa chọn|(?:Câu )?Trả lời ngắn) trong (?:word|latex)[ \t]*$/gim;
  if([...text.matchAll(title)].length>1)throw new Error('Dán từng câu vào khung nhận diện.');
  return text.replace(title,'').trim();
}
function wordParts(text,pattern,alphabet){
  const hits=[...text.matchAll(pattern)];
  if(!hits.length)return null;
  if(hits.map(m=>m[1]).join('')!==alphabet)throw new Error('Cần đủ bốn nhãn '+alphabet.split('').join(', ')+' theo thứ tự, mỗi nhãn ở đầu dòng.');
  return {stem:text.slice(0,hits[0].index).trim(),items:hits.map((m,i)=>text.slice(m.index+m[0].length,hits[i+1]?.index??text.length).trim())};
}
function recognizeQuestion(raw,route="vn",bulk=false){
  const {source,q:text}=splitSource(cleanQuestionPaste(raw));
  if(!text)throw new Error('Hãy dán nội dung một câu hỏi.');
  if(/\\(?:choiceTF|choice|shortans)\b/.test(text)){
    const wrapped=/\\(?:begin|end)\{ex\}/.test(text);
    if(wrapped&&!/^\\begin\{ex\}[\s\S]*\\end\{ex\}$/.test(text))throw new Error('Kiểm tra cặp lệnh mở và đóng khối ex.');
    const rows=parseExamTex(wrapped?text:'\\begin{ex}\n'+text+'\n\\end{ex}',route,bulk);
    if(rows.length!==1)throw new Error('Mỗi lần chỉ nhận diện một câu.');
    const q=rows[0];
    if(q.type==='tf'){
      let i=0;
      q.why=q.why.replace(/\\(?:begin|end)\{itemchoice\}/g,'').replace(/\\itemch\b\s*/g,()=>'\n'+('abcd'[i++]||'•')+') ').trim();
    }
    return {...q,source:source||q.source};
  }
  const headings=[...text.matchAll(/^[ \t]*Lời giải[ \t]*[:：]?[ \t]*/gim)];
  if(headings.length>1)throw new Error('Có nhiều phần Lời giải. Hãy dán một câu mỗi lần.');
  const cut=headings[0],body=(cut?text.slice(0,cut.index):text).trim();
  let why=cut?text.slice(cut.index+cut[0].length).trim():'';
  const mcPattern=/^[ \t]*([A-D])[.)][ \t]*/gm,tfPattern=/^[ \t]*([a-d])\)[ \t]*/gm;
  const mc=wordParts(body,mcPattern,'ABCD'),tf=wordParts(body,tfPattern,'abcd');
  if(mc&&tf)throw new Error('Có hai nhóm phương án. Kiểm tra lại phần đề bài.');
  const q=(mc||tf)?.stem??body;
  if(!q)throw new Error('Chưa có nội dung đề bài.');
  const base={source,q,why,choices:[],statements:[]};
  if(mc){
    const keys=[...why.matchAll(/^[ \t]*(?:Chọn[ \t]+|Đáp án[ \t]*[:：]?[ \t]*)([A-D])\b[.)]?[ \t]*$/gim)];
    if(keys.length!==1)throw new Error('Thêm một dòng “Chọn D” hoặc “Đáp án: D” trong phần Lời giải.');
    if(mc.items.some(v=>!v)||new Set(mc.items).size!==4)throw new Error('Cần bốn phương án khác nhau và có nội dung.');
    const key=keys[0];
    return {...base,type:'mc',choices:mc.items,answer:mc.items['ABCD'.indexOf(key[1].toUpperCase())],why:(why.slice(0,key.index)+why.slice(key.index+key[0].length)).trim()};
  }
  if(tf){
    const solution=wordParts(why,tfPattern,'abcd');
    if(!solution||tf.items.some(v=>!v))throw new Error('Cần bốn mệnh đề và bốn lời giải bắt đầu bằng a) … d).');
    const answer=solution.items.map((v,i)=>{
      const label=/^(Đúng|Sai)(?=$|[\s.,:;!?])/iu.exec(v);
      if(!label)throw new Error('Thiếu Đúng hoặc Sai ở đầu lời giải ý '+('abcd'[i])+').');
      return label[1].toLocaleLowerCase('vi')==='đúng';
    });
    return {...base,type:'tf',statements:tf.items,answer};
  }
  const key=/^[ \t]*(?:Đáp án|Đáp số)[ \t]*[:：][ \t]*(.+?)[ \t]*$/im.exec(why);
  if(!key)throw new Error('Chưa nhận diện được dạng câu. Kiểm tra nhãn A–D, a)–d) hoặc dòng “Đáp án: …”.');
  const answer=shortKey(key[1].trim().replace(/[.]$/,''),route);
  return {...base,answer,type:'short',why:(why.slice(0,key.index)+why.slice(key.index+key[0].length)).trim()};
}
function recognizeIntoEditor(form){
  const fields=form.elements,notice=form.querySelector('#recognize-status');
  try{
    const pasted=cleanQuestionPaste(fields.pastedQuestion.value);
    const prefix=splitSource(pasted);
    if(prefix.source&&prefix.q&&!/\\(?:begin\{ex\}|choiceTF|choice|shortans)\b|^(?:Lời giải|[A-D][.)]|[a-d]\)|Đáp án|Đáp số)/im.test(prefix.q)){
      if((fields.q.value.trim()||fields.source.value.trim())&&!confirm('Thay nguồn và đề bài đang soạn?'))return;
      fields.source.value=prefix.source;fields.q.value=prefix.q;
      notice.textContent='Đã tách nguồn và đề bài. Hãy kiểm tra dạng câu và điền hoặc kiểm tra đáp án trước khi lưu.';
      return;
    }
    const q=recognizeQuestion(pasted,fields.track.value);
    if(q.type==='tf'&&fields.track.value==='sat')throw new Error('Dạng Đúng/Sai thuộc Toán THPT. Chọn lộ trình THPT rồi bấm Nhận diện lại.');
    const names=['source','q','why','answer',...Array.from({length:4},(_,i)=>['option'+i,'statement'+i]).flat()];
    if(names.some(n=>fields[n].value.trim())&&!confirm('Thay nội dung câu đang soạn bằng nội dung vừa nhận diện?'))return;
    if(editingQuestion?.image)fields.removeLegacy.checked=true;
    fields.type.value=q.type;updateAnswerFields(form);
    fields.source.value=q.source||'';fields.q.value=q.q;fields.why.value=q.why;
    fields.answer.value=q.type==='short'?q.answer:'';
    for(let i=0;i<4;i++){
      fields['option'+i].value=q.choices[i]?.replace(/\s*\n\s*/g,' ')??'';
      fields['statement'+i].value=q.statements[i]?.replace(/\s*\n\s*/g,' ')??'';
      fields['truth'+i].value=q.type==='tf'?String(q.answer[i]):'';
      fields.correct[i].checked=q.type==='mc'&&q.choices[i]===q.answer;
    }
    notice.textContent='Đã nhận diện câu '+bankTypes[q.type].toLowerCase()+'. Kiểm tra nội dung bằng Xem trước rồi bấm Lưu.';
  }catch(error){notice.textContent=error.message;}
}
