function renderTournaments(){const el=$('tournamentList');if(!el)return;let list=tournamentsCache.filter(t=>t?.date>=today());if(tournamentScope==='nearby')list=list.filter(t=>tournamentRegion(t.prefecture)==='nearby');else if(tournamentScope==='kanto')list=list.filter(t=>['nearby','kanto'].includes(tournamentRegion(t.prefecture)));if(tournamentRank!=='all')list=list.filter(t=>(t.ranks||[]).includes(tournamentRank));if(tournamentFavoritesOnly)list=list.filter(t=>(state.tournamentFavorites||[]).includes(t.seriesId||t.id));list.sort((x,y)=>String(x.date).localeCompare(String(y.date)));
  const pageSize=10,totalPages=Math.max(1,Math.ceil(list.length/pageSize));
  tournamentPage=Math.min(tournamentPage,totalPages);
  const pageItems=list.slice((tournamentPage-1)*pageSize,tournamentPage*pageSize);
  el.innerHTML=pageItems.map(t=>{const fav=(state.tournamentFavorites||[]).includes(t.seriesId||t.id);return '<article class="tournament-card"><div class="tournament-card-top"><div><span class="eyebrow">'+escapeHtml(t.prefecture||'全国')+'</span><h3>'+(fav?'⭐ ':'')+escapeHtml((t.name||'大会')+((t.ranks||[]).length?' ('+(t.ranks||[]).join('.')+')':''))+'</h3></div><span class="tournament-date">'+escapeHtml(tournamentDateText(t.date))+'</span></div><p class="tournament-venue">'+escapeHtml(t.venue||'会場未定')+'</p><div class="tournament-meta"><b>國大締切：'+escapeHtml(t.kokudaiDeadline||'—')+'</b></div><button type="button" class="secondary-btn" data-tournament-detail="'+escapeHtml(t.id)+'">詳細を見る</button></article>'}).join('');
  const pager=$('tournamentPagination');
  if(pager){
    pager.innerHTML=totalPages>1
      ? '<button type="button" class="secondary-btn" data-tournament-page="prev" '+(tournamentPage===1?'disabled':'')+'>‹</button><span>'+tournamentPage+' / '+totalPages+'</span><button type="button" class="secondary-btn" data-tournament-page="next" '+(tournamentPage===totalPages?'disabled':'')+'>›</button>'
      : '';
  }
  $('tournamentEmpty')?.classList.toggle('hidden',!list.length)
}
async function loadTournaments(){try{const r=await fetch(TOURNAMENT_DATA_URL+'?v='+Date.now(),{cache:'no-store'});if(!r.ok)throw 0;tournamentsCache=await r.json();renderTournaments()}catch(e){tournamentsCache=[];renderTournaments()}}
function openTournamentDetail(id){const t=tournamentsCache.find(x=>x.id===id);if(!t)return;const fav=(state.tournamentFavorites||[]).includes(t.seriesId||t.id);const docs=(t.documents||[]).map(d=>'<a class="secondary-btn" href="'+escapeHtml(d.url)+'" target="_blank" rel="noopener">'+escapeHtml(d.label)+'</a>').join('');$('modalRoot').innerHTML='<div class="modal-overlay" data-modal-close><div class="modal-card"><div class="modal-head"><h3>'+escapeHtml(t.name)+'</h3><button class="icon-btn" data-modal-close>×</button></div><div class="tournament-detail-grid"><div><span>開催日</span><b>'+escapeHtml(tournamentDateText(t.date))+'</b></div><div><span>会場</span><b>'+escapeHtml(t.venue||'—')+'</b></div><div><span>公式締切</span><b>'+escapeHtml(t.officialDeadline||'—')+'</b></div><div><span>國大締切</span><b>'+escapeHtml(t.kokudaiDeadline||'—')+'</b></div></div><div class="tournament-docs"><h4>大会資料</h4>'+docs+'</div><a class="primary-btn wide" href="'+escapeHtml(t.sourceUrl)+'" target="_blank" rel="noopener">公式大会ページを見る</a><button type="button" class="secondary-btn wide" data-toggle-tournament-favorite>'+ (fav?'⭐ お気に入りを外す':'☆ お気に入りにする')+'</button></div></div>';const ov=$('modalRoot').firstElementChild;ov.onclick=e=>{if(e.target===ov||e.target.closest('[data-modal-close]'))closeModal()};ov.querySelector('[data-toggle-tournament-favorite]').onclick=()=>{state.tournamentFavorites=state.tournamentFavorites||[];const key=t.seriesId||t.id;state.tournamentFavorites=state.tournamentFavorites.includes(key)?state.tournamentFavorites.filter(x=>x!==key):[...state.tournamentFavorites,key];save();closeModal();renderTournaments()}}
function currentPractice(){return state.practices.find(p=>p.id===state.currentPracticeId)||null}
function player(id){return state.players.find(p=>p.id===id)}
function rankText(rank){return rank+'級'}
function playerDisplayRank(p){
  return p?.displayRank?.trim() || rankText(p?.rank||'');
}
function playerDisplayLabel(p){
  if(!p)return '—';
  const base=escapeHtml(p.name)+' '+escapeHtml(playerDisplayRank(p));
  return base+(p.affiliation?.trim()?'('+escapeHtml(p.affiliation.trim())+')':'');
}

function pairKey(a,b){return [a,b].sort().join('|')}
function matchHistoryCount(a,b){
  return state.practices.flatMap(p=>p.rounds||[]).flatMap(r=>r.matches||[])
    .filter(m=>m.player1Id&&m.player2Id&&pairKey(m.player1Id,m.player2Id)===pairKey(a,b)).length;
}
function lastRoundAgainst(a,b){
  let latest=-1;
  state.practices.forEach(p=>(p.rounds||[]).forEach(r=>(r.matches||[]).forEach(m=>{
    if(m.player1Id&&m.player2Id&&pairKey(m.player1Id,m.player2Id)===pairKey(a,b))
      latest=Math.max(latest,Number(m.round||0));
  })));
  return latest;
}
function restCount(p){
  return currentPractice()?.rounds?.reduce((n,r)=>n+(r.restPlayerId===p.id?1:0),0)||0;
}
function makeRecommendations(ids){
  const arr=ids.map(player).filter(Boolean);
  const candidates=[];
  for(let i=0;i<arr.length;i++){
    for(let j=i+1;j<arr.length;j++){
      const a=arr[i],b=arr[j], history=matchHistoryCount(a.id,b.id);
      const sameRank=a.rank===b.rank;
      const rankDiff=Math.abs(rankScore(a.rank)-rankScore(b.rank));
      const last=lastRoundAgainst(a.id,b.id);
      const sameLatest=(currentPractice()?.rounds||[]).some(r=>(r.matches||[]).some(m=>m.player1Id&&m.player2Id&&pairKey(m.player1Id,m.player2Id)===pairKey(a.id,b.id)));
      let score=0;
      if(history===0) score+=50;
      else score-=history*18;
      if(sameRank) score+=18;
      else if(rankDiff===1) score+=12;
      else if(rankDiff===2) score+=5;
      if(!sameLatest) score+=20; else score-=30;
      score+=Math.max(0,4-(Math.max(restCount(a),restCount(b))))*2;
      candidates.push({a,b,score,history,rankDiff,last});
    }
  }
  const result=[];
  const used=new Set();
  const sorted=candidates.sort((x,y)=>y.score-x.score);
  for(const c of sorted){
    if(used.has(c.a.id)||used.has(c.b.id)) continue;
    used.add(c.a.id);used.add(c.b.id);result.push(c);
  }
  if(arr.length%2===1){
    const rest=arr.filter(p=>!used.has(p.id)).sort((a,b)=>restCount(a)-restCount(b))[0];
    if(!rest){
      const swapChoices=arr.filter(p=>used.has(p.id));
      if(swapChoices.length){/* fallback handled by random regeneration */}
    }
    return {pairs:result,restPlayer:rest||null};
  }
  return {pairs:result,restPlayer:null};
}
let customPairRows=[];
let setupPairRows=[];

