const ocrFiles=new WeakMap();
const ocrTypes=['image/jpeg','image/png','image/webp'];
function ocrPanel(){
  return `<details class="editor-content" data-ocr-panel>
    <summary>Chuyển ảnh chụp thành TeX</summary>
    <p>Chọn hoặc dán một ảnh JPEG, PNG hoặc WebP, tối đa 3 MiB. Ảnh được gửi đến Gemini khi bạn bấm Chuyển ảnh.</p>
    <label>Dán ảnh chụp<textarea data-ocr-paste rows="2" placeholder="Bấm vào đây rồi nhấn Ctrl+V (Mac: ⌘V)"></textarea></label>
    <label>Hoặc chọn tệp ảnh<input type="file" accept="image/jpeg,image/png,image/webp" data-ocr-file></label>
    <img hidden data-ocr-preview class="figure" alt="Ảnh chuẩn bị chuyển sang TeX">
    <button type="button" disabled data-ocr-read>Chuyển ảnh</button>
    <p role="status" data-ocr-status></p>
    <div data-ocr-result hidden><label>Văn bản và TeX đã nhận diện<textarea rows="8" data-ocr-text></textarea></label>
    <button type="button" data-ocr-insert>Chèn vào khung Nhận diện</button></div>
  </details>`;
}
function setOcrFile(panel,file){
  const preview=panel.querySelector('[data-ocr-preview]'),notice=panel.querySelector('[data-ocr-status]');
  const read=panel.querySelector('[data-ocr-read]');
  ocrFiles.delete(panel);read.disabled=true;preview.hidden=true;preview.removeAttribute('src');
  panel.querySelector('[data-ocr-result]').hidden=true;
  if(!file||!ocrTypes.includes(file.type)||!file.size||file.size>3*1024*1024){
    notice.textContent='Chọn hoặc dán ảnh JPEG, PNG, WebP tối đa 3 MiB.';return;
  }
  ocrFiles.set(panel,file);const reader=new FileReader();
  notice.textContent='Đang mở ảnh…';
  reader.onload=()=>{
    if(ocrFiles.get(panel)!==file)return;
    preview.src=reader.result;preview.hidden=false;read.disabled=false;notice.textContent='Ảnh đã sẵn sàng.';
  };
  reader.onerror=()=>{if(ocrFiles.get(panel)===file){ocrFiles.delete(panel);notice.textContent='Không đọc được ảnh.';}};
  reader.readAsDataURL(file);
}
document.addEventListener('change',event=>{
  if(event.target.matches('[data-ocr-file]')&&isAdmin)setOcrFile(event.target.closest('[data-ocr-panel]'),event.target.files[0]);
});
document.addEventListener('paste',event=>{
  if(!event.target.matches('[data-ocr-paste]')||!isAdmin)return;
  event.preventDefault();
  const panel=event.target.closest('[data-ocr-panel]');
  const clip=event.clipboardData;
  const file=Array.from(clip?.items||[]).find(i=>i.kind==='file'&&i.type.startsWith('image/'))?.getAsFile()||clip?.files?.[0];
  if(!file){panel.querySelector('[data-ocr-status]').textContent='Clipboard chưa có ảnh. Hãy sao chép ảnh hoặc chụp màn hình rồi dán lại.';return;}
  panel.querySelector('[data-ocr-file]').value='';
  setOcrFile(panel,file);
});
document.addEventListener('click',async event=>{
  const b=event.target.closest('[data-ocr-read],[data-ocr-insert]');
  if(!b||!isAdmin)return;
  const panel=b.closest('[data-ocr-panel]'),out=panel.querySelector('[data-ocr-text]'),notice=panel.querySelector('[data-ocr-status]');
  if(b.hasAttribute('data-ocr-insert')){
    const dest=b.form.elements.pastedQuestion;
    dest.setRangeText(out.value,dest.selectionStart,dest.selectionEnd,'end');dest.focus();return;
  }
  const file=ocrFiles.get(panel);
  if(!file||b.disabled)return;
  const picker=panel.querySelector('[data-ocr-file]'),paste=panel.querySelector('[data-ocr-paste]');
  picker.disabled=paste.disabled=b.disabled=true;notice.textContent='Đang đọc ảnh…';
  try{
    const {data:{session}}=await db.auth.getSession();
    if(!session)throw new Error('Phiên Admin đã hết hạn.');
    const r=await fetch('/api/anh-sang-tex',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':file.type},body:file});
    const data=await r.json().catch(()=>({error:'Function chưa hoạt động. Kiểm tra bản deploy trên Cloudflare Pages.'}));
    if(!r.ok||!data.text)throw new Error(data.error||'Không nhận được TeX.');
    out.value=data.text;panel.querySelector('[data-ocr-result]').hidden=false;
    notice.textContent='Kiểm tra công thức rồi chèn vào khung Nhận diện.';
  }catch(e){notice.textContent=e.message;}finally{picker.disabled=paste.disabled=b.disabled=false;}
});
