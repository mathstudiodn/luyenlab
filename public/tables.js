// Store ordinary LaTeX in existing question fields so tables survive editing and export.
function parseQuestionTable(source) {
  const match = source.trim().match(/^\\begin\{(tabular|array)\}\s*\{([lcr|\s]+)\}([\s\S]*?)\\end\{\1\}$/);
  if (!match || /\\(?:begin|end|multicolumn|multirow)\b/.test(match[3]))
    throw new Error('Hỗ trợ bảng tabular hoặc array với cột l, c, r và dấu |. Hãy tách các ô gộp trước khi chèn.');
  const columns = [...match[2]].filter(c => 'lcr'.includes(c));
  const rows = [];
  let row = [], cell = '', depth = 0;
  function finishRow() {
    row.push(cell.trim());
    if (row.length !== columns.length) throw new Error('Hàng '+(rows.length+1)+' cần có '+columns.length+' ô. Kiểm tra dấu & và dấu kết thúc hàng.');
    rows.push(row);
    row = []; cell = '';
  }
  const tokens = match[3].match(/\\[a-zA-Z]+|\\[\s\S]|[\s\S]/g) || [];
  for (const t of tokens) {
    if (t === '{') depth++;
    if (t === '}') depth--;
    if (depth < 0) throw new Error('Thừa dấu } trong ô.');
    if (!depth && t === '&') { row.push(cell.trim()); cell = ''; }
    else if (!depth && t === '\\\\') finishRow();
    else if (!depth && ['\\hline','\\toprule','\\midrule','\\bottomrule'].includes(t)) continue;
    else cell += t;
  }
  if (depth) throw new Error('Thiếu dấu } trong ô.');
  if (row.length || cell.trim() || !rows.length) finishRow();
  return {rows, columns, math:match[1]==='array'};
}

function renderQuestionTables(value, renderText) {
  const pattern = /\\begin\{(tabular|array)\}[\s\S]*?\\end\{\1\}/g;
  const source = String(value ?? '');
  let html = '', offset = 0;
  for (const match of source.matchAll(pattern)) {
    // Let MathJax handle arrays embedded in existing mathematical expressions.
    const before = source.slice(0,match.index);
    if (match[1]==='array' && (before.lastIndexOf('\\(')>before.lastIndexOf('\\)') || before.lastIndexOf('\\[')>before.lastIndexOf('\\]'))) continue;
    let table;
    try { table=parseQuestionTable(match[0]); } catch { continue; }
    const align={l:'left',c:'center',r:'right'};
    const body=table.rows.map(row=>'<tr>'+row.map((cell,i)=>{
      const content=table.math && cell ? '\\('+cell+'\\)' : formatQuestionMath(cell).replace(/\\&/g,'&');
      return '<td style="text-align:'+align[table.columns[i]]+'">'+renderText(content)+'</td>';
    }).join('')+'</tr>').join('');
    html+=renderText(source.slice(offset,match.index))+'<span class="question-table-scroll"><table class="question-table"><tbody>'+body+'</tbody></table></span>';
    offset=match.index+match[0].length;
  }
  return html+renderText(source.slice(offset));
}

function openTableEditor(button) {
  const field=button.form.elements[button.dataset.tableField];
  const start=field.selectionStart, end=field.selectionEnd;
  const dialog=document.createElement('dialog');
  dialog.className='table-editor';
  dialog.setAttribute('aria-label','Thêm bảng');
  dialog.innerHTML='<h2>Thêm bảng</h2><label>Cách nhập <select name="mode"><option value="grid">Nhập thủ công</option><option value="tex">Dán mã LaTeX</option></select></label>'+
    '<section class="table-manual"><div class="table-tools"><label>Số cột <input name="cols" type="number" min="1" max="40" value="2"></label><label>Số hàng <input name="rows" type="number" min="1" max="100" value="2"></label><button type="button" name="make">Tạo bảng</button></div><div class="table-grid"></div><small>Dùng $...$ cho công thức trong ô.</small></section>'+
    '<label class="table-latex" hidden>Mã LaTeX<textarea rows="7" placeholder="Dán bảng tabular hoặc array"></textarea></label>'+
    '<p role="status"></p><div class="table-tools"><button type="button" name="insert" class="primary">Chèn vào vị trí con trỏ</button><button type="button" name="cancel">Hủy</button></div>';
  document.body.append(dialog);
  const get=selector=>dialog.querySelector(selector);
  const message=get('[role=status]'), grid=get('.table-grid'), mode=get('select');
  const values=()=>Array.from(grid.querySelectorAll('tr'),tr=>Array.from(tr.querySelectorAll('input'),input=>input.value));
  function makeGrid() {
    const rows=get('[name=rows]'), cols=get('[name=cols]');
    if (!rows.value || !cols.value || !rows.reportValidity() || !cols.reportValidity()) return;
    const old=values(), table=document.createElement('table');
    for (let r=0;r<rows.valueAsNumber;r++) {
      const tr=table.insertRow();
      for (let c=0;c<cols.valueAsNumber;c++) {
        const input=document.createElement('input');
        input.setAttribute('aria-label','Hàng '+(r+1)+', cột '+(c+1));
        input.value=old[r]?.[c]||'';
        tr.insertCell().append(input);
      }
    }
    grid.replaceChildren(table);
    message.textContent='';
  }
  get('[name=make]').onclick=makeGrid;
  mode.onchange=()=>{
    get('.table-manual').hidden=mode.value!=='grid';
    get('.table-latex').hidden=mode.value!=='tex';
    message.textContent='';
  };
  get('[name=cancel]').onclick=()=>dialog.close();
  dialog.onclose=()=>{dialog.remove();field.focus();};
  get('[name=insert]').onclick=()=>{
    try {
      let source;
      if (mode.value==='tex') {
        source=get('textarea').value.trim().replace(/(^|[^\\])%[^\n]*/g,'$1').trim();
        source=source.replace(/^\\\[([\s\S]*)\\\]$/,'$1').replace(/^\$\$([\s\S]*)\$\$/,'$1').trim();
      } else {
        const data=values();
        if (data.length!==get('[name=rows]').valueAsNumber || data[0].length!==get('[name=cols]').valueAsNumber)
          throw new Error('Bấm Tạo bảng để áp dụng kích thước vừa nhập.');
        const rows=data.map(row=>row.map(cell=>cell.replace(/\\.|&/g,t=>t==='&'?'\\&':t)).join(' & '));
        source='\\begin{tabular}{'+'c'.repeat(data[0].length)+'} '+rows.join(' \\\\ ')+' \\\\ \\end{tabular}';
      }
      source=source.replace(/[\r\n]+/g,' ');
      parseQuestionTable(source);
      if (field.maxLength>=0 && field.value.length-end+start+source.length>field.maxLength)
        throw new Error('Bảng vượt giới hạn độ dài của ô soạn thảo.');
      field.setRangeText(source,start,end,'end');
      field.dispatchEvent(new Event('input',{bubbles:true}));
      dialog.close();
    } catch(error) { message.textContent=error.message; }
  };
  makeGrid();
  dialog.showModal();
}
