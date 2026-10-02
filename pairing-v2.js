/* 國大練習｜今日の対戦編成 v3
 * 通常：既存の要件を維持
 * カスタム：参加者を手動で自由に組み合わせる
 */
(function(){
  'use strict';

  const esc2=s=>typeof escapeHtml==='function'?escapeHtml(s??''):String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pairKey=(a,b)=>[a,b].sort().join('|');
  const getPlayer=id=>typeof player==='function'?player(id):null;
  const getRank=id=>{const p=getPlayer(id);return p?Number(rankScore(p.rank)):0};
  const goalLabel=g=>g==='coaching'?'指導':g==='tuning'?'調整':'通常';
  const goalNote=g=>g==='coaching'?'格上を優先':g==='tuning'?'格下を優先':'級が近い相手を優先';

  function ensure(){
    if(!Array.isArray(state.tournaments))state.tournaments=[];
    state.practices.forEach(p=>{
      if(!Array.isArray(p.rounds))p.rounds=[];
      if(!p.pairingGoals||typeof p.pairingGoals!=='object')p.pairingGoals={};
    });
  }

  function practiceMatches(){
    return state.practices.flatMap(p=>(p.rounds||[]).flatMap(r=>(r.matches||[]).map(m=>({m,p,r}))));
  }

  function inCurrentPractice(a,b){
    const p=currentPractice();
    return !!p&&(p.rounds||[]).some(r=>(r.matches||[]).some(m=>m.player1Id&&m.player2Id&&pairKey(m.player1Id,m.player2Id)===pairKey(a,b)));
  }

  function historyCount(a,b){
    return practiceMatches().filter(x=>x.m.player1Id&&x.m.player2Id&&pairKey(x.m.player1Id,x.m.player2Id)===pairKey(a,b)).length;
  }

  function recent14(a,b){
    const p=currentPractice();
    if(!p)return false;
    const base=new Date((p.date||today())+'T00:00:00');
    return practiceMatches().some(x=>{
      if(x.p.id===p.id)return false;
      if(!x.m.player1Id||!x.m.player2Id||pairKey(x.m.player1Id,x.m.player2Id)!==pairKey(a,b))return false;
      const d=new Date((x.p.date||'')+'T00:00:00');
      if(Number.isNaN(d.getTime()))return false;
      return Math.abs(base-d)/86400000<=14;
    });
  }

  function scorePair(a,b,goals){
    const ra=getRank(a.id),rb=getRank(b.id),diff=Math.abs(ra-rb);
    const ga=goals[a.id]||'normal',gb=goals[b.id]||'normal';
    const recent=recent14(a.id,b.id),history=historyCount(a.id,b.id);
    let score=0;const reasons=[];
    function apply(g,self,opp){
      if(g==='coaching'){
        if(opp>self){score+=1000;reasons.push('指導：格上');}
        else if(opp===self){score+=120;reasons.push('指導：同級');}
        else {score-=500;reasons.push('指導：格下');}
      }else if(g==='tuning'){
        if(opp<self){score+=1000;reasons.push('調整：格下');}
        else if(opp===self){score+=120;reasons.push('調整：同級');}
        else {score-=500;reasons.push('調整：格上');}
      }else{
        if(diff===0){score+=500;reasons.push('通常：同級');}
        else if(diff===1){score+=360;reasons.push('通常：近い級');}
        else if(diff===2)score+=120;
      }
    }
    apply(ga,ra,rb);apply(gb,rb,ra);
    if(recent){score-=700;reasons.push('過去14日以内に対戦');}
    else{score+=220;reasons.push('過去14日以内の対戦なし');}
    if(history===0){score+=90;reasons.push('過去の対戦なし');}
    else{score-=Math.min(history*18,90);reasons.push('過去'+history+'回対戦');}
    return {score,recent,history,reasons:[...new Set(reasons)].slice(0,3)};
  }

  function makePairs(ids,goals){
    const arr=ids.map(getPlayer).filter(Boolean),candidates=[];
    for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++){
      const a=arr[i],b=arr[j];
      if(inCurrentPractice(a.id,b.id))continue;
      candidates.push({...scorePair(a,b,goals),a,b,goalA:goals[a.id]||'normal',goalB:goals[b.id]||'normal'});
    }
    candidates.sort((a,b)=>b.score-a.score);
    const used=new Set(),pairs=[];
    for(const c of candidates){
      if(used.has(c.a.id)||used.has(c.b.id))continue;
      used.add(c.a.id);used.add(c.b.id);pairs.push(c);
    }
    const rest=arr.filter(p=>!used.has(p.id)).sort((a,b)=>{
      const p=currentPractice();
      const ra=p?.rounds?.filter(r=>r.restPlayerId===a.id).length||0;
      const rb=p?.rounds?.filter(r=>r.restPlayerId===b.id).length||0;
      return ra-rb;
    })[0]||null;
    return {pairs,rest};
  }

  function participantIds(){
    const p=currentPractice();
    return (p?.participantIds||[]).filter(id=>getPlayer(id));
  }

  function openPairing(mode='normal'){
    ensure();
    const p=currentPractice();
    if(!p){openNewPractice();return;}
    const screen=document.getElementById('screenPairing');
    if(!screen)return;
    document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active',s===screen));
    document.querySelectorAll('.nav-item,.x-drawer-item').forEach(b=>b.classList.toggle('active',b.dataset.nav==='screenHome'));
    window.scrollTo({top:0,behavior:'smooth'});
    renderPairing(mode);
  }

  function renderPairing(mode='normal'){
    ensure();
    const p=currentPractice(),screen=document.getElementById('screenPairing');
    if(!p||!screen)return;
    const ids=participantIds();
    if(!p.pairingGoals)p.pairingGoals={};
    ids.forEach(id=>{if(!p.pairingGoals[id])p.pairingGoals[id]='normal';});

    screen.innerHTML=
      '<div class="page-title-row">'+
        '<div><div class="eyebrow">TODAY MATCHING</div><h2>今日の対戦を組む</h2><p class="setup-lead">通常の自動編成か、カスタムで自由に組めます。</p></div>'+
        '<button id="xPairingBackV3" class="text-btn" type="button">戻る</button>'+
      '</div>'+
      '<div class="x-pairing-mode-tabs">'+
        '<button id="xPairingNormalV3" class="secondary-btn '+(mode==='normal'?'active':'')+'" type="button">通常で組む</button>'+
        '<button id="xPairingCustomV3" class="secondary-btn '+(mode==='custom'?'active':'')+'" type="button">カスタムで組む</button>'+
      '</div>'+
      (mode==='normal'?renderNormalHtml(ids,p):renderCustomHtml(ids,p));

    document.getElementById('xPairingBackV3').onclick=()=>showHome();
    document.getElementById('xPairingNormalV3').onclick=()=>renderPairing('normal');
    document.getElementById('xPairingCustomV3').onclick=()=>renderPairing('custom');

    if(mode==='normal')bindNormal(ids,p);
    else bindCustom(ids,p);
  }

  function renderNormalHtml(ids,p){
    return '<section class="card x-pairing-v2-goals">'+
      '<div class="panel-title"><div><div class="eyebrow">TODAY\'S GOAL</div><h3>今日の目的</h3></div><span class="muted">'+ids.length+'人</span></div>'+
      '<p class="muted">指導＝格上、調整＝格下、通常＝級が近い相手を優先します。</p>'+
      '<div class="x-pairing-v2-list">'+ids.map(id=>{
        const pl=getPlayer(id),g=p.pairingGoals[id]||'normal';
        return '<div class="x-pairing-v2-row"><div><b>'+esc2(pl.name)+'</b><small>'+esc2(typeof playerDisplayRank==='function'?playerDisplayRank(pl):pl.rank+'級')+'</small></div><select data-goal-id="'+esc2(id)+'"><option value="normal" '+(g==='normal'?'selected':'')+'>通常</option><option value="coaching" '+(g==='coaching'?'selected':'')+'>指導</option><option value="tuning" '+(g==='tuning'?'selected':'')+'>調整</option></select><span>'+goalNote(g)+'</span></div>';
      }).join('')+'</div>'+
      '</section>'+
      '<section class="card"><div class="panel-title"><div><div class="eyebrow">SUGGESTIONS</div><h3>対戦候補</h3></div><button id="xPairingRegenerateV3" class="accent-btn" type="button">組み直す</button></div>'+
      '<div id="xPairingV3Suggestions" class="stack"></div>'+
      '<div class="custom-match-footer"><span id="xPairingV3Rest" class="muted"></span><button id="xPairingV3Apply" class="primary-btn" type="button">この組み合わせで次の試合を作る</button></div></section>';
  }

  function renderCustomHtml(ids,p){
    const count=Math.max(1,Math.floor(ids.length/2));
    const rows=Array.from({length:count},()=>['','']);
    return '<section class="card x-pairing-v2-goals">'+
      '<div class="panel-title"><div><div class="eyebrow">CUSTOM MATCHING</div><h3>カスタムで組む</h3></div><span class="muted">'+ids.length+'人</span></div>'+
      '<p class="muted">参加者を自由に選んで組み合わせます。1人は休みにできます。</p>'+
      '<div id="xCustomPairsV3" class="x-custom-pairs">'+rows.map((r,i)=>customRow(i,r,ids)).join('')+'</div>'+
      '<div class="custom-match-footer"><span id="xCustomRestV3" class="muted"></span><button id="xCustomApplyV3" class="primary-btn" type="button" disabled>この組み合わせで次の試合を作る</button></div></section>';
  }

  function customRow(i,row,ids){
    const opts=(selected,label)=>'<option value="">'+label+'</option>'+ids.map(id=>{
      const p=getPlayer(id);return '<option value="'+esc2(id)+'" '+(id===selected?'selected':'')+'>'+esc2(p.name)+'（'+esc2(playerDisplayRank(p))+'）</option>';
    }).join('');
    return '<div class="x-custom-pair-row"><span>'+(i+1)+'</span><select data-custom-a="'+i+'">'+opts(row[0],'選手A')+'</select><b>×</b><select data-custom-b="'+i+'">'+opts(row[1],'選手B')+'</select></div>';
  }

  function bindNormal(ids,p){
    document.querySelectorAll('[data-goal-id]').forEach(el=>el.onchange=()=>{
      p.pairingGoals[el.dataset.goalId]=el.value;save();renderPairing('normal');
    });
    document.getElementById('xPairingRegenerateV3').onclick=()=>renderNormalSuggestions(ids,p);
    document.getElementById('xPairingV3Apply').onclick=()=>{
      applyPairs(makePairs(ids,p.pairingGoals));
    };
    renderNormalSuggestions(ids,p);
  }

  function renderNormalSuggestions(ids,p){
    const result=makePairs(ids,p.pairingGoals),list=document.getElementById('xPairingV3Suggestions');
    if(!list)return;
    list.innerHTML=result.pairs.length?result.pairs.map((x,i)=>
      '<div class="suggestion-row x-pairing-v2-suggestion"><span class="suggestion-num">'+(i+1)+'</span><div><b>'+esc2(x.a.name)+' <span>×</span> '+esc2(x.b.name)+'</b><small>'+esc2(playerDisplayRank(x.a))+'・'+goalLabel(x.goalA)+'　vs　'+esc2(playerDisplayRank(x.b))+'・'+goalLabel(x.goalB)+'</small></div><span class="suggestion-reason">'+esc2(x.reasons.join('・'))+'</span></div>'
    ).join(''):'<div class="empty-small">条件を考慮できる組み合わせがありません。</div>';
    document.getElementById('xPairingV3Rest').textContent=result.rest?'今回は'+result.rest.name+'を休み候補にします。':'全員を対戦に入れます。';
  }

  function bindCustom(ids,p){
    const rows=Array.from({length:Math.max(1,Math.floor(ids.length/2))},()=>['','']);
    const wrap=document.getElementById('xCustomPairsV3');
    const stateRows=rows;

    const refresh=()=>{
      const used=[];
      wrap.querySelectorAll('[data-custom-a],[data-custom-b]').forEach(el=>{
        const i=Number(el.dataset.customA??el.dataset.customB);
        stateRows[i][el.hasAttribute('data-custom-a')?0:1]=el.value;
      });
      const usedIds=stateRows.flat().filter(Boolean);
      const duplicate=usedIds.length!==new Set(usedIds).size;
      const invalid=stateRows.some(r=>(r[0]&&!r[1])||(!r[0]&&r[1])||r[0]===r[1]);
      const selected=new Set(usedIds);
      const rest=ids.map(getPlayer).find(q=>!selected.has(q.id));
      const valid=stateRows.every(r=>!r[0]&&!r[1]||r[0]&&r[1]&&r[0]!==r[1])&&!duplicate&&selected.size>0;
      document.getElementById('xCustomApplyV3').disabled=!valid;
      document.getElementById('xCustomRestV3').textContent=rest?'今回は'+rest.name+'を休みにできます。':selected.size===ids.length?'全員を対戦に入れます。':'';
      return {valid,stateRows,rest};
    };
    wrap.querySelectorAll('select').forEach(el=>el.onchange=refresh);
    document.getElementById('xCustomApplyV3').onclick=()=>{
      const r=refresh();
      if(!r.valid){toast('各試合の2人を正しく選択してください');return;}
      const used=new Set(),pairs=[];
      for(const row of r.stateRows){
        if(!row[0]&&!row[1])continue;
        if(used.has(row[0])||used.has(row[1])){toast('同じ選手を複数の試合に入れられません');return;}
        used.add(row[0]);used.add(row[1]);pairs.push([getPlayer(row[0]),getPlayer(row[1])]);
      }
      const rest=ids.map(getPlayer).find(q=>!used.has(q.id));
      if(!pairs.length){toast('対戦を1つ以上作ってください');return;}
      generateRound(p,pairs,rest?.id||null);save();renderHome();renderHistory();showHome();toast(pairs.length+'試合を追加しました');
    };
  }

  function applyPairs(result){
    const p=currentPractice();
    if(!p||!result.pairs.length){toast('組み合わせを作れませんでした');return;}
    const pairs=result.pairs.map(x=>[x.a,x.b]);
    generateRound(p,pairs,result.rest?.id||null);
    save();renderHome();renderHistory();showHome();toast(pairs.length+'試合を追加しました');
  }

  function showHome(){
    document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active',s.id==='screenHome'));
    document.querySelectorAll('.nav-item,.x-drawer-item').forEach(b=>b.classList.toggle('active',b.dataset.nav==='screenHome'));
    if(typeof renderHome==='function')renderHome();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function install(){
    ensure();
    document.getElementById('kokudaiDrawer')?.querySelector('[data-nav="screenPairing"]')?.remove();
    const home=document.getElementById('homeAddRoundBtn');
    const recommend=document.getElementById('recommendBtn');
    const custom=document.getElementById('customMatchBtn');
    if(home)home.onclick=()=>openPairing('normal');
    if(recommend)recommend.onclick=()=>openPairing('normal');
    if(custom)custom.onclick=()=>openPairing('custom');
  }

  function injectStyle(){
    if(document.getElementById('pairing-v3-style'))return;
    const s=document.createElement('style');s.id='pairing-v3-style';
    s.textContent='.x-pairing-mode-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}.x-pairing-mode-tabs button.active{background:var(--brand);color:#fff}.x-pairing-v2-goals{padding:16px}.x-pairing-v2-list{display:grid;gap:7px;margin-top:12px}.x-pairing-v2-row{display:grid;grid-template-columns:minmax(0,1fr) 88px minmax(110px,auto);gap:9px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:10px;background:#fff}.x-pairing-v2-row b{display:block;font-size:12px}.x-pairing-v2-row small{display:block;color:var(--muted);font-size:9px;margin-top:2px}.x-pairing-v2-row select{width:100%;min-width:0;padding:8px;border:1px solid var(--line);border-radius:8px;background:#fff}.x-pairing-v2-row>span{font-size:9px;color:var(--muted);text-align:right}.x-pairing-v2-suggestion>div{min-width:0}.x-pairing-v2-suggestion small{display:block;margin-top:3px;color:var(--muted);font-size:9px}.x-pairing-v2-suggestion .suggestion-reason{max-width:190px;text-align:right;font-size:9px;line-height:1.4}.x-custom-pairs{display:grid;gap:8px;margin-top:12px}.x-custom-pair-row{display:grid;grid-template-columns:24px minmax(0,1fr) 18px minmax(0,1fr);gap:7px;align-items:center}.x-custom-pair-row>span{font-size:11px;font-weight:700;text-align:center}.x-custom-pair-row>b{text-align:center;color:var(--muted)}.x-custom-pair-row select{width:100%;min-width:0;padding:9px;border:1px solid var(--line);border-radius:9px;background:#fff}@media(max-width:600px){.x-pairing-v2-goals{padding:13px}.x-pairing-v2-row{grid-template-columns:minmax(0,1fr) 82px}.x-pairing-v2-row>span{grid-column:1 / -1;text-align:left}.x-pairing-v2-suggestion{grid-template-columns:24px minmax(0,1fr)}.x-pairing-v2-suggestion .suggestion-reason{grid-column:2;max-width:none;text-align:left}.x-custom-pair-row{grid-template-columns:20px minmax(0,1fr) 14px minmax(0,1fr);gap:5px}}';
    document.head.appendChild(s);
  }

  window.addEventListener('load',()=>setTimeout(()=>{try{injectStyle();install()}catch(e){console.error('pairing v3',e)}},150));
  window.KOKUDAI_PAIRING_V2={open:openPairing};
})();