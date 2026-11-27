let studentSession=null;
try { studentSession=JSON.parse(sessionStorage.getItem('studio-student-session')); } catch {}
let lastResult=null;
let studentPageRequest=0;

function setStudentSession(value){
  studentSession=value;
  try {
    if(value)sessionStorage.setItem('studio-student-session',JSON.stringify(value));
    else sessionStorage.removeItem('studio-student-session');
  } catch {}
}

async function studentRpc(name,args){
  if(!db)throw new Error('Trang chưa được kết nối Supabase.');
  const {data,error}=await db.rpc(name,args);
  if(error)throw error;
  return data;
}

async function openStudent(offset=0){
  page='student';
  track='vn';
  const request=++studentPageRequest;
  if(!studentSession){
    draw(`<h1>Đăng nhập học sinh</h1><section class="panel student-login">
      <form id="student-login"><label>Họ và tên <input name="fullName" autocomplete="name" maxlength="120" required></label>
      <label>Mã PIN <input name="pin" type="password" inputmode="numeric" autocomplete="off" pattern="[0-9]{4}" maxlength="4" required></label>
      <button class="primary">Đăng nhập</button><p id="student-status" role="status"></p></form>
      <p class="muted">Dùng mã PIN 4 chữ số do admin cấp.</p>${btn('Luyện tập với tư cách khách','home')}
      </section>`);
    return;
  }
  home();

}

async function persistStudentResult(result){
  if(!result?.studentId||studentSession?.id!==result.studentId)return;
  const session=studentSession;
  const status=document.querySelector('#result-save-status');
  if(status)status.textContent='Đang lưu kết quả…';
  try{
    await studentRpc('studio_save_student_result',{p_token:session.token,p_attempt:result.attemptId,p_result:{
      fullCredit:Object.fromEntries(result.questions.flatMap((q,i)=>q.id?[[q.id,points(q,result.answers[i],result.track)===1]]:[])),
      mode:result.mode??'exam',track:result.track,questions:result.questions,answers:result.answers
    }});
    result.saved=true;
    result.saveFailed=false;
    if(status?.isConnected)status.textContent='Đã lưu vào Bài đã làm.';
    else if(page==='student'&&studentSession===session)await openStudent();
  }catch(error){
    result.saveFailed=true;
    if(error.code==='28000'&&studentSession===session){setStudentSession(null);history=[];}
    if(status?.isConnected){
      status.textContent='Chưa lưu được kết quả. Kiểm tra kết nối hoặc đăng nhập lại bằng cùng tài khoản. ';
      status.insertAdjacentHTML('beforeend',btn('Thử lưu lại','retry-result'));
    }
  }
}

function studentAdminPanel(){
  return `<details class="panel"><summary>Quản lý học sinh và cấp PIN</summary>
    <form id="issue-pin"><label>Họ và tên học sinh <input name="fullName" maxlength="120" required></label>
    <button class="primary">Tạo học sinh và cấp PIN</button></form>
    <p id="pin-result" role="status"></p>
    ${btn('Tải danh sách học sinh','student-list')}
    <div id="student-list"></div><section id="admin-records"></section></details>`;
}

async function listStudents(){
  const target=document.querySelector('#student-list');
  if(!isAdmin||!target)return;
  target.textContent='Đang tải…';
  try{
    const rows=await studentRpc('studio_list_students',{});
    target.innerHTML=rows.length?'<ul>'+rows.map(x=>'<li><strong>'+esc(x.name)+'</strong> <small>'+esc(x.id.slice(-8))+'</small> '+btn('Xem kết quả','admin-records:'+x.id+':0')+' '+btn('Cấp lại PIN','reset-pin:'+x.id)+'</li>').join('')+'</ul>':'<p>Chưa có học sinh.</p>';
  }catch{target.textContent='Không tải được danh sách. Kiểm tra đã chạy students.sql.';}
}
async function issuePin(name,id=null){
  const target=document.querySelector('#pin-result');
  if(!isAdmin||!target)return false;
  try{
    const issue=await studentRpc('studio_issue_student_pin',{p_name:name,p_student:id});
    target.textContent=issue.name+' · PIN '+issue.pin+' · Hãy lưu lại để gửi riêng cho học sinh.';
    return true;
  }catch{
    target.textContent='Không cấp được PIN. Kiểm tra quyền quản trị và students.sql.';
    return false;
  }
}

async function studentForms(event){
  const form=event.target;
  if(!['student-login','issue-pin'].includes(form.id))return;
  event.preventDefault();
  const button=form.querySelector('button[type="submit"],button:not([type])');
  if(button.disabled)return;
  const input=new FormData(form);
  button.disabled=true;
  try{
    if(form.id==='issue-pin'){
      if(await issuePin(input.get('fullName')))form.reset();
      return;
    }
    const status=form.querySelector('#student-status');
    status.textContent='Đang đăng nhập…';
    try{
      const session=await studentRpc('studio_student_login',{p_name:input.get('fullName'),p_pin:input.get('pin')});
      form.elements.pin.value='';
      if(session?.retry){status.textContent='Đã thử quá nhiều lần. Hãy thử lại sau 15 phút.';return;}
      if(!session){status.textContent='Họ tên hoặc mã PIN không đúng.';return;}
      setStudentSession(session);
      history=[];
      if(page==='student'){if(location.pathname.replace(/\/$/,'')===portalRoutes.records)await studentRecords();else await go('student');}
    }catch{
      form.elements.pin.value='';
      status.textContent='Không thể đăng nhập. Hãy kiểm tra kết nối và thử lại.';
    }
  }finally{button.disabled=false;}
}
