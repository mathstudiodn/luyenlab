const tikzSample=String.raw`\begin{tikzpicture}
  \draw[thick] (0,0) -- (3,0) -- (1,2) -- cycle;
  \node[below] at (0,0) {$A$};
  \node[below] at (3,0) {$B$};
  \node[above] at (1,2) {$C$};
\end{tikzpicture}`;

function tikzInput(input){
  const declarations=[];
  const declare=line=>{if(!declarations.includes(line))declarations.push(line);};
  const command=/\\(?:usepackage|usetikzlibrary|usepgfplotslibrary)(?:\[[^\]\n]*\])?\{[^{}\n]+\}/g;
  let source=input.replace(/^\s*%!<([^\n]*)>\s*$/gm,(_,list)=>{
    const lines=list.match(command)||[];
    if(!lines.length||list.replace(command,'').replace(/[,\s]/g,''))
      throw new Error('Kiểm tra khai báo thư viện trong dòng %!<…>.');
    lines.forEach(declare);
    return '';
  });
  const doc=source.match(/^([\s\S]*?)\\begin\{document\}([\s\S]*?)\\end\{document\}\s*$/);
  if(doc){
    const preamble=doc[1].replace(/\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/,'');
    declare(preamble);
    source=doc[2];
  }else{
    const start=source.indexOf('\\begin{tikzpicture}');
    if(start>=0){declare(source.slice(0,start));source=source.slice(start);}
  }
  const full=[...declarations,source].join('\n');
  if(/\\tkzTab/.test(full)&&!full.includes('{tkz-tab}'))declare('\\usepackage{tkz-tab}');
  if(/\\begin\{axis\}/.test(full)&&!full.includes('{pgfplots}'))declare('\\usepackage{pgfplots}');
  return {source,preamble:declarations.join('\n')+'\n'};
}

function compileTikz(input,signal){
  const root=new URL('vendor/tikzjax/',document.baseURI);
  const {source,preamble}=tikzInput(input);
  const options={addToPreamble:preamble};
  if(/\\tkz(?:Def|Draw|Label|Get|Inter|Mark)/.test(source))
    throw new Error('Mã dùng tkz-euclide. Bộ biên dịch này hỗ trợ TikZ cơ bản, tkz-tab và pgfplots. Hãy dùng mã TikZ thường hoặc nhập hình đã vẽ.');
  if(!/\\begin\{tikzpicture\}/.test(source)||!/\\end\{tikzpicture\}/.test(source))
    throw new Error('Dán một hình có đủ lệnh mở và đóng tikzpicture.');
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('run-tex.js',root));
    const abort=()=>finish(new Error('Đã hủy biên dịch.'));
    const timer=setTimeout(()=>finish(new Error('Biên dịch quá lâu. Hãy kiểm tra cú pháp hoặc thử hình đơn giản hơn.')),60000);
    function finish(error,value){
      clearTimeout(timer);signal.removeEventListener('abort',abort);worker.terminate();
      if(error)reject(error);else resolve(value);
    }
    signal.addEventListener('abort',abort,{once:true});
    worker.onerror=()=>finish(new Error('Không tải được bộ biên dịch TikZ. Kiểm tra lần build Cloudflare Pages.'));
    // The pinned engine exposes load and texify over the threads.js worker protocol.
    worker.onmessage=({data})=>{
      if(data?.type==='init')worker.postMessage({type:'run',uid:1,method:'load',args:[root.href]});
      if(data?.type==='result' && data.uid===1)worker.postMessage({type:'run',uid:2,method:'texify',args:[source,options]});
      if(data?.type==='result' && data.uid===2)finish(null,data.payload);
      if(data?.type==='error'||data?.type==='uncaughtError')finish(new Error('Biên dịch thất bại. '+String(data.error?.message||'Kiểm tra cú pháp TikZ và thư viện đang dùng.').slice(0,320)));
    };
  });
}

