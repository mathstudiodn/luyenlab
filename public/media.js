const mediaBucket='studio-question-media';
const mediaPattern=/\[\[hinh:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp))\]\]/g;
const pendingMedia=new Map();
function resetMedia(){
  for(const entry of pendingMedia.values())URL.revokeObjectURL(entry.url);
  pendingMedia.clear();
}
function richText(value){
  return renderQuestionTables(value,renderMediaText);
}
function renderMediaText(value){
  return esc(value).replace(mediaPattern,(_,name)=>{
    const url=pendingMedia.get(name)?.url||db?.storage.from(mediaBucket).getPublicUrl(name).data.publicUrl;
    return url?'<img class="inline-math-image" src="'+esc(url)+'" alt="Hình minh họa toán học">':'[Hình minh họa]';
  });
}
function imageButton(name,label){
  return '<span class="field-tools"><button type="button" data-table-field="'+name+'" aria-label="Thêm bảng vào '+label+'">Thêm bảng</button> <button class="insert-picture" type="button" data-picture="'+name+'" aria-label="Chèn hình vào '+label+'">Chèn hình</button></span>';
}
async function prepareImage(file){
  const type=file.type||({'jpeg':'image/jpeg','jpg':'image/jpeg','png':'image/png','webp':'image/webp','svg':'image/svg+xml'})[file.name.split('.').pop().toLowerCase()];
  const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/svg+xml':'png'}[type];
  if(!ext)throw new Error('Chọn ảnh JPEG, PNG, SVG hoặc WebP.');
  const blob=file.type?file:file.slice(0,file.size,type);
  const url=URL.createObjectURL(blob),image=new Image();
  try{
    image.src=url;await image.decode();
    if(type!=='image/svg+xml')return {blob,ext};
    const canvas=document.createElement('canvas');
    const scale=Math.min(2,4096/Math.max(image.naturalWidth,image.naturalHeight));
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!png)throw new Error();
    return {blob:png,ext};
  }catch{throw new Error('Không đọc được hình '+file.name+'. Kiểm tra nội dung tệp ảnh.');}
  finally{URL.revokeObjectURL(url);}
}
function promptImageCount(text,legacy){return [...text.matchAll(mediaPattern)].length+Number(Boolean(legacy));}
function retainedImage(form){return form.elements.removeLegacy?.checked?'':editingQuestion?.image||'';}
function choosePictures(button){
  const form=button.form,field=form.elements[button.dataset.picture],notice=form.querySelector('#form-feedback');
  const start=field.selectionStart,end=field.selectionEnd,before=field.value,original=editingQuestion;
  const input=document.createElement('input');
  input.type='file';input.multiple=true;input.accept='image/jpeg,image/png,image/svg+xml,image/webp,.svg,.webp';
  input.onchange=async()=>{
    const files=[...input.files];if(!files.length)return;
    const saveButton=form.querySelector('[type=submit]');
    if(saveButton.disabled)return;
    const withoutSelection=before.slice(0,start)+before.slice(end);
    if(field.name==='q'&&promptImageCount(withoutSelection,retainedImage(form))+files.length>3){notice.textContent='Đề bài chứa tối đa 3 hình. Hãy bỏ bớt hình trước khi chèn.';return;}
    saveButton.disabled=true;notice.textContent='Đang đọc hình…';
    try{
      const batch=[];
      for(const file of files)batch.push(await prepareImage(file));
      if(!form.isConnected||field.value!==before||original!==editingQuestion)throw new Error('Nội dung đã thay đổi. Đặt lại con trỏ và chèn hình.');
      const entries=batch.map(({blob,ext})=>({blob,name:crypto.randomUUID()+'.'+ext}));
      const insert=entries.map(x=>'[[hinh:'+x.name+']]').join('');
      if(field.maxLength>=0&&withoutSelection.length+insert.length>field.maxLength)throw new Error('Nội dung vượt độ dài của trường.');
      for(const {name,blob} of entries)pendingMedia.set(name,{blob,url:URL.createObjectURL(blob),stored:false});
      field.setRangeText(insert,start,end,'end');field.focus();notice.textContent='Đã chèn '+entries.length+' hình. Bấm Xem trước để kiểm tra vị trí.';
    }catch(e){notice.textContent=e.message;}finally{saveButton.disabled=false;}
  };
  input.click();
}
async function storeMedia(record){
  const names=new Set([record.q,record.why,...record.choices,...record.statements].flatMap(t=>[...t.matchAll(mediaPattern)].map(m=>m[1])));
  const uploads=[...names].map(name=>[name,pendingMedia.get(name)]);
  for(const [name,entry] of uploads){
    if(!entry||entry.stored)continue;
    const {error}=await db.storage.from(mediaBucket).upload(name,entry.blob,{contentType:entry.blob.type,upsert:false});
    if(error&&error.statusCode!=='409'&&error.statusCode!==409)throw new Error('Chưa tải được hình lên Supabase. Kiểm tra kết nối, dung lượng và migration question-media.sql.');
    entry.stored=true;
  }
}
function fullPreview(q){
  const values=q.type==='mc'?q.choices:q.type==='tf'?q.statements:[];
  const choices=values.map((x,i)=>'<li><b>'+('ABCD'[i])+'.</b> '+richText(x||'Chưa nhập')+'</li>').join('');
  let key=q.answer??'';
  if(q.type==='mc'){const i=q.choices.indexOf(key);key=key&&i>=0?'ABCD'[i]+'. '+key:'';}
  if(q.type==='tf')key=key.map((v,i)=>'abcd'[i]+') '+(v===true?'Đúng':v===false?'Sai':'Chưa chọn')).join(' · ');
  popup('<div class="full-preview"><h2>Xem trước câu hỏi</h2>'+(q.source?'<p>Nguồn / ID SAT · '+esc(q.source)+'</p>':'')+'<h3>Đề bài</h3><div>'+richText(q.q||'Chưa nhập đề bài.')+'</div>'+(q.image?'<img class="inline-math-image" src="'+esc(q.image)+'" alt="Hình minh họa đề bài">':'')+(choices?'<ol>'+choices+'</ol>':'')+'<h3>Đáp án</h3><div>'+richText(key||'Chưa nhập đáp án.')+'</div><h3>Lời giải</h3><div>'+richText(q.why||'Chưa nhập lời giải.')+'</div></div>');
}
function previewEditor(){
  const f=document.querySelector('#question-form'),d=Object.fromEntries(new FormData(f));
  const read=name=>formatQuestionMath(d[name]||'');
  const slots=[0,1,2,3],choices=slots.map(i=>read('option'+i)),statements=slots.map(i=>read('statement'+i));
  const answer=d.type==='mc'?choices[d.correct]:d.type==='short'?d.answer:slots.map(i=>d['truth'+i]==='true'?true:d['truth'+i]==='false'?false:null);
  const prefix=splitSource(read('q'));
  fullPreview({type:d.type,source:prefix.source||d.source,q:prefix.q,why:read('why'),choices,statements,answer,image:retainedImage(f)});
}
