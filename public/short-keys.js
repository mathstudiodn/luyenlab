// A semicolon separates SAT keys without conflicting with a Vietnamese decimal comma.
function shortKey(raw,route){
  const values=String(raw??'').split(';');
  if(route!=='sat'&&values.length!==1)throw new Error('Toán THPT chỉ nhận một đáp án trả lời ngắn.');
  const normalized=values.map(item=>{
    const clean=item.trim().replace(/^\$([^$]+)\$$/,'$1').trim().replace(/^−/,'-');
    const fraction=/^(-?)\\(?:dfrac|tfrac|frac)\{(-?\d+)\}\{(-?\d+)\}$/.exec(clean);
    const key=fraction?(fraction[1]?String(-Number(fraction[2])):fraction[2])+'/'+fraction[3]:clean;
    if(!key||key.length>20||!Number.isFinite(numeric(key)))throw new Error('Mỗi đáp án phải là một số hoặc phân số hữu hạn.');
    return key;
  });
  return [...new Set(normalized)].join('; ');
}