function openCustomMatch(){
  const p=currentPractice(); if(!p)return;
  customPairRows=[];
  const count=Math.floor(p.participantIds.length/2);
  for(let i=0;i<count;i++)customPairRows.push({a:'',b:''});
  renderCustomMatch();
  $('customMatchPanel').classList.remove('hidden');
}
function renderCustomMatch(){
  const p=currentPractice(); if(!p||!$('customMatchList'))return;
  const ids=p.participantIds.filter(id=>player(id));
  $('customMatchList').innerHTML=customPairRows.map((row,i)=>{
    const usedElsewhere=new Set();
    customPairRows.forEach((r,j)=>{
      if(j===i)return;
      if(r.a)usedElsewhere.add(r.a);
      if(r.b)usedElsewhere.add(r.b);
    });
    const options=(selected)=>ids.map(id=>{
      const q=player(id);
      const disabled=usedElsewhere.has(id)&&id!==selected;
      return '<option value="'+id+'" '+(id===selected?'selected':'')+' '+(disabled?'disabled':'')+'>'+escapeHtml(q.name)+'（'+escapeHtml(q.rank)+'級）</option>';
    }).join('');
    return '<div class="custom-pair-row"><span class="custom-pair-num">'+(i+1)+'</span>'+
      '<select class="custom-player-select" data-custom-row="'+i+'" data-side="a"><option value="">選手を選択</option>'+options(row.a)+'</select>'+
      '<span class="custom-vs">×</span>'+
      '<select class="custom-player-select" data-custom-row="'+i+'" data-side="b"><option value="">選手を選択</option>'+options(row.b)+'</select></div>';
  }).join('');
  document.querySelectorAll('.custom-player-select').forEach(s=>s.onchange=()=>{
    customPairRows[Number(s.dataset.customRow)][s.dataset.side]=s.value;
    renderCustomMatch();
  });
  const selectedIds=customPairRows.flatMap(r=>[r.a,r.b]).filter(Boolean);
  const duplicate=selectedIds.length!==new Set(selectedIds).size;
  const valid=customPairRows.filter(r=>r.a&&r.b&&r.a!==r.b);
  const invalid=customPairRows.some(r=>(r.a&&!r.b)||(!r.a&&r.b)||r.a===r.b);
  const ready=valid.length>0&&!duplicate&&!invalid;
  $('confirmCustomMatchBtn').disabled=!ready;
  $('customMatchHint').textContent=ready?valid.length+'試合を作成できます':'各試合の2人を選択してください';
}
function confirmCustomMatch(){
  const p=currentPractice(); if(!p)return;
  const pairs=[],used=new Set();
  for(const row of customPairRows){
    if(!row.a&&!row.b)continue;
    if(!row.a||!row.b||row.a===row.b){toast('すべての対戦を正しく選択してください');return}
    if(used.has(row.a)||used.has(row.b)){toast('同じ選手を複数の試合に入れられません');return}
    used.add(row.a);used.add(row.b);
    pairs.push([player(row.a),player(row.b)]);
  }
  if(!pairs.length){toast('対戦を1つ以上作ってください');return}
  generateRound(p,pairs,null);
  customPairRows=[];
  $('customMatchPanel').classList.add('hidden');
  renderPractice();
  toast(pairs.length+'試合を決定しました');
}
function ensureDealPlanForRounds(practice, roundCount){
  const rules=(practice.dealRules||[]).map(key=>DEAL_RULES.find(r=>r.key===key)).filter(Boolean);
  const rounds=Array.isArray(practice.rounds)?practice.rounds:[];
  const oldPlan=Array.isArray(practice.dealPlan)?practice.dealPlan:[];
  const result=[];

  // 既存データは「各回戦の最初の試合」の札分けを、その回戦全体の札分けとして引き継ぐ。
  for(let i=0;i<rounds.length&&i<roundCount;i++){
    const firstMatch=rounds[i]?.matches?.[0];
    const existing=rounds[i]?.dealInstruction || firstMatch?.dealInstruction || oldPlan[i] || null;
    if(existing) result.push({...existing,round:i+1});
  }

  for(let i=result.length;i<roundCount;i++){
    if(!rules.length)break;
    const previous=result[i-1]?.key||'';
    const next=makeDealInstruction(rules,previous);
    result.push({round:i+1,key:next.key,text:next.text});
  }

  practice.dealPlan=result;
  return result;
}

function syncMatchDealPlans(practice){
  // 札分けは回戦単位で管理する。各組には札分けを持たせない。
  (practice.rounds||[]).forEach((round,roundIndex)=>{
    if(!round.dealInstruction){
      const legacy=round.matches?.[0]?.dealInstruction || practice.dealPlan?.[roundIndex] || null;
      if(legacy)round.dealInstruction={...legacy,round:roundIndex+1};
    }
  });
  return (practice.rounds||[]).reduce((n,r)=>n+(r.matches?.length||0),0);
}

function generateRound(practice, pairs, restPlayerId=null){
  const roundNo=(practice.rounds?.length||0)+1;
  practice.rounds=practice.rounds||[];

  // 札分けは「試合」単位ではなく「回戦」単位で決める。
  // 1回戦に2試合あれば、2試合とも同じ札分けになる。
  ensureDealPlanForRounds(practice,roundNo);

  const roundDeal=practice.dealPlan?.[roundNo-1]||null;
  const currentMatchCount=practice.rounds.reduce((n,r)=>n+(r.matches?.length||0),0);

  const matches=pairs.map((pair,idx)=>({
    id:uid('match'),
    index:idx+1,
    matchNo:currentMatchCount+idx+1,
    player1Id:pair[0].id,
    player2Id:pair[1].id,
    status:'未実施',
    winnerId:null,
    score1:null,
    score2:null,
    cardSet:null,
    dealInstruction:null,
    createdAt:new Date().toISOString()
  }));

  practice.rounds.push({
    id:uid('round'),
    round:roundNo,
    matches,
    // 札分けは回戦全体で共通。各組にはコピーせず、回戦に保持する。
    dealInstruction:roundDeal ? {...roundDeal,round:roundNo} : null,
    restPlayerId:restPlayerId||null,
    createdAt:new Date().toISOString()
  });

  syncMatchDealPlans(practice);
  practice.updatedAt=new Date().toISOString();
  state.currentPracticeId=practice.id;
  save();
}
function generateRecommendedRound(){
  const p=currentPractice(); if(!p)return;
  const ids=p.participantIds.filter(id=>player(id));
  const rec=makeRecommendations(ids);
  if(!rec.pairs.length){toast('組み合わせを作れる参加者が足りません');return}
  generateRound(p,rec.pairs,rec.restPlayer?.id||null);
  recommendedPairs=[];
  renderPractice();
  renderHome();
  renderHistory();
  toast('おすすめ対戦を追加しました');
}
function generateRandomRound(){
  const p=currentPractice(); if(!p)return;
  const arr=shuffle(p.participantIds.map(player).filter(Boolean));
  const pairs=[];
  for(let i=0;i+1<arr.length;i+=2)pairs.push([arr[i],arr[i+1]]);
  const rest=arr.length%2?arr[arr.length-1]:null;
  generateRound(p,pairs,rest?.id||null);
  renderPractice();
  renderHome();
  renderHistory();
  toast('ランダムで次の試合を追加しました');
}
function renderHome(){
  const p=currentPractice();
  if(p)syncMatchDealPlans(p);
  $('homeEmpty').classList.toggle('hidden',!p);
  $('homeCurrent').classList.toggle('hidden',!p);
  if(!p)return;
  $('homeDate').textContent=p.date;
  $('homeParticipants').textContent=(p.participantIds?.length||0)+'人';
  $('homeMatches').textContent=(p.rounds||[]).reduce((n,r)=>n+(r.matches?.length||0),0)+'試合';
  $('homeMatchesList').innerHTML=(p.rounds||[]).map(roundCompactHtml).join('')||'<div class="empty-small">まだ試合がありません。</div>';
  const homeList=$('homeMatchesList');
  homeList.onclick=e=>{
    const winnerBtn=e.target.closest('[data-home-winner]');
    if(winnerBtn){
      const row=winnerBtn.closest('.match-row');
      const selectedId=winnerBtn.dataset.homeWinner;
      row.querySelector('.home-winner-select').value=selectedId;
      row.querySelectorAll('[data-home-winner]').forEach(x=>{
        const selected=x.dataset.homeWinner===selectedId;
        x.classList.toggle('selected',selected);
        x.textContent=selected?'○':'×';
      });
      return;
    }
    const saveBtn=e.target.closest('[data-save-home-result]');
    if(saveBtn)saveHomeResult(saveBtn.dataset.saveHomeResult);
  };
}
function openHomeResultEditor(id){
  const found=findMatch(id);
  if(!found)return;
  const {m}=found,a=player(m.player1Id),b=player(m.player2Id);
  const content=$('homeMatchesList').querySelector('[data-home-result="'+id+'"]')?.closest('.match-row')?.querySelector('.match-content');
  if(!content)return;
  const currentWinner=m.winnerId||'';
  const currentScore=currentWinner?(currentWinner===m.player1Id?m.score1:m.score2):'';
  content.innerHTML=
    '<div class="home-result-editor">'+
      '<div class="result-line-input">'+
        '<span class="result-name">'+escapeHtml(a?.name||'—')+' <small class="result-rank">('+escapeHtml(playerDisplayRank(a))+')</small></span>'+
        '<button type="button" class="result-symbol home-result-symbol '+(currentWinner===m.player1Id?'selected':'')+'" data-home-winner="'+m.player1Id+'">'+(currentWinner===m.player1Id?'○':'×')+'</button>'+
        '<input class="winner-score-input inline home-winner-score" type="number" min="0" max="25" value="'+(currentScore??'')+'" placeholder="数字">'+
        '<button type="button" class="result-symbol home-result-symbol '+(currentWinner===m.player2Id?'selected':'')+'" data-home-winner="'+m.player2Id+'">'+(currentWinner===m.player2Id?'○':'×')+'</button>'+
        '<span class="result-name right">'+escapeHtml(b?.name||'—')+' <small class="result-rank">('+escapeHtml(playerDisplayRank(b))+')</small></span>'+
      '</div>'+
      '<small class="result-score-note">数字＝勝った側の残り札</small>'+
      '<div class="home-result-actions"><button type="button" class="mini-btn primary-home-result" data-save-home-result="'+id+'">決定</button><button type="button" class="mini-btn" data-cancel-home-result="'+id+'">閉じる</button></div>'+
      '<input type="hidden" class="home-winner-select" value="'+currentWinner+'">'+
    '</div>';
  document.querySelectorAll('#homeMatchesList [data-home-winner]').forEach(btn=>btn.onclick=()=>{
    const row=btn.closest('.match-row');
    row.querySelector('.home-winner-select').value=btn.dataset.homeWinner;
    row.querySelectorAll('[data-home-winner]').forEach(x=>{
      const selected=x.dataset.homeWinner===btn.dataset.homeWinner;
      x.classList.toggle('selected',selected);
      x.textContent=selected?'○':'×';
    });
  });
  document.querySelectorAll('#homeMatchesList [data-save-home-result]').forEach(btn=>btn.onclick=()=>saveHomeResult(btn.dataset.saveHomeResult));
  document.querySelectorAll('#homeMatchesList [data-cancel-home-result]').forEach(btn=>btn.onclick=()=>renderHome());
}

