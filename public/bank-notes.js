const manualBankNotes=new Map();
function reviewFlags(q){
  const content=[q.q,...q.choices,...q.statements,q.why].join('\n');
  return importReviewReasons(content).filter(reason=>reason!=='Thiếu hình vẽ'||!q.image);
}

// Sørensen–Dice on character bigrams, counting repeated occurrences.
function duplicateIndex(onMatch){
  const postings=new Map(), exact=new Map();
  return function add(question,label){
    const normalize=s=>String(s||'').normalize('NFC').toLowerCase()
      .replace(/\s+/g,' ').trim();
    const key=[normalize(question.q),...[...question.choices,...question.statements].map(normalize).sort()].join('\n');
    const pairs=new Map();
    for(let i=1;i<key.length;i++){
      const gram=key.slice(i-1,i+1);
      pairs.set(gram,(pairs.get(gram)||0)+1);
    }
    const size=Math.max(0,key.length-1), hits=new Map(), row={label,size};
    for(const [gram,count] of pairs){
      const prior=postings.get(gram)||[];
      for(const [other,n] of prior){
        if(20*Math.min(size,other.size)>9*(size+other.size))
          hits.set(other,(hits.get(other)||0)+Math.min(count,n));
      }
      prior.push([row,count]);postings.set(gram,prior);
    }
    let best=exact.get(key)?{label:exact.get(key),score:1}:null;
    for(const [other,n] of hits){
      const total=size+other.size;
      if(onMatch && 20*n>9*total)onMatch(label,other.label,2*n/total);
      if(20*n>9*total && (!best||2*n/total>best.score))best={label:other.label,score:2*n/total};
    }
    if(!size && best && onMatch)onMatch(label,best.label,1);
    exact.set(key,label);
    return best;
  };
}
function duplicateCaption(match){
  return 'Có thể trùng '+(match.score*100).toLocaleString('vi-VN',{maximumFractionDigits:2})+'% · '+match.label;
}
function questionLabel(q){return q.source||q.q.slice(0,65)+' · '+q.id.slice(0,8);}
let previousBank,previousMatches;
function bankDuplicates(){
  if(previousBank===bank)return previousMatches;
  const matches=new Map();
  const add=duplicateIndex((q,prior,score)=>{
    for(const [item,other] of [[q,prior],[prior,q]]){
      if(!matches.has(item.id)||matches.get(item.id).score<score)
        matches.set(item.id,{label:questionLabel(other),score});
    }
  });
  for(const q of bank)add(q,q);
  previousBank=bank;previousMatches=matches;
  return matches;
}
function notesCell(q,duplicates){
  const flags=q.review_flags?.length?q.review_flags:reviewFlags(q);
  const match=duplicates.get(q.id);
  const lines=[...flags,...(match?[duplicateCaption(match)]:[]),manualBankNotes.get(q.id)].filter(Boolean);
  return '<div class="bank-note"><strong>Ghi chú</strong><div>'+esc(lines.join('\n')||'—')+'</div><button data-go="bank-note:'+esc(q.id)+'">Sửa ghi chú</button></div>';
}
function editBankNote(id){
  if(!bank.some(q=>q.id===id))return;
  popup('<h2>Ghi chú quản trị</h2><label>Nội dung<textarea id="bank-note-text" maxlength="4000"></textarea></label><button id="save-bank-note">Lưu ghi chú</button><p role="status"></p>');
  const field=document.querySelector('#bank-note-text'),button=document.querySelector('#save-bank-note');
  const previous=manualBankNotes.get(id);
  field.value=previous||'';
  button.onclick=async()=>{
    button.disabled=true;
    const note=field.value.trim();
    try{
      const table=db.from('studio_bank_notes');
      const query=previous===undefined?table.insert({question_id:id,note}):table.update({note}).eq('question_id',id).eq('note',previous);
      const {error}=await query.select('question_id').single();
      if(error)throw error;
      manualBankNotes.set(id,note);renderSavedBank();
      if(button.isConnected)modal.close();
    }catch{if(button.isConnected)button.nextElementSibling.textContent='Chưa lưu được. Kiểm tra bank-notes.sql hoặc tải lại ngân hàng nếu ghi chú vừa được sửa.';}
    finally{button.disabled=false;}
  };
}
