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
const adminGlyphs={
  table:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M10 10v10"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.4"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
  preview:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  history:'<path d="M3 11a9 9 0 1 1 2 7M3 5v6h6m3-4v5l3 2"/>',
  note:'<path d="M4 3h16v12l-6 6H4zM14 21v-6h6M8 8h8M8 12h5"/>',
  edit:'<path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z"/>',
  remove:'<path d="M3 6h18M9 6V3h6v3m4 0-1 15H6L5 6m5 4v7m4-7v7"/>'
};
function adminIcon(icon,label,attribute,value,disabled=false){
  return '<button type="button" class="admin-icon icon-'+icon+'" '+attribute+'="'+esc(value)+'" title="'+esc(label)+'" aria-label="'+esc(label)+'" '+(disabled?'disabled':'')+'><svg aria-hidden="true" viewBox="0 0 24 24">'+adminGlyphs[icon]+'</svg></button>';
}
function imageButton(name,label){
  return '<span class="field-tools">'+adminIcon('table','Thêm bảng vào '+label,'data-table-field',name)+adminIcon('image','Chèn hình vào '+label,'data-picture',name)+'</span>';
}
function previewMetadata(q){
  const leaf=catalogLeaves().find(l=>l.id===q.catalog_id);
  const fields=[['Chương / Domain',leaf?.topic||q.topic],['Bài / Skill',leaf?.name],['Mức độ',q.difficulty]];
  return '<dl class="preview-meta">'+fields.map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+esc(value||'Chưa xác định')+'</dd></div>').join('')+'</dl>';
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
  popup('<div class="full-preview"><h2>Xem trước câu hỏi</h2>'+previewMetadata(q)+(q.source?'<p>Nguồn / ID SAT · '+esc(q.source)+'</p>':'')+'<h3>Đề bài</h3><div>'+richText(q.q||'Chưa nhập đề bài.')+'</div>'+(q.image?'<img class="inline-math-image" src="'+esc(q.image)+'" alt="Hình minh họa đề bài">':'')+(choices?'<ol>'+choices+'</ol>':'')+'<h3>Đáp án</h3><div>'+richText(key||'Chưa nhập đáp án.')+'</div><h3>Lời giải</h3><div>'+richText(q.why||'Chưa nhập lời giải.')+'</div></div>');
}
function previewEditor(){
  const f=document.querySelector('#question-form'),d=Object.fromEntries(new FormData(f));
  const read=name=>formatQuestionMath(d[name]||'');
  const slots=[0,1,2,3],choices=slots.map(i=>read('option'+i)),statements=slots.map(i=>read('statement'+i));
  const answer=d.type==='mc'?choices[d.correct]:d.type==='short'?d.answer:slots.map(i=>d['truth'+i]==='true'?true:d['truth'+i]==='false'?false:null);
  const prefix=splitSource(read('q'));
  fullPreview({catalog_id:d.topic==='existing'?editingQuestion?.catalog_id:d.topic,topic:d.topic==='existing'?editingQuestion?.topic:'',difficulty:d.difficulty,type:d.type,source:prefix.source||d.source,q:prefix.q,why:read('why'),choices,statements,answer,image:retainedImage(f)});
}
