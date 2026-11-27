const portalRoutes={home:'/',vn:'/thpt',sat:'/sat',student:'/hoc-sinh',records:'/hoc-sinh/ket-qua',admin:'/admin'};
function navigatePath(action){
  const path=portalRoutes[action];
  if(path&&location.pathname!==path)window.history.pushState(null,'',path);
}
function enterPath(){
  const path=location.pathname.replace(/\/$/,'')||'/';
  return go(Object.keys(portalRoutes).find(k=>portalRoutes[k]===path)||'home');
}
function studentTabs(active){
  return '<nav class="student-tabs" aria-label="Học sinh">'+[['student','Luyện tập'],['records','Kết quả']].map(([k,title])=>'<button data-go="'+k+'" '+(active===k?'aria-current="page"':'')+'>'+title+'</button>') .join('')+btn('Đăng xuất','student-logout')+'</nav>';
}
function canResume(r){
  if(!r)return false;
  if(r.studentId)return r.studentId===studentSession?.id;
  return r.mode==='quick';
}
async function verifyExam(){
  if(!studentSession){await go('student');return false;}
  const session=studentSession;
  try{
    const id=await studentRpc('studio_exam_session',{p_token:session.token});
    if(studentSession!==session)return false;
    if(id===session.id)return true;
    setStudentSession(null);history=[];await go('student');
    const status=document.querySelector('#student-status');if(status)status.textContent='Phiên đã hết hạn. Đăng nhập lại để thi thử.';
  }catch{alert('Không xác minh được phiên thi thử. Kiểm tra kết nối và thử lại.');}
  return false;
}
const recordFilters={track:'',grade:'',topic:'',skill:''};
function historyPanel(){
  const names=new Map(catalogLeaves().map(l=>[l.id,l.name]));
  const flat=history.flatMap(r=>r.questions.map(q=>({...q,track:r.track})));
  const keys=['track','grade','topic','skill'];
  const value=(q,k)=>String(k==='skill'?q.catalog_id??'':q[k]??'');
  const matches=(q,n)=>keys.slice(0,n).every(k=>!recordFilters[k]||value(q,k)===recordFilters[k]);
  const filters=keys.map((k,i)=>{
    const values=[...new Set(flat.filter(q=>matches(q,i)).map(q=>value(q,k)).filter(Boolean))].sort();
    if(!values.includes(recordFilters[k]))recordFilters[k]='';
    return '<label>'+['Lộ trình','Lớp','Chương / Domain','Bài / Skill'][i]+'<select data-record-filter="'+k+'"><option value="">Tất cả</option>'+values.map(v=>'<option value="'+esc(v)+'" '+(recordFilters[k]===v?'selected':'')+'>'+esc(k==='track'?(v==='sat'?'SAT':'Toán THPT'):k==='skill'?names.get(v)||v:v)+'</option>').join('')+'</select></label>';
  }).join('');
  const rows=history.flatMap((r,i)=>r.questions.some(q=>matches({...q,track:r.track},4))?[{r,i}]:[]);
  return '<h2>Kết quả đã lưu</h2><div class="bank-filters">'+filters+'</div><p>'+rows.length+' lượt làm phù hợp</p>'+rows.map(({r,i})=>'<p>'+btn((r.track==='sat'?'SAT Math':'Toán THPT')+' · '+(r.mode==='quick'?'Luyện nhanh':'Thi thử')+' · '+new Date(r.date).toLocaleString('vi-VN'),'result:'+i)+'</p>').join('')+(rows.length?progressTable(rows.map(x=>x.r)):'');
}
async function studentRecords(){
  page='student';track='vn';
  if(!studentSession){await openStudent();return;}
  const req=++studentPageRequest,session=studentSession;
  draw(studentTabs('records')+'<p role="status">Đang tải kết quả…</p>');
  try{
    await loadCatalog();
    const all=[];
    for(let offset=0;;offset+=10){
      const rows=await studentRpc('studio_student_history',{p_token:session.token,p_offset:offset});
      if(page!=='student'||req!==studentPageRequest||session!==studentSession)return;
      all.push(...rows);if(rows.length<10)break;
    }
    history=[...new Map(all.map(x=>[x.attempt_id,x])).values()].map(x=>({...x.result,date:new Date(x.saved_at).getTime()}));
    draw('<h1>'+esc(session.name)+'</h1>'+studentTabs('records')+'<section class="panel" id="history-panel">'+historyPanel()+'</section>');
  }catch(e){
    if(page!=='student'||req!==studentPageRequest)return;
    if(e.code==='28000'){setStudentSession(null);history=[];await openStudent();return;}
    draw(studentTabs('records')+'<p>Không tải được lịch sử.</p>'+btn('Thử lại','records'));
  }
}
const stateLabels={empty:['Chưa làm','Unanswered'],started:['Đang làm dở','Incomplete'],done:['Đã làm','Answered'],correct:['Đúng','Correct'],partial:['Đúng một phần','Partial credit'],wrong:['Sai','Incorrect']};
function questionState(r,i,review){
  const q=r.questions[i],a=r.answers[i];
  if(!answered(q,a))return 'empty';
  if(review){const score=points(q,a,r.track);return score===1?'correct':score>0?'partial':'wrong';}
  return q.type==='tf'&&a.filter(x=>typeof x==='boolean').length<4?'started':'done';
}
function questionMap(r,review=false){
  const moduleOnly=!review&&r.track==='sat'&&r.mode!=='quick';
  const lo=moduleOnly?(r.module-1)*22:0,hi=moduleOnly?lo+22:r.questions.length;
  const label=k=>stateLabels[k][r.track==='sat'?1:0];
  const buttons=r.questions.slice(lo,hi).map((q,j)=>{
    const i=lo+j,state=questionState(r,i,review),current=!review&&i===r.index;
    return '<button data-go="'+(review?'inspect:':'jump:')+i+'" class="number '+state+(current?' current':'')+(r.flags?.[i]?' marked':'')+'" '+(current?'aria-current="step"':'')+' aria-label="'+(j+1)+' · '+label(state)+'" title="'+label(state)+'">'+(j+1)+'</button>';
  }).join('');
  const legend=(review?['correct','partial','wrong','empty']:['empty','started','done']).map(s=>'<span class="'+s+'">'+label(s)+'</span>').join('');
  return '<nav class="question-map" aria-label="Question navigation"><div>'+buttons+'</div><p class="map-legend">'+(!review?'<span class="current">'+(r.track==='sat'?'Current':'Đang xem')+'</span>':'')+legend+'</p></nav>';
}
function inspectAnswer(r,i){
  const q=r?.questions[i];if(!q)return;
  const answer=r.answers[i],display=a=>Array.isArray(a)?a.map(v=>v===true?'Đúng':v===false?'Sai':'—').join(' / '):a??'—';
  const state=stateLabels[questionState(r,i,true)][r.track==='sat'?1:0];
  popup('<h2>'+say('Câu ','Question ')+(i+1)+' / '+r.questions.length+'</h2><p>'+esc(state)+'</p><p>'+richText(q.q)+'</p>'+(/^data:image\/(?:png|jpeg|webp);base64,/.test(q.image||'')?'<img class="figure" src="'+esc(q.image)+'" alt="Hình câu hỏi">':'')+'<ol>'+[...(q.choices||[]),...(q.statements||[])].map(v=>'<li>'+richText(v)+'</li>').join('')+'</ol><p>'+say('Đã chọn','Your answer')+' · '+richText(display(answer))+'</p><p>'+say('Đáp án','Answer')+' · '+richText(display(q.answer))+'</p><p>'+richText(q.why)+'</p>');
}
let adminRecords=[],adminReview=null,adminRequest=0;
async function showStudentRecords(id,offset){
  const host=document.querySelector('#admin-records');if(!isAdmin||!host)return;
  const req=++adminRequest;host.textContent='Đang tải kết quả…';adminReview=null;adminRecords=[];
  try{
    const rows=await studentRpc('studio_admin_student_history',{p_student:id,p_offset:offset});
    if(req!==adminRequest||!isAdmin||!host.isConnected)return;
    adminRecords=rows;
    const name=app.querySelector('[data-go="admin-records:'+id+':0"]')?.closest('li')?.querySelector('strong')?.textContent||'';
    host.innerHTML='<h3>Kết quả · '+esc(name)+'</h3>'+rows.map((x,i)=>'<p>'+btn((x.result.track==='sat'?'SAT Math':'Toán THPT')+' · '+new Date(x.saved_at).toLocaleString('vi-VN'),'admin-review:'+i)+'</p>').join('')+(rows.length?'':'Chưa có bài ở trang này.')+'<div class="actions">'+(offset?btn('Trang trước','admin-records:'+id+':'+Math.max(0,offset-10)):'')+(rows.length===10?btn('Trang sau','admin-records:'+id+':'+(offset+10)):'')+'</div><section id="admin-detail"></section>';
  }catch{if(req===adminRequest)host.textContent='Không tải được kết quả. Kiểm tra quyền Admin và portal.sql.';}
}
function showAdminReview(index){
  if(!isAdmin)return;
  adminReview=adminRecords[index]?.result;if(!adminReview)return;
  const r=adminReview,score=r.questions.reduce((s,q,i)=>s+points(q,r.answers[i],r.track),0);
  app.querySelector('#admin-detail').innerHTML='<h3>Chi tiết bài làm</h3><p>Điểm · '+(r.track==='vn'&&r.mode!=='quick'?vnScore(r).toFixed(2)+' / 10':Number(score.toFixed(2))+' / '+r.questions.length)+'</p>'+questionMap(r,true).replaceAll('data-go="inspect:','data-go="admin-inspect:');
}
async function wordQuestionBlocks(file){
  const zip=await JSZip.loadAsync(await file.arrayBuffer()),entry=zip.file('word/document.xml');
  if(!entry)throw new Error('Chọn tài liệu Word .docx hợp lệ.');
  const xml=new DOMParser().parseFromString(await entry.async('string'),'application/xml');
  if(xml.querySelector('parsererror'))throw new Error('Không đọc được nội dung Word.');
  const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  function readNode(node){
    if(node.localName==='oMath'||node.localName==='oMathPara'){
      const text=[...node.getElementsByTagNameNS('*','t')].map(n=>n.textContent).join('');
      return '⟦Công thức Word cần sửa'+(text?' · '+text:'')+ '⟧';
    }
    if(['drawing','pict','object','AlternateContent'].includes(node.localName))return '⟦Thiếu hình vẽ⟧';
    if(node.namespaceURI===ns){
      if(node.localName==='t')return node.textContent;
      if(node.localName==='tab')return ' ';
      if(node.localName==='br')return '\n';
    }
    const content=[...node.children].map(readNode).join('');
    return node.namespaceURI===ns&&node.localName==='p'?content+'\n':content;
  }
  const lines=readNode(xml.documentElement);
  return lines.split(/^[ \t]*(?:Câu|Question)[ \t]+\d+[.):][ \t]*/gim).map(t=>t.trim()).filter(Boolean);
}
