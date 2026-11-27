const app=document.querySelector('#app'), modal=document.querySelector('#modal');
const domains=['Algebra','Advanced Math','Problem-Solving and Data Analysis','Geometry and Trigonometry'];
const topics={10:['Hàm số bậc hai','Hệ thức lượng','Xác suất'],11:['Lượng giác','Dãy số','Đạo hàm'],12:['Ứng dụng đạo hàm','Nguyên hàm','Xác suất có điều kiện']};
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
const save=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const math=value=>'\\('+value+'\\)';
const pick=(a,n)=>a.map(value=>({value,key:Math.random()})).sort((a,b)=>a.key-b.key).slice(0,n).map(x=>x.value);
const triangle=(a,b)=>'<svg viewBox="0 0 220 135" role="img" aria-label="Right triangle"><path d="M30 110V18L182 110Z M30 94H46V110" fill="#edf4ff" stroke="#414ba0" stroke-width="2"/><text x="10" y="65">'+a+'</text><text x="100" y="129">'+b+'</text><text x="113" y="55">x</text></svg>';
const scatter=(a,b)=>'<svg viewBox="0 0 220 140" role="img" aria-label="Scatterplot with a line of best fit"><path d="M28 18V112H198 M35 104L183 30" fill="none" stroke="#414ba0" stroke-width="2"/><g fill="#153d3b"><circle cx="46" cy="96" r="4"/><circle cx="78" cy="77" r="4"/><circle cx="120" cy="65" r="4"/><circle cx="151" cy="50" r="4"/></g><text x="150" y="131">x = '+a+'</text><text x="148" y="24">y = '+b+'</text></svg>';
const config=window.STUDIO_CONFIG||{};
const db=config.url&&config.key&&window.supabase?window.supabase.createClient(config.url,config.key):null;
const adminEmail='mathstudiodn@gmail.com';
let isAdmin=false, busy=false;
let bank=[], history=[], run=read('studio-run',null), page='home', track='vn', grade=12, tab='all';
const sat=()=>track==='sat';
const vnFormats={45:{mc:12,tf:2,short:4},90:{mc:12,tf:4,short:6}};
const vnWeights={mc:3,tf:4,short:3};
let duration=45, domain='all';
let catalog=structuredClone(studioCatalogSeed), revision=null, selectedClass='', selectedSkill='', pendingImport=[];
const catalogLeaves=()=>[
  ...catalog.grades.flatMap(g=>g.chapters.flatMap(c=>c.lessons.map(l=>({...l,track:'vn',grade:g.grade,topic:c.name,path:g.name+' / '+c.name+' / '+l.name})))),
  ...catalog.domains.flatMap(d=>d.skills.map(s=>({...s,track:'sat',grade:null,topic:d.name,path:d.name+' / '+s.name})))
];
const optionsFor=(items,value,label)=>items.map(x=>'<option value="'+esc(value(x))+'">'+esc(label(x))+'</option>').join('');
async function loadCatalog(){
  if(!db)return;
  const {data,error}=await db.from('studio_catalog').select('tree,revision').eq('id',1).maybeSingle();
  if(error)throw new Error('Không tải được danh mục. Kiểm tra migration supabase/catalog.sql.');
  catalog=data?.tree??structuredClone(studioCatalogSeed);
  revision=data?.revision??null;
}
async function writeCatalog(tree){
  const request=revision===null
    ? db.from('studio_catalog').insert({id:1,tree})
    : db.from('studio_catalog').update({tree,revision:revision+1}).eq('id',1).eq('revision',revision);
  const {data,error}=await request.select('revision').maybeSingle();
  if(error||!data)throw new Error('Không lưu được danh mục. Tải lại trang để đồng bộ và thử lại.');
  catalog=tree;
  revision=data.revision;
}
function catalogAdmin(){
  const outline=catalog.grades.map((g,i)=>'<details><summary>'+esc(g.name)+'</summary>'+btn('Bỏ lớp','catalog-delete:'+i)+g.chapters.map((c,j)=>'<details><summary>'+esc(c.name)+'</summary>'+btn('Bỏ chương','catalog-delete:'+i+','+j)+'<ul>'+c.lessons.map((l,k)=>'<li>'+esc(l.name)+' '+btn('Bỏ bài','catalog-delete:'+i+','+j+','+k)+'</li>').join('')+'</ul></details>').join('')+'</details>').join('')
    +catalog.domains.map((d,i)=>'<details><summary>'+esc(d.name)+'</summary><ul>'+d.skills.map((s,j)=>'<li>'+esc(s.name)+' '+btn('Bỏ skill','catalog-delete:sat,'+i+','+j)+'</li>').join('')+'</ul></details>').join('');
  return '<details class="panel"><summary>Quản lý danh mục lớp, chương, bài và skill</summary><div class="split"><div><form id="catalog-manual"><h3>Thêm thủ công</h3><label>Lộ trình <select name="track"><option value="vn">THPT</option><option value="sat">SAT</option></select></label><div data-catalog-track="vn"><label>Khối <select name="grade"><option>10</option><option>11</option><option>12</option></select></label><label>Tên lớp <input name="className" maxlength="240" list="catalog-classes"></label><datalist id="catalog-classes">'+optionsFor(catalog.grades,g=>g.name,g=>g.name)+'</datalist><label>Tên chương <input name="chapter" maxlength="240" list="catalog-chapters"></label><datalist id="catalog-chapters">'+optionsFor([...new Set(catalog.grades.flatMap(g=>g.chapters.map(c=>c.name)))],x=>x,x=>x)+'</datalist><label>Tên bài <input name="lesson" maxlength="240"></label></div><div data-catalog-track="sat" hidden><label>Domain <select name="domain">'+optionsFor(catalog.domains,d=>d.name,d=>d.name)+'</select></label><label>Tên skill <input name="skill" maxlength="240"></label></div><button class="primary">Thêm vào danh mục</button></form><form id="catalog-file"><h3>Nhập danh mục từ tệp</h3><p><a href="templates/mau-danh-muc.json" download>Tải mẫu JSON</a> · <a href="templates/danh-muc-day-du.json" download>Tải danh mục từ Excel</a></p><label>Tệp JSON <input name="file" type="file" accept=".json" required></label><button>Gộp danh mục</button></form></div><div id="catalog-outline">'+outline+'</div></div></details>';
}
function importChapterKey(leaf){return JSON.stringify([leaf.track,leaf.grade,leaf.topic]);}
function importChapterOptions(){
  const chapters=new Map(catalogLeaves().map(l=>[importChapterKey(l),(l.grade?'Lớp '+l.grade:'SAT')+' · '+l.topic]));
  return optionsFor([...chapters],x=>x[0],x=>x[1]);
}
function importSkills(form){
  const choices=catalogLeaves().filter(l=>importChapterKey(l)===form.elements.chapter.value);
  form.elements.leaf.innerHTML='<option value="">Chọn bài / skill</option>'+optionsFor(choices,l=>l.id,l=>l.name);
  form.elements.leaf.disabled=!choices.length;
}
function texAdmin(){
  return '<details class="panel"><summary>Nhập câu hỏi từ LaTeX hoặc Word</summary><p><a href="templates/mau-cau-hoi.tex" download>Tải mẫu ex_test (.tex)</a> · <a href="templates/mau-cau-hoi.docx" download>Tải mẫu Word (.docx)</a></p><form id="tex-import"><div class="import-fields"><label>Chương / Domain <select name="chapter" required><option value="">Chọn chương / domain</option>'+importChapterOptions()+'</select></label><label>Bài / Skill <select name="leaf" required disabled><option value="">Chọn chương trước</option></select></label><label>Mức độ <select name="difficulty"><option>Easy</option><option selected>Medium</option><option>Hard</option></select></label></div><label>Tệp .tex hoặc .docx <input name="file" type="file" accept=".tex,.docx" required></label><button>Xem trước</button></form><div id="tex-preview"></div></details>';
}
let catalogNotice='';
async function adminImport(event){
  const form=event.target;
  if(!['catalog-manual','catalog-file','tex-import','tex-save'].includes(form.id))return;
  event.preventDefault();
  if(!isAdmin||busy)return;
  const data=Object.fromEntries(new FormData(form));
  const status=document.querySelector('#catalog-status');
  busy=true;
  const button=form.querySelector('button');
  button.disabled=true;
  try{
    if(form.id==='tex-save'){
      const selected=new FormData(form).getAll('row').map(i=>pendingImport[Number(i)]).filter(Boolean);
      if(!selected.length)throw new Error('Chọn ít nhất một câu để nhập.');
      const {error}=await db.from('studio_questions').insert(selected);
      if(error)throw new Error(error.message);
      const drafts=selected.filter(q=>q.status==='draft').length;
      const summary='Đã nhập '+selected.length+' câu hỏi, gồm '+drafts+' câu ở trạng thái Bản nháp.';
      pendingImport=[];
      form.remove();
      status.textContent=summary;
      await loadBank().catch(()=>{});
      catalogNotice=summary;
      if(page==='admin')admin();
      return;
    }
    if(form.id==='tex-import'){
      pendingImport=[];
      const preview=document.querySelector('#tex-preview');
      preview.innerHTML='';
      const leaf=catalogLeaves().find(x=>x.id===data.leaf);
      if(!leaf || importChapterKey(leaf)!==data.chapter)throw new Error('Hãy chọn chương và bài hoặc skill tương ứng.');
      const word=/\.docx$/i.test(data.file.name);
      if(data.file.size>(word?5000000:1000000))throw new Error('Tệp vượt dung lượng cho phép (Word 5 MB, TeX 1 MB).');
      const source=word?await wordQuestionBlocks(data.file):await data.file.text();
      if(!form.isConnected||form.elements.chapter.value!==data.chapter||form.elements.leaf.value!==data.leaf||
        form.elements.difficulty.value!==data.difficulty||form.elements.file.files[0]!==data.file)return;
      preview.innerHTML=importPreview(source,leaf,data.difficulty,word);
      window.MathJax?.typesetPromise?.([preview]).catch(()=>{});
      status.textContent='';
      return;
    }
    let incoming;
    if(form.id==='catalog-file'){
      if(data.file.size>1000000)throw new Error('Tệp danh mục tối đa 1 MB.');
      incoming=JSON.parse((await data.file.text()).replace(/^\uFEFF/,''));
    }else if(data.track==='vn'){
      if(data.lesson.trim()&&!data.chapter.trim())throw new Error('Nhập tên chương trước khi thêm bài.');
      incoming={grades:[{name:data.className,grade:Number(data.grade),chapters:data.chapter.trim()?[{name:data.chapter,lessons:data.lesson.trim()?[{name:data.lesson}]:[]}]:[]}],domains:[]};
    }else{
      if(!data.skill.trim())throw new Error('Nhập tên skill.');
      incoming={grades:[],domains:[{name:data.domain,skills:[{name:data.skill}]}]};
    }
    const updated=mergeCatalog(catalog,incoming);
    if(incoming.remove?.length&&!confirm('Áp dụng '+incoming.remove.length+' yêu cầu bỏ mục? Câu hỏi vẫn được giữ trong ngân hàng.'))return;
    await writeCatalog(updated);
    catalogNotice='Đã lưu danh mục.';
    if(page==='admin')admin();
  }catch(error){status.textContent=error.message;}finally{busy=false;button.disabled=false;}
}
async function deleteCatalog(path){
  if(!isAdmin||busy||!confirm('Bỏ mục này và các mục con khỏi danh mục luyện tập? Câu hỏi vẫn được giữ trong ngân hàng.'))return;
  const tree=structuredClone(catalog);
  const [a,b,c]=path.split(',');
  if(a==='sat')tree.domains[b].skills.splice(Number(c),1);
  else if(c!==undefined)tree.grades[a].chapters[b].lessons.splice(Number(c),1);
  else if(b!==undefined)tree.grades[a].chapters.splice(Number(b),1);
  else tree.grades.splice(Number(a),1);
  busy=true;
  try{await writeCatalog(tree);catalogNotice='Đã bỏ mục khỏi danh mục.';if(page==='admin')admin();}
  catch(error){document.querySelector('#catalog-status').textContent=error.message;}
  finally{busy=false;}
}

