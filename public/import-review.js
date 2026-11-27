// Inspect the original input before dollar delimiters are normalized.
function importReviewReasons(source) {
  const reasons=[];
  if (/\\includegraphics\b|\\begin\{(?:tikzpicture|picture|pspicture)\}|(?:\[Thiếu hình vẽ\]|⟦Thiếu hình vẽ⟧)|(?:hình (?:vẽ )?(?:bên|sau|dưới đây)|figure (?:above|below)|diagram (?:above|below))/iu.test(source) && !/\[\[hinh:[\da-f-]+\.(?:png|jpg|webp)\]\]/i.test(source))
    reasons.push('Thiếu hình vẽ');
  const stack=[];
  let broken=source.includes('⟦Công thức Word cần sửa');
  for (const [token,kind,name] of source.matchAll(/\\(begin|end)\{([^{}]+)\}|\\[()[\]]|\\[\s\S]|\$\$?|[{}]/g)) {
    if(token==='{')stack.push('{');
    else if(token==='}'){if(stack.pop()!=='{')broken=true;}
    else if(kind==='begin')stack.push('env:'+name);
    else if(kind==='end'){if(stack.pop()!=='env:'+name)broken=true;}
    else if(token==='$'||token==='$$'){
      if(stack.at(-1)===token)stack.pop();else stack.push(token);
    }else if(token==='\\('||token==='\\[')stack.push(token);
    else if(token==='\\)'||token==='\\]'){
      if(stack.pop()!==(token==='\\)'?'\\(':'\\['))broken=true;
    }
  }
  if (broken||stack.length)reasons.push('Lỗi môi trường toán');
  return reasons;
}

function recoverImportDraft(block,track){
  const body=block.replace(/^\\begin\{ex\}/,'').replace(/\\end\{ex\}[\s\S]*$/,'').trim();
  const prefix=splitSource(body);
  const mc=/\\choice\b|^[ \t]*A[.)]/m.test(body);
  const tf=track==='vn' && /\\choiceTF\b|^[ \t]*a\)/m.test(body);
  const stem=prefix.q.split(/\\(?:choiceTF|choice|shortans)\b|^[ \t]*(?:A[.)]|a\)|Lời giải)/m)[0].trim();
  return {source:prefix.source,q:(stem||prefix.q||'Câu cần rà soát').slice(0,12000),
    type:tf?'tf':mc?'mc':'short',choices:[],statements:[],answer:tf?[]:'',why:'Nội dung gốc để sửa thủ công\n'+block};
}