function saveHomeResult(id){
  const found=findMatch(id);
  if(!found)return;
  const row=$('homeMatchesList').querySelector('[data-save-home-result="'+id+'"]')?.closest('.match-row');
  if(!row)return;
  const winner=row.querySelector('.home-winner-select')?.value||'';
  const rawScore=row.querySelector('.home-winner-score')?.value??'';
  if(!winner){toast('○になる側を選択してください');return}
  if(rawScore===''){toast('○側の残り札を入力してください');return}
  const parsedScore=Number(rawScore);
  if(!Number.isFinite(parsedScore)||!Number.isInteger(parsedScore)||parsedScore<0||parsedScore>25){
    toast('数字は0〜25の整数で入力してください');return;
  }
  const winnerScore=parsedScore;
  const loserScore=25-winnerScore;
  found.m.winnerId=winner;
  found.m.score1=winner===found.m.player1Id?winnerScore:loserScore;
  found.m.score2=winner===found.m.player2Id?winnerScore:loserScore;
  found.m.status='終了';
  save();
  renderHome();
  toast('結果を決定しました');
}

function roundCompactHtml(r){
  const deal=r.dealInstruction?.text?'　札分け：'+escapeHtml(r.dealInstruction.text):'';
  return '<div class="round-card compact"><div class="round-head"><b>'+r.round+'回戦'+deal+'</b><span class="muted">'+(r.matches?.length||0)+'試合'+(r.restPlayerId?'・休み：'+escapeHtml(player(r.restPlayerId)?.name||'—'):'')+'</span></div>'+
    (r.matches||[]).map(m=>matchCompactHtml(m)).join('')+'</div>';
}
function matchCompactHtml(m){
  const a=player(m.player1Id),b=player(m.player2Id);
  const deal='';
  const currentWinner=m.winnerId||'';
  const currentScore=currentWinner?(currentWinner===m.player1Id?m.score1:m.score2):'';
  const resultEditor=
    '<div class="home-result-editor home-result-always">'+
      '<div class="result-line-input">'+
        '<span class="result-name">'+escapeHtml(a?.name||'—')+' <small class="result-rank">('+escapeHtml(playerDisplayRank(a))+')</small></span>'+
        '<button type="button" class="result-symbol home-result-symbol '+(currentWinner===m.player1Id?'selected':'')+'" data-home-winner="'+m.player1Id+'">'+(currentWinner===m.player1Id?'○':'×')+'</button>'+
        '<input class="winner-score-input inline home-winner-score" type="number" min="0" max="25" value="'+(currentScore??'')+'" placeholder="数字" aria-label="勝った側の残り札">'+
        '<button type="button" class="result-symbol home-result-symbol '+(currentWinner===m.player2Id?'selected':'')+'" data-home-winner="'+m.player2Id+'">'+(currentWinner===m.player2Id?'○':'×')+'</button>'+
        '<span class="result-name right">'+escapeHtml(b?.name||'—')+' <small class="result-rank">('+escapeHtml(playerDisplayRank(b))+')</small></span>'+
      '</div>'+
      '<small class="result-score-note">数字＝勝った側の残り札</small>'+
      '<input type="hidden" class="home-winner-select" value="'+currentWinner+'">'+
      '<button type="button" class="mini-btn primary-home-result" data-save-home-result="'+m.id+'">'+(m.winnerId?'結果を更新':'結果を決定')+'</button>'+
    '</div>';
  return '<div class="match-row"><span class="court">'+m.index+'</span><div class="match-content"><div class="match-names"><b>'+escapeHtml(a?.name||'—')+'</b><span> vs </span><b>'+escapeHtml(b?.name||'—')+'</b></div>'+resultEditor+deal+'</div></div>';
}
function statusClass(s){return s==='終了'?'done':s==='進行中'?'live':''}
function renderRounds(p){
  $('roundsList').innerHTML=(p.rounds||[]).length ? p.rounds.map(r=>roundHtml(r,p)).join('') :
    '<div class="empty-card"><div class="empty-icon">対</div><h3>まだ対戦がありません</h3><p>「おすすめ対戦」か「次の試合」から作成できます。</p></div>';
  document.querySelectorAll('[data-open-match]').forEach(b=>b.onclick=()=>openMatchModal(b.dataset.openMatch));
}