async function loadBank(){
  if(!db){
    if(config.url)throw new Error('Không thể tải thư viện Supabase.');
    return;
  }
  const all=[];
  const withNotes=isAdmin;
  for(let offset=0;;offset+=100){
    const {data,error}=await db.from('studio_questions').select('id,source,created_at,status,version,track,grade,topic,catalog_id,difficulty,type,q,answer,choices,statements,why,image'+(withNotes?',review_flags,studio_bank_notes(note)':'')).order('id').range(offset,offset+99);
    if(error)throw error;
    all.push(...data);
    if(data.length<100)break;
  }
  manualBankNotes.clear();
  for(const row of all){
    if(row.studio_bank_notes)manualBankNotes.set(row.id,row.studio_bank_notes.note);
    delete row.studio_bank_notes;
  }
  bank=all.map(row=>row.source==null?{...row,...splitSource(row.q)}:row);
}
async function adminStatus(){
  if(!db)return false;
  const {data:{session}}=await db.auth.getSession();
  if(!session)return false;
  const {data,error}=await db.rpc('studio_is_admin');
  if(error)throw error;
  return data===true;
}

const say=(vi,en)=>sat()?en:vi;
const btn=(label,action,css='')=>'<button class="'+css+'" data-go="'+action+'">'+label+'</button>';
function draw(html){resetMedia();document.querySelectorAll('header [data-go]').forEach(b=>{const current=b.dataset.go===page||(b.dataset.go==='student'&&page==='results');if(current)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});app.className=sat()?'sat':'';app.innerHTML=html;window.MathJax?.typesetPromise?.([app]).catch(()=>{});}
function popup(html){document.querySelector('#modalbody').innerHTML=html;if(!modal.open)modal.showModal();window.MathJax?.typesetPromise?.([modal]).catch(()=>{});}
function home(){
  draw(`<section class="hero">
    <div class="hero-content">
      <h1>Không gian<br>ôn tập Toán</h1>
      <p>${studentSession?'Học sinh · '+esc(studentSession.name)+' · Luyện nhanh và thi thử.':'Chế độ Khách · Luyện nhanh theo bài hoặc skill. Đăng nhập học sinh để thi thử và lưu kết quả.'}</p>
      ${studentSession?studentTabs('student'):btn('Đăng nhập học sinh','student')}
      ${canResume(run) ? btn('Tiếp tục bài đang làm','resume','primary') : ''}
    </div>
    <div class="hero-art" aria-hidden="true"><span class="formula">ƒ(x)</span><span class="orbit"></span><span class="axis axis-x"></span><span class="axis axis-y"></span></div>
  </section>
  <section class="tracks" aria-label="Lộ trình ôn tập">
    <article class="card">
      <span class="icon" aria-hidden="true">Δ</span>
      <h2>Toán THPT Việt Nam</h2>
      <p>Lớp 10–12 · Luyện theo chương</p>
      <p>${studentSession?"Thi thử 45 hoặc 90 phút.":"Luyện nhanh theo bài học."}</p>
      ${btn('Chọn nội dung THPT','vn','primary')}
    </article>
    <article class="card" lang="en">
      <span class="icon" aria-hidden="true">∫</span>
      <h2>Digital SAT Math</h2>
      <p>Full practice or practice by domain</p>
      <p>${studentSession?"Two timed modules of 22 questions each.":"Quick practice by skill."}</p>
      ${btn('Open SAT Practice','sat','primary')}
    </article>
  </section>`);
}
function setup(){
  const classList=db?catalog.grades:Object.keys(topics).map(k=>({grade:Number(k),name:'Lớp '+k}));
  const current=classList.find(g=>g.name===selectedClass)??classList.find(g=>g.grade===grade)??classList[0];
  selectedClass=current?.name??'';
  grade=current?.grade??12;
  if(!studentSession){draw(btn('Trang chủ / Home','home')+'<h1>'+say('Luyện nhanh Toán THPT','SAT Quick Practice')+'</h1><p>'+say('Chế độ Khách · Kết quả không lưu.','Guest mode · Results are not saved.')+'</p>'+quickPanel()+btn(say('Đăng nhập để thi thử','Sign in for a timed test'),'student'));return;}
  const choices=db?(current?.chapters??[]).map(ch=>'<fieldset data-chapter><legend><label><input type="checkbox" data-chapter-all checked> '+esc(ch.name)+'</label></legend><button type="button" data-only-chapter>Chỉ chọn chương này</button>'+ch.lessons.map(l=>'<label><input type="checkbox" name="topic" value="'+esc(l.id)+'" checked> '+esc(l.name)+'</label>').join('')+'</fieldset>').join('')
    :topics[grade].map(t=>'<label><input type="checkbox" name="topic" value="'+esc(t)+'" checked> '+esc(t)+'</label>').join('');
  const classOptions=classList.map(g=>'<option '+(g.name===selectedClass?'selected':'')+'>'+esc(g.name)+'</option>').join('');
  const skills=catalog.domains.find(d=>d.name===domain)?.skills??[];
  if(!skills.some(x=>x.id===selectedSkill))selectedSkill='';
  const skillOptions=domain!=='all'&&db?'<label>Skill <select id="skill"><option value="">All skills</option>'+skills.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===selectedSkill?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></label>':'';
  const format=vnFormats[duration];
  const settings=sat()
    ? '<label>Practice scope <select id="domain"><option value="all">All domains</option>'+domains.map(d=>'<option '+(domain===d?'selected':'')+'>'+esc(d)+'</option>').join('')+'</select></label>'+skillOptions+'<p>Two modules, 22 questions and 35 minutes each.</p>'
    : '<label>Khối lớp <select id="grade">'+classOptions+'</select></label><label>Thời gian <select id="duration">'+[45,90].map(m=>'<option value="'+m+'" '+(m===duration?'selected':'')+'>'+m+' phút</option>').join('')+'</select></label><p>'+format.mc+' nhiều lựa chọn · '+format.tf+' đúng/sai (4 ý/câu) · '+format.short+' trả lời ngắn. Điểm ba phần: 3/4/3.</p><div class="actions"><button data-topics="all">Chọn tất cả</button><button data-topics="none">Bỏ chọn tất cả</button></div>'+choices;
  draw(studentTabs('student')+'<h1>'+say('Ôn tập Toán THPT','SAT Math Practice')+'</h1><p class="session-state">'+(studentSession?esc(studentSession.name)+' · '+say('Kết quả được lưu','Results are saved'):say('Chế độ khách · Kết quả không lưu vào lịch sử','Guest mode · Results are not saved'))+'</p><div class="learning-grid">'+quickPanel()+'<section class="panel"><h2>'+say('Thi thử có tính giờ','Timed practice test')+'</h2>'+settings+(!config.url?'<p class="muted">'+say('Chế độ xem thử với câu mẫu.','Preview mode with sample questions.')+'</p>':'')+'<p id="availability" role="status"></p>'+btn(say('Bắt đầu làm bài','Start Practice'),'start','primary')+'<p class="muted" role="status" id="setup-error"></p></section><aside class="panel setup-help"><h3>'+say('Sau khi nộp bài','After submission')+'</h3><p>'+say('Xem điểm, đáp án, lời giải và tỷ lệ đúng theo chương. Kết quả được lưu vào tab Kết quả của bạn.','Review answers and see accuracy by module and domain. Your score will appear in the Results tab.')+'</p></aside></div>');updateAvailability();
}
function makeSat(d,n,hard=false,spr=false){const a=n+2,b=n%7+2;let q='',answer,why,figure='';switch(d){case 0:q=hard?'If '+math(a+'(x-'+b+')+'+b+'='+ (a*a+b))+', what is '+math('x')+'?':'If '+math(a+'x+'+b+'='+(a*b+b))+', what is '+math('x')+'?';answer=hard?a+b:b;why='Isolate the expression containing x, then solve for x.';break;
case 1:q='The function '+math('f(x)=(x-'+a+')^2+'+b)+' is defined for all real x. What is the '+(hard?'value of '+math('f('+ (a+2)+')'):'minimum value of f')+'?';answer=hard?4+b:b;why=hard?'Substitute the given x-value. The squared term equals 4.':'The squared term is zero at '+math('x='+a)+'.';break;
case 2:q=hard?'A value of '+(a*10)+' increases by 20%. What is the new value?':'A line of best fit is given by '+math('y=2x+3')+'. What value of y does it predict when '+math('x='+a)+'?';answer=hard?a*12:2*a+3;why=hard?'Multiply the initial value by 1.2.':'Substitute the given x-value into the equation.';if(!hard)figure=scatter(a,answer);break;
default:q='The right triangle shown has legs of lengths '+(3*b)+' and '+(4*b)+'. What is the length x of its hypotenuse?';answer=5*b;why='Apply the Pythagorean theorem. The side lengths form a scaled 3–4–5 triangle.';figure=triangle(3*b,4*b);}
return makeQuestion(q,answer,why,domains[d],spr?'short':'mc',figure);}
function makeQuestion(q,a,why,topic,type='mc',figure=''){const choices=type==='mc'?pick([a,a+1,a+2,a+3],4).map(String):[];return {q,answer:type==='tf'?a:String(a),why,topic,type,figure,choices};}
function makeVn(g,t,n,type){const a=n+2,b=n%5+2;let q,ans,why,figure='';switch(t){
case 'Hàm số bậc hai': q='Cho hàm số '+math('f(x)=(x-'+a+')^2+'+b)+'. Tìm giá trị nhỏ nhất.';ans=b;why='Bình phương không âm và bằng 0 khi x = '+a+'.';break;
case 'Hệ thức lượng':q='Cho tam giác vuông có hai cạnh góc vuông dài '+(3*b)+' và '+(4*b)+'. Tính cạnh huyền x.';ans=5*b;why='Áp dụng định lý Pythagore.';figure=triangle(3*b,4*b);break;
case 'Lượng giác':q='Tính '+math(a+'\\sin(\\pi/2)+'+b)+'.';ans=a+b;why='Giá trị của sin tại π/2 bằng 1.';break;
case 'Dãy số':q='Cấp số cộng có '+math('u_1='+a)+', công sai '+math('d='+b)+'. Tính '+math('u_5')+'.';ans=a+4*b;why='Dùng công thức '+math('u_5=u_1+4d')+'.';break;
case 'Đạo hàm':q='Cho '+math('f(x)=x^2+'+b+'x')+'. Tính '+math("f'("+a+")")+'.';ans=2*a+b;why=math("f'(x)=2x+"+b)+'.';break;
case 'Ứng dụng đạo hàm':q='Cho '+math('f(x)=-(x-'+a+')^2+'+b)+'. Tìm giá trị lớn nhất trên '+math('[0,'+(2*a)+']')+'.';ans=b;why='Bình phương bằng 0 tại x = '+a+', thuộc đoạn đã cho.';break;
case 'Nguyên hàm':q='Tính '+math('\\int_0^'+a+' 2x\\,dx')+'.';ans=a*a;why='Thay cận vào nguyên hàm '+math('x^2')+'.';break;
default:q=t==='Xác suất có điều kiện'?'Biết kết quả xúc xắc là số chẵn. Có bao nhiêu giá trị có thể xảy ra?':'Gieo một xúc xắc. Có bao nhiêu kết quả là số chẵn?';ans=3;why='Các giá trị chẵn là 2, 4 và 6.';}
const item=makeQuestion(q,ans,why,t,type,figure);if(type==='tf'){item.statements=[ans,ans+1,ans+2,ans].map((x,i)=>i===3?'Kết quả là số nguyên.':'Kết quả bằng '+x+'.');item.answer=[true,false,false,true];}return item;}
function satModule(number,hard=false,scope=run?.domain??domain,previous=run?.questions??[],skill=run?.skill??selectedSkill){
  const counts=scope==='all'?[8,8,3,3]:domains.map(d=>d===scope?22:0);
  const used=new Set(number===2?previous.map(q=>q.id).filter(Boolean):[]);
  const questions=counts.flatMap((count,d)=>Array.from({length:count},(_,i)=>{
    const shortCount=scope==='all'?(number===1&&d===0?1:d<2?2:1):(number===1?5:6);
    const q=makeSat(d,number*30+i,hard,i<shortCount);
    const candidates=liveQuestions().filter(x=>x.track==='sat'&&x.topic===q.topic&&(!skill||x.catalog_id===skill)&&(!x.catalog_id||catalog.domains.some(d=>d.skills.some(s=>s.id===x.catalog_id)))&&x.type===q.type&&!used.has(x.id));
    const preferred=candidates.filter(x=>hard?x.difficulty==='Hard':x.difficulty!=='Hard');
    const replacement=pick(preferred.length?preferred:candidates,1)[0];
    if(replacement)used.add(replacement.id);
    return replacement||(db?null:q);
  }));
  if(questions.some(q=>!q))return null;
  if(number===1){
    const illustrated=['mc','short'].map(type=>questions.find(q=>(q.figure||q.image)&&q.type===type)).filter(Boolean);
    return [...illustrated,...questions.filter(q=>!illustrated.includes(q))];
  }
  return pick(questions,22);
}
async function start(){
  if(!studentSession||page!=='setup')return;
  const session=studentSession;
  const chosen=[...document.querySelectorAll('[name=topic]:checked')].map(x=>x.value);
  const notice=document.querySelector('#setup-error');
  if(!sat()&&!chosen.length){notice.textContent='Chọn ít nhất một chương.';return;}
  const settings={track,grade,duration,domain,selectedClass,selectedSkill};
  if(busy)return;
  busy=true;
  notice.textContent=say('Đang tải ngân hàng câu hỏi…','Loading question bank…');
  try{if(!await verifyExam())return;await loadBank();}catch{notice.textContent=say('Không tải được ngân hàng. Hãy thử lại.','Could not load the question bank. Try again.');return;}finally{busy=false;}
  if(session!==studentSession||page!=='setup'||track!==settings.track||grade!==settings.grade||duration!==settings.duration||domain!==settings.domain||selectedClass!==settings.selectedClass||selectedSkill!==settings.selectedSkill)return;
  const used=new Set();
  const leaves=catalogLeaves();
  const chosenChapters=new Set(leaves.filter(x=>chosen.includes(x.id)).map(x=>x.topic));
  const allSelected=document.querySelectorAll('[name=topic]').length===chosen.length;
  const questions=sat()?satModule(1,false,domain,[],selectedSkill):Object.entries(vnFormats[duration]).flatMap(([type,count])=>Array.from({length:count},(_,i)=>{
    const topic=chosen[i%chosen.length];
    const candidates=liveQuestions().filter(x=>x.track==='vn'&&x.grade===grade&&(x.catalog_id?chosen.includes(x.catalog_id):(allSelected||chosenChapters.has(x.topic)||chosen.includes(x.topic)))&&x.type===type&&!used.has(x.id));
    const preferred=candidates.filter(x=>(x.catalog_id??x.topic)===topic);
    const q=pick(preferred.length?preferred:candidates,1)[0];
    if(q)used.add(q.id);
    return q||(db?null:makeVn(grade,topic,i,type));
  }));
  const second=sat()&&questions?[satModule(2,false,domain,questions,selectedSkill),satModule(2,true,domain,questions,selectedSkill)]:null;
  if(!questions||questions.some(q=>!q)||(sat()&&(!second||second.some(module=>!module)))){
    notice.textContent=shortage(chosen,allSelected)||say('Ngân hàng chưa đủ câu theo loại và chương đã chọn. Chọn thêm chương hoặc thử cấu hình ngắn hơn.','The bank does not have enough questions of each type for this scope. Try a different scope or ask the administrator to add questions.');
    return;
  }
  run={attemptId:crypto.randomUUID(),studentId:studentSession?.id??null,track,domain,skill:selectedSkill,duration,second,questions,index:0,module:1,end:Date.now()+(sat()?35:duration)*60000,answers:{},flags:{},eliminated:{},notes:{},highlights:{},hidden:false};
  persist();exam();
}
function persist(){save('studio-run',run)}
function answered(q,a){return q.type==='tf'?Array.isArray(a)&&a.some(v=>typeof v==='boolean'):a!==undefined&&a!=='';}
function numeric(value){const v=String(value).trim().replace(',','.');if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\/[+-]?(?:\d+(?:\.\d*)?|\.\d+))?$/.test(v))return NaN;const [p,d=1]=v.split('/');return Number(p)/Number(d);}
function points(q,a,route=track){if(!answered(q,a))return 0;if(q.type==='tf')return [0,.1,.25,.5,1][q.answer.filter((v,i)=>v===a[i]).length];if(q.type==='short'&&route==='sat')return String(q.answer).split(';').some(key=>satMatches(a,key))?1:0;if(q.type==='short')return !String(q.answer).includes(';')&&Number.isFinite(numeric(a))&&Math.abs(numeric(a)-numeric(q.answer))<1e-8?1:0;return a===q.answer?1:0;}
const part=q=>q.type==='mc'?'I':q.type==='tf'?'II':'III';
function satResponse(value){
  const text=String(value??'').trim();
  const limit=text.startsWith('-')?6:5;
  if(text.length>limit||! /^-?(?:\d+(?:\.\d+)?|\.\d+|\d+\/\d+)$/.test(text))return null;
  const number=numeric(text);
  return Number.isFinite(number)?{text,number}:null;
}
function satMatches(value,expected){
  const response=satResponse(value);
  const exact=numeric(expected);
  if(!response||!Number.isFinite(exact))return false;
  const equal=(a,b)=>Math.abs(a-b)<1e-10;
  if(equal(response.number,exact))return true;
  if(!response.text.includes('.'))return false;
  const magnitude=Math.abs(exact);
  const full=String(magnitude);
  if(!full.includes('e')&&full.replace(/^0\./,'.').length<=5)return false;
  const whole=response.text.replace(/^-/,'').split('.')[0];
  const precision=Math.min(4,4-whole.length);
  if(precision<1)return false;
  const factor=10**precision;
  const scaled=magnitude*factor;
  return [Math.floor(scaled+1e-9),Math.round(scaled)].some(n=>equal(response.number,Math.sign(exact)*n/factor));
}
function choiceControls(q,i,answer){
  return q.choices.map((value,j)=>{
    const letter='ABCD'[j];
    const eliminated=run.eliminated[i]?.includes(j)??false;
    const label=eliminated?say('Khôi phục phương án ','Restore option '):say('Loại phương án ','Eliminate option ');
    return `<div class="option">
      <button data-go="answer:${j}" class="choice-button ${answer===value?'selected':''} ${eliminated?'eliminated':''}" aria-pressed="${answer===value}" ${eliminated?'disabled':''}><span class="choice-letter">${letter}</span><span class="choice-value">${richText(value)}</span></button>
      <button data-go="eliminate:${j}" class="choice-eliminator" aria-pressed="${eliminated}" aria-label="${label+letter}" title="${label+letter}"><s aria-hidden="true">${letter}</s></button>
    </div>`;
  }).join('');
}
function truthControls(q,i,answer){
  const rows=q.statements.map((statement,j)=>`<tr><th scope="row">${'abcd'[j]}) ${richText(statement)}</th>${[true,false].map(value=>`<td><label class="truth-box"><input type="radio" name="truth-${i}-${j}" data-truth="${j}" value="${value}" aria-label="Ý ${'abcd'[j]}, ${value?'Đúng':'Sai'}" ${answer?.[j]===value?'checked':''}><span aria-hidden="true">✓</span></label></td>`).join('')}</tr>`).join('');
  return '<table class="truth-table"><thead><tr><th scope="col">Mệnh đề</th><th scope="col">Đúng</th><th scope="col">Sai</th></tr></thead><tbody>'+rows+'</tbody></table>';
}
function shortControls(answer){
  if(!sat()){
    const chars=Array.isArray(answer)?answer:[...String(answer??'').replace('.',',')];
    return '<fieldset class="short-grid"><legend>Đáp số</legend><div>'+Array.from({length:4},(_,i)=>`<input data-short-cell="${i}" maxlength="1" inputmode="text" aria-label="Ô ${i+1}" value="${esc(chars[i]??'')}">`).join('')+'</div><p class="muted">Điền từ trái sang phải. Dấu trừ và dấu phẩy mỗi dấu chiếm một ô.</p></fieldset>';
  }
  return `<label>Your answer <input id="short" maxlength="6" autocomplete="off" spellcheck="false" value="${esc(answer)}" aria-describedby="answer-preview sat-format"></label>
    <div class="answer-preview"><strong>Answer Preview:</strong> <output id="answer-preview" for="short" aria-live="polite"></output></div>
    <p id="sat-format" class="muted" role="status"></p>
    <details class="spr-directions"><summary>Student-produced response directions</summary>
      <ul><li>Enter one answer. Use up to 5 characters for a nonnegative answer or 6 including the minus sign.</li><li>Use an integer, a decimal, or a fraction. For a mixed number, use an improper fraction or a decimal.</li><li>If a fraction does not fit, enter the decimal. If the decimal does not fit, round or truncate using the available digits.</li><li>Leave out spaces, commas, currency and percent symbols.</li></ul>
      <table><thead><tr><th>Answer</th><th>Accepted examples</th><th>Examples without credit</th></tr></thead><tbody><tr><td>3.5</td><td>3.5, 3.50, 7/2</td><td>3 1/2</td></tr><tr><td>2/3</td><td>2/3, .6666, .6667, 0.666, 0.667</td><td>.66, .67</td></tr><tr><td>−1/3</td><td>-1/3, -.3333, -0.333</td><td>-.33, -0.33</td></tr></tbody></table>
    </details>`;
}
function writeShortCells(){
  const chars=[...app.querySelectorAll('[data-short-cell]')].map(cell=>cell.value);
  const last=chars.findLastIndex(Boolean);
  run.answers[run.index]=last<0?'':chars.slice(0,last+1).map(x=>x||' ').join('');
  persist();
}
function exam(){page='exam';track=run.track;if(run.mode==='quick'){quickQuestion();return;}const i=run.index,q=run.questions[i],a=run.answers[i],lo=sat()?(run.module-1)*22:0,hi=sat()?lo+22:run.questions.length;let controls='';
if(q.type==='mc')controls=choiceControls(q,i,a);
if(q.type==='tf')controls=truthControls(q,i,a);
if(q.type==='short')controls=shortControls(a);
draw('<div class="toolbar"><strong>'+say('Phần '+part(q),'Module '+run.module)+'</strong><span id="timer" role="timer"></span>'+btn(run.hidden?say('Hiện giờ','Show timer'):say('Ẩn giờ','Hide timer'),'clock')+(sat()?btn('Reference','reference')+btn('Note','note')+btn('Highlight','highlight')+btn('Line reader','reader'):'')+'<span id="warning" aria-live="polite"></span></div>'+(sat()?'':'<div class="actions">'+['I','II','III'].map(p=>btn('Phần '+p,'jump:'+run.questions.findIndex(x=>part(x)===p))).join('')+'</div>')+'<section class="panel question"><div class="actions"><strong>'+say('Câu '+(i+1)+' / '+hi,'Question '+(i-lo+1)+' / 22')+'</strong>'+btn(run.flags[i]?say('Đã đánh dấu','Marked for review'):say('Đánh dấu','Mark for Review'),'flag',run.flags[i]?'marked':'')+'</div><p id="prompt" style="margin-top:15px">'+(run.highlights[i]?'<mark>'+richText(q.q)+'</mark>':richText(q.q))+'</p>'+(q.figure?'<div class="figure">'+q.figure+'</div>'+btn(say('Phóng to hình','Expand figure'),'figure'):'')+(q.image?'<img class="figure" src="'+esc(q.image)+'" alt="Question diagram">'+btn(say('Phóng to hình','Expand figure'),'figure'):'')+controls+'</section>'+questionMap(run)+'<div class="actions">'+(i>lo?btn(say('Câu trước','Previous'),'jump:'+(i-1)):'')+(i+1<hi?btn(say('Câu tiếp','Next'),'jump:'+(i+1)):'')+btn(say('Nộp bài','Submit Module'),'submit','primary')+btn(say('Tạm dừng','Exit to Home'),'home')+'</div>');tick();preview();}
function preview(){
  const input=document.querySelector('#short'),out=document.querySelector('#answer-preview');
  if(!input||!out)return;
  const value=input.value.trim(),response=satResponse(value);
  input.setAttribute('aria-invalid',String(Boolean(value&&!response)));
  document.querySelector('#sat-format').textContent=value&&!response?'Enter an integer, decimal, or fraction within the character limit.':'';
  out.textContent=response?response.text:'—';
  if(response?.text.includes('/')){
    const [numerator,denominator]=response.text.replace(/^-/,'').split('/');
    out.textContent=math((response.text.startsWith('-')?'-':'')+'\\frac{'+numerator+'}{'+denominator+'}');
    window.MathJax?.typesetPromise?.([out]).catch(()=>{});
  }
}
function tick(){if(page!=='exam'||!run||run.mode==='quick')return;const left=Math.max(0,Math.ceil((run.end-Date.now())/1000));document.querySelector('#timer').textContent=run.hidden?'':Math.floor(left/60)+':'+String(left%60).padStart(2,'0');document.querySelector('#warning').textContent=left<=300?say('Còn không quá 5 phút','5 minutes or less remaining'):'';if(!left)submit();}
setInterval(tick,1000);
function submit(){if(modal.open)modal.close();if(run.mode!=='quick'&&sat()&&run.module===1){const correct=run.questions.reduce((s,q,i)=>s+points(q,run.answers[i]),0);run.questions.push(...(run.second?.[correct>=15?1:0]??satModule(2,correct>=15)??[]));delete run.second;run.module=2;run.index=22;run.end=Date.now()+35*60000;persist();exam();return;}const result={...run,date:Date.now()};lastResult=result;run=null;persist();tab='all';results(-1);void persistStudentResult(result);}
function vnScore(r){
  return Object.entries(vnWeights).reduce((total,[type,weight])=>{
    const group=r.questions.map((q,i)=>({q,i})).filter(({q})=>q.type===type);
    return total+(group.length?weight*group.reduce((sum,{q,i})=>sum+points(q,r.answers[i]),0)/group.length:0);
  },0);
}
function results(index){page='results';const r=index===-1?lastResult:studentSession?history[index]:null;if(!r){go('student');return;}reviewResult=r;track=r.track;const score=r.questions.reduce((s,q,i)=>s+points(q,r.answers[i]),0);const groups=new Map();r.questions.forEach((q,i)=>{for(const k of [q.topic,...(sat()&&r.mode!=='quick'?['Module '+(i<22?1:2)]:[])]){const v=groups.get(k)||[0,0];v[0]+=points(q,r.answers[i])===1;v[1]++;groups.set(k,v);}});
draw((studentSession?studentTabs('records'):btn('Trang chủ / Home','home'))+(index===-1?'<p id="result-save-status" role="status">'+(r.saved?'Đã lưu vào Bài đã làm.':r.studentId?(r.saveFailed?'Chưa lưu được kết quả. '+btn('Thử lưu lại','retry-result'):''):say('Bài luyện khách không lưu vào lịch sử.','Guest practice is not saved.'))+'</p>':'')+'<div class="split"><section class="panel"><h2>'+say('Kết quả','Score Breakdown')+'</h2><div class="score">'+(sat()||r.mode==='quick'?Number(score.toFixed(2))+' / '+r.questions.length:vnScore(r).toFixed(2)+' / 10')+'</div><p>'+say('Tỷ lệ câu đạt trọn điểm','Overall accuracy')+' · '+Math.round(r.questions.filter((q,i)=>points(q,r.answers[i])===1).length/r.questions.length*100)+'%</p></section><section class="panel"><table><thead><tr><th>'+say('Nội dung','Group')+'</th><th>'+say('Đúng','Correct')+'</th><th>%</th></tr></thead><tbody>'+[...groups].map(([k,[a,b]])=>'<tr><td>'+esc(k)+'</td><td>'+a+' / '+b+'</td><td>'+Math.round(a/b*100)+'%</td></tr>').join('')+'</tbody></table></section></div>'+questionMap(r,true)+resultPractice(r)+'<section class="panel" style="margin-top:18px"><h2>'+say('Xem lại từng câu','Review Questions')+'</h2><div class="actions">'+[['all',say('Tất cả','All')],['correct',say('Đúng','Correct')],['wrong',say('Sai hoặc đúng một phần','Incorrect or partial')],['blank',say('Bỏ trống','Unanswered')]].map(([k,v])=>btn(v,'filter:'+index+':'+k,tab===k?'selected':'')).join('')+'</div>'+r.questions.map((q,i)=>{const a=r.answers[i],p=points(q,a),status=!answered(q,a)?'blank':p===1?'correct':'wrong';if(tab!=='all'&&tab!==status)return '';const format=v=>Array.isArray(v)?v.map(x=>x===true?say('Đúng','True'):x===false?say('Sai','False'):'–').join(' / '):richText(v??'–');return '<details class="'+status+'"><summary>'+say('Câu ','Question ')+(i+1)+' · '+esc(q.topic)+'</summary><p>'+richText(q.q)+'</p>'+(q.figure?'<div class="figure">'+q.figure+'</div>':'')+(q.image?'<img class="figure" src="'+esc(q.image)+'" alt="Question diagram">':'')+'<p>'+say('Đã chọn','Your answer')+' · '+format(a)+'<br>'+say('Đáp án','Correct answer')+' · '+format(q.answer)+'</p><p>'+richText(q.why)+'</p>'+(studentSession&&q.id?btn(say('Báo lỗi','Report question'),'report:'+i):'')+'</details>';}).join('')+'</section>');}
let editingQuestion=null;
let deletingQuestions=false;
const bankFilters={search:'',topic:'',lesson:'',difficulty:'',status:''};
let bankSearchInput='';
const bankSelection=new Set();
const bankTypes={mc:'Nhiều lựa chọn',tf:'Đúng/Sai',short:'Trả lời ngắn'};
const bankTopic=q=>JSON.stringify([q.track,q.grade,q.topic]);
const editIcon='<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z"/></svg>';
const trashIcon='<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6h18M9 6V3h6v3m4 0-1 15H6L5 6m5 4v7m4-7v7"/></svg>';
function matchesBankFilters(q){
  const query=bankFilters.search;
  return (!query||searchText(q.source).includes(query)||searchText(q.q).includes(query))&&(!bankFilters.status||q.status===bankFilters.status)&&(!bankFilters.topic||bankTopic(q)===bankFilters.topic)
    &&(!bankFilters.lesson||(q.catalog_id??'legacy')===bankFilters.lesson)
    &&(!bankFilters.difficulty||q.difficulty===bankFilters.difficulty);
}
function bankSelectionStatus(){
  const section=document.querySelector('#saved-bank');
  if(!section)return;
  const rows=bank.filter(matchesBankFilters);
  const count=rows.filter(q=>bankSelection.has(q.id)).length;
  const all=section.querySelector('#bank-all');
  all.checked=rows.length>0&&count===rows.length;
  all.indeterminate=count>0&&count<rows.length;
  all.disabled=!rows.length||deletingQuestions;
  section.querySelector('#bank-delete').disabled=!count||deletingQuestions;
  section.querySelector('#bank-delete-count').textContent='Xóa đã chọn ('+count+')';
}
function renderSavedBank(message=''){
  const section=document.querySelector('#saved-bank');
  if(!section)return;
  const leaves=catalogLeaves();
  const paths=new Map(leaves.map(x=>[x.id,x.path]));
  const topics=new Map(bank.map(q=>[bankTopic(q),q.track==='vn'?'Lớp '+q.grade+' / '+q.topic:q.topic]));
  const topicRows=bank.filter(q=>!bankFilters.topic||bankTopic(q)===bankFilters.topic);
  const lessons=new Map(topicRows.map(q=>[q.catalog_id??'legacy',paths.get(q.catalog_id)??(q.catalog_id?'Mục đã bỏ · '+q.topic:'Chưa gắn bài/skill')]));
  if(!topics.has(bankFilters.topic))bankFilters.topic='';
  if(!lessons.has(bankFilters.lesson))bankFilters.lesson='';
  const options=(items,selected)=>[...items].map(([value,label])=>'<option value="'+esc(value)+'" '+(selected===value?'selected':'')+'>'+esc(label)+'</option>').join('');
  const duplicates=bankDuplicates();
  const rows=sortBankRows(bank.filter(matchesBankFilters),leaves,bankOrder);
  section.innerHTML=`<h2>Câu đã lưu <small>(${rows.length}/${bank.length})</small></h2>
    <form id="bank-search"><label>Tìm theo nguồn, ID SAT hoặc nội dung đề <input type="search" name="query" value="${esc(bankSearchInput)}" placeholder="Ví dụ: 93954cfa"></label><button class="primary">Tìm kiếm</button><button type="button" data-go="clear-search">Xóa tìm kiếm</button></form>
    <div class="bank-filters">
      <label>Sắp xếp theo <select data-bank-order="key">${options([['grade','Lớp'],['chapter','Chương / Domain'],['lesson','Bài / Skill'],['date','Thời gian nhập']],bankOrder.key)}</select></label>
      <label>Thứ tự <select data-bank-order="direction">${options([['asc',bankOrder.key==='date'?'Cũ nhất trước':'Tăng dần'],['desc',bankOrder.key==='date'?'Mới nhất trước':'Giảm dần']],bankOrder.direction)}</select></label>
      <label>Trạng thái <select data-bank-filter="status"><option value="">Tất cả</option>${options(Object.entries(statusNames),bankFilters.status)}</select></label><label>Chương / domain <select data-bank-filter="topic"><option value="">Tất cả</option>${options(topics,bankFilters.topic)}</select></label>
      <label>Bài / skill <select data-bank-filter="lesson"><option value="">Tất cả</option>${options(lessons,bankFilters.lesson)}</select></label>
      <label>Mức độ <select data-bank-filter="difficulty"><option value="">Tất cả</option>${options(['Easy','Medium','Hard'].map(x=>[x,x]),bankFilters.difficulty)}</select></label>
    </div>
    <div class="bank-toolbar"><label><input id="bank-all" type="checkbox"> Chọn tất cả câu đang lọc</label><button id="bank-delete" class="bank-danger bank-action" data-go="bank-delete">${trashIcon}<span id="bank-delete-count"></span></button></div>
    ${bulkPanel()}<p id="bank-feedback" role="status">${esc(message)}</p>`+
    (rows.length?'<div class="bank-head" aria-hidden="true"><span></span><b>Câu hỏi</b><b>Nguồn / ID SAT</b><b>Thời gian nhập (VN)</b><b>Thao tác</b></div>'+rows.map(q=>`<article class="bank-row">
      <input type="checkbox" data-bank-select="${esc(q.id)}" aria-label="Chọn câu hỏi" ${bankSelection.has(q.id)?'checked':''} ${deletingQuestions?'disabled':''}>
      <details><summary>${esc(q.q.replace(mediaPattern,'[Hình]').slice(0,110))}</summary><p>${esc(paths.get(q.catalog_id)??q.topic)} · ${esc(statusNames[q.status])} · ${esc(q.difficulty)} · ${esc(bankTypes[q.type]??q.type)}</p><p class="bank-question">${richText(q.q)}</p></details>
      <span class="bank-source">${esc(q.source||"—")}</span><time datetime="${esc(q.created_at)}">${Number.isFinite(Date.parse(q.created_at))?esc(dateLabel.format(new Date(q.created_at))):"—"}</time>
      <div class="bank-row-actions">${notesCell(q,duplicates)}
        ${adminIcon('preview','Xem trước câu hỏi','data-go','bank-preview:'+q.id)}
        ${adminIcon('history','Lịch sử chỉnh sửa','data-go','versions:'+q.id)}
        ${adminIcon('edit','Sửa câu hỏi','data-go','edit-question:'+q.id,deletingQuestions)}
        ${adminIcon('remove','Xóa câu hỏi','data-go','remove:'+q.id,deletingQuestions)}
      </div></article>`).join(''):'<p>Không có câu hỏi phù hợp.</p>');
  bankSelectionStatus();
  window.MathJax?.typesetPromise?.([section]).catch(()=>{});
}
function openQuestionEditor(id){
  const q=bank.find(row=>row.id===id);
  const f=document.querySelector('#question-form');
  if(isAdmin&&q)showAdminView('editor');
  if(!isAdmin||!q||!f||f.querySelector('button[type="submit"]').disabled)return;
  resetMedia();
  editingQuestion=q;
  f.reset();
  f.elements.status.value=q.status;
  f.elements.track.value=q.track;
  if(q.grade)f.elements.grade.value=q.grade;
  f.elements.type.value=q.type;
  f.elements.difficulty.value=q.difficulty;
  fields();
  const target=f.elements.topic;
  if([...target.options].some(option=>option.value===q.catalog_id))target.value=q.catalog_id;
  else {
    const old=document.createElement('option');
    old.value='existing';
    old.textContent=q.topic+' (phân loại hiện có)';
    target.prepend(old);
    target.value='existing';
  }
  f.elements.source.value=q.source||'';
  f.elements.q.value=q.q;
  f.elements.why.value=q.why??'';
  q.choices?.forEach((choice,i)=>{if(f.elements['option'+i])f.elements['option'+i].value=choice;});
  if(q.type==='mc')f.elements.correct.value=String(q.choices.indexOf(q.answer));
  if(q.type==='tf')q.statements.forEach((statement,i)=>{
    if(!f.elements['statement'+i])return;
    f.elements['statement'+i].value=statement;
    f.elements['truth'+i].value=String(q.answer[i]);
  });
  if(q.type==='short')f.elements.answer.value=q.answer;
  f.querySelector('h2').textContent='Chỉnh sửa câu hỏi';
  f.querySelector('button[type="submit"]').textContent='Lưu thay đổi';
  f.querySelector('[data-go="cancel-edit"]').hidden=false;
  f.querySelector('#legacy-image').hidden=!q.image;
  f.querySelector('#form-feedback').textContent='';
  f.scrollIntoView({block:'start'});
  f.elements.q.focus({preventScroll:true});
}
async function deleteBankQuestions(ids){
  if(!isAdmin||deletingQuestions||!ids.length)return;
  if(!confirm('Xóa vĩnh viễn '+ids.length+' câu hỏi khỏi ngân hàng?'))return;
  deletingQuestions=true;
  renderSavedBank('Đang xóa…');
  const removed=new Set();
  let failed=false;
  try{
    for(let offset=0;offset<ids.length;offset+=100){
      const batch=ids.slice(offset,offset+100);
      const {data,error}=await db.from('studio_questions').delete().in('id',batch).select('id');
      if(error)throw error;
      for(const row of data)removed.add(row.id);
      if(data.length!==batch.length)failed=true;
    }
  }catch{failed=true;}
  finally{
    deletingQuestions=false;
    bank=bank.filter(q=>!removed.has(q.id));
    removed.forEach(id=>bankSelection.delete(id));
    if(editingQuestion&&removed.has(editingQuestion.id))admin();
    renderSavedBank('Đã xóa '+removed.size+'/'+ids.length+' câu.'+(failed?' Một số câu chưa xóa được. Hãy tải lại ngân hàng trước khi thử lại.':''));
  }
}
app.addEventListener('change',event=>{
  const target=event.target;
  if(target.dataset.bankFilter){
    const filter=target.dataset.bankFilter;
    bankFilters[filter]=target.value;
    if(filter==='topic')bankFilters.lesson='';
    bankSelection.clear();
    renderSavedBank();
    document.querySelector('[data-bank-filter="'+filter+'"]')?.focus();
  }else if(target.id==='bank-all'){
    for(const q of bank.filter(matchesBankFilters)){
      if(target.checked)bankSelection.add(q.id);
      else bankSelection.delete(q.id);
    }
    renderSavedBank();
    document.querySelector('#bank-all')?.focus();
  }else if(target.dataset.bankSelect){
    if(target.checked)bankSelection.add(target.dataset.bankSelect);
    else bankSelection.delete(target.dataset.bankSelect);
    bankSelectionStatus();
  }
});
function questionEditor(){
  const rows=Array.from({length:4},(_,i)=>{
    const letter='ABCD'[i];
    return `<div class="answer-row">
      <label class="answer-pick" title="Chọn ${letter} là đáp án đúng">
        <input type="radio" name="correct" value="${i}" required aria-label="Chọn ${letter} là đáp án đúng">
        <span aria-hidden="true">✓</span>
      </label>
      <label class="answer-text"><span>${letter}</span><input name="option${i}" placeholder="Phương án ${letter}" required aria-label="Phương án ${letter}"></label>${imageButton("option"+i,"phương án "+letter)}
    </div>`;
  }).join('');
  const statements=Array.from({length:4},(_,i)=>{
    const letter='abcd'[i];
    return `<div class="statement-row">
      <label class="answer-text"><span>${letter})</span><input name="statement${i}" placeholder="Mệnh đề ${letter}" required aria-label="Mệnh đề ${letter}"></label>${imageButton("statement"+i,"mệnh đề "+letter)}
      <label><span class="visually-hidden">Đáp án mệnh đề ${letter}</span><select name="truth${i}" required><option value="">Chọn</option><option value="true">Đúng</option><option value="false">Sai</option></select></label>
    </div>`;
  }).join('');
  return `<form id="question-form" class="question-editor">
    <h2>Soạn câu hỏi</h2>
    ${ocrPanel()}
    <section class="editor-content"><label>Dán một câu từ Word hoặc LaTeX<textarea name="pastedQuestion" rows="5" placeholder="Dán đề bài, phương án, đáp án và lời giải"></textarea></label>
      <p class="muted">Với Word, đặt từng phương án và dòng Lời giải ở đầu dòng riêng. Với LaTeX, có thể dán trực tiếp đoạn ex_test.</p>
      <button type="button" data-go="recognize">Nhận diện</button><p role="status" id="recognize-status"></p></section>
    <div class="editor-settings">
      <label>Lộ trình <select name="track"><option value="vn">THPT</option><option value="sat">SAT</option></select></label>
      <label>Khối lớp <select name="grade"><option>10</option><option>11</option><option selected>12</option></select></label>
      <label>Mức độ <select name="difficulty"><option>Easy</option><option selected>Medium</option><option>Hard</option></select></label>
      <label>Dạng câu <select name="type"><option value="mc">Nhiều lựa chọn</option><option value="tf">Đúng/Sai</option><option value="short">Trả lời ngắn</option></select></label>
      <label>Trạng thái <select name="status">${optionsFor(Object.entries(statusNames),x=>x[0],x=>x[1])}</select></label><label class="editor-topic">Bài hoặc skill <select name="topic" required></select></label>
    </div>
    <div class="editor-content">
      <label>Nguồn / ID SAT <input name="source" placeholder="93954cfa hoặc tên nguồn"></label><label>Đề bài <textarea name="q" rows="3" maxlength="12000" placeholder="Nhập đề bài" required></textarea></label>
      ${imageButton('q','đề bài')}<p class="muted editor-hint">Đề bài tối đa 3 hình. Bảng và hình được chèn tại con trỏ.</p>
      <p class="muted editor-hint">Dùng <code>$...$</code> cho công thức toán.</p>
      <fieldset data-answer-type="mc"><legend>Phương án</legend><p class="muted editor-hint">Chọn vòng tròn cạnh phương án đúng.</p>${rows}</fieldset>
      <fieldset data-answer-type="tf" hidden disabled><legend>Mệnh đề và đáp án</legend>${statements}</fieldset>
      <fieldset data-answer-type="short" hidden disabled><legend>Đáp số</legend><label><span class="visually-hidden">Đáp số</span><input name="answer" aria-describedby="short-key-hint" placeholder="Ví dụ: -3/2" required></label><p id="short-key-hint" class="muted"></p></fieldset>
      <label>Lời giải <textarea name="why" rows="2" placeholder="Nhập lời giải"></textarea></label>
      ${imageButton('why','lời giải')}
      <label id="legacy-image" hidden><input type="checkbox" name="removeLegacy"> Bỏ hình minh họa cũ ở cuối đề bài</label>
    </div>
    <div class="editor-footer"><button type="button" data-go="preview-editor">Xem trước</button><button type="submit" class="primary">Lưu câu hỏi</button><button type="button" data-go="cancel-edit" hidden>Hủy sửa</button><p id="form-feedback" role="status"></p></div>
  </form>`;
}
function updateAnswerFields(form){
  form.querySelector('#short-key-hint').textContent=form.elements.track.value==='sat'
    ? 'SAT: một giá trị chấp nhận các cách viết tương đương (3.5 và 7/2). Nếu đề có nhiều nghiệm đúng, ngăn cách bằng dấu chấm phẩy, ví dụ -2; 5.'
    : 'Toán THPT: nhập một đáp án duy nhất, ví dụ -3,5.';
  for(const group of form.querySelectorAll('[data-answer-type]')){
    group.hidden=group.disabled=group.dataset.answerType!==form.elements.type.value;
  }
}
function editorAnswers(data){
  const four=Array.from({length:4},(_,i)=>i);
  if(data.type==='mc'){
    const choices=four.map(i=>formatQuestionMath(data['option'+i]??''));
    if(choices.some(x=>!x)||new Set(choices).size!==4)throw new Error('Nhập bốn phương án khác nhau.');
    const answer=choices[data.correct];
    if(!answer)throw new Error('Chọn một phương án đúng.');
    return {answer,choices,statements:[]};
  }
  if(data.type==='tf'){
    const statements=four.map(i=>formatQuestionMath(data['statement'+i]??''));
    const values=four.map(i=>data['truth'+i]);
    if(statements.some(x=>!x)||values.some(x=>!['true','false'].includes(x)))throw new Error('Nhập bốn mệnh đề và chọn Đúng hoặc Sai cho từng ý.');
    return {answer:values.map(x=>x==='true'),choices:[],statements};
  }
  const answer=shortKey(data.answer,data.track);
  return {answer,choices:[],statements:[]};
}
function fields(){const f=document.querySelector('#question-form'),isSat=f.elements.track.value==='sat',g=Number(f.elements.grade.value);f.elements.grade.disabled=isSat;f.elements.topic.innerHTML=optionsFor(catalogLeaves().filter(x=>x.track===(isSat?'sat':'vn')&&(isSat||x.grade===g)),x=>x.id,x=>x.path);f.elements.type.querySelector('[value=tf]').disabled=isSat;if(isSat&&f.elements.type.value==='tf')f.elements.type.value='mc';updateAnswerFields(f);}
async function openAdmin(){
  page='admin';
  draw('<h1>Ngân hàng câu hỏi</h1><p>Đang kiểm tra quyền truy cập…</p>');
  try{
    isAdmin=await adminStatus();
    if(isAdmin){await loadCatalog();await loadBank();}
  }catch{
    if(page==='admin')draw('<h1>Ngân hàng câu hỏi</h1><p>Không thể xác minh quyền hoặc tải ngân hàng.</p>'+btn('Thử lại','admin'));
    return;
  }
  if(page==='admin')admin();
}
function admin(){
  if(!db){draw('<h1>Ngân hàng câu hỏi</h1><p>Hãy cấu hình Supabase để đăng nhập quản trị và lưu câu hỏi.</p>');return;}
  if(!isAdmin){
    draw('<h1>Đăng nhập quản trị</h1><section class="panel"><form id="login"><label>Email <input type="email" autocomplete="username" value="'+adminEmail+'" readonly></label><label>Mật khẩu <input name="password" type="password" autocomplete="current-password" required></label><button class="primary">Đăng nhập</button><p id="login-status" role="status"></p></form></section>');
    return;
  }
  pendingImport=[];
  editingQuestion=null;
  const panels={bank:'<section class="panel" id="saved-bank"></section>',editor:'<section class="panel">'+questionEditor()+'</section>',tex:texAdmin(),coverage:'<section class="panel">'+coveragePanel()+'</section>',reports:'',catalog:catalogAdmin(),students:studentAdminPanel()};
  draw('<h1>Quản trị Toán Studio</h1>'+btn('Đăng xuất','logout')+'<nav class="admin-nav" aria-label="Quản trị">'+Object.entries(adminTabs).map(([key,label])=>'<button data-admin-tab="'+key+'">'+label+'</button>').join('')+'</nav><p id="catalog-status" role="status">'+esc(catalogNotice)+'</p>'+Object.entries(panels).map(([key,html])=>'<div data-view="'+key+'" hidden>'+html+'</div>').join(''));
  showAdminView(adminView);
  fields();
  renderSavedBank();
}
app.addEventListener('submit',adminImport);
app.addEventListener('submit',studentForms);
app.addEventListener('change',e=>{if(e.target.dataset.truth!==undefined&&run&&page==='exam'){const values=run.answers[run.index]||[null,null,null,null];values[Number(e.target.dataset.truth)]=e.target.value==='true';run.answers[run.index]=values;persist();const button=app.querySelector('.palette [data-go="jump:'+run.index+'"]');button?.classList.add('selected');return;}if(e.target.form?.id==='tex-import'){if(e.target.name==='chapter')importSkills(e.target.form);pendingImport=[];document.querySelector('#tex-preview').innerHTML='';}if(e.target.form?.id==='catalog-manual'&&e.target.name==='track')e.target.form.querySelectorAll('[data-catalog-track]').forEach(x=>x.hidden=x.dataset.catalogTrack!==e.target.value);if(e.target.id==='grade'){selectedClass=e.target.value;setup();}if(e.target.id==='duration'){const selected=[...document.querySelectorAll('[name=topic]')].filter(x=>x.checked).map(x=>x.value);duration=Number(e.target.value);setup();document.querySelectorAll('[name=topic]').forEach(x=>x.checked=selected.includes(x.value));}if(e.target.id==='domain'){domain=e.target.value;selectedSkill='';setup();}if(e.target.id==='skill')selectedSkill=e.target.value;if(e.target.form?.id==='question-form'&&['track','grade'].includes(e.target.name))fields();if(e.target.form?.id==='question-form'&&e.target.name==='type')updateAnswerFields(e.target.form);});
app.addEventListener('input',event=>{
  if(!run||page!=='exam')return;
  const field=event.target;
  if(field.id==='short'){
    field.maxLength=field.value.startsWith('-')?6:5;
    run.answers[run.index]=field.value;
    persist();
    preview();
  }
  if(field.dataset.shortCell!==undefined){
    field.value=field.value.replace(/[−–]/g,'-').replace(/\./g,',').replace(/[^0-9,-]/g,'').slice(0,1);
    writeShortCells();
    if(field.value)field.nextElementSibling?.focus();
  }
});
app.addEventListener('keydown',event=>{
  if(event.target.dataset.shortCell===undefined)return;
  const field=event.target;
  if(event.key==='ArrowLeft'||(event.key==='Backspace'&&!field.value))field.previousElementSibling?.focus();
  if(event.key==='ArrowRight')field.nextElementSibling?.focus();
});
app.addEventListener('paste',event=>{
  if(event.target.dataset.shortCell===undefined)return;
  event.preventDefault();
  const text=event.clipboardData.getData('text').trim().replace(/[−–]/g,'-').replace(/\./g,',');
  if(!/^-?\d+(?:,\d+)?$/.test(text)||text.length>4)return;
  const cells=[...app.querySelectorAll('[data-short-cell]')];
  const start=text.length>1?0:Number(event.target.dataset.shortCell);
  if(text.length>1)cells.forEach(cell=>cell.value='');
  [...text].forEach((char,i)=>cells[start+i].value=char);
  writeShortCells();
  cells[Math.min(3,start+text.length)].focus();
});
app.addEventListener('submit',async e=>{if(e.target.id==='login'){
  e.preventDefault();
  const form=e.target,status=form.querySelector('#login-status');
  const button=form.querySelector('button');
  button.disabled=true;
  try{
    const {error}=await db.auth.signInWithPassword({email:adminEmail,password:form.elements.password.value});
    form.reset();
    if(error){status.textContent='Email hoặc mật khẩu không hợp lệ.';return;}
    await openAdmin();
  }catch{status.textContent='Không thể kết nối. Hãy thử lại.';}finally{button.disabled=false;}
  return;
}
if(e.target.id!=='question-form')return;
e.preventDefault();
if(!isAdmin)return;
const f=e.target,data=Object.fromEntries(new FormData(f)),status=f.querySelector('#form-feedback');
const prefix=splitSource(data.q);
if(prefix.source&&data.source.trim()&&data.source.trim()!==prefix.source){status.textContent='Nguồn trong đề và ô Nguồn / ID SAT khác nhau. Kiểm tra lại trước khi lưu.';return;}
data.source=prefix.source||data.source.trim();data.q=prefix.q;
if(!data.q.trim()){status.textContent='Nhập đề bài.';return;}
let answers;
try{answers=editorAnswers(data);}catch(error){status.textContent=error.message;return;}
const original=editingQuestion;
const image=retainedImage(f);
if(promptImageCount(data.q,image)>3){status.textContent='Đề bài chứa tối đa 3 hình.';return;}
const leaf=data.topic==='existing'&&original?{track:original.track,grade:original.grade,topic:original.topic,id:original.catalog_id}:catalogLeaves().find(x=>x.id===data.topic);
if(!leaf){status.textContent='Hãy chọn bài hoặc skill.';return;}
const record={source:data.source,status:data.status,track:leaf.track,grade:leaf.grade,topic:leaf.topic,catalog_id:leaf.id,difficulty:data.difficulty,type:data.type,q:formatQuestionMath(data.q),why:formatQuestionMath(data.why),...answers,image};
const saveButton=f.querySelector('button[type=submit],button:not([type])');
if(saveButton.disabled)return;
saveButton.disabled=true;
try{
  record.review_flags=reviewFlags(record);
  try{await storeMedia(record);}catch(error){status.textContent=error.message;return;}
  const table=db.from('studio_questions');
  const query=original?table.update(record).eq('id',original.id).eq('version',original.version):table.insert(record);
  const {data:saved,error}=await query.select().single();
  if(error)throw error;
  if(original)bank=bank.map(q=>q.id===saved.id?saved:q);else bank=[...bank,saved];
  if(page==='admin'&&isAdmin&&f.isConnected){
    adminView='editor';catalogNotice='Đã lưu câu hỏi.';admin();
    const next=app.querySelector('#question-form');
    next.elements.track.value=saved.track;
    next.elements.grade.value=String(saved.grade??f.elements.grade.value);
    next.elements.difficulty.value=saved.difficulty;
    fields();
    next.elements.topic.value=saved.catalog_id??'';
    if(!next.elements.topic.value)next.querySelector('#form-feedback').textContent='Bài/skill cũ không còn trong danh mục. Hãy chọn bài cho câu mới.';
    next.elements.pastedQuestion.focus();
  }
}catch{status.textContent='Không lưu được câu hỏi. Tải lại ngân hàng để kiểm tra phiên bản mới nhất.';}finally{saveButton.disabled=false;}});
function reference(){popup('<h2>Math Reference</h2><div class="split"><div>'+triangle('a','b')+'<p>Right triangle '+math('a^2+b^2=x^2')+'</p></div><div><svg width="120" height="110" viewBox="0 0 120 110" role="img" aria-label="Circle with radius r"><circle cx="55" cy="53" r="45" fill="#edf4ff" stroke="#414ba0"/><path d="M55 53H100" stroke="#414ba0"/><text x="75" y="47">r</text></svg><p>Circle '+math('A=\\pi r^2')+' · '+math('C=2\\pi r')+'</p></div></div><p>Triangle area '+math('A=\\frac12 bh')+'</p><p>Rectangle area '+math('A=lw')+'</p><p>Cylinder volume '+math('V=\\pi r^2h')+'</p>');}
async function go(action){navigatePath(action);const [key,arg,extra]=action.split(':');if(key==='clear-search'&&isAdmin){bankSearchInput=bankFilters.search='';bankSelection.clear();renderSavedBank();return;}
if(key==='records'){await studentRecords();return;}
if(key==='inspect'){inspectAnswer(reviewResult,Number(arg));return;}
if(key==='admin-records'){await showStudentRecords(arg,Number(extra)||0);return;}
if(key==='admin-review'){showAdminReview(Number(arg));return;}
if(key==='admin-inspect'&&isAdmin){inspectAnswer(adminReview,Number(arg));return;}
if(key==='recognize'&&isAdmin){recognizeIntoEditor(document.querySelector('#question-form'));return;}if(key==='bank-preview'&&isAdmin){const q=bank.find(row=>row.id===arg);if(q)fullPreview(q);return;}if(key==='preview-editor'){previewEditor();return;}
if(key==='bank-note'&&isAdmin){editBankNote(arg);return;}
if(key==='versions'&&isAdmin){await questionVersions(arg);return;}
if(key==='report'){reportQuestion(Number(arg));return;}
if(key==='quick-retry'&&reviewResult){beginQuick(reviewResult.questions.filter((q,i)=>points(q,reviewResult.answers[i],reviewResult.track)<1));return;}
if(key==='quick-skill'){await startSkill(arg,5,document.querySelector('#review-notice'));return;}
if(run?.mode==='quick'&&page==='exam'){
  if(key==='quick-check'){checkQuick();return;}
  if(key==='quick-next'&&run.checked[run.index]){if(run.questions.every((_,i)=>run.checked[i]))submit();else{const next=run.questions.findIndex((_,i)=>i>run.index&&!run.checked[i]);run.index=next>=0?next:run.questions.findIndex((_,i)=>!run.checked[i]);persist();exam();}return;}
}
if(key==='home'){page='home';track='vn';home();return;}if(key==='vn'||key==='sat'){page='setup';track=key;try{await Promise.all([loadCatalog(),loadBank()]);}catch(error){if(page==='setup'&&track===key)draw('<p>'+esc(error.message)+'</p>'+btn('Thử lại',key)+btn('Trang chủ','home'));return;}if(page==='setup'&&track===key)setup();return;}if(key==='catalog-delete'){await deleteCatalog(arg);return;}if(key==='student'){await openStudent(Number(arg)||0);return;}
if(key==='student-logout'){
  if(!studentSession){await go('home');return;}
  try{await studentRpc('studio_student_logout',{p_token:studentSession.token});}
  catch{alert('Không thể kết nối để đăng xuất. Hãy thử lại.');return;}
  setStudentSession(null);history=[];lastResult=null;await go('home');return;
}
if(key==='retry-result'){
  if(studentSession?.id===lastResult?.studentId){await persistStudentResult(lastResult);return;}
  await openStudent();return;
}
if(key==='student-list'){await listStudents();return;}
if(key==='reset-pin'){
  if(isAdmin&&confirm('Cấp PIN mới và kết thúc các phiên đăng nhập của học sinh này?'))await issuePin(null,arg);
  return;
}if(key==='admin'){adminView='bank';await openAdmin();return;}if(key==='logout'){const {error}=await db.auth.signOut();if(error){alert('Không thể đăng xuất. Hãy thử lại.');return;}isAdmin=false;bankSelection.clear();admin();return;}if(key==='result'){tab='all';results(Number(arg));return;}if(key==='filter'){tab=extra;results(Number(arg));return;}if(key==='edit-question'){openQuestionEditor(arg);return;}
if(key==='cancel-edit'){if(editingQuestion)admin();return;}
if(key==='remove'){await deleteBankQuestions(bank.some(q=>q.id===arg)?[arg]:[]);return;}
if(key==='bank-delete'){await deleteBankQuestions(bank.filter(q=>matchesBankFilters(q)&&bankSelection.has(q.id)).map(q=>q.id));return;}
if(key==='start'){if(!run||confirm(say('Thay bài đang làm bằng bài mới?','Replace the current practice attempt?')))start();return;}if(!run)return;if(key==='resume'){const candidate=run;if(canResume(candidate)&&(candidate.mode==='quick'||await verifyExam())&&run===candidate)exam();return;}const i=run.index,q=run.questions[i],j=Number(arg);
switch(key){
case 'answer':if(!run.eliminated[i]?.includes(j))run.answers[i]=q.choices[j];break;
case 'jump':{const lo=sat()&&run.mode!=='quick'?(run.module-1)*22:0;if(j>=lo&&j<(sat()&&run.mode!=='quick'?lo+22:run.questions.length))run.index=j;break;}
case 'flag':run.flags[i]=!run.flags[i];break;
case 'eliminate':{const a=run.eliminated[i]||[];run.eliminated[i]=a.includes(j)?a.filter(x=>x!==j):[...a,j];if(run.eliminated[i].includes(j)&&run.answers[i]===q.choices[j])delete run.answers[i];persist();exam();app.querySelector('[data-go="eliminate:'+j+'"]')?.focus();return;}
case 'clock':run.hidden=!run.hidden;break;
case 'highlight':run.highlights[i]=!run.highlights[i];break;
case 'note':popup('<h2>Question note</h2><label>Private note<textarea id="note-text">'+esc(run.notes[i])+'</textarea></label>');document.querySelector('#note-text').oninput=e=>{run.notes[i]=e.target.value;persist();};return;
case 'reader':popup('<h2>Line reader</h2><p>'+richText(q.q)+'</p>');return;
case 'reference':reference();return;
case 'figure':popup('<div class="large">'+(q.figure||'<img id="zoom-img" style="max-width:100%" src="'+esc(q.image)+'" alt="Question diagram">')+'</div><label>Zoom <input id="zoom" type="range" min="35" max="100" value="72"></label>');document.querySelector('#zoom').oninput=e=>{document.querySelector('.large svg,.large img').style.width=e.target.value+'vw';};return;
case 'submit':if(confirm(say('Nộp bài ngay?','Submit this module?'))){submit();}return;
default:return;}
persist();exam();}
document.addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(b)go(b.dataset.go);});
window.addEventListener('popstate',enterPath);
void enterPath();
app.addEventListener('submit',async event=>{
  const f=event.target;
  if(f.id==='quick-form'){event.preventDefault();await startSkill(f.elements.leaf.value,Number(f.elements.count.value),f.querySelector('[role=status]'));}
  if(f.id==='bulk-edit'){event.preventDefault();if(isAdmin)await bulkEdit(f);}
});
app.addEventListener('click',async event=>{
  const tab=event.target.closest('[data-admin-tab]');
  if(tab)showAdminView(tab.dataset.adminTab);
  const b=event.target.closest('[data-resolve]');
  if(!b||!isAdmin)return;
  b.disabled=true;
  const {error}=await db.from('studio_question_reports').update({resolved:true}).eq('question_id',b.dataset.resolve).eq('student_id',b.dataset.student).eq('reason',b.dataset.reason);
  if(error){b.textContent='Thử lại';b.disabled=false;}else if(page==='admin'&&adminView==='reports')showAdminView('reports');
});

