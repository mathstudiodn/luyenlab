const formatQuestionMath = text => text.trim()
  .replace(/(^|[^\\])\$\$([\s\S]+?)\$\$/g,'$1\\[$2\\]')
  .replace(/(^|[^\\])\$([^$]+?)\$/g,'$1\\($2\\)');

/* Parse the supported ex_test commands without executing LaTeX. */
function parseExamTex(source,route="vn",bulk=false) {
  const input = source.replace(/(?:\\.|%[^\r\n]*)/g, token => token.startsWith('%') ? '' : token);
  const environments = [...input.matchAll(/\\begin\{ex\}([\s\S]*?)\\end\{ex\}/g)];
  if (!environments.length || environments.length !== [...input.matchAll(/\\(?:begin|end)\{ex\}/g)].length / 2) {
    throw new Error('Cần các khối \\begin{ex} … \\end{ex} hoàn chỉnh.');
  }
  return environments.map(([,body],index) => {
    try {
      const command = /\\(choiceTF|choice|shortans)(?![A-Za-z])/g.exec(body);
      if (!command) throw new Error('Thiếu \\choice, \\choiceTF hoặc \\shortans.');
      let at = command.index + command[0].length;
      const skip = () => { while (/\s/.test(body[at] ?? '')) at++; };
      function group(open,close) {
        skip();
        if (body[at++] !== open) throw new Error('Thiếu nhóm '+open+close+'.');
        const start = at;
        let depth = 1;
        for (;at<body.length;at++) {
          const char = body[at];
          if (char === '\\' && !/[A-Za-z]/.test(body[at+1] ?? '')) { at++; continue; }
          if (char === open) depth++;
          if (char === close && --depth === 0) return body.slice(start,at++).trim();
        }
        throw new Error('Nhóm chưa đóng.');
      }
      const prefix=splitSource(body.slice(0,command.index));
      const source=prefix.source, q=formatQuestionMath(prefix.q);
      if (!q || q.length>12000) throw new Error('Đề bài trống hoặc quá dài.');
      if (!bulk && /\\(?:includegraphics|begin\{tikzpicture\})/.test(body)) throw new Error('Câu có hình LaTeX. Hãy nhập thủ công và tải ảnh riêng.');
      skip();
      if (body[at] === '[') group('[',']');
      const kind = command[1];
      const options = Array.from({length:kind === 'shortans' ? 1 : 4},()=>group('{','}'));
      const truth = options.map(item => /^\\True(?![A-Za-z])/.test(item));
      const labels = options.map(item => formatQuestionMath(item.replace(/^\\True(?![A-Za-z])/,'').trim()));
      if (labels.some(item=>!item)) throw new Error('Có phương án hoặc đáp số trống.');
      skip();
      let why = '';
      if (body.startsWith('\\loigiai',at)) { at += '\\loigiai'.length; why = formatQuestionMath(group('{','}')); }
      skip();
      if (at!==body.length) throw new Error('Có lệnh hoặc văn bản ngoài mẫu sau phần đáp án.');
      if (kind==='choice' && (truth.filter(Boolean).length!==1 || new Set(labels).size!==4)) throw new Error('Cần 4 phương án khác nhau và đúng một \\True.');
      if (kind==='shortans') {
        const answer=shortKey(options[0],route);
        return {source,q,why,type:'short',answer,choices:[],statements:[]};
      }
      return kind==='choice'
        ? {source,q,why,type:'mc',answer:labels[truth.indexOf(true)],choices:labels,statements:[]}
        : {source,q,why,type:'tf',answer:truth,choices:[],statements:labels};
    } catch(error) {
      throw new Error('Câu '+(index+1)+': '+error.message);
    }
  });
}
function mergeCatalog(current, incoming) {
  const result=structuredClone(current);
  const name=value=>{
    if(typeof value!=='string'||!value.trim()||value.trim().length>240)throw new Error('Tên danh mục phải có từ 1 đến 240 ký tự.');
    return value.trim();
  };
  const list=value=>{
    if(!Array.isArray(value))throw new Error('Danh mục phải theo cấu trúc tệp mẫu.');
    return value;
  };
  const addLeaves=(target,source)=>{
    for(const item of list(source)){
      const label=name(item.name);
      if(!target.some(x=>x.name===label))target.push({name:label,id:crypto.randomUUID()});
    }
  };
  for(const item of list(incoming.grades)){
    const label=name(item.name);
    if(!Number.isInteger(item.grade)||![10,11,12].includes(item.grade))throw new Error('Khối THPT phải là 10, 11 hoặc 12.');
    let grade=result.grades.find(x=>x.name===label);
    if(grade&&grade.grade!==item.grade)throw new Error('Tên lớp đã thuộc một khối khác.');
    if(!grade){grade={name:label,grade:item.grade,chapters:[]};result.grades.push(grade);}
    for(const part of list(item.chapters)){
      const title=name(part.name);
      let chapter=grade.chapters.find(x=>x.name===title);
      if(!chapter){chapter={name:title,lessons:[]};grade.chapters.push(chapter);}
      addLeaves(chapter.lessons,part.lessons);
    }
  }
  for(const item of list(incoming.domains)){
    const title=name(item.name);
    const domain=result.domains.find(x=>x.name===title);
    if(!domain)throw new Error('Domain SAT không hợp lệ: '+title);
    addLeaves(domain.skills,item.skills);
  }
  if(incoming.remove!==undefined){
    for(const item of list(incoming.remove)){
      if(item.domain!==undefined){
        const domain=result.domains.find(x=>x.name===name(item.domain));
        const index=domain?.skills.findIndex(x=>x.name===name(item.skill))??-1;
        if(index<0)throw new Error('Không tìm thấy skill cần bỏ.');
        domain.skills.splice(index,1);
        continue;
      }
      const index=result.grades.findIndex(x=>x.name===name(item.class));
      if(index<0)throw new Error('Không tìm thấy lớp cần bỏ.');
      if(item.chapter===undefined){result.grades.splice(index,1);continue;}
      const chapters=result.grades[index].chapters;
      const chapter=chapters.findIndex(x=>x.name===name(item.chapter));
      if(chapter<0)throw new Error('Không tìm thấy chương cần bỏ.');
      if(item.lesson===undefined){chapters.splice(chapter,1);continue;}
      const lessons=chapters[chapter].lessons;
      const lesson=lessons.findIndex(x=>x.name===name(item.lesson));
      if(lesson<0)throw new Error('Không tìm thấy bài cần bỏ.');
      lessons.splice(lesson,1);
    }
  }
  if(JSON.stringify(result).length>600000)throw new Error('Danh mục vượt giới hạn kích thước.');
  return result;
}