function roundHtml(r,p){
  const rest=r.restPlayerId?player(r.restPlayerId):null;
  const deal=r.dealInstruction?.text?'　札分け：'+escapeHtml(r.dealInstruction.text)+' <button class="mini-btn" data-copy-round-deal="'+r.id+'">コピー</button>':'';
  return '<div class="round-card"><div class="round-head"><div><div class="eyebrow">ROUND '+r.round+'</div><h3>'+r.round+'回戦'+deal+'</h3></div><div class="round-head-right"><span class="muted">'+(r.matches?.length||0)+'試合</span>'+(rest?'<span class="rest-badge">休み：'+escapeHtml(rest.name)+'</span>':'')+'</div></div>'+
    (r.matches||[]).map(m=>matchCardHtml(m)).join('')+'</div>';
}
function homeResultDisplayHtml(m){
  if(!m.winnerId)return '';
  const winner=player(m.winnerId);
  const s1=Number(m.score1),s2=Number(m.score2);
  const diff=(Number.isFinite(s1)&&Number.isFinite(s2))?Math.abs(s1-s2):null;
  return '<div class="home-result-summary"><b>'+escapeHtml(winner?.name||'—')+'</b>'+(diff!=null?' <span>'+diff+'枚差で勝ち</span>':' <span>勝ち</span>')+'</div>';
}
function resultDisplayHtml(m){
  if(!m.winnerId)return '';
  const p1=player(m.player1Id),p2=player(m.player2Id);
  const leftWon=m.winnerId===m.player1Id;
  const winnerScore=leftWon?m.score1:m.score2;
  const number=winnerScore!=null?'<strong>'+escapeHtml(String(winnerScore))+'</strong>':'';
  return '<div class="result-display"><b>'+escapeHtml(p1?.name||'—')+'</b><span>'+(leftWon?'○':'×')+'</span>'+
    (leftWon?number:'')+
    '<span>'+(leftWon?'×':'○')+'</span>'+
    (!leftWon?number:'')+
    '<b>'+escapeHtml(p2?.name||'—')+'</b></div>';
}
function matchCardHtml(m){
  const a=player(m.player1Id),b=player(m.player2Id);
  const generatedDeal='';
  const deal=m.cardSet?'<span class="deal-badge">札'+(m.cardSetId||'')+'</span>':'';
  const body=m.winnerId
    ? resultDisplayHtml(m)
    : '<div class="player-names"><div><b>'+escapeHtml(a?.name||'—')+'</b><small>'+escapeHtml(playerDisplayRank(a))+'</small></div><span class="vs">vs</span><div class="right-name"><b>'+escapeHtml(b?.name||'—')+'</b><small>'+escapeHtml(playerDisplayRank(b))+'</small></div></div><div class="match-foot"><span class="status-dot">'+escapeHtml(m.status)+'</span>'+deal+'</div>';
  const action=m.winnerId
    ? '<button class="open-match" data-open-match="'+m.id+'">結果確認</button>'
    : '<button class="open-match result-input-btn" data-open-match="'+m.id+'">結果入力</button>';
  return '<div class="match-card"><div class="court-big">'+m.index+'</div><div class="match-main">'+body+generatedDeal+'</div>'+action+'</div>';
}
function renderPractice(){
  const p=currentPractice(); if(!p){showScreen('screenHome');return}
  syncMatchDealPlans(p);
  $('practiceTitle').textContent=p.date+' の練習';
  $('practiceParticipantCount').textContent=(p.participantIds?.length||0)+'人';
  $('practiceRoundCount').textContent=(p.rounds?.length||0)+'試合';
  renderRounds(p);
}
function renderSetup(){
  $('practiceDate').value=$('practiceDate').value||today();
  $('playerSearch').value='';
  selectedPairingGoals={};
  renderPlayerSelect();
}
function renderPlayerSelect(){
  const q=$('playerSearch').value.trim().toLowerCase();
  const filtered=state.players.filter(p=>p.name.toLowerCase().includes(q));
  $('noPlayersHint').classList.toggle('hidden',state.players.length!==0);
  $('playerSelectList').innerHTML=filtered.map(p=>{
    const goal=selectedPairingGoals[p.id]||'normal';
    const note=goal==='coaching'?'格上を優先':goal==='tuning'?'格下を優先':'級が近い相手を優先';
    return '<div class="player-check participant-goal-row">'+
      '<label><input type="checkbox" data-player-select="'+p.id+'" '+(selectedPlayers.has(p.id)?'checked':'')+'><span class="check-ui"></span><span class="player-check-main"><b>'+escapeHtml(p.name)+'</b><small>'+escapeHtml(playerDisplayRank(p))+(p.affiliation?.trim()?'・'+escapeHtml(p.affiliation.trim()):'')+'</small></span></label>'+
      '<div class="participant-goal"><select data-player-goal="'+p.id+'" aria-label="'+escapeHtml(p.name)+'の今日の目的">'+
      '<option value="normal" '+(goal==='normal'?'selected':'')+'>通常</option>'+
      '<option value="coaching" '+(goal==='coaching'?'selected':'')+'>指導</option>'+
      '<option value="tuning" '+(goal==='tuning'?'selected':'')+'>調整</option>'+
      '</select><small>'+note+'</small></div></div>';
  }).join('');
  document.querySelectorAll('[data-player-select]').forEach(c=>c.onchange=()=>{c.checked?selectedPlayers.add(c.dataset.playerSelect):selectedPlayers.delete(c.dataset.playerSelect);updateSelectedCount()});
  document.querySelectorAll('[data-player-goal]').forEach(s=>s.onchange=()=>{selectedPairingGoals[s.dataset.playerGoal]=s.value});
  updateSelectedCount();
}
function updateSelectedCount(){
  const count=selectedPlayers.size;
  $('selectedCount').textContent=count+'人';
  if($('setupSelectionHint'))$('setupSelectionHint').textContent=count>=2?count+'人を選択中':'2人以上選択してください';
}
function winRateText(wins,total){
  return total?((wins/total)*100).toFixed(1)+'%':'—';
}
function calculatePlayerStats(playerId){
  const stats={wins:0,losses:0,total:0,byRank:{},byOpponent:{},recent:[]};
  const matches=[];
  for(const practice of state.practices){
    for(const round of practice.rounds||[]){
      for(const match of round.matches||[]){
        if(!match.winnerId) continue;
        if(match.player1Id!==playerId && match.player2Id!==playerId) continue;
        const opponentId=match.player1Id===playerId?match.player2Id:match.player1Id;
        const opponent=player(opponentId);
        if(!opponent) continue;
        const win=match.winnerId===playerId;
        stats.total++;
        if(win)stats.wins++;else stats.losses++;
        const rank=opponent.rank||'その他';
        if(!stats.byRank[rank])stats.byRank[rank]={wins:0,losses:0,total:0};
        stats.byRank[rank].total++;
        if(win)stats.byRank[rank].wins++;else stats.byRank[rank].losses++;
        if(!stats.byOpponent[opponentId])stats.byOpponent[opponentId]={player:opponent,wins:0,losses:0,total:0};
        stats.byOpponent[opponentId].total++;
        if(win)stats.byOpponent[opponentId].wins++;else stats.byOpponent[opponentId].losses++;
        stats.recent.push({
          practiceDate:practice.date,
          round:round.round,
          match,
          opponent,
          win
        });
      }
    }
  }
  stats.recent.sort((a,b)=>{
    const da=(a.practiceDate||'')+' '+String(a.round).padStart(3,'0');
    const db=(b.practiceDate||'')+' '+String(b.round).padStart(3,'0');
    return db.localeCompare(da);
  });
  return stats;
}
function openPlayerStats(id){
  const p=player(id); if(!p)return;
  const s=calculatePlayerStats(id);
  const rankOrder=['A','B','C','D','E','その他'];
  const byRank=rankOrder.filter(rank=>s.byRank[rank]).map(rank=>{
    const x=s.byRank[rank];
    return '<div class="stats-row"><div><b>対 '+escapeHtml(rankText(rank))+'</b><small>'+x.total+'試合</small></div><strong>'+winRateText(x.wins,x.total)+'</strong><span>'+x.wins+'勝 '+x.losses+'敗</span></div>';
  }).join('');
  const byOpponent=Object.values(s.byOpponent).sort((a,b)=>b.total-a.total||b.wins-a.wins).map(x=>{
    return '<div class="stats-opponent-row"><div><b>'+escapeHtml(x.player.name)+'</b><small>'+escapeHtml(rankText(x.player.rank))+'</small></div><strong>'+winRateText(x.wins,x.total)+'</strong><span>'+x.wins+'勝 '+x.losses+'敗</span></div>';
  }).join('');
  const recent=s.recent.slice(0,10).map(x=>{
    const score=x.match.score1!=null&&x.match.score2!=null
      ?(x.match.player1Id===id?x.match.score1+' - '+x.match.score2:x.match.score2+' - '+x.match.score1)
      :'結果のみ';
    return '<div class="result-history-row"><div><b>'+escapeHtml(x.opponent.name)+'</b><small>'+escapeHtml(x.practiceDate)+'・第'+x.round+'試合</small></div><span class="'+(x.win?'result-win':'result-loss')+'">'+(x.win?'勝':'負')+'</span><span class="result-score">'+escapeHtml(String(score))+'</span></div>';
  }).join('');
  $('modalRoot').innerHTML='<div class="modal-overlay"><div class="modal-card player-stats-modal"><div class="modal-head"><div><div class="eyebrow">PLAYER STATS</div><h3>'+escapeHtml(p.name)+'</h3><p class="stats-rank-line">'+escapeHtml(rankText(p.rank))+'・サークル内戦績</p></div><button id="closePlayerStats" class="icon-btn">×</button></div>'+
    '<div class="stats-overview"><div><small>勝率</small><strong>'+winRateText(s.wins,s.total)+'</strong></div><div><small>勝ち</small><strong>'+s.wins+'</strong></div><div><small>負け</small><strong>'+s.losses+'</strong></div><div><small>試合数</small><strong>'+s.total+'</strong></div></div>'+
    '<section class="stats-section"><div class="stats-section-head"><h4>相手の級別</h4><span>サークル内</span></div>'+(byRank||'<div class="empty-small">まだ対戦結果がありません。</div>')+'</section>'+
    '<section class="stats-section"><div class="stats-section-head"><h4>対戦相手別</h4><span>勝率・戦績</span></div>'+(byOpponent||'<div class="empty-small">まだ対戦結果がありません。</div>')+'</section>'+
    '<section class="stats-section"><div class="stats-section-head"><h4>最近の対戦結果</h4><span>最大10件</span></div>'+(recent||'<div class="empty-small">まだ対戦結果がありません。</div>')+'</section>'+
    '</div></div>';
  $('closePlayerStats').onclick=closeModal;
}
function renderPlayers(){
  $('playerCount').textContent=state.players.length+'人';
  $('playersList').innerHTML=state.players.length?state.players.map(p=>{
    const s=calculatePlayerStats(p.id);
    const summary=s.total? s.wins+'勝 '+s.losses+'敗・'+winRateText(s.wins,s.total):'対戦結果なし';
    return '<div class="player-card"><div class="player-avatar">'+escapeHtml(p.name.slice(0,1))+'</div><button class="player-detail-button" data-player-detail="'+p.id+'"><span class="player-detail-name">'+escapeHtml(p.name)+'</span><span>'+escapeHtml(playerDisplayRank(p))+(p.affiliation?.trim()?'('+escapeHtml(p.affiliation.trim())+')':'')+'・'+summary+'</span></button><div class="player-actions"><button class="icon-btn edit-player" data-id="'+p.id+'">編集</button><button class="icon-btn danger-text delete-player" data-id="'+p.id+'">削除</button></div></div>';
  }).join(''):'<div class="empty-card"><div class="empty-icon">人</div><h3>選手がいません</h3><p>上のフォームから登録してください。</p></div>';
  document.querySelectorAll('.player-detail-button').forEach(b=>b.onclick=()=>openPlayerStats(b.dataset.playerDetail));
  document.querySelectorAll('.edit-player').forEach(b=>b.onclick=()=>editPlayer(b.dataset.id));
  document.querySelectorAll('.delete-player').forEach(b=>b.onclick=()=>deletePlayer(b.dataset.id));
}
function addPlayer(){
  const name=$('newPlayerName').value.trim(), rank=$('newPlayerRank').value;
  if(!name){toast('名前を入力してください');return}
  if(state.players.some(p=>p.name===name)){toast('同じ名前が登録されています');return}
  const displayRank=$('newPlayerDisplayRank')?.value.trim()||'';
  const affiliation=$('newPlayerAffiliation')?.value.trim()||'';
  state.players.push({id:uid('player'),name,rank,displayRank,affiliation});
  save();$('newPlayerName').value='';if($('newPlayerDisplayRank'))$('newPlayerDisplayRank').value='';if($('newPlayerAffiliation'))$('newPlayerAffiliation').value='';renderPlayers();toast(name+' を登録しました');
}
function editPlayer(id){
  const p=player(id); if(!p)return;
  const name=prompt('名前',p.name); if(name===null)return;
  const clean=name.trim(); if(!clean)return;
  const rank=prompt('級（A/B/C/D/E/その他）',p.rank); if(rank===null)return;
  const displayRank=prompt('表示用の段位・級（例：五段、八段、A級）',p.displayRank||rankText(p.rank)); if(displayRank===null)return;
  const affiliation=prompt('所属（例：東京明静会）',p.affiliation||''); if(affiliation===null)return;
  p.name=clean;
  p.rank=RANKS.includes(rank.trim())?rank.trim():'その他';
  p.displayRank=displayRank.trim();
  p.affiliation=affiliation.trim();
  save();renderPlayers();renderHome();renderPractice();toast('選手情報を更新しました');
}
function deletePlayer(id){
  const p=player(id);if(!p)return;
  if(!confirm(p.name+' を削除しますか？\\n過去の履歴は削除せず、表示できる名前だけ残します。'))return;
  state.players=state.players.filter(x=>x.id!==id);
  selectedPlayers.delete(id);save();renderPlayers();toast('削除しました');
}
function createPractice(){
  const ids=[...selectedPlayers];
  if(ids.length<2){toast('2人以上を選んでください');return}

  // 「対戦を組む」を押した時点で、まずおすすめの組み合わせを自動作成する。
  // そのまま「試合を開始する」を押せるようにする。
  const rec=buildRankRecommendedPairs(ids);
  setupPairRows=rec.pairs.map(pair=>({a:pair[0].id,b:pair[1].id}));
  if(rec.restPlayer)setupPairRows.push({a:rec.restPlayer.id,b:'',rest:true});

  $('setupPairingSection').classList.remove('hidden');
  $('setupPairingModeHint').textContent='おすすめの対戦を自動で組みました。必要なら変更できます。';
  renderSetupPairing(ids);
  $('setupPairingSection').scrollIntoView({behavior:'smooth',block:'start'});
}