async function tikzSvg(raw,signal){
  // Parse in an inert template. Use the SVG only as an image, never as live editor markup.
  const template=document.createElement('template');template.innerHTML=raw;
  const svg=template.content.querySelector('svg');
  if(!svg)throw new Error('Bộ biên dịch không tạo được SVG.');
  // Downloaded SVGs can also be opened as documents; retain drawing content
  // and local fragment references, and discard active or external content.
  for(const node of [svg,...svg.querySelectorAll('*')]){
    if(node.namespaceURI!=='http://www.w3.org/2000/svg'||['script','foreignObject','style','image','a','animate','set','animateTransform','animateMotion'].includes(node.localName)){
      node.remove();continue;
    }
    for(const attr of [...node.attributes]){
      if(/^on/i.test(attr.name)||(attr.localName==='href'&&!attr.value.startsWith('#'))||
        /(?:url\(\s*['"]?(?![#'"])[^)]|@import)/i.test(attr.value))node.removeAttributeNode(attr);
    }
  }
  const families=new Set(Array.from(svg.querySelectorAll('text[font-family]'),n=>n.getAttribute('font-family')));
  const styles=await Promise.all(Array.from(families,async family=>{
    if(!/^[a-zA-Z0-9_-]+$/.test(family))return '';
    const response=await fetch('vendor/tikzjax/fonts/'+family+'.woff2',{signal});
    if(!response.ok)throw new Error('Không tải được font '+family+'.');
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(String.fromCharCode(...bytes.slice(0,4))!=='wOF2')return '';
    let binary='';
    for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return '@font-face{font-family:'+family+';src:url(data:font/woff2;base64,'+btoa(binary)+') format("woff2")}';
  }));
  const style=document.createElementNS('http://www.w3.org/2000/svg','style');
  style.textContent=styles.join('\n');svg.prepend(style);
  return new File([new XMLSerializer().serializeToString(svg)],'hinh-tikz.svg',{type:'image/svg+xml'});
}

function openTikzEditor(button){
  const insert=mediaDestination(button,button.dataset.tikz);
  const dialog=document.createElement('dialog');dialog.className='tikz-editor';dialog.setAttribute('aria-label','Chèn TikZ');
  dialog.innerHTML='<h2>Chèn TikZ</h2><label>Mã TikZ<textarea rows="9" spellcheck="false" placeholder="Dán mã tikzpicture"></textarea></label><button type="button" name="sample">Dùng hình mẫu</button> <button type="button" name="render">Xem trước hình</button><p role="status"></p><div class="tikz-view"><img alt="Hình TikZ xem trước" hidden></div><div class="tikz-tools" hidden><label>Thu phóng <select><option>100%</option><option>150%</option><option>200%</option></select></label><button type="button" data-format="png">Tải PNG</button><label>Định dạng chèn <select name="format"><option value="png">PNG</option><option value="svg">SVG</option></select></label></div><div class="actions"><button class="primary" name="insert" disabled>Chèn hình</button><a download="hinh-tikz.svg" hidden>Tải SVG</a><button name="close">Đóng</button></div>';
  document.body.append(dialog);
  const get=s=>dialog.querySelector(s),field=get('textarea'),status=get('[role=status]'),img=get('img'),link=get('a'),accept=get('[name=insert]');
  const tools=get('.tikz-tools'),zoom=get('select');
  zoom.onchange=()=>{img.style.width=(img.naturalWidth*parseInt(zoom.value)/100)+'px';};
  get('[data-format=png]').onclick=async()=>{
    if(!file)return;
    try{
      const {blob}=await prepareImage(file);
      const download=document.createElement('a');
      download.download='hinh-tikz.png';
      download.href=URL.createObjectURL(blob);
      download.click();
      setTimeout(()=>URL.revokeObjectURL(download.href),30000);
    }catch(e){status.textContent=e.message;}
  };
  let job,file,url;
  function clear(){
    tools.hidden=true;zoom.selectedIndex=0;img.style.width="";
    job?.abort();job=null;file=null;accept.disabled=true;img.hidden=link.hidden=true;
    img.removeAttribute('src');link.removeAttribute('href');if(url)URL.revokeObjectURL(url);url=null;status.textContent='';
  }
  field.oninput=clear;
  get('[name=sample]').onclick=()=>{if(field.value.trim()&&!confirm('Thay mã đang nhập bằng hình mẫu?'))return;clear();field.value=tikzSample;field.focus();};
  get('[name=render]').onclick=async()=>{
    clear();const current=new AbortController();job=current;
    status.textContent='Đang biên dịch TikZ…';
    try{
      const raw=await compileTikz(field.value,current.signal);
      const svg=await tikzSvg(raw,current.signal);
      if(job!==current)return;
      url=URL.createObjectURL(svg);img.src=url;await img.decode();
      if(job!==current)return;
      tools.hidden=false;zoom.onchange();file=svg;link.href=url;link.hidden=img.hidden=accept.disabled=false;status.textContent='';
    }catch(e){if(job===current)status.textContent=e.message;}
  };
  accept.onclick=async()=>{if(!file)return;accept.disabled=true;
    try{await insert([file],{preserveTikzSvg:get('[name=format]').value==='svg'});dialog.close();}catch(e){status.textContent=e.message;accept.disabled=!file;}};
  get('[name=close]').onclick=()=>dialog.close();
  dialog.onclose=()=>{clear();dialog.remove();};
  dialog.showModal();field.focus();
}