app.addEventListener('change',event=>{if(page==='setup'&&(event.target.name==='topic'||['skill','duration'].includes(event.target.id)))updateAvailability();});

app.addEventListener('click',event=>{
  const tableButton=event.target.closest('[data-table-field]');
  if(tableButton && isAdmin) openTableEditor(tableButton);
  const b=event.target.closest('[data-picture]');if(b&&isAdmin)choosePictures(b);
});
app.addEventListener('change',event=>{
  const key=event.target.dataset.coverage;
  if(!key)return;
  coverageFilters[key]=event.target.value;
  if(key==='level')coverageFilters.topic='';
  const panel=event.target.closest('.panel');
  panel.innerHTML=coveragePanel();
  panel.querySelector('[data-coverage="'+key+'"]').focus();
});

function syncChapters(){
  for(const group of app.querySelectorAll('[data-chapter]')){
    const boxes=[...group.querySelectorAll('[name=topic]')],parent=group.querySelector('[data-chapter-all]');
    parent.checked=boxes.length>0&&boxes.every(b=>b.checked);
    parent.indeterminate=!parent.checked&&boxes.some(b=>b.checked);
  }
}
app.addEventListener('click',e=>{
  if(e.target.hasAttribute('data-only-chapter')){const chapter=e.target.closest('[data-chapter]');app.querySelectorAll('[name=topic]').forEach(b=>b.checked=chapter.contains(b));syncChapters();updateAvailability();}
  if(e.target.dataset.topics){app.querySelectorAll('[name=topic]').forEach(b=>b.checked=e.target.dataset.topics==='all');syncChapters();updateAvailability();}
});
app.addEventListener('change',e=>{
  if(e.target.hasAttribute('data-chapter-all'))e.target.closest('fieldset').querySelectorAll('[name=topic]').forEach(b=>b.checked=e.target.checked);
  if(page==='setup'){syncChapters();updateAvailability();}
  if(e.target.dataset.recordFilter){const key=e.target.dataset.recordFilter;
    recordFilters[key]=e.target.value;
    const keys=Object.keys(recordFilters);keys.slice(keys.indexOf(key)+1).forEach(k=>recordFilters[k]='');
    app.querySelector('#history-panel').innerHTML=historyPanel();app.querySelector('[data-record-filter="'+key+'"]').focus();}
});
function refreshMap(){
  const nav=app.querySelector('.question-map');
  if(page==='exam'&&run&&nav)nav.outerHTML=questionMap(run);
}
app.addEventListener('input',e=>{if(e.target.id==='short'||e.target.hasAttribute('data-short-cell'))refreshMap();});
app.addEventListener('paste',e=>{if(e.target.hasAttribute('data-short-cell'))refreshMap();});
app.addEventListener('change',e=>{if(e.target.hasAttribute('data-truth'))refreshMap();});

app.addEventListener('submit',event=>{
  if(event.target.id!=='bank-search')return;
  event.preventDefault();bankSearchInput=event.target.elements.query.value.trim();
  bankFilters.search=searchText(bankSearchInput.replace(/^\[([^\]]+)\]$/,'$1'));
  bankSelection.clear();renderSavedBank();app.querySelector('#bank-search input')?.focus();
});
app.addEventListener('change',event=>{
  const key=event.target.dataset.bankOrder;
  if(!key)return;
  bankOrder[key]=event.target.value;
  if(key==='key')bankOrder.direction=bankOrder.key==='date'?'desc':'asc';
  renderSavedBank();app.querySelector('[data-bank-order="'+key+'"]').focus();
});