function renderSetupPairing(ids=[...selectedPlayers]){
  const validIds=ids.map(id=>player(id)).filter(Boolean).map(p=>p.id);
  $('setupPairingList').innerHTML=setupPairRows.map((row,i)=>{
    if(row.rest){
      const options=validIds.map(id=>{
        const p=player(id);
        return '<option value="'+id+'" '+(id===row.a?'selected':'')+'>'+escapeHtml(p.name)+'（'+escapeHtml(playerDisplayRank(p))+'）</option>';
      }).join('');
      return '<div class="custom-pair-row"><span class="custom-pair-num">休</span><select class="setup-player-select custom-player-select" data-setup-row="'+i+'" data-side="a"><option value="">休みの選手を選択</option>'+options+'</select></div>';
    }
    const usedElsewhere=new Set();
    setupPairRows.forEach((r,j)=>{
      if(j===i||r.rest)return;
      if(r.a)usedElsewhere.add(r.a); if(r.b)usedElsewhere.add(r.b);
    });
    const options=(selected)=>validIds.map(id=>{
      const p=player(id),disabled=usedElsewhere.has(id)&&id!==selected;
      return '<option value="'+id+'" '+(id===selected?'selected':'')+' '+(disabled?'disabled':'')+'>'+escapeHtml(p.name)+'（'+escapeHtml(playerDisplayRank(p))+'）</option>';
    }).join('');
    return '<div class="custom-pair-row"><span class="custom-pair-num">'+(i+1)+'</span>'+
      '<select class="setup-player-select custom-player-select" data-setup-row="'+i+'" data-side="a"><option value="">選手を選択</option>'+options(row.a)+'</select>'+
      '<span class="custom-vs">×</span>'+
      '<select class="setup-player-select custom-player-select" data-setup-row="'+i+'" data-side="b"><option value="">選手を選択</option>'+options(row.b)+'</select></div>';
  }).join('');
  document.querySelectorAll('.setup-player-select').forEach(el=>el.onchange=()=>{
    setupPairRows[Number(el.dataset.setupRow)][el.dataset.side]=el.value;
    renderSetupPairing(validIds);
  });
  const selected=setupPairRows.flatMap(r=>r.rest?[r.a]:[r.a,r.b]).filter(Boolean);
  const duplicate=selected.length!==new Set(selected).size;
  const invalid=setupPairRows.some(r=>r.rest?!r.a:(!r.a||!r.b||r.a===r.b));
  const matchCount=setupPairRows.filter(r=>!r.rest&&r.a&&r.b&&r.a!==r.b).length;
  const ready=matchCount>0&&!duplicate&&!invalid;
  $('startPracticeBtn').disabled=!ready;
  $('setupPairingHint').textContent=ready?matchCount+'試合を組みました。':'各試合の2人を選択してください';
}

function buildRankRecommendedPairs(ids){
  const arr=ids.map(player).filter(Boolean);
  if(arr.length<2)return {pairs:[],restPlayer:null};
  const goal=id=>selectedPairingGoals[id]||'normal';
  const score=(a,b)=>{
    const ra=rankScore(a.rank),rb=rankScore(b.rank),diff=Math.abs(ra-rb);
    let s=0;
    const ga=goal(a.id),gb=goal(b.id);
    if(ga==='coaching')s+=rb>ra?1000:rb===ra?120:-500;
    else if(ga==='tuning')s+=rb<ra?1000:rb===ra?120:-500;
    else s+=diff===0?500:diff===1?360:diff===2?120:0;
    if(gb==='coaching')s+=ra>rb?1000:ra===rb?120:-500;
    else if(gb==='tuning')s+=ra<rb?1000:ra===rb?120:-500;
    else s+=diff===0?500:diff===1?360:diff===2?120:0;
    return s+Math.random()*0.01;
  };
  const candidates=[];
  for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++)candidates.push({a:arr[i],b:arr[j],score:score(arr[i],arr[j])});
  candidates.sort((a,b)=>b.score-a.score);
  const used=new Set(),pairs=[];
  for(const x of candidates){
    if(used.has(x.a.id)||used.has(x.b.id))continue;
    used.add(x.a.id);used.add(x.b.id);pairs.push([x.a,x.b]);
  }
  const restPlayer=arr.find(p=>!used.has(p.id))||null;
  return {pairs,restPlayer};
}

function applySetupCustomPairing(){
  const ids=[...selectedPlayers];
  setupPairRows=[];
  for(let i=0;i<Math.floor(ids.length/2);i++)setupPairRows.push({a:'',b:''});
  if(ids.length%2)setupPairRows.push({a:'',b:'',rest:true});
  $('setupPairingModeHint').textContent='参加者を自由に選んで対戦を組めます。';
  $('startPracticeBtn').disabled=true;
  renderSetupPairing(ids);
}

function applySetupRecommendedPairing(){
  const ids=[...selectedPlayers];
  const rec=buildRankRecommendedPairs(ids);
  setupPairRows=rec.pairs.map(pair=>({a:pair[0].id,b:pair[1].id}));
  if(rec.restPlayer)setupPairRows.push({a:rec.restPlayer.id,b:'',rest:true});
  $('setupPairingModeHint').textContent='級が近い順に組み合わせています。必要ならこのあと手動で変更できます。';
  renderSetupPairing(ids);
  toast('級が近いおすすめ対戦を作りました');
}

