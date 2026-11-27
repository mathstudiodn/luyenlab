function splitSource(text){
  const q=text.trim();
  const tag=/^\[([^\[\]\r\n]+)\]\s*/u.exec(q);
  if(!tag||!tag[1].trim())return {source:'',q};
  return {source:tag[1].trim(),q:q.slice(tag[0].length)};
}
function searchText(text){
  return String(text??'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/đ/g,'d').replace(/\s+/g,' ').trim();
}
const bankOrder={key:'date',direction:'desc'};
const dateLabel=new Intl.DateTimeFormat('vi-VN',{dateStyle:'short',timeStyle:'medium',timeZone:'Asia/Ho_Chi_Minh'});
function sortBankRows(rows,leaves,order){
  const leafRank=new Map(leaves.map((l,i)=>[l.id,i]));
  const chapterKey=q=>JSON.stringify([q.track,q.grade??null,q.topic]);
  const chapterRank=new Map([...new Set(leaves.map(chapterKey))].map((k,i)=>[k,i]));
  const compareText=new Intl.Collator('vi',{numeric:true,sensitivity:'base'}).compare;
  function compare(a,b){
    if(order.key==='date')return Date.parse(a.created_at)-Date.parse(b.created_at);
    const rank=q=>order.key==='grade'?(q.track==='sat'?100:Number(q.grade)):order.key==='chapter'?chapterRank.get(chapterKey(q)):leafRank.get(q.catalog_id);
    return (rank(a)??1e9)-(rank(b)??1e9)||compareText(order.key==='grade'?'':a.topic,order.key==='grade'?'':b.topic);
  }
  return rows.sort((a,b)=>(order.direction==='asc'?1:-1)*compare(a,b)||Date.parse(b.created_at)-Date.parse(a.created_at)||compareText(a.id,b.id));
}
