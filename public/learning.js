const statusNames={published:'Đang dùng',draft:'Bản nháp',archived:'Lưu trữ'};
const reportNames={answer:'Đáp án',wording:'Đề bài',image:'Hình vẽ',solution:'Lời giải'};
let adminView='bank';
let reviewResult=null;
const liveQuestions=()=>bank.filter(q=>(q.status??'published')==='published');
function quickPanel(){
  const counts=new Map();
  for(const q of liveQuestions())counts.set(q.catalog_id,(counts.get(q.catalog_id)||0)+1);
  const leaves=catalogLeaves().filter(l=>l.track===track&&counts.has(l.id));
  return '<section class="panel quick-panel"><h2>'+say('Luyện nhanh','Quick practice')+'</h2><p>'+say('Luyện một bài, kiểm tra ngay sau mỗi câu.','Focus on one skill with feedback after each answer.')+'</p><form id="quick-form"><label>'+say('Bài học','Skill')+'<select name="leaf" required>'+optionsFor(leaves,l=>l.id,l=>l.path+' ('+counts.get(l.id)+')')+'</select></label><label>'+say('Số câu tối đa','Maximum questions')+'<select name="count"><option>5</option><option>10</option></select></label><button class="primary" '+(leaves.length?'':'disabled')+'>'+say('Luyện ngay','Start quick practice')+'</button><p role="status">'+(leaves.length?'':say('Chưa có bài đã gắn câu hỏi để luyện nhanh.','No skills with published questions yet.'))+'</p></form></section>';
}
function beginQuick(questions){
  if(!questions.length||run&&!confirm(say('Thay bài đang làm bằng lượt luyện này?','Replace the current attempt?')))return;
  run={mode:'quick',track,attemptId:crypto.randomUUID(),studentId:studentSession?.id??null,questions,index:0,answers:{},checked:{},eliminated:{},flags:{},notes:{},highlights:{}};
  persist();exam();
}
function quickQuestion(){
  const i=run.index,q=run.questions[i],a=run.answers[i],checked=run.checked[i];
  const controls=q.type==='mc'?choiceControls(q,i,a):q.type==='tf'?truthControls(q,i,a):shortControls(a);
  const key=Array.isArray(q.answer)?q.answer.map(x=>x?'Đ':'S').join(' / '):q.answer;
  draw('<section class="panel question"><p>'+say('Luyện nhanh','Quick practice')+' · '+(i+1)+' / '+run.questions.length+'</p><h2>'+esc(q.topic)+'</h2><p>'+richText(q.q)+'</p>'+(q.image?'<img class="figure" alt="Question diagram" src="'+esc(q.image)+'">':'')+(q.figure||'')+'<fieldset class="quick-controls" '+(checked?'disabled':'')+'>'+controls+'</fieldset><div role="status" id="quick-status">'+(checked?'<h3>'+ (points(q,a)===1?say('Chính xác','Correct'):say('Xem lại đáp án','Review the answer'))+'</h3><p>'+say('Đáp án','Answer')+' · '+richText(key)+'</p><p>'+richText(q.why)+'</p>':'')+'</div><div class="actions">'+(checked?btn(run.questions.every((_,j)=>run.checked[j])?say('Xem kết quả','View results'):say('Câu tiếp','Next'),'quick-next','primary'):btn(say('Kiểm tra đáp án','Check answer'),'quick-check','primary'))+btn(say('Tạm dừng','Exit to home'),'home')+'</div></section>'+questionMap(run));
  preview();
}
function checkQuick(){
  const q=run.questions[run.index],a=run.answers[run.index];
  if(!answered(q,a)||(q.type==='tf'&&a.filter(x=>typeof x==='boolean').length!==4)||(q.type==='short'&&!(sat()?satResponse(a):/^-?\d+(?:,\d+)?$/.test(a)))){
    document.querySelector('#quick-status').textContent=say('Hãy điền đủ đáp án hợp lệ.','Enter a complete, valid answer.');return;
  }
  run.checked[run.index]=true;persist();exam();
}
function skillGroups(records){
  const map=new Map(),leaves=new Map(catalogLeaves().map(l=>[l.id,l]));
  for(const r of records)r.questions.forEach((q,i)=>{
    const id=q.catalog_id||r.track+' / '+q.topic;
    const g=map.get(id)||{id,label:leaves.get(id)?.name||q.topic,correct:0,total:0};
    g.total++;if(points(q,r.answers[i],r.track)===1)g.correct++;map.set(id,g);
  });
  return [...map.values()].sort((a,b)=>a.correct/a.total-b.correct/b.total||b.total-a.total);
}
function progressTable(records){
  return '<table><thead><tr><th>'+say('Bài / skill','Skill')+'</th><th>'+say('Câu đạt trọn điểm','Fully correct')+'</th></tr></thead><tbody>'+skillGroups(records).map(g=>'<tr><td>'+esc(g.label)+'</td><td>'+g.correct+' / '+g.total+'</td></tr>').join('')+'</tbody></table>';
}
function resultPractice(r){
  const missed=r.questions.filter((q,i)=>points(q,r.answers[i],r.track)<1);
  const weak=skillGroups([r]).find(g=>g.correct<g.total&&catalogLeaves().some(l=>l.id===g.id));
  return '<section class="panel"><h2>'+say('Luyện tiếp','Practice next')+'</h2>'+progressTable([r])+'<div class="actions">'+(missed.length?btn(say('Làm lại câu chưa trọn điểm','Retry missed questions')+' ('+missed.length+')','quick-retry'):'')+(weak?btn(say('Luyện thêm','Practice')+' · '+esc(weak.label),'quick-skill:'+esc(weak.id)):'')+'</div><p id="review-notice" role="status"></p></section>';
}
async function startSkill(id,count,status){
  const context=page,route=track;
  if(busy)return;
  busy=true;
  try{
    await loadBank();
    if(page!==context||track!==route||!status.isConnected)return;
    const pool=liveQuestions().filter(q=>q.track===track&&q.catalog_id===id);
    if(!pool.length){status.textContent=say('Bài này chưa có câu đang dùng. Hãy chọn bài khác.','No published questions for this skill yet. Choose another skill.');return;}
    beginQuick(pick(pool,count));
  }catch{if(status.isConnected)status.textContent=say('Không tải được câu hỏi. Hãy thử lại.','Could not load questions. Please retry.');}
  finally{busy=false;}
}
function shortage(chosen,allSelected){
  const leaves=catalogLeaves(),items=liveQuestions(),chapters=new Set(leaves.filter(x=>chosen.includes(x.id)).map(x=>x.topic));
  const scopes=sat()?(domain==='all'?domains:[domain]):['THPT'];
  return scopes.flatMap((scope,i)=>{
    const pool=items.filter(q=>sat()?q.track==='sat'&&q.topic===scope&&(!selectedSkill||selectedSkill===q.catalog_id)&&(!q.catalog_id||leaves.some(l=>l.id===q.catalog_id)):q.track==='vn'&&q.grade===grade&&(q.catalog_id?chosen.includes(q.catalog_id):allSelected||chapters.has(q.topic)||chosen.includes(q.topic)));
    const need=sat()?(domain==='all'?[{mc:13,short:3},{mc:12,short:4},{mc:4,short:2},{mc:4,short:2}][i]:{mc:33,short:11}):vnFormats[duration];
    return Object.entries(need).flatMap(([type,n])=>{const lack=n-pool.filter(q=>q.type===type).length;return lack>0?[scope+' · '+(sat()?({mc:'multiple choice',short:'student-produced response'})[type]:bankTypes[type])+' '+say('thiếu','short by')+' '+lack]:[];});
  }).join(' · ');
}
const coverageFilters={level:'',topic:''};
function coveragePanel(){
  const all=catalogLeaves(),level=l=>l.track==='sat'?'SAT':'Lớp '+l.grade;
  const levels=[...new Set(all.map(level))];
  if(!levels.includes(coverageFilters.level))coverageFilters.level='';
  const scope=all.filter(l=>!coverageFilters.level||level(l)===coverageFilters.level);
  const topics=[...new Set(scope.map(l=>l.topic))];
  if(!topics.includes(coverageFilters.topic))coverageFilters.topic='';
  const visible=scope.filter(l=>!coverageFilters.topic||l.topic===coverageFilters.topic);
  const filter=(label,key,values)=>'<label>'+label+'<select data-coverage="'+key+'"><option value="">Tất cả</option>'+values.map(v=>'<option '+(coverageFilters[key]===v?'selected':'')+' value="'+esc(v)+'">'+esc(v)+'</option>').join('')+'</select></label>';
  const controls='<div class="bank-filters">'+filter('Lớp / lộ trình','level',levels)+filter('Chương / Domain','topic',topics)+'</div>';

  const items=liveQuestions();
  return '<h2>Độ phủ ngân hàng</h2><p>Số câu đang dùng theo từng bài hoặc skill.</p>'+controls+'<div class="table-wrap"><table><thead><tr><th>Bài / skill</th><th>Trắc nghiệm</th><th>Đúng/Sai</th><th>Trả lời ngắn</th></tr></thead><tbody>'+visible.map(l=>{const rows=items.filter(q=>q.catalog_id===l.id);return '<tr><th>'+esc(l.path)+'</th>'+['mc','tf','short'].map(t=>'<td>'+(l.track==='sat'&&t==='tf'?'—':rows.filter(q=>q.type===t).length)+'</td>').join('')+'</tr>';}).join('')+'</tbody></table></div>';
}
const adminTabs={bank:'Ngân hàng',editor:'Soạn câu hỏi',tex:'Nhập TeX / Word',coverage:'Độ phủ',reports:'Báo lỗi & chất lượng',catalog:'Danh mục',students:'Học sinh'};
function showAdminView(key){
  if(!isAdmin||!Object.hasOwn(adminTabs,key))return;
  adminView=key;
  app.querySelectorAll('[data-view]').forEach(el=>el.hidden=el.dataset.view!==key);
  app.querySelectorAll('[data-admin-tab]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.adminTab===key)));
  const pane=app.querySelector('[data-view="'+key+'"]');if(!pane)return;
  const detail=pane.querySelector(':scope > details');if(detail)detail.open=true;
  if(key==='reports')void loadReports(pane);
}
async function loadReports(pane){
  pane.textContent='Đang tải báo lỗi…';
  const {data,error}=await db.from('studio_question_reports').select('question_id,student_id,reason,reported_at').eq('resolved',false).order('reported_at');
  if(!pane.isConnected)return;
  pane.innerHTML='<h2>Báo lỗi cần xử lý</h2>'+(error?'Không tải được báo lỗi.':data.length?data.map(x=>'<article><p>'+esc(reportNames[x.reason])+' · '+esc(bank.find(q=>q.id===x.question_id)?.q)+'</p>'+btn('Mở câu hỏi','edit-question:'+esc(x.question_id))+' <button data-resolve="'+esc(x.question_id)+'" data-student="'+esc(x.student_id)+'" data-reason="'+esc(x.reason)+'">Đánh dấu đã xử lý</button></article>').join(''):'<p>Chưa có báo lỗi đang mở.</p>');
  const stats=await db.rpc('studio_question_quality');
  if(!pane.isConnected)return;
  pane.insertAdjacentHTML('beforeend','<h2>Câu cần rà soát</h2><p>Các câu có ít nhất 5 lượt làm đã lưu từ bản nâng cấp, xếp theo tỷ lệ đạt trọn điểm từ thấp đến cao.</p>'+(stats.error?'Không tải được thống kê.':stats.data.length?stats.data.map(x=>'<article><p>'+esc(bank.find(q=>q.id===x.question_id)?.q)+'</p><p>Đạt trọn điểm '+x.fully_correct+' / '+x.total+' lượt</p>'+btn('Rà soát câu','edit-question:'+esc(x.question_id))+'</article>').join(''):'<p>Chưa đủ lượt làm để thống kê.</p>'));

}
function importPreview(source,leaf,difficulty,word=false){
  const clean=word?null:source.replace(/(?:\\.|%[^\r\n]*)/g,v=>v.startsWith('%')?'':v);
  const blocks=word?source:clean.split(/(?=\\begin\{ex\})/).filter(s=>s.startsWith('\\begin{ex}'));
  if(!blocks.length||blocks.length>300)throw new Error('Chọn tệp có từ 1 đến 300 câu.');
  const addDuplicate=duplicateIndex();
  for(const q of bank)addDuplicate(q,questionLabel(q));
  pendingImport=[];
  const rows=blocks.map((block,i)=>{
    try{
      const input=word?block:block.match(/^[\s\S]*?\\end\{ex\}/)?.[0]??block;
      const reasons=importReviewReasons(input);
      let q;
      try { q=word?recognizeQuestion(block,leaf.track,true):parseExamTex(block,leaf.track,true)[0]; }
      catch(error){
        if(!reasons.length)throw error;
        q=recoverImportDraft(block,leaf.track);
      }
      q.review_flags=reasons;
      q.status=reasons.length?'draft':'published';
      if(word){
        if(q.type==='mc')q.answer=formatQuestionMath(q.answer);
        q.q=formatQuestionMath(q.q);q.why=formatQuestionMath(q.why);
        q.choices=q.choices.map(formatQuestionMath);q.statements=q.statements.map(formatQuestionMath);
      }
      if(leaf.track==='sat'&&q.type==='tf')throw new Error('SAT không có dạng Đúng/Sai.');
      Object.assign(q,{track:leaf.track,grade:leaf.grade,topic:leaf.topic,catalog_id:leaf.id,difficulty,image:''});
      const duplicate=addDuplicate(q,'Câu '+(i+1)+' trong tệp');
      const index=pendingImport.push(q)-1;
      return '<article><label><input type="checkbox" name="row" value="'+index+'" '+(duplicate&&!reasons.length?'':'checked')+'> Câu '+(i+1)+' · '+esc(bankTypes[q.type])+(q.source?' · '+esc(q.source):'')+(reasons.length?' · Bản nháp — '+esc(reasons.join(', ')):'')+(duplicate?' · '+esc(duplicateCaption(duplicate)):'')+'</label><details><summary>'+richText(q.q)+'</summary>'+[...q.choices,...q.statements].map(v=>'<p>'+esc(v)+'</p>').join('')+'<p>Đáp án · '+esc(Array.isArray(q.answer)?q.answer.map(v=>v?'Đ':'S').join(' / '):q.answer)+'</p><p>'+richText(q.why)+'</p></details></article>';
    }catch(e){return '<p>Câu '+(i+1)+' · '+esc(e.message.replace(/^Câu 1: /,''))+'</p>';}
  });
  return '<form id="tex-save"><h3>'+blocks.length+' câu · '+esc(leaf.path)+'</h3>'+rows.join('')+'<button class="primary">Nhập câu đã chọn</button></form>';
}
function bulkPanel(){
  return '<details><summary>Cập nhật các câu đã chọn</summary><form id="bulk-edit"><label>Trạng thái <select name="status"><option value="">Giữ hiện tại</option>'+optionsFor(Object.entries(statusNames),x=>x[0],x=>x[1])+'</select></label><label>Bài / skill <select name="leaf"><option value="">Giữ hiện tại</option>'+optionsFor(catalogLeaves(),x=>x.id,x=>x.path)+'</select></label><button>Áp dụng</button></form></details>';
}
async function bulkEdit(f){
  const rows=bank.filter(q=>matchesBankFilters(q)&&bankSelection.has(q.id));
  const leaf=catalogLeaves().find(l=>l.id===f.elements.leaf.value),status=f.elements.status.value;
  const msg=document.querySelector('#bank-feedback');
  if(!rows.length||!leaf&&!status){msg.textContent='Chọn câu và thay đổi cần áp dụng.';return;}
  if(leaf&&rows.some(q=>q.track!==leaf.track)){msg.textContent='Chọn các câu cùng lộ trình với bài / skill đích.';return;}
  if(!confirm('Cập nhật '+rows.length+' câu đã chọn?'))return;
  f.querySelector('button').disabled=true;
  try{
    const {error}=await db.rpc('studio_bulk_questions',{p_rows:rows.map(q=>({id:q.id,version:q.version})),p_status:status||null,p_leaf:leaf?.id??null,p_topic:leaf?.topic??null,p_track:leaf?.track??null,p_grade:leaf?.grade??null});
    if(error)throw error;
    await loadBank();bankSelection.clear();catalogNotice='Đã cập nhật '+rows.length+' câu.';admin();
  }catch{msg.textContent='Chưa thể xác nhận cập nhật. Tải lại ngân hàng để kiểm tra phiên bản mới nhất.';}
  finally{f.querySelector('button').disabled=false;}
}
async function questionVersions(id){
  const {data,error}=await db.from('studio_question_versions').select('version,snapshot,saved_at').eq('question_id',id).order('version',{ascending:false});
  popup('<h2>Phiên bản trước</h2>'+(error?'Không tải được lịch sử.':data.length?data.map(v=>'<details><summary>Bản '+v.version+' · '+esc(new Date(v.saved_at).toLocaleString('vi-VN'))+'</summary><p>'+richText(v.snapshot.q)+'</p><p>'+richText(v.snapshot.why)+'</p><p>'+richText([...(v.snapshot.choices||[]),...(v.snapshot.statements||[])].join(' / '))+'</p><p>Đáp án · '+richText(v.snapshot.answer)+'</p><p>'+esc(v.snapshot.topic)+' · '+esc(statusNames[v.snapshot.status])+'</p></details>').join(''):'Chưa có lần chỉnh sửa trước.'));
}
function reportQuestion(index){
  const q=reviewResult?.questions[index];
  if(!studentSession||!q?.id)return;
  popup('<h2>'+say('Báo lỗi câu hỏi','Report a question')+'</h2><form id="report-form"><label>'+say('Nội dung','Issue')+'<select name="reason">'+optionsFor(Object.keys(reportNames),x=>x,x=>say(reportNames[x],x))+'</select></label><button>'+say('Gửi báo lỗi','Send report')+'</button><p role="status"></p></form>');
  const f=document.querySelector('#report-form');f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector('button');b.disabled=true;
    try{await studentRpc('studio_report_question',{p_token:studentSession.token,p_question:q.id,p_reason:f.elements.reason.value});f.querySelector('p').textContent=say('Đã gửi báo lỗi.','Report sent.');}
    catch{b.disabled=false;f.querySelector('p').textContent=say('Chưa gửi được. Hãy thử lại.','Could not send report. Please retry.');}
  };
}

function updateAvailability(){
  const notice=document.querySelector('#availability');
  if(!db||!notice)return;
  const boxes=[...app.querySelectorAll('[name=topic]')],chosen=boxes.filter(x=>x.checked).map(x=>x.value);
  const missing=shortage(chosen,chosen.length===boxes.length);
  notice.textContent=!sat()&&!chosen.length?'Chọn ít nhất một bài.':missing||say('Đã đủ câu cho cấu hình này.','Enough questions for this test.');
}