function buildDealPlanForMatches(practice, matchCount){
  // 初回の対戦開始時は、設定した札分けプランをそのまま利用する。
  // まだ生成していなければ、選択したルールから必要数を自動生成する。
  const count=Math.max(1,Math.min(7,Number(matchCount)||1));
  const existing=Array.isArray(practice.dealPlan)?practice.dealPlan.filter(Boolean):[];
  const rules=(practice.dealRules||[]).map(key=>DEAL_RULES.find(r=>r.key===key)).filter(Boolean);
  if(existing.length>=count){
    practice.dealPlan=existing.slice(0,count);
    return practice.dealPlan;
  }
  let lastKey=existing.at(-1)?.key||'';
  const plan=[...existing];
  for(let i=plan.length;i<count;i++){
    const usable=rules.length?rules:DEAL_RULES;
    const next=makeDealInstruction(usable,lastKey);
    lastKey=next.key;
    plan.push({round:i+1,key:next.key,text:next.text});
  }
  practice.dealPlan=plan;
  return plan;
}
function startPracticeFromSetup(){
  const ids=[...selectedPlayers];
  const pairs=[],used=new Set(); let restId=null;
  for(const row of setupPairRows){
    if(row.rest){restId=row.a||null;continue}
    if(!row.a||!row.b||row.a===row.b){toast('すべての対戦を正しく選択してください');return}
    if(used.has(row.a)||used.has(row.b)){toast('同じ選手を複数の試合に入れられません');return}
    used.add(row.a);used.add(row.b);
    pairs.push([player(row.a),player(row.b)]);
  }
  if(!pairs.length){toast('対戦を1つ以上作ってください');return}
  const participantIds=ids.filter(id=>player(id));
  const selected=selectedDealRules();
  const p={id:uid('practice'),date:today(),note:$('practiceNote').value.trim(),participantIds,rounds:[],pairingGoals:{...selectedPairingGoals},dealPlan:[...pendingDealPlan],dealRules:selected.map(r=>r.key),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
buildDealPlanForMatches(p,pairs.length);
  state.practices.unshift(p);state.currentPracticeId=p.id;
  generateRound(p,pairs,restId);
  save();showScreen('screenHome');toast('1試合目を開始しました');
}
function openCurrentPractice(){
  if(currentPractice())showScreen('screenPractice');else showScreen('screenSetup');
}
function openNewPractice(){
  selectedPlayers=new Set();setupPairRows=[];
  if($('dealPlanCount'))$('dealPlanCount').innerHTML=Array.from({length:7},(_,i)=>'<option value="'+(i+1)+'" '+(i===4?'selected':'')+'>'+(i+1)+'試合</option>').join('');
  $('practiceDate').value=today();$('practiceNote').value='';resetDealPlan();$('dealPlanCount').value=5;
  document.querySelectorAll('[data-deal-rule]').forEach(x=>x.checked=true);
  $('setupPairingSection').classList.add('hidden');
  showScreen('screenSetup');
}
function openHistoryItem(id){
  state.currentPracticeId=id;save();showScreen('screenPractice');
}
function historyMatchHtml(m,p){
  const a=player(m.player1Id),b=player(m.player2Id);
  const winner=m.winnerId?player(m.winnerId):null;
  const score=m.winnerId?(m.winnerId===m.player1Id?m.score1:m.score2):null;
  const result=m.winnerId
    ? '<div class="history-detail-row"><span>結果</span><b>'+escapeHtml(winner?.name||'—')+' '+escapeHtml(String(score??''))+'枚差で勝ち</b></div>'
    : '<div class="history-detail-row"><span>結果</span><span class="muted">未実施</span></div>';
  return '<div class="history-match-card"><div class="history-match-title"><span>'+m.index+'組目</span><b>'+escapeHtml(a?.name||'—')+' vs '+escapeHtml(b?.name||'—')+'</b><button type="button" class="secondary-btn history-edit-btn" data-history-edit="'+escapeHtml(m.id)+'">結果を編集</button></div>'+result+'</div>';
}
function historyRoundHtml(r,p){
  const firstMatch=r.matches?.[0];
  const deal=r.dealInstruction?.text
    ? r.dealInstruction
    : firstMatch?.dealInstruction?.text
      ? firstMatch.dealInstruction
      : p.dealPlan?.[Number(r.round)-1]||null;
  const dealHtml=deal?.text
    ? '　札分け：'+escapeHtml(deal.text)
    : '';
  const matches=r.matches||[];
  return '<div class="history-round-card">'+
    '<div class="history-round-head"><div><div class="eyebrow">ROUND '+escapeHtml(String(r.round))+'</div><h4>'+escapeHtml(String(r.round))+'回戦'+dealHtml+'</h4></div><span class="muted">'+matches.length+'試合</span></div>'+
    '<div class="history-round-matches">'+matches.map(m=>historyMatchHtml(m,p)).join('')+'</div>'+
    '</div>';
}
function renderHistory(){
  state.practices.forEach(p=>{
    syncMatchDealPlans(p);
    // 札分けは回戦単位で保持。既存データは1組目の設定から回戦設定を復元する。
    (p.rounds||[]).forEach((r,i)=>{
      if(!r.dealInstruction){
        const deal=r.matches?.[0]?.dealInstruction||p.dealPlan?.[i]||null;
        if(deal)r.dealInstruction={...deal,round:r.round};
      }
    });
  });
  $('historyEmpty').classList.toggle('hidden',state.practices.length>0);
  $('historyList').innerHTML=state.practices.map(p=>{
    const total=(p.rounds||[]).reduce((n,r)=>n+(r.matches?.length||0),0);
    const details=(p.rounds||[]).length
      ? '<div class="history-rounds">'+p.rounds.map(r=>historyRoundHtml(r,p)).join('')+'</div>'
      : '<div class="empty-small">まだ試合がありません。</div>';
    return '<div class="history-card history-card-detail"><div class="history-card-head"><div><div class="eyebrow">'+escapeHtml(p.date)+'</div><h3>'+escapeHtml(p.title||'練習')+'</h3><span class="muted">'+(p.participantIds?.length||0)+'人・'+total+'試合'+(p.note?'・'+escapeHtml(p.note):'')+'</span></div></div>'+details+'</div>';
  }).join('');
  document.querySelectorAll('[data-history-edit]').forEach(btn=>btn.onclick=()=>{
    const matchId=btn.dataset.historyEdit;
    const found=state.practices.flatMap(p=>p.rounds||[]).flatMap(r=>r.matches||[]).find(m=>m.id===matchId);
    if(!found)return;
    const owningPractice=state.practices.find(p=>(p.rounds||[]).some(r=>(r.matches||[]).some(m=>m.id===matchId)));
    if(!owningPractice)return;
    state.currentPracticeId=owningPractice.id;
    save();
    openMatchModal(matchId);
  });
}
function openRecommend(){
  const p=currentPractice(); if(!p)return;
  const rec=makeRecommendations(p.participantIds);
  recommendedPairs=rec.pairs;
  $('recommendList').innerHTML=rec.pairs.length?rec.pairs.map((x,i)=>'<div class="suggestion-row"><span class="suggestion-num">'+(i+1)+'</span><div><b>'+escapeHtml(x.a.name)+' <span>vs</span> '+escapeHtml(x.b.name)+'</b><small>'+x.a.rank+'級 × '+x.b.rank+'級　／　過去 '+x.history+' 回'+(x.history===0?'・初対戦':'')+'</small></div><span class="suggestion-reason">'+reasonText(x)+'</span></div>').join(''):'<div class="empty-small">候補を作れませんでした。</div>';
  const rest= p.participantIds.map(player).filter(Boolean).sort((a,b)=>restCount(a)-restCount(b))[0];
  if(rest) $('recommendList').insertAdjacentHTML('beforeend','<div class="rest-suggest">休み候補：<b>'+escapeHtml(rest.name)+'</b>（これまで '+restCount(rest)+' 回）</div>');
  $('recommendPanel').classList.remove('hidden');
}
function reasonText(x){
  if(x.history===0)return '未対戦';
  if(x.history<=1)return '再戦少なめ';
  if(x.rankDiff<=1)return '級が近い';
  return '履歴分散';
}
function applyRecommendation(){
  generateRecommendedRound();$('recommendPanel').classList.add('hidden');
}
function makeCardSet(options={}){
  let pool=[...CARDS];
  if(options.type==='ones' || options.type==='tens'){
    const digits=options.digits||[];
    pool=CARDS.filter(c=>digits.includes(options.type==='tens'?Math.floor((c.id-1)/10):c.id%10));
  }
  if(options.type==='exclude'){
    const excluded=options.excluded||[];
    pool=pool.filter(c=>!excluded.includes(c.id));
  }
  if(pool.length<50) throw new Error('条件に合う札が50枚ありません');
  const deck=shuffle(pool),used=deck.slice(0,50);
  return {setId:'SET-'+Math.random().toString(36).slice(2,6).toUpperCase(),generatedAt:new Date().toISOString(),type:options.type||'random',options,a:used.slice(0,25),b:used.slice(25,50),dead:CARDS.filter(c=>!used.some(u=>u.id===c.id))};
}
function renderDealControls(mode='random'){
  if(mode==='ones'||mode==='tens'){
    return '<div class="digit-grid">'+[0,1,2,3,4,5,6,7,8,9].map(n=>'<label><input type="checkbox" value="'+n+'" data-deal-digit> '+n+'</label>').join('')+'</div><small>5つ選択してください。選んだ位の札から50枚を作ります。</small>';
  }
  if(mode==='exclude') return '<input id="excludeCards" class="deal-text-input" placeholder="例：5.7.9.61"><small>抜きたい札番号を「.」区切りで入力します。</small>';
  return '<div class="deal-random-note">100枚から50枚を完全ランダムに選びます。</div>';
}
function getDealOptions(mode){
  if(mode==='ones'||mode==='tens'){
    const digits=[...document.querySelectorAll('[data-deal-digit]:checked')].map(x=>Number(x.value));
    if(digits.length!==5) throw new Error('位指定は5つ選択してください');
    return {type:mode,digits};
  }
  if(mode==='exclude'){
    const excluded=($('excludeCards')?.value||'').split('.').map(Number).filter(n=>n>=1&&n<=100);
    return {type:mode,excluded:[...new Set(excluded)]};
  }
  return {type:'random'};
}
const DEAL_RULES=[
  {key:'ones5',label:'一の位'},
  {key:'tens5',label:'十の位'},
  {key:'threeDigits',label:'数字3つ'},
  {key:'one3Ten3',label:'一の位から3つ、十の位から3つ'},
  {key:'one4Ten2',label:'一の位から4つ、十の位から2つ'},
  {key:'one2Ten4',label:'一の位から2つ、十の位から4つ'}
];
let pendingDealPlan=[];

function pickDigits(count){
  return shuffle([0,1,2,3,4,5,6,7,8,9]).slice(0,count).sort((a,b)=>a-b);
}
function pickCardNumber(){
  return shuffle(CARDS)[0].id;
}
function matchingCardsForDigits(digits){
  return CARDS.filter(c=>{
    const ones=c.id%10;
    const tens=Math.floor((c.id-1)/10);
    return digits.includes(ones)||digits.includes(tens);
  });
}
function pickExcludedCardForDigits(digits){
  const candidates=matchingCardsForDigits(digits);
  if(!candidates.length)return null;
  return shuffle(candidates)[0].id;
}
function dealRuleText(rule){
  if(rule.key==='ones5') return '1の位 '+pickDigits(5).join('.');
  if(rule.key==='tens5') return '10の位 '+pickDigits(5).join('.');
  if(rule.key==='threeDigits'){
    const digits=pickDigits(3);
    const excluded=pickExcludedCardForDigits(digits);
    return digits.join('.')+' '+excluded+'抜き';
  }
  if(rule.key==='one3Ten3') return '一の位から3つ '+pickDigits(3).join('.')+'、十の位から3つ '+pickDigits(3).join('.');
  if(rule.key==='one4Ten2') return '一の位から4つ '+pickDigits(4).join('.')+'、十の位から2つ '+pickDigits(2).join('.');
  if(rule.key==='one2Ten4') return '一の位から2つ '+pickDigits(2).join('.')+'、十の位から4つ '+pickDigits(4).join('.');
  return rule.label;
}
function selectedDealRules(){
  return [...document.querySelectorAll('[data-deal-rule]:checked')]
    .map(x=>DEAL_RULES.find(r=>r.key===x.value)).filter(Boolean);
}
function makeDealInstruction(rules,lastKey=''){
  const usable=rules.length?rules:DEAL_RULES;
  const choices=usable.filter(r=>r.key!==lastKey);
  const pool=choices.length?choices:usable;
  const rule=pool[Math.floor(Math.random()*pool.length)];
  return {key:rule.key,text:dealRuleText(rule)};
}
function generateDealPlan(){
  const count=Math.min(7,Math.max(1,Number($('dealPlanCount')?.value||5)));
  const selected=selectedDealRules();
  if(!selected.length){toast('使用するルールを1つ以上選択してください');return}
  const lines=[];
  let lastKey='';
  for(let i=0;i<count;i++){
    const deal=makeDealInstruction(selected,lastKey);
    lastKey=deal.key;
    lines.push({round:i+1,key:deal.key,text:deal.text});
  }
  pendingDealPlan=lines;
  $('dealPlanOutput').textContent=lines.map(x=>x.round+'回戦　札分け：'+x.text).join('\n');
  $('copyDealPlanBtn').disabled=false;
  toast(count+'回戦分の札分けを作成しました');
}
async function copyDealPlan(){
  if(!pendingDealPlan.length){toast('先に札分けを生成してください');return}
  const textValue=pendingDealPlan.map(x=>x.round+'回戦　札分け：'+x.text).join('\n');
  try{
    await navigator.clipboard.writeText(textValue);
  }catch{
    const ta=document.createElement('textarea');
    ta.value=textValue;document.body.appendChild(ta);ta.select();
    document.execCommand('copy');ta.remove();
  }
  toast('札分けをコピーしました');
}
function resetDealPlan(){
  pendingDealPlan=[];
  if($('dealPlanOutput'))$('dealPlanOutput').textContent='まだ生成していません。';
  if($('copyDealPlanBtn'))$('copyDealPlanBtn').disabled=true;
}
function getRoundDealInstruction(practice,roundNo){
  if(!practice.dealPlan)practice.dealPlan=[];
  if(practice.dealPlan[roundNo-1])return practice.dealPlan[roundNo-1];
  const rules=(practice.dealRules||[]).map(key=>DEAL_RULES.find(r=>r.key===key)).filter(Boolean);
  if(!rules.length)return null;
  const previous=practice.dealPlan.at(-1)?.key||'';
  const next=makeDealInstruction(rules,previous);
  practice.dealPlan[roundNo-1]={round:roundNo,key:next.key,text:next.text};
  return practice.dealPlan[roundNo-1];
}

function findMatch(id){
  const p=currentPractice(); if(!p)return null;
  for(const r of p.rounds||[]) for(const m of r.matches||[]) if(m.id===id) return {p,r,m};
  return null;
}
function openMatchModal(id){
  const found=findMatch(id);if(!found)return;
  const {m,p,r}=found;
  syncMatchDealPlans(p);
  const a=player(m.player1Id),b=player(m.player2Id);
  let set=m.cardSet;
  const dealInstruction=r?.dealInstruction || p.dealPlan?.[(Number(r?.round||1)-1)] || null;
  const dealPlanView=dealInstruction?.text
    ? '<div class="modal-deal-plan"><div class="eyebrow">この回戦の札分け</div><strong>'+escapeHtml(dealInstruction.text)+'</strong></div>'
    : '<div class="modal-deal-plan muted">札分け設定はありません。</div>';
  $('modalRoot').innerHTML='<div class="modal-overlay"><div class="modal-card match-modal"><div class="modal-head"><div><div class="eyebrow">MATCH '+m.index+'</div><h3>'+escapeHtml(a?.name||'—')+' <span>vs</span> '+escapeHtml(b?.name||'—')+'</h3></div><button id="closeModal" class="icon-btn">×</button></div><div class="match-status-row"><span class="status-dot '+statusClass(m.status)+'">'+escapeHtml(m.status)+'</span>'+(set?'<span class="deal-badge">'+set.setId+'</span>':'')+'</div><div id="dealPlanView">'+dealPlanView+'</div><div id="dealView">'+(set?renderDeal(set,a,b):'<div class="match-memo"><div class="eyebrow">メモ</div><div class="match-memo-text">まだメモはありません。</div></div>')+'</div><div id="resultView">'+renderResultInputs(m,a,b)+'</div></div></div>';
  $('closeModal').onclick=closeModal;
  $('saveResultBtn').onclick=()=>saveResult(id);
  document.querySelectorAll('[data-result-winner]').forEach(btn=>btn.onclick=()=>{
    $('winnerSelect').value=btn.dataset.resultWinner;
    document.querySelectorAll('[data-result-winner]').forEach(x=>{
      const selected=x.dataset.resultWinner===btn.dataset.resultWinner;
      x.classList.toggle('selected',selected);
      x.textContent=selected?'○':'×';
    });
  });
  if($('cancelResult'))$('cancelResult').onclick=closeModal;
}
function renderDeal(set,a,b){
  const list=x=>x.map(c=>'<span class="card-chip">'+c.no+'<small>'+escapeHtml(c.name)+'</small></span>').join('');
  return '<div class="deal-grid"><div class="deal-side"><div class="deal-side-head"><b>'+escapeHtml(a?.name||'—')+'</b><span>25枚</span></div><div class="card-chip-list">'+list(set.a)+'</div></div><div class="deal-side"><div class="deal-side-head"><b>'+escapeHtml(b?.name||'—')+'</b><span>25枚</span></div><div class="card-chip-list">'+list(set.b)+'</div></div></div><div class="dead-info">場外：'+set.dead.length+'枚</div>';
}
function renderResultInputs(m,a,b){
  const currentWinner=m.winnerId||'';
  const currentScore=currentWinner?(currentWinner===m.player1Id?m.score1:m.score2):'';
  const leftSelected=currentWinner===m.player1Id;
  const rightSelected=currentWinner===m.player2Id;
  return '<div class="result-box"><div class="eyebrow">RESULT</div><h4>結果入力</h4>'+
    '<p class="result-format-hint">「名前 ○or× 数字 ○or× 名前」の形で記録します。</p>'+
    '<div class="result-line-input">'+
      '<span class="result-name">'+escapeHtml(a?.name||'—')+'</span>'+
      '<button type="button" class="result-symbol '+(leftSelected?'selected':'')+'" data-result-winner="'+m.player1Id+'">'+(leftSelected?'○':'×')+'</button>'+
      '<input id="winnerScore" class="winner-score-input inline" type="number" min="0" max="25" value="'+(currentScore??'')+'" placeholder="数字">'+
      '<button type="button" class="result-symbol '+(rightSelected?'selected':'')+'" data-result-winner="'+m.player2Id+'">'+(rightSelected?'○':'×')+'</button>'+
      '<span class="result-name right">'+escapeHtml(b?.name||'—')+'</span>'+
    '</div>'+
    '<p class="result-score-note">数字＝勝った側の残り札</p>'+
    '<input id="winnerSelect" type="hidden" value="'+currentWinner+'">'+
    '<div class="result-actions"><button id="saveResultBtn" class="primary-btn">結果を決定</button><button id="cancelResult" class="secondary-btn">閉じる</button></div></div>';
}
function saveResult(id){
  const f=findMatch(id); if(!f)return;
  const winner=$('winnerSelect')?.value||null;
  const rawScore=$('winnerScore')?.value;
  if(!winner){toast('○になる側を選択してください');return}
  if(rawScore===''){toast('○側の残り札を入力してください');return}
  const winnerScore=Math.min(25,Math.max(0,Number(rawScore)));
  const loserScore=25-winnerScore;
  f.m.winnerId=winner;
  f.m.score1=winner===f.m.player1Id?winnerScore:loserScore;
  f.m.score2=winner===f.m.player2Id?winnerScore:loserScore;
  f.m.status='終了';
  save();closeModal();renderPractice();renderHistory();toast('結果を決定しました');
}
function closeModal(){$('modalRoot').innerHTML=''}
function showToast(t){const e=$('toast');e.textContent=t;e.classList.add('show');clearTimeout(showToast.t);showToast.t=setTimeout(()=>e.classList.remove('show'),1600)}
const toast=showToast;

function exportData(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='kokudai-practice-backup-'+today()+'.json';a.click();URL.revokeObjectURL(url);toast('バックアップを書き出しました');
}
function importData(file){
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const incoming=JSON.parse(reader.result);
      if(!incoming.players||!incoming.practices)throw new Error();
      state={...defaultState,...incoming};save();renderHome();toast('データを復元しました');
    }catch{toast('JSONを読み込めませんでした')}
  };reader.readAsText(file);
}
const ADMIN_USER='admin';
const ADMIN_PASSWORD='kokupyon';

function isAdmin(){
  return sessionStorage.getItem('kokudai_admin')==='1';
}

function adminLogin(){
  if(isAdmin())return true;
  const username=prompt('管理者ログイン\nユーザー名を入力してください。');
  if(username===null)return false;
  const password=prompt('管理者ログイン\nパスワードを入力してください。');
  if(password===null)return false;
  if(username===ADMIN_USER&&password===ADMIN_PASSWORD){
    sessionStorage.setItem('kokudai_admin','1');
    toast('管理者としてログインしました');
    return true;
  }
  toast('ユーザー名またはパスワードが違います');
  return false;
}

function openAdminSettings(){
  if(!adminLogin())return;
  showScreen('screenData');
}

function resetData(){
  if(!adminLogin())return;
  const answer=prompt('共有データを全員分削除します。実行する場合は DELETE と入力してください。');
  if(answer!=='DELETE')return;
  state=structuredClone(defaultState);
  selectedPlayers=new Set();
  save();
  showScreen('screenHome');
  toast('共有データの初期化を開始しました');
}

document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>{ if(b.dataset.nav==='screenData'){openAdminSettings();return;} showScreen(b.dataset.nav); });
if($('brandHomeBtn'))$('brandHomeBtn').onclick=()=>showScreen('screenHome');
$('headerHistoryBtn').onclick=()=>showScreen('screenHistory');if($('tournamentList'))$('tournamentList').onclick=e=>{const b=e.target.closest('[data-tournament-detail]');if(b)openTournamentDetail(b.dataset.tournamentDetail)};document.querySelectorAll('[data-tournament-scope]').forEach(b=>b.onclick=()=>{tournamentScope=b.dataset.tournamentScope;tournamentPage=1;document.querySelectorAll('[data-tournament-scope]').forEach(x=>x.classList.toggle('active',x===b));renderTournaments()});document.querySelectorAll('[data-tournament-rank]').forEach(b=>b.onclick=()=>{tournamentRank=b.dataset.tournamentRank;tournamentPage=1;document.querySelectorAll('[data-tournament-rank]').forEach(x=>x.classList.toggle('active',x===b));renderTournaments()});if($('tournamentFavoritesBtn'))$('tournamentFavoritesBtn').onclick=()=>{tournamentFavoritesOnly=!tournamentFavoritesOnly;tournamentPage=1;$('tournamentFavoritesBtn').classList.toggle('active',tournamentFavoritesOnly);renderTournaments()};loadTournaments();
$('homeHistoryBtn').onclick=()=>showScreen('screenHistory');
$('homePlayersBtn').onclick=()=>showScreen('screenPlayers');
$('homeSettingsBtn').onclick=openAdminSettings;if($('homeTournamentBtn'))$('homeTournamentBtn').onclick=()=>showScreen('screenTournaments');
$('newPracticeBtn').onclick=openNewPractice;
$('homeStartBtn').onclick=openNewPractice;
$('homeAddRoundBtn').onclick=()=>generateRandomRound();
$('customMatchBtn').onclick=openCustomMatch;
$('closeCustomMatchBtn').onclick=()=>$('customMatchPanel').classList.add('hidden');
$('confirmCustomMatchBtn').onclick=confirmCustomMatch;
$('recommendBtn').onclick=openRecommend;
$('closeRecommendBtn').onclick=()=>$('recommendPanel').classList.add('hidden');
$('applyRecommendBtn').onclick=applyRecommendation;
$('addPlayerBtn').onclick=addPlayer;
$('setupAddPlayerBtn').onclick=()=>showScreen('screenPlayers');
$('playerSearch').oninput=renderPlayerSelect;
$('selectAllBtn').onclick=()=>{
  const visible=state.players.filter(p=>p.name.toLowerCase().includes($('playerSearch').value.trim().toLowerCase()));
  if(visible.every(p=>selectedPlayers.has(p.id)))visible.forEach(p=>selectedPlayers.delete(p.id));else visible.forEach(p=>selectedPlayers.add(p.id));
  renderPlayerSelect();
};
$('createPracticeBtn').onclick=createPractice;
$('setupCustomPairBtn').onclick=applySetupCustomPairing;
$('setupRecommendPairBtn').onclick=applySetupRecommendedPairing;
$('practiceCloseBtn').onclick=()=>showScreen('screenHome');
document.querySelectorAll('.back-home').forEach(b=>b.onclick=()=>showScreen('screenHome'));
$('startPracticeBtn').onclick=startPracticeFromSetup;
$('exportBtn').onclick=exportData;
$('importInput').onchange=e=>{if(e.target.files[0])importData(e.target.files[0])};
$('resetBtn').onclick=resetData;
if($('manualTournamentUpdateBtn'))$('manualTournamentUpdateBtn').onclick=()=>{
  if(!adminLogin())return;
  window.open('https://github.com/8tjf8htbch-maker/kokudai/actions/workflows/update-tournaments.yml','_blank','noopener');
  toast('GitHub Actionsの更新画面を開きました');
};
if($('generateDealPlanBtn'))$('generateDealPlanBtn').onclick=generateDealPlan;
if($('copyDealPlanBtn'))$('copyDealPlanBtn').onclick=copyDealPlan;
function syncDealRuleAllButton(){
  const boxes=[...document.querySelectorAll('[data-deal-rule]')];
  if(!$('dealRuleAllBtn'))return;
  $('dealRuleAllBtn').textContent=boxes.length&&boxes.every(x=>x.checked)?'全解除':'全選択';
}
if($('dealRuleAllBtn')){
  $('dealRuleAllBtn').onclick=()=>{
    const boxes=[...document.querySelectorAll('[data-deal-rule]')];
    const allChecked=boxes.every(x=>x.checked);
    boxes.forEach(x=>x.checked=!allChecked);
    syncDealRuleAllButton();
  };
  document.querySelectorAll('[data-deal-rule]').forEach(x=>x.onchange=syncDealRuleAllButton);
  syncDealRuleAllButton();
}

void bootSharedData();