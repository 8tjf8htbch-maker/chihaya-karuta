/* 國大練習 拡張機能
 * - 対戦方針別の組み合わせ
 * - 戦績・AI自動分析
 * - 大会記録
 * - 既存UI/データ構造を拡張する追加スクリプト
 */
(function(){
  'use strict';

  function ensureStateShape(){
    if(!Array.isArray(state.tournaments)) state.tournaments=[];
    state.practices.forEach(p=>{
      if(!Array.isArray(p.rounds)) p.rounds=[];
      if(!Array.isArray(p.dealPlan)) p.dealPlan=[];
    });
  }

  const esc=s=>escapeHtml(s??'');
  const clone=v=>structuredClone(v);
  const fmtPct=(win,total)=>total?Math.round(win/total*100)+'%':'—';
  const safeNum=v=>Number.isFinite(Number(v))?Number(v):0;
  const dateText=d=>d?String(d).replaceAll('-','/'): '—';

  function xAllPracticeMatches(){
    return state.practices.flatMap(p=>(p.rounds||[]).flatMap(r=>(r.matches||[]).map(m=>({...m,practice:p,round:r}))));
  }

  function xAllFinishedPracticeMatches(){
    return xAllPracticeMatches().filter(x=>x.m?.winnerId);
  }

  function xOpponentLabel(id){
    const p=player(id);
    return p?.name || '—';
  }

  function xPairKey(a,b){
    return [a,b].sort().join('|');
  }

  function xPairHistory(a,b){
    return xAllPracticeMatches()
      .filter(x=>x.m.player1Id&&x.m.player2Id&&xPairKey(x.m.player1Id,x.m.player2Id)===xPairKey(a,b))
      .sort((x,y)=>String(x.m.createdAt||'').localeCompare(String(y.m.createdAt||'')));
  }

  function xRecentPairInCurrentPractice(a,b,roundWindow=1){
    const p=currentPractice();
    if(!p)return false;
    const rounds=(p.rounds||[]).slice(-Math.max(1,roundWindow));
    return rounds.some(r=>(r.matches||[]).some(m=>m.player1Id&&m.player2Id&&xPairKey(m.player1Id,m.player2Id)===xPairKey(a,b)));
  }

  function xPairingReason(c,mode,avoidRecent){
    if(c.preferred)return '優先指定';
    if(c.avoided)return '回避指定';
    if(mode==='coaching' && c.rankDiff>=1)return '指導向けの級差';
    if(mode==='tournament' && c.rankDiff===1)return '大会前の格上・近級';
    if(c.rankDiff===0)return '同級';
    if(c.rankDiff===1)return avoidRecent&&c.recent?'級が近い・直近対戦は注意':'級が近い';
    if(c.history===0)return '未対戦';
    if(c.history<=1)return '再戦少なめ';
    return '対戦履歴を分散';
  }

  function xParsePairSelects(selector){
    const pairs=[];
    document.querySelectorAll(selector).forEach(row=>{
      const a=row.querySelector('[data-pair-a]')?.value||'';
      const b=row.querySelector('[data-pair-b]')?.value||'';
      if(a&&b&&a!==b)pairs.push([a,b]);
    });
    return pairs;
  }

  function xPairingsFromIds(ids,mode='normal',avoidRecent=true,preferred=[],avoided=[]){
    const arr=ids.map(player).filter(Boolean);
    const prefKeys=new Set(preferred.map(p=>xPairKey(p[0],p[1])));
    const avoidKeys=new Set(avoided.map(p=>xPairKey(p[0],p[1])));
    const candidates=[];
    for(let i=0;i<arr.length;i++){
      for(let j=i+1;j<arr.length;j++){
        const a=arr[i],b=arr[j];
        const history=xPairHistory(a.id,b.id).length;
        const rankDiff=Math.abs(rankScore(a.rank)-rankScore(b.rank));
        const recent=xRecentPairInCurrentPractice(a.id,b.id,1);
        const key=xPairKey(a.id,b.id);
        const preferredPair=prefKeys.has(key);
        const avoidedPair=avoidKeys.has(key);
        let score=0;

        if(rankDiff===0)score+=60;
        else if(rankDiff===1)score+=40;
        else if(rankDiff===2)score+=15;

        if(mode==='distribute'){
          score+=history===0?70:-history*16;
          if(recent)score-=95;
        }else if(mode==='tournament'){
          score+=(rankDiff===1?55:0);
          score+=(rankDiff===0?25:0);
          if(rankDiff>=2)score+=12;
        }else if(mode==='tournamentLower'){
          score+=(rankDiff===1?60:0);
          score+=(rankDiff===0?25:0);
          if(rankDiff>=2)score+=35;
        }else if(mode==='coaching'){
          score+=(rankDiff===1?55:0);
          score+=(rankDiff>=2?70:0);
          if(rankDiff===0)score-=20;
        }else{
          if(history===0)score+=28;
          else score-=history*8;
          if(avoidRecent&&recent)score-=80;
        }

        if(avoidRecent&&recent&&mode!=='distribute')score-=45;
        if(preferredPair)score+=1000;
        if(avoidedPair)score-=1200;

        candidates.push({
          a,b,score,history,rankDiff,recent,
          preferred:preferredPair,avoided:avoidedPair
        });
      }
    }

    candidates.sort((x,y)=>y.score-x.score);
    const pairs=[];
    const used=new Set();

    const take=[];
    const preferredCandidates=candidates.filter(c=>c.preferred&&!c.avoided);
    for(const c of preferredCandidates){
      if(used.has(c.a.id)||used.has(c.b.id))continue;
      used.add(c.a.id);used.add(c.b.id);take.push(c);
    }
    for(const c of candidates){
      if(used.has(c.a.id)||used.has(c.b.id))continue;
      if(c.avoided)continue;
      used.add(c.a.id);used.add(c.b.id);take.push(c);
    }

    for(const c of take){
      pairs.push({...c,reason:xPairingReason(c,mode,avoidRecent)});
    }

    const unused=arr.filter(p=>!used.has(p.id));
    let restPlayer=null;
    if(unused.length){
      restPlayer=unused.sort((a,b)=>{
        const rcA=currentPractice()?.rounds?.filter(r=>r.restPlayerId===a.id).length||0;
        const rcB=currentPractice()?.rounds?.filter(r=>r.restPlayerId===b.id).length||0;
        return rcA-rcB;
      })[0]||null;
    }

    return {pairs,restPlayer};
  }

  function xParticipantIds(){
    const p=currentPractice();
    return p?.participantIds?.filter(id=>player(id))||[];
  }

  function xNameOptions(selected=''){
    return xParticipantIds().map(id=>{
      const p=player(id);
      return '<option value="'+esc(id)+'" '+(id===selected?'selected':'')+'>'+esc(p.name)+'（'+esc(playerDisplayRank(p))+'）</option>';
    }).join('');
  }

  function xBuildPairingScreen(){
    if($('screenPairing'))return;
    const section=document.createElement('section');
    section.id='screenPairing';
    section.className='screen';
    section.innerHTML=
      '<div class="page-title-row">'+
        '<div><div class="eyebrow">MATCHING</div><h2>対戦</h2><p class="setup-lead">練習の目的に合わせて、対戦履歴・級・直近対戦を組み合わせます。</p></div>'+
        '<button class="text-btn x-back-home" type="button">ホームに戻る</button>'+
      '</div>'+
      '<div id="xPairingEmpty" class="empty-card hidden"><div class="empty-icon">対</div><h3>現在の練習がありません</h3><p>先に練習を作ってください。</p><button id="xPairingNewPractice" class="primary-btn wide">練習を始める</button></div>'+
      '<div id="xPairingBody">'+
        '<div class="card x-pairing-controls">'+
          '<div class="form-field"><label for="xPairingMode">対戦方針</label><select id="xPairingMode"><option value="normal">通常練習：同級・近い級を優先</option><option value="distribute">対戦相手を分散：最近当たっていない人を優先</option><option value="tournament">大会前調整：格上・近い級を増やす</option><option value="tournamentLower">大会前調整：格下・近い級を増やす</option><option value="coaching">指導・育成：級差をつける</option><option value="manual">自由に組む</option></select></div>'+
          '<label class="x-check"><input id="xAvoidRecent" type="checkbox" checked><span>直近で当たった相手をなるべく避ける</span></label>'+
          '<div class="x-pairing-subhead"><b>優先したい対戦</b><small>大会前の調整など、今日だけ優先したい組み合わせ</small></div>'+
          '<div id="xPreferredRows"></div><button id="xAddPreferred" class="secondary-btn" type="button">＋ 優先対戦を追加</button>'+
          '<div class="x-pairing-subhead"><b>避けたい対戦</b><small>「今日はこの2人を当てない」などの例外指定</small></div>'+
          '<div id="xAvoidRows"></div><button id="xAddAvoid" class="secondary-btn" type="button">＋ 避ける対戦を追加</button>'+
          '<div class="x-pairing-actions"><button id="xGeneratePairing" class="accent-btn" type="button">おすすめを作る</button><button id="xUseRandom" class="secondary-btn" type="button">完全ランダム</button></div>'+
        '</div>'+
        '<div class="card"><div class="panel-title"><div><div class="eyebrow">SUGGESTIONS</div><h3>組み合わせ候補</h3></div><span id="xPairingSummary" class="muted"></span></div><div id="xPairingSuggestions" class="stack"></div><div class="custom-match-footer"><span id="xPairingRest" class="muted"></span><button id="xApplyPairing" class="primary-btn" type="button" disabled>この候補で次の試合を作る</button></div></div>'+
        '<div id="xManualPairing" class="card hidden"><div class="panel-title"><div><div class="eyebrow">MANUAL</div><h3>自由に組む</h3></div></div><div id="xManualRows"></div><div class="custom-match-footer"><span id="xManualHint" class="muted">2人ずつ選択してください</span><button id="xApplyManual" class="primary-btn" type="button" disabled>この対戦で追加</button></div></div>'+
      '</div>';
    $('app').appendChild(section);

    $('xPairingMode').onchange=()=>{
      $('xManualPairing').classList.toggle('hidden',$('xPairingMode').value!=='manual');
      $('xGeneratePairing').disabled=$('xPairingMode').value==='manual';
      xRenderPairSuggestions();
      if($('xPairingMode').value==='manual')xRenderManualPairing();
    };
    $('xAvoidRecent').onchange=()=>xRenderPairSuggestions();
    $('xAddPreferred').onclick=()=>{xPairingRows.preferred.push(['','']);xRenderPairingRows()};
    $('xAddAvoid').onclick=()=>{xPairingRows.avoid.push(['','']);xRenderPairingRows()};
    $('xGeneratePairing').onclick=()=>xGenerateAndRenderPairing();
    $('xUseRandom').onclick=()=>xGenerateRandomSuggestion();
    $('xApplyPairing').onclick=()=>xApplySuggestedPairs();
    $('xApplyManual').onclick=()=>xApplyManualPairs();
    $('xPairingNewPractice').onclick=()=>openNewPractice();
    section.querySelector('.x-back-home').onclick=()=>xShowScreen('screenHome');
  }

  let xPairingRows={preferred:[],avoid:[]};
  let xPairSuggestions=[];
  let xManualRows=[];

  function xResetPairingRows(){
    xPairingRows={preferred:[],avoid:[]};
    xManualRows=[];
    for(let i=0;i<Math.max(1,Math.floor(xParticipantIds().length/2));i++)xManualRows.push(['','']);
    xRenderPairingRows();
    xRenderManualPairing();
  }

  function xRenderPairingRows(){
    const renderRows=(rows,kind)=>{
      const wrap=$(kind==='preferred'?'xPreferredRows':'xAvoidRows');
      if(!wrap)return;
      wrap.innerHTML=rows.map((row,i)=>{
        const options=xNameOptions;
        return '<div class="x-pair-select-row">'+
          '<select class="custom-player-select" data-pair-a data-kind="'+kind+'" data-row="'+i+'"><option value="">選手A</option>'+options(row[0])+'</select>'+
          '<span class="custom-vs">×</span>'+
          '<select class="custom-player-select" data-pair-b data-kind="'+kind+'" data-row="'+i+'"><option value="">選手B</option>'+options(row[1])+'</select>'+
          '<button class="mini-btn" type="button" data-remove-pair="'+kind+'" data-remove-index="'+i+'">削除</button>'+
        '</div>';
      }).join('');
      wrap.querySelectorAll('select[data-kind]').forEach(el=>el.onchange=()=>{
        xPairingRows[el.dataset.kind][Number(el.dataset.row)][el.hasAttribute('data-pair-a')?0:1]=el.value;
      });
      wrap.querySelectorAll('[data-remove-pair]').forEach(btn=>btn.onclick=()=>{
        xPairingRows[btn.dataset.removePair].splice(Number(btn.dataset.removeIndex),1);xRenderPairingRows();xRenderPairSuggestions();
      });
    };
    renderRows(xPairingRows.preferred,'preferred');
    renderRows(xPairingRows.avoid,'avoid');
  }

  function xGenerateAndRenderPairing(){
    const ids=xParticipantIds();
    if(ids.length<2){toast('参加者が2人以上必要です');return}
    const mode=$('xPairingMode').value;
    const preferred=xParsePairSelects('#xPreferredRows .x-pair-select-row');
    const avoided=xParsePairSelects('#xAvoidRows .x-pair-select-row');
    xPairSuggestions=xPairingsFromIds(ids,mode,$('xAvoidRecent').checked,preferred,avoided).pairs;
    xRenderPairSuggestions();
  }

  function xGenerateRandomSuggestion(){
    const ids=xParticipantIds();
    const arr=shuffle(ids.map(player));
    const pairs=[];
    for(let i=0;i+1<arr.length;i+=2)pairs.push({a:arr[i],b:arr[i+1],score:0,history:xPairHistory(arr[i].id,arr[i+1].id).length,rankDiff:Math.abs(rankScore(arr[i].rank)-rankScore(arr[i+1].rank)),recent:xRecentPairInCurrentPractice(arr[i].id,arr[i+1].id,1),preferred:false,avoided:false,reason:'ランダム'});
    xPairSuggestions=pairs;
    xRenderPairSuggestions();
  }

  function xRenderPairSuggestions(){
    const p=currentPractice();
    $('xPairingBody').classList.toggle('hidden',!p);
    $('xPairingEmpty').classList.toggle('hidden',!!p);
    if(!p)return;
    if(!$('xPairingMode'))return;
    if($('xPairingMode').value!=='manual' && !xPairSuggestions.length)xGenerateAndRenderPairing();
    const list=$('xPairingSuggestions');
    list.innerHTML=xPairSuggestions.length?xPairSuggestions.map((x,i)=>
      '<div class="suggestion-row">'+
        '<span class="suggestion-num">'+(i+1)+'</span>'+
        '<div><b>'+esc(x.a.name)+' <span>vs</span> '+esc(x.b.name)+'</b><small>'+esc(playerDisplayRank(x.a))+' × '+esc(playerDisplayRank(x.b))+'　／　過去 '+x.history+' 回'+(x.recent?'・直近対戦あり':'')+'</small></div>'+
        '<span class="suggestion-reason">'+esc(x.reason||'候補')+'</span>'+
      '</div>').join(''):'<div class="empty-small">候補がありません。</div>';
    const restCount=(p.participantIds?.length||0)%2;
    $('xPairingSummary').textContent=xPairSuggestions.length+'試合候補';
    $('xPairingRest').textContent=restCount?'余った1人は休み候補として自動決定します。':'全員を対戦に入れます。';
    $('xApplyPairing').disabled=!xPairSuggestions.length || $('xPairingMode').value==='manual';
  }

  function xRenderManualPairing(){
    const ids=xParticipantIds();
    const count=Math.max(1,Math.floor(ids.length/2));
    if(xManualRows.length!==count)xManualRows=Array.from({length:count},(_,i)=>xManualRows[i]||['','']);
    $('xManualRows').innerHTML=xManualRows.map((row,i)=>
      '<div class="x-pair-select-row">'+
      '<span class="custom-pair-num">'+(i+1)+'</span>'+
      '<select class="custom-player-select" data-manual-a="'+i+'"><option value="">選手A</option>'+xNameOptions(row[0])+'</select>'+
      '<span class="custom-vs">×</span>'+
      '<select class="custom-player-select" data-manual-b="'+i+'"><option value="">選手B</option>'+xNameOptions(row[1])+'</select>'+
      '</div>').join('');
    document.querySelectorAll('[data-manual-a],[data-manual-b]').forEach(el=>el.onchange=()=>{
      const i=Number(el.dataset.manualA??el.dataset.manualB);
      xManualRows[i][el.hasAttribute('data-manual-a')?0:1]=el.value;
      xRenderManualPairing();
    });
    const used=xManualRows.flatMap(x=>x).filter(Boolean);
    const valid=xManualRows.every(r=>r[0]&&r[1]&&r[0]!==r[1]);
    const dup=used.length!==new Set(used).size;
    const allUsed=new Set(used).size===ids.length-(ids.length%2);
    $('xManualHint').textContent=valid&&!dup&&allUsed?'組み合わせを追加できます':'各試合の2人を選択してください';
    $('xApplyManual').disabled=!(valid&&!dup);
  }

  function xApplySuggestedPairs(){
    const p=currentPractice();if(!p||!xPairSuggestions.length)return;
    const used=new Set();
    const pairs=xPairSuggestions.filter(x=>{
      if(!x.a||!x.b||used.has(x.a.id)||used.has(x.b.id))return false;
      used.add(x.a.id);used.add(x.b.id);return true;
    }).map(x=>[x.a,x.b]);
    const rest=(p.participantIds||[]).map(player).filter(Boolean).find(q=>!used.has(q.id));
    if(!pairs.length){toast('組み合わせを作れませんでした');return}
    generateRound(p,pairs,rest?.id||null);
    save();renderHome();renderHistory();xShowScreen('screenHome');
    toast(pairs.length+'試合を追加しました');
  }

  function xApplyManualPairs(){
    const p=currentPractice();if(!p)return;
    const ids=xParticipantIds();
    const pairs=[];const used=new Set();
    for(const row of xManualRows){
      if(!row[0]&&!row[1])continue;
      if(!row[0]||!row[1]||row[0]===row[1]){toast('すべての対戦を正しく選択してください');return}
      if(used.has(row[0])||used.has(row[1])){toast('同じ選手を複数の試合に入れられません');return}
      used.add(row[0]);used.add(row[1]);pairs.push([player(row[0]),player(row[1])]);
    }
    const rest=ids.map(player).find(q=>!used.has(q.id));
    if(!pairs.length){toast('対戦を1つ以上作ってください');return}
    generateRound(p,pairs,rest?.id||null);
    save();renderHome();renderHistory();xShowScreen('screenHome');toast(pairs.length+'試合を追加しました');
  }

  function xOpenPairing(mode){
    if(!currentPractice()){openNewPractice();return}
    xShowScreen('screenPairing');
    $('xPairingMode').value=mode||'normal';
    $('xPairingMode').dispatchEvent(new Event('change'));
    xResetPairingRows();
    xGenerateAndRenderPairing();
  }

  function xStatsForPlayer(id,source='practice'){
    const rows=[];
    if(source==='practice'||source==='all'){
      xAllFinishedPracticeMatches().forEach(x=>{
        const m=x.m;
        if(m.player1Id!==id&&m.player2Id!==id)return;
        const oppId=m.player1Id===id?m.player2Id:m.player1Id;
        const win=m.winnerId===id;
        const own=m.player1Id===id?safeNum(m.score1):safeNum(m.score2);
        const opp=m.player1Id===id?safeNum(m.score2):safeNum(m.score1);
        rows.push({date:x.practice.date||String(x.m.createdAt||'').slice(0,10),win,oppId,oppName:xOpponentLabel(oppId),oppRank:player(oppId)?.rank||'その他',margin:Math.abs(own-opp),own,opp,source:'practice',practice:x.practice,match:m});
      });
    }
    if(source==='tournament'||source==='all'){
      (state.tournaments||[]).forEach(t=>{
        if(t.playerId!==id)return;
        (t.matches||[]).forEach(m=>{
          if(!m.result||m.result==='pending')return;
          const linked=m.opponentPlayerId;
          const oppName=linked?xOpponentLabel(linked):(m.opponentName||'—');
          rows.push({date:t.date,win:m.result==='win',oppId:linked||('name:'+oppName),oppName,oppRank:m.opponentRank||player(linked)?.rank||'その他',margin:safeNum(m.margin),source:'tournament',tournament:t,match:m});
        });
      });
    }
    return rows.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  }

  function xStatsSummary(rows){
    const wins=rows.filter(r=>r.win).length;
    const losses=rows.length-wins;
    const margins=rows.map(r=>r.margin).filter(Number.isFinite);
    return {total:rows.length,wins,losses,winRate:wins/(rows.length||1),avgMargin:margins.length?margins.reduce((a,b)=>a+b,0)/margins.length:0};
  }

  function xBreakdown(rows,keyFn){
    const map=new Map();
    rows.forEach(r=>{
      const key=keyFn(r);
      if(!key)return;
      const cur=map.get(key)||{key,label:key,wins:0,losses:0,total:0,margins:[]};
      cur.total++;if(r.win)cur.wins++;else cur.losses++;cur.margins.push(r.margin);map.set(key,cur);
    });
    return [...map.values()].sort((a,b)=>b.total-a.total).map(x=>({...x,winRate:x.wins/(x.total||1),avgMargin:x.margins.length?x.margins.reduce((a,b)=>a+b,0)/x.margins.length:0}));
  }

  function xTrend(rows){
    return rows.slice(-12).map(r=>({date:dateText(r.date),mark:r.win?'○':'×',margin:r.margin}));
  }

  function xAiInsights(id){
    const practice=xStatsForPlayer(id,'practice');
    const tournament=xStatsForPlayer(id,'tournament');
    const all=xStatsForPlayer(id,'all');
    const p=player(id);
    if(!p)return [];
    const out=[];
    if(practice.length<5){
      out.push('まだ練習データが少ないため、現在の傾向は参考値です。まずは5〜10試合程度を蓄積すると変化を追いやすくなります。');
    }else{
      const recent=practice.slice(-10),prev=practice.slice(Math.max(0,practice.length-20),Math.max(0,practice.length-10));
      const rs=xStatsSummary(recent),ps=xStatsSummary(prev);
      if(recent.length>=5){
        if(prev.length>=5 && rs.winRate-ps.winRate>=0.15) out.push('直近の勝率がその前の期間より上がっています。最近の結果は改善傾向です。');
        else if(prev.length>=5 && ps.winRate-rs.winRate>=0.15) out.push('直近の勝率がその前の期間より下がっています。練習テーマや対戦相手の変化と一緒に確認するとよさそうです。');
        else out.push('直近'+recent.length+'試合では'+rs.wins+'勝'+(recent.length-rs.wins)+'敗です。短期的な波があるため、1試合だけで判断せず推移を見ます。');
      }
      if(rs.avgMargin>0)out.push('直近の平均枚差は約'+rs.avgMargin.toFixed(1)+'枚です。勝敗だけでなく、接戦か大差かも継続して確認できます。');
    }

    const rank=xBreakdown(practice,r=>r.oppRank);
    if(rank.length){
      const weak=rank.filter(r=>r.total>=3).sort((a,b)=>a.winRate-b.winRate)[0];
      const strong=rank.filter(r=>r.total>=3).sort((a,b)=>b.winRate-a.winRate)[0];
      if(weak)out.push(weak.label+'との成績は'+weak.wins+'勝'+weak.losses+'敗です。対戦機会を増やす場合はこの級との試合を候補にできます。');
      if(strong&&strong!==weak)out.push(strong.label+'との成績は'+strong.wins+'勝'+strong.losses+'敗です。現在の得意な対戦帯として記録しておけます。');
    }

    const deal=xBreakdown(practice,r=>r.match?.dealInstruction?.key).map(r=>{
      const rule=typeof DEAL_RULES!=='undefined'?DEAL_RULES.find(x=>x.key===r.key):null;
      return {...r,label:rule?.label||r.key};
    });
    if(deal.filter(r=>r.total>=3).length){
      const top=deal.filter(r=>r.total>=3).sort((a,b)=>b.winRate-a.winRate)[0];
      if(top)out.push('札分け「'+top.label+'」では'+top.wins+'勝'+top.losses+'敗です。札分けと結果の関係は参考値として蓄積し、原因とは断定しません。');
    }

    const opp=xBreakdown(practice,r=>r.oppId);
    if(opp.length){
      const top=opp[0];
      if(practice.length>=8 && top.total/practice.length>0.35)out.push(top.label+'との対戦が全体の約'+Math.round(top.total/practice.length*100)+'%を占めています。相手を分散させる練習も選択肢です。');
    }

    if(practice.length>=6){
      const themes=practice.map(r=>r.practice?.theme).filter(Boolean);
      if(themes.length){
        const latest=themes.slice(-3);
        out.push('最近の練習テーマは「'+latest.join('」「')+'」です。テーマ別に勝敗を残すと、テーマと結果の関係を後から確認できます。');
      }
    }

    if(tournament.length>=2 && practice.length>=5){
      const pt=xStatsSummary(practice),tt=xStatsSummary(tournament);
      out.push('大会では'+tt.wins+'勝'+tt.losses+'敗、練習では'+pt.wins+'勝'+pt.losses+'敗です。大会と練習は母数や条件が異なるため、差は参考値として確認します。');
    }

    if(!out.length)out.push('現在のデータからは大きな傾向を特定できません。試合・相手の級・枚差・練習テーマを継続して記録すると分析精度が上がります。');

    out.push('※現在の分析は記録された数値から傾向を自動生成しています。記録されていない原因や技術的要因を断定しません。');
    return out;
  }

  function xRenderStats(){
    const wrap=$('xPlayerSelect');
    if(!wrap)return;
    const current=wrap.value||state.players[0]?.id||'';
    wrap.innerHTML=state.players.map(p=>'<option value="'+esc(p.id)+'" '+(p.id===current?'selected':'')+'>'+esc(p.name)+'（'+esc(playerDisplayRank(p))+'）</option>').join('');
    if(!current&&state.players[0])wrap.value=state.players[0].id;
    const id=wrap.value;
    if(!id){
      $('xStatsContent').innerHTML='<div class="empty-card"><h3>選手がいません</h3><p>先に選手を登録してください。</p></div>';
      return;
    }

    const practice=xStatsForPlayer(id,'practice');
    const tour=xStatsForPlayer(id,'tournament');
    const s=xStatsSummary(practice);
    const ts=xStatsSummary(tour);
    const rank=xBreakdown(practice,r=>r.oppRank);
    const opp=xBreakdown(practice,r=>r.oppName);
    const deal=xBreakdown(practice,r=>r.match?.dealInstruction?.key).map(r=>{
      const rule=typeof DEAL_RULES!=='undefined'?DEAL_RULES.find(x=>x.key===r.key):null;
      return {...r,label:rule?.label||r.key};
    });
    const trend=xTrend(practice);

    const card=(title,body,sub='')=>'<section class="card x-stats-card"><div class="stats-section-head"><h4>'+title+'</h4>'+(sub?'<span>'+sub+'</span>':'')+'</div>'+body+'</section>';
    const rows=(items,empty)=>items||'<div class="empty-small">'+empty+'</div>';

    $('xStatsContent').innerHTML=
      '<section class="card x-stats-hero">'+
        '<div class="x-stats-player"><div><div class="eyebrow">PLAYER</div><h3>'+esc(player(id)?.name||'—')+'</h3><p class="muted">'+esc(playerDisplayRank(player(id)))+'</p></div></div>'+
        '<div class="stats-overview">'+
          '<div><small>練習</small><strong>'+s.wins+'勝'+s.losses+'敗</strong></div>'+
          '<div><small>勝率</small><strong>'+fmtPct(s.wins,s.total)+'</strong></div>'+
          '<div><small>平均枚差</small><strong>'+s.avgMargin.toFixed(1)+'</strong></div>'+
          '<div><small>試合数</small><strong>'+s.total+'</strong></div>'+
        '</div>'+
      '</section>'+
      card('勝敗推移',trend.length?'<div class="x-trend">'+trend.map(r=>'<div class="x-trend-item"><b class="'+(r.mark==='○'?'x-win':'x-loss')+'">'+r.mark+'</b><small>'+esc(r.date)+'</small><span>'+r.margin+'枚差</span></div>').join('')+'</div>':'<div class="empty-small">まだ結果がありません。</div>','直近'+trend.length+'試合')+
      card('級別戦績',rows(rank.length?rank.map(r=>'<div class="stats-opponent-row"><b>'+esc(r.label)+'</b><strong>'+r.wins+'勝'+r.losses+'敗</strong><span>'+fmtPct(r.wins,r.total)+'</span></div>').join(''):null,'級別データがありません。'))+
      card('相手別戦績',rows(opp.length?opp.slice(0,12).map(r=>'<div class="stats-opponent-row"><b>'+esc(r.label)+'</b><strong>'+r.wins+'勝'+r.losses+'敗</strong><span>'+r.total+'試合</span></div>').join(''):null,'相手別データがありません。'))+
      card('札分け別',rows(deal.filter(r=>r.total>=3).map(r=>'<div class="stats-opponent-row"><b>'+esc(r.label)+'</b><strong>'+r.wins+'勝'+r.losses+'敗</strong><span>'+fmtPct(r.wins,r.total)+'</span></div>').join(''), '札分け別の比較に必要なデータがまだありません。'),'記録が3試合以上のもの')+
      card('大会との比較',
        '<div class="stats-opponent-row"><b>大会</b><strong>'+ts.wins+'勝'+ts.losses+'敗</strong><span>'+fmtPct(ts.wins,ts.total)+'</span></div>'+
        '<div class="stats-opponent-row"><b>大会試合数</b><strong>'+ts.total+'試合</strong><span>'+ts.avgMargin.toFixed(1)+'枚差平均</span></div>')+
      '<section class="card x-ai-card"><div class="eyebrow">AI ANALYSIS</div><h3>AI分析</h3><p class="muted">まず記録データから自動分析し、必要なら実際のAIに詳しく分析させます。</p><div class="x-ai-list">'+xAiInsights(id).map((t,i)=>'<div class="x-ai-item"><span>'+(i+1)+'</span><p>'+esc(t)+'</p></div>').join('')+'</div><div id="xRealAiResult" class="x-real-ai-result hidden"></div><div class="x-ai-actions"><button id="xRunRealAi" class="accent-btn" type="button">AIに詳しく分析してもらう</button><button id="xAiPairingBtn" class="secondary-btn" type="button">AI提案を使って対戦を組む</button><button id="xCopyAiPrompt" class="secondary-btn" type="button">AI分析用データをコピー</button></div></section>'+
      '<section class="card x-stats-card"><div class="stats-section-head"><h4>次の練習候補</h4><span>記録からの提案</span></div>'+xPracticeSuggestions(id)+'</section>';

    $('xCopyAiPrompt').onclick=()=>xCopyAiPrompt(id);
    $('xAiPairingBtn').onclick=()=>xOpenPairing(xRecommendedPairingMode(id));
    $('xRunRealAi').onclick=null;
  }
  function xRecommendedPairingMode(id){
    const practice=xStatsForPlayer(id,'practice');
    const rank=xBreakdown(practice,r=>r.oppRank).filter(r=>r.total>=2).sort((a,b)=>a.winRate-b.winRate);
    const opp=xBreakdown(practice,r=>r.oppName);
    if(rank[0]&&rank[0].winRate<0.4)return 'tournament';
    if(opp[0]&&practice.length>=6&&opp[0].total/practice.length>0.35)return 'distribute';
    return 'normal';
  }

  function xPracticeSuggestions(id){
    const practice=xStatsForPlayer(id,'practice');
    if(practice.length<3)return '<div class="empty-small">もう少し試合を記録すると提案を作れます。</div>';
    const rank=xBreakdown(practice,r=>r.oppRank).filter(r=>r.total>=2).sort((a,b)=>a.winRate-b.winRate);
    const opp=xBreakdown(practice,r=>r.oppName);
    const suggestions=[];
    if(rank[0])suggestions.push('最近の記録が少ない級ではなく、'+rank[0].label+'との対戦を候補にする');
    if(opp[0]&&opp[0].total>=3)suggestions.push('最近多く当たっている'+opp[0].label+'以外の相手を優先する');
    const recent=practice.slice(-5);
    if(recent.filter(r=>r.win).length<=1)suggestions.push('直近5試合は結果よりも練習テーマとメモを残して、次回に振り返る');
    return '<div class="x-suggestion-list">'+(suggestions.length?suggestions.map(s=>'<div class="x-suggestion">'+esc(s)+'</div>').join(''):'<div class="empty-small">現在の記録から追加提案はありません。</div>')+'</div>';
  }

  function xBuildAiPayload(id){
    const p=player(id);
    const practice=xStatsForPlayer(id,'practice');
    const tournament=xStatsForPlayer(id,'tournament');
    const opponentMap=new Map();
    practice.forEach(r=>{
      if(!r.oppName)return;
      const key=r.oppName;
      const cur=opponentMap.get(key)||{name:key,rank:r.oppRank,total:0,wins:0,losses:0,margins:[]};
      cur.total++;if(r.win)cur.wins++;else cur.losses++;cur.margins.push(r.margin);
      opponentMap.set(key,cur);
    });
    return {
      targetPlayer:{name:p?.name||'対象選手',rank:playerDisplayRank(p)},
      practiceSummary:xStatsSummary(practice),
      recentResults:practice.slice(-20).map(r=>({
        date:r.date,win:r.win,opponent:r.oppName,opponentRank:r.oppRank,margin:r.margin,
        practicePurpose:r.practice?.purpose||'',theme:r.practice?.theme||'',goal:r.practice?.goal||'',
        dealRule:r.match?.dealInstruction?.key||'',dealText:r.match?.dealInstruction?.text||''
      })),
      opponentSummary:[...opponentMap.values()].map(x=>({
        name:x.name,rank:x.rank,total:x.total,wins:x.wins,losses:x.losses,
        avgMargin:x.margins.length?Number((x.margins.reduce((a,b)=>a+b,0)/x.margins.length).toFixed(1)):0
      })),
      tournamentSummary:xStatsSummary(tournament),
      tournamentResults:tournament.slice(-20).map(r=>({
        date:r.date,win:r.win,opponent:r.oppName,opponentRank:r.oppRank,margin:r.margin,tournament:r.tournament?.name||''
      }))
    };
  }

  async function xRunRealAiAnalysis(id){
    const box=$('xRealAiResult');
    const btn=$('xRunRealAi');
    if(!box||!btn)return;
    box.classList.remove('hidden');
    box.innerHTML='<div class="x-ai-loading">AIが記録を分析しています…</div>';
    btn.disabled=true;
    try{
      if(!SUPABASE_URL||!SUPABASE_PUBLISHABLE_KEY){
        throw new Error('Supabaseの設定がありません。');
      }
      const response=await fetch(SUPABASE_URL+'/functions/v1/ai-analysis',{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'apikey':SUPABASE_PUBLISHABLE_KEY
        },
        body:JSON.stringify({data:xBuildAiPayload(id)})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result?.detail||result?.error||'AI分析に失敗しました。');
      box.innerHTML='<div class="eyebrow">REAL AI</div><h4>AIによる分析</h4><div class="x-real-ai-text">'+esc(result.analysis||'分析結果がありません。').replaceAll('\\n','<br>')+'</div>';
    }catch(error){
      console.error(error);
      box.innerHTML='<div class="eyebrow">REAL AI</div><h4>AI分析を利用できません</h4><p class="muted">'+esc(error?.message||String(error))+'</p><p class="muted">Supabase Edge Function と OPENAI_API_KEY の設定を確認してください。</p>';
    }finally{
      btn.disabled=false;
    }
  }

  function xCopyAiPrompt(id){
    const p=player(id);
    const practice=xStatsForPlayer(id,'practice');
    const tournament=xStatsForPlayer(id,'tournament');
    const prompt=[
      'あなたは競技かるたの練習データを整理するアシスタントです。',
      '原因を断定せず、記録から確認できる傾向と、次回練習で試せる選択肢を分けてください。',
      '選手: '+(p?.name||'—')+' / '+playerDisplayRank(p),
      '練習試合: '+JSON.stringify(practice.map(x=>({date:x.date,win:x.win,opponent:x.oppName,rank:x.oppRank,margin:x.margin,theme:x.practice?.theme}))),
      '大会試合: '+JSON.stringify(tournament.map(x=>({date:x.date,win:x.win,opponent:x.oppName,rank:x.oppRank,margin:x.margin})))
    ].join('\n');
    try{navigator.clipboard.writeText(prompt).then(()=>toast('AI分析用データをコピーしました')).catch(()=>toast('コピーできませんでした'));}catch{toast('コピーできませんでした')}
  }

  function xBuildStatsScreen(){
    if($('screenStats'))return;
    const section=document.createElement('section');
    section.id='screenStats';section.className='screen';
    section.innerHTML='<div class="page-title-row"><div><div class="eyebrow">STATS</div><h2>戦績</h2><p class="setup-lead">勝率だけでなく、相手・級・推移・大会との差から傾向を見ます。</p></div><button class="text-btn x-back-home" type="button">ホームに戻る</button></div>'+
      '<div class="card x-stats-player-select-card"><div class="form-field"><label for="xPlayerSelect">選手</label><select id="xPlayerSelect" class="x-stats-player-select"></select></div></div>'+
      '<div id="xStatsContent"></div>';
    $('app').appendChild(section);
    $('xPlayerSelect').onchange=xRenderStats;
    section.querySelector('.x-back-home').onclick=()=>xShowScreen('screenHome');
  }

  function xTournamentRows(){
    return state.tournaments||[];
  }

  let xSelectedTournamentId=null;

  function xBuildTournamentScreen(){
    if($('screenTournament'))return;
    const section=document.createElement('section');
    section.id='screenTournament';section.className='screen';
    section.innerHTML=
      '<div class="page-title-row"><div><div class="eyebrow">TOURNAMENT</div><h2>大会</h2><p class="setup-lead">大会名・開催日・相手・結果を練習記録とは分けて残します。</p></div><button class="text-btn x-back-home" type="button">ホームに戻る</button></div>'+
      '<div class="card x-tournament-register"><div class="setup-card-title"><div><span class="setup-step">01</span><h3>大会情報</h3></div></div><div class="form-card-inner">'+
        '<div class="form-field"><label for="xTournamentName">大会名</label><input id="xTournamentName" placeholder="例：全日本かるた選手権"></div>'+
        '<div class="form-field"><label for="xTournamentDate">開催日</label><input id="xTournamentDate" type="date"></div>'+
        '<div class="form-field"><label for="xTournamentLocation">場所</label><input id="xTournamentLocation" placeholder="例：○○会館"></div>'+
        '<div class="form-field"><label for="xTournamentPlayer">選手</label><select id="xTournamentPlayer"><option value="">選手を選択</option>'+state.players.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'（'+esc(playerDisplayRank(p))+'）</option>').join('')+'</select></div>'+
        '<div class="form-field"><label for="xTournamentRank">自分の級</label><select id="xTournamentRank"><option value="A">A級</option><option value="B">B級</option><option value="C">C級</option><option value="D">D級</option><option value="E">E級</option><option value="その他">その他</option></select></div>'+
        '<div class="form-field"><label for="xTournamentMemo">メモ</label><textarea id="xTournamentMemo" rows="2" placeholder="大会目標など"></textarea></div>'+
      '</div><button id="xCreateTournament" class="primary-btn x-tournament-register-btn" type="button">登録</button></div>'+
      '<div class="section-head"><h3>大会一覧</h3><span id="xTournamentCount" class="muted"></span></div><div id="xTournamentList" class="stack"></div>'+
      '<div id="xTournamentDetail" class="hidden"></div>';
    $('app').appendChild(section);
    $('xTournamentDate').value=today();
    $('xCreateTournament').onclick=xCreateTournament;
    section.querySelector('.x-back-home').onclick=()=>xShowScreen('screenHome');
  }

  function xCreateTournament(){
    const name=$('xTournamentName').value.trim();
    const date=$('xTournamentDate').value||today();
    const playerId=$('xTournamentPlayer')?.value||'';
    if(!name){toast('大会名を入力してください');return}
    if(!playerId){toast('選手を選択してください');return}
    const selected=player(playerId);
    const t={id:uid('tournament'),name,date,location:$('xTournamentLocation').value.trim(),playerId,myRank:$('xTournamentRank').value||(selected?.rank||'その他'),memo:$('xTournamentMemo').value.trim(),matches:[],createdAt:new Date().toISOString()};
    state.tournaments.unshift(t);xSelectedTournamentId=t.id;save();
    $('xTournamentName').value='';$('xTournamentLocation').value='';$('xTournamentMemo').value='';
    xRenderTournament();toast('大会を登録しました');
  }

  function xRenderTournament(){
    const list=$('xTournamentList');if(!list)return;
    const playerSelect=$('xTournamentPlayer');
    if(playerSelect){
      const current=playerSelect.value||'';
      playerSelect.innerHTML='<option value="">選手を選択</option>'+state.players.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'（'+esc(playerDisplayRank(p))+'）</option>').join('');
      if(current)playerSelect.value=current;
    }
    const tournaments=xTournamentRows();
    $('xTournamentCount').textContent=tournaments.length+'大会';
    list.innerHTML=tournaments.length?tournaments.map(t=>{
      const total=(t.matches||[]).length, wins=(t.matches||[]).filter(m=>m.result==='win').length;
      const losses=(t.matches||[]).filter(m=>m.result==='loss').length;
      return '<button class="x-tournament-card '+(t.id===xSelectedTournamentId?'selected':'')+'" type="button" data-x-tournament="'+esc(t.id)+'"><div><div class="eyebrow">'+esc(dateText(t.date))+'</div><b>'+esc(t.name)+'</b><small>'+esc(t.location||'場所未設定')+'　'+esc(t.myRank||'その他')+'級</small></div><strong>'+wins+'勝'+losses+'敗</strong></button>';
    }).join(''):'<div class="empty-card"><div class="empty-icon">大</div><h3>大会記録はまだありません</h3><p>大会を登録するとここに残ります。</p></div>';
    list.querySelectorAll('[data-x-tournament]').forEach(btn=>btn.onclick=()=>{xSelectedTournamentId=btn.dataset.xTournament;xRenderTournament()});
    xRenderTournamentDetail();
  }

  function xRenderTournamentDetail(){
    const detail=$('xTournamentDetail');if(!detail)return;
    const t=xTournamentRows().find(x=>x.id===xSelectedTournamentId);
    if(!t){detail.classList.add('hidden');return}
    detail.classList.remove('hidden');
    const oppOptions=state.players.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'（'+esc(playerDisplayRank(p))+'）</option>').join('');
    const matchList=(t.matches||[]).map(m=>{
      const opp=m.opponentPlayerId?player(m.opponentPlayerId):null;
      return '<div class="history-match-card"><div class="history-match-title"><span>'+esc(m.round?m.round+'回戦':'試合')+'</span><b>'+esc(opp?.name||m.opponentName||'—')+'</b><button class="secondary-btn x-del-tmatch" data-x-tmatch="'+esc(m.id)+'" type="button">削除</button></div><div class="history-detail-row"><span>結果</span><b>'+ (m.result==='win'?'○ 勝ち':'× 負け')+' '+esc(String(m.margin||0))+'枚差</b></div><div class="history-detail-row"><span>級</span><span>'+esc(m.opponentRank||opp?.rank||'その他')+'級</span></div>'+(m.memo?'<div class="history-detail-row"><span>メモ</span><span>'+esc(m.memo)+'</span></div>':'')+'</div>';
    }).join('');
    const matchHtml=matchList||'<div class="empty-small">まだ試合を登録していません。</div>';
    detail.innerHTML=
      '<div class="card"><div class="panel-title"><div><div class="eyebrow">MATCH RECORD</div><h3>'+esc(t.name)+'</h3></div><button id="xDeleteTournament" class="danger-btn" type="button">大会を削除</button></div>'+
      '<div class="muted">'+esc(dateText(t.date))+'　'+esc(t.location||'場所未設定')+'　'+esc(t.myRank||'その他')+'級</div>'+
      '<div class="x-tournament-add">'+
        '<select id="xTMatchPlayer"><option value="">登録選手と対戦</option>'+oppOptions+'</select>'+
        '<input id="xTOppName" placeholder="相手名（未登録の場合）">'+
        '<select id="xTOppRank"><option value="">相手級</option>'+RANKS.map(r=>'<option value="'+esc(r)+'">'+esc(r)+'級</option>').join('')+'</select>'+
        '<select id="xTResult"><option value="win">○ 勝ち</option><option value="loss">× 負け</option></select>'+
        '<input id="xTMargin" type="number" min="0" max="25" placeholder="枚差">'+
        '<input id="xTRound" type="number" min="1" max="30" placeholder="回戦">'+
        '<input id="xTMemo" placeholder="試合メモ">'+
        '<button id="xAddTournamentMatch" class="primary-btn" type="button">試合を追加</button>'+
      '</div>'+
      '<div class="history-matches">'+matchHtml+'</div></div>'+
      (t.memo?'<div class="card"><b>大会メモ</b><p class="muted">'+esc(t.memo)+'</p></div>':'');
    $('xDeleteTournament').onclick=()=>xDeleteTournament(t.id);
    $('xAddTournamentMatch').onclick=()=>xAddTournamentMatch(t.id);
    detail.querySelectorAll('.x-del-tmatch').forEach(btn=>btn.onclick=()=>xDeleteTournamentMatch(t.id,btn.dataset.xTmatch));
  }

  function xAddTournamentMatch(tid){
    const t=state.tournaments.find(x=>x.id===tid);if(!t)return;
    const linked=$('xTMatchPlayer').value||'';
    const name=$('xTOppName').value.trim()||(linked?player(linked)?.name||'':'');
    if(!name){toast('相手を入力してください');return}
    const rank=$('xTOppRank').value||(linked?player(linked)?.rank:'その他');
    const result=$('xTResult').value;
    const margin=safeNum($('xTMargin').value);
    const round=safeNum($('xTRound').value)||null;
    t.matches.push({id:uid('tmatch'),playerId:t.playerId||null,round,opponentPlayerId:linked||null,opponentName:name,opponentRank:rank||'その他',result,margin,memo:$('xTMemo').value.trim(),createdAt:new Date().toISOString()});
    save();xRenderTournament();toast('大会の試合を記録しました');
  }

  function xDeleteTournamentMatch(tid,mid){
    const t=state.tournaments.find(x=>x.id===tid);if(!t)return;
    t.matches=t.matches.filter(m=>m.id!==mid);save();xRenderTournament();toast('試合記録を削除しました');
  }

  function xDeleteTournament(tid){
    const t=state.tournaments.find(x=>x.id===tid);if(!t)return;
    if(!confirm(t.name+' の記録を削除しますか？'))return;
    state.tournaments=state.tournaments.filter(x=>x.id!==tid);
    xSelectedTournamentId=state.tournaments[0]?.id||null;save();xRenderTournament();toast('大会記録を削除しました');
  }

  function xInjectSetupFields(){
    const inner=document.querySelector('#screenSetup .form-card-inner');
    if(!inner||$('practicePurpose'))return;
    const field=document.createElement('div');
    field.innerHTML=
      '<div class="form-field"><label for="practicePurpose">練習目的</label><select id="practicePurpose"><option value="通常練習">通常練習</option><option value="大会前調整">大会前調整</option><option value="指導・育成">指導・育成</option><option value="苦手対策">苦手対策</option><option value="その他">その他</option></select></div>';
    inner.appendChild(field);
  }

  function xDecoratePracticeSetup(){
    xInjectSetupFields();
    const originalStart=window.__kokudaiStartWrapped;
    if(originalStart)return;
    const btn=$('startPracticeBtn');
    if(!btn)return;
    window.__kokudaiStartWrapped=true;
    const oldHandler=btn.onclick;
    btn.onclick=()=>{
      if(typeof oldHandler==='function')oldHandler();
      const p=currentPractice();
      if(!p)return;
      p.date=$('practiceDate')?.value||today();
      p.purpose=$('practicePurpose')?.value||'通常練習';
      p.theme=$('practiceTheme')?.value.trim()||'';
      p.goal=$('practiceGoal')?.value.trim()||'';
      p.updatedAt=new Date().toISOString();
      save();renderHome();
    };
  }

  function xPatchHomeAndPractice(){
    if($('homeAddRoundBtn'))$('homeAddRoundBtn').onclick=()=>xOpenPairing('normal');
    if($('recommendBtn'))$('recommendBtn').onclick=()=>xOpenPairing('normal');
    if($('customMatchBtn'))$('customMatchBtn').onclick=()=>xOpenPairing('manual');
    if($('headerHistoryBtn'))$('headerHistoryBtn').onclick=()=>xShowScreen('screenHistory');
    if($('homeHistoryBtn'))$('homeHistoryBtn').onclick=()=>xShowScreen('screenHistory');
    if($('newPracticeBtn'))$('newPracticeBtn').onclick=()=>{
      openNewPractice();
      if($('practicePurpose'))$('practicePurpose').value='通常練習';
      if($('practiceTheme'))$('practiceTheme').value='';
      if($('practiceGoal'))$('practiceGoal').value='';
    };
    if($('homeStartBtn'))$('homeStartBtn').onclick=()=>$('newPracticeBtn')?.click();
  }

  function xShowScreen(id){
    try{sessionStorage.setItem('kokudai-current-screen',id)}catch(e){}
    ensureStateShape();
    document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active',s.id===id));
    document.querySelectorAll('.nav-item,.x-drawer-item').forEach(b=>b.classList.toggle('active',b.dataset.nav===id));
    window.scrollTo({top:0,behavior:'smooth'});
    if(id==='screenHome')renderHome();
    if(id==='screenPlayers')renderPlayers();
    if(id==='screenHistory')renderHistory();
    if(id==='screenTournaments')renderTournaments();
    if(id==='screenData'){}
    if(id==='screenSetup'){renderSetup();xDecoratePracticeSetup();}
    if(id==='screenPractice')renderPractice();
    if(id==='screenPairing'){xResetPairingRows();xRenderPairSuggestions();}
    if(id==='screenStats')xRenderStats();
    if(id==='screenTournament')xRenderTournament();
  }

  function xBuildNavigation(){
    const bottom=document.querySelector('.bottom-nav');
    if(bottom)bottom.remove();

    let drawer=$('kokudaiDrawer');
    if(!drawer){
      drawer=document.createElement('div');
      drawer.id='kokudaiDrawer';
      drawer.innerHTML=
        '<div class="x-drawer-backdrop" data-drawer-close></div>'+
        '<aside class="x-drawer-panel" aria-label="メニュー">'+
          '<div class="x-drawer-head"><div><div class="eyebrow">MENU</div><strong>國大練習</strong></div><button type="button" class="icon-btn" data-drawer-close aria-label="メニューを閉じる">×</button></div>'+
          '<nav class="x-drawer-nav">'+
            '<button data-nav="screenHome" class="x-drawer-item active"><span>🏠</span><b>ホーム</b></button>'+
            '<button type="button" class="x-drawer-item x-drawer-parent" data-drawer-group="tournament" aria-expanded="false"><span>🏆</span><b>大会</b><i class="x-drawer-chevron" aria-hidden="true">▶️</i></button>'+
            '<div class="x-drawer-subgroup" data-drawer-subgroup="tournament" hidden>'+
              '<button data-nav="screenTournaments" class="x-drawer-subitem"><b>開催予定の大会を見る</b></button>'+
              '<button data-nav="screenTournament" class="x-drawer-subitem"><b>大会記録</b></button>'+
            '</div>'+
            '<button data-nav="screenPairing" class="x-drawer-item"><span>対</span><b>対戦</b><small>組み合わせ・対戦方針</small></button>'+
            '<button data-nav="screenStats" class="x-drawer-item"><span>📈</span><b>戦績</b><small>成長・相手・級・AI分析</small></button>'+
            '<button data-nav="screenHistory" class="x-drawer-item"><span>📝</span><b>記録</b><small>練習・試合・札分け履歴</small></button>'+
            '<button data-nav="screenPlayers" class="x-drawer-item"><span>👤</span><b>選手</b><small>名前・級・所属</small></button><button data-nav="screenHowTo" class="x-drawer-item"><span>❓</span><b>使い方</b><small>アプリの基本操作</small></button>'+
            '<button data-nav="screenData" class="x-drawer-item"><span>⚙️</span><b>設定</b><small>共有データ・バックアップ</small></button>'+
          '</nav>'+
        '</aside>';
      document.body.appendChild(drawer);
    }

    let menuBtn=$('menuBtn');
    if(!menuBtn){
      menuBtn=document.createElement('button');
      menuBtn.id='menuBtn';
      menuBtn.className='menu-btn';
      menuBtn.type='button';
      menuBtn.setAttribute('aria-label','メニューを開く');
      menuBtn.setAttribute('aria-expanded','false');
      menuBtn.innerHTML='<span></span><span></span><span></span>';
      document.body.appendChild(menuBtn);
    }

    const closeDrawer=()=>{
      drawer.classList.remove('open');
      menuBtn?.setAttribute('aria-expanded','false');
      document.body.classList.remove('drawer-open');
    };
    const openDrawer=()=>{
      drawer.classList.add('open');
      menuBtn?.setAttribute('aria-expanded','true');
      document.body.classList.add('drawer-open');
    };

    menuBtn.onclick=()=>drawer.classList.contains('open')?closeDrawer():openDrawer();
    let touchStartX=0,touchStartY=0,touchTracking=false,touchHorizontal=false,touchStartTime=0,touchStartProgress=0;
    const drawerPanel=drawer.querySelector('.x-drawer-panel');
    const drawerBackdrop=drawer.querySelector('.x-drawer-backdrop');
    const drawerWidth=()=>drawerPanel?.getBoundingClientRect().width||Math.min(window.innerWidth*.86,340);
    const setDrawerProgress=p=>{
      const progress=Math.max(0,Math.min(1,p));
      if(!drawerPanel)return;
      drawerPanel.style.transform='translateX('+((-1+progress)*drawerWidth())+'px)';
      if(drawerBackdrop)drawerBackdrop.style.opacity=String(progress);
    };
    const animateDrawerTo=open=>{
      if(!drawerPanel)return;
      const width=drawerWidth();
      drawerPanel.style.transition='transform .25s ease-out';
      if(drawerBackdrop)drawerBackdrop.style.transition='opacity .25s ease-out';
      drawerPanel.style.transform='translateX('+(open?'0px':(-width)+'px')+')';
      if(drawerBackdrop)drawerBackdrop.style.opacity=open?'1':'0';
      window.setTimeout(()=>{
        drawerPanel.style.transition='';
        if(drawerBackdrop)drawerBackdrop.style.transition='';
        if(open){
          drawer.classList.add('open');
          menuBtn?.setAttribute('aria-expanded','true');
          document.body.classList.add('drawer-open');
        }else{
          drawer.classList.remove('open');
          menuBtn?.setAttribute('aria-expanded','false');
          document.body.classList.remove('drawer-open');
        }
        drawerPanel.style.transform='';
        if(drawerBackdrop)drawerBackdrop.style.opacity='';
      },260);
    };
    document.addEventListener('touchstart',e=>{
      const t=e.touches[0];
      if(!t||e.touches.length!==1)return;
      touchStartX=t.clientX;
      touchStartY=t.clientY;
      touchStartTime=Date.now();
      touchTracking=true;
      touchHorizontal=false;
      touchStartProgress=drawer.classList.contains('open')?1:0;
    },{passive:true});
    document.addEventListener('touchmove',e=>{
      if(!touchTracking||!drawerPanel||e.touches.length!==1)return;
      const t=e.touches[0],dx=t.clientX-touchStartX,dy=t.clientY-touchStartY;
      if(!touchHorizontal){
        if(Math.abs(dx)<6&&Math.abs(dy)<6)return;
        if(Math.abs(dy)>Math.abs(dx)){
          touchTracking=false;
          return;
        }
        touchHorizontal=true;
      }
      e.preventDefault();
      const width=drawerWidth();
      const progress=touchStartProgress+(dx/width);
      drawerPanel.style.transition='none';
      if(drawerBackdrop)drawerBackdrop.style.transition='none';
      setDrawerProgress(progress);
    },{passive:false});
    document.addEventListener('touchend',e=>{
      if(!touchTracking||!touchHorizontal||!drawerPanel)return;
      touchTracking=false;
      const t=e.changedTouches[0],dx=t?t.clientX-touchStartX:0;
      const elapsed=Math.max(1,Date.now()-touchStartTime);
      const velocity=dx/elapsed;
      const progress=Math.max(0,Math.min(1,touchStartProgress+(dx/drawerWidth())));
      const opening=touchStartProgress===0;
      const shouldOpen=opening?(progress>=.5||velocity>=.7):(progress>=.5&&velocity>-0.7);
      if(opening)animateDrawerTo(shouldOpen);
      else animateDrawerTo(shouldOpen);
    },{passive:true});
    drawerBackdrop?.addEventListener('click',closeDrawer);
    drawer.querySelectorAll('[data-drawer-close]').forEach(el=>el.onclick=closeDrawer);
    drawer.querySelectorAll('.x-drawer-parent').forEach(b=>b.onclick=()=>{const sub=drawer.querySelector('[data-drawer-subgroup="'+b.dataset.drawerGroup+'"]');if(sub){sub.hidden=!sub.hidden;b.setAttribute('aria-expanded',String(!sub.hidden));b.classList.toggle('is-expanded',!sub.hidden);}});
    drawer.querySelectorAll('.x-drawer-item:not(.x-drawer-parent),.x-drawer-subitem').forEach(b=>b.onclick=()=>{
      if(b.dataset.nav==='screenData'){
        closeDrawer();
        openAdminSettings();
        return;
      }
      xShowScreen(b.dataset.nav);
      closeDrawer();
    });

    window.KOKUDAI_DRAWER={open:openDrawer,close:closeDrawer};
  }

  function xInjectStyles(){
    if($('kokudai-extension-style'))return;
    const style=document.createElement('style');
    style.id='kokudai-extension-style';
    style.textContent=
      '.x-pairing-controls{display:grid;gap:12px}.x-check{display:flex;align-items:center;gap:8px;padding:10px;border:1px solid var(--line);border-radius:10px;background:#fff;font-size:11px}.x-check input{width:auto;margin:0}.x-pairing-subhead{display:flex;justify-content:space-between;gap:10px;align-items:end;padding-top:6px}.x-pairing-subhead b{font-size:12px}.x-pairing-subhead small{font-size:9px;color:var(--muted);text-align:right}.x-pair-select-row{display:grid;grid-template-columns:1fr auto 1fr auto;gap:7px;align-items:center;margin-top:7px}.x-pair-select-row .custom-player-select{min-width:0}.x-pairing-actions{display:flex;gap:8px;flex-wrap:wrap;padding-top:4px}.x-pairing-actions button{flex:1}.x-trend{display:flex;gap:6px;overflow-x:auto;padding:8px 0}.x-trend-item{min-width:46px;text-align:center;padding:7px 4px;border:1px solid var(--line);border-radius:9px;background:#fff}.x-trend-item b{display:grid;place-items:center;width:25px;height:25px;margin:0 auto 4px;border-radius:50%;font-size:12px}.x-win{background:#ead8e5;color:var(--brand)}.x-loss{background:#eee9df;color:var(--muted)}.x-trend-item small{display:block;font-size:8px;color:var(--muted);white-space:nowrap}.x-trend-item span{display:block;font-size:8px;margin-top:3px;color:var(--muted)}.x-subcard{margin-top:12px}.x-ai-card{margin-top:12px;background:linear-gradient(135deg,#fffafd,#f8eef4)}.x-ai-list{display:grid;gap:8px;margin:12px 0}.x-ai-item{display:grid;grid-template-columns:24px 1fr;gap:8px;align-items:start}.x-ai-item span{display:grid;place-items:center;width:24px;height:24px;border-radius:8px;background:var(--brand);color:#fff;font-size:10px;font-weight:900}.x-ai-item p{margin:3px 0 0;font-size:11px;line-height:1.6}.x-suggestion-list{display:grid;gap:7px}.x-suggestion{padding:10px 11px;border:1px solid var(--line);border-radius:10px;background:#fff;font-size:11px;line-height:1.5}.x-tournament-card{width:100%;border:1px solid var(--line);border-radius:12px;background:#fff;padding:12px;display:flex;justify-content:space-between;align-items:center;text-align:left;gap:10px;cursor:pointer}.x-tournament-card.selected{border-color:var(--brand);background:#f8eef4}.x-tournament-card b{display:block;font-size:13px}.x-tournament-card small{display:block;margin-top:4px;color:var(--muted);font-size:9px}.x-tournament-card strong{white-space:nowrap;color:var(--brand)}.x-tournament-add{display:grid;grid-template-columns:1.1fr 1fr .7fr .7fr .55fr .55fr 1fr auto;gap:7px;margin:14px 0}.x-tournament-add input,.x-tournament-add select{width:100%;min-width:0;padding:10px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--ink)}.compact-page{margin-bottom:0}.x-ai-card h3{margin:4px 0}.x-ai-card .secondary-btn{margin-top:5px}@media(max-width:760px){.x-tournament-add{grid-template-columns:1fr 1fr;}.x-tournament-add .primary-btn{grid-column:1 / -1}.x-pair-select-row{grid-template-columns:1fr auto 1fr}.x-pair-select-row .mini-btn{grid-column:1 / -1;justify-self:end}.bottom-nav{overflow-x:auto}.bottom-nav .nav-item{min-width:66px}}@media(min-width:900px){.bottom-nav{position:fixed;left:14px;top:96px;bottom:auto;width:126px;padding:8px;display:grid;gap:6px;border:1px solid var(--line);border-radius:16px;box-shadow:0 14px 30px rgba(45,25,40,.08);background:rgba(255,250,253,.95)}.bottom-nav .nav-item{display:flex;flex-direction:row;justify-content:flex-start;gap:8px;padding:10px 9px;border-radius:10px}.bottom-nav .nav-item span{width:20px}.bottom-nav .nav-item.active{background:#f8eef4}.bottom-nav{z-index:40}main{max-width:900px;margin-left:156px}.app-header{padding-left:170px}}.menu-btn{position:fixed;left:12px;top:12px;z-index:1101;width:40px;height:40px;display:grid;place-content:center;gap:5px;border:1px solid var(--line);border-radius:11px;background:rgba(255,255,255,.96);cursor:pointer;box-shadow:0 4px 12px rgba(45,25,40,.12)}.menu-btn span{display:block;width:18px;height:2px;border-radius:999px;background:var(--ink)}.app-header{gap:10px;padding-left:62px}.x-drawer{position:fixed;inset:0;width:auto;height:auto;z-index:1000;transform:none;background:transparent;border:0;box-shadow:none;pointer-events:none;overflow:visible}.x-drawer-backdrop{position:absolute;inset:0;background:rgba(30,20,28,.28);opacity:0;pointer-events:none;transition:opacity .2s ease}.x-drawer-panel{position:absolute;left:0;top:0;bottom:0;width:min(86vw,340px);background:#fffafd;border-right:1px solid var(--line);box-shadow:18px 0 40px rgba(45,25,40,.16);transform:translateX(-102%);transition:transform .22s ease;padding:16px 14px;overflow:auto}.x-drawer.open{pointer-events:auto}.x-drawer.open .x-drawer-backdrop{opacity:1;pointer-events:auto}.x-drawer.open .x-drawer-panel{transform:translateX(0)}.x-drawer-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 2px 14px;border-bottom:1px solid var(--line);margin-bottom:10px}.x-drawer-head strong{font-size:20px;color:var(--brand)}.x-drawer-nav{display:grid;gap:5px}.x-drawer-subgroup{display:grid;gap:3px;padding:0 0 3px}.x-drawer-parent{position:relative;padding-right:64px}.x-drawer-parent .x-drawer-chevron{position:absolute;right:20px;top:calc(50% - 5px);transform:translateY(-50%);font-style:normal;font-size:26px;font-weight:700;line-height:1;color:var(--muted);transition:transform .18s ease,color .18s ease}.x-drawer-parent.is-expanded .x-drawer-chevron{transform:translateY(-50%) rotate(90deg);color:var(--brand)}.x-drawer-parent.is-expanded .x-drawer-chevron{transform:translateY(-50%) rotate(90deg);color:var(--brand)}.x-drawer-subgroup[hidden]{display:none}.x-drawer-subitem{width:calc(100% - 12px);margin-left:12px;text-align:left;border:0;border-left:2px solid var(--line);background:transparent;border-radius:0 8px 8px 0;padding:9px 10px;color:var(--muted);cursor:pointer}.x-drawer-subitem:hover,.x-drawer-subitem.active{background:#f8eef4;color:var(--brand)}.x-drawer-subitem b{font-size:24px}.x-drawer-group-title span{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--surface-2);font-size:11px}.x-drawer-subitem{width:calc(100% - 12px);margin-left:12px;text-align:left;border:0;border-left:2px solid var(--line);background:transparent;border-radius:0 8px 8px 0;padding:9px 10px;color:var(--muted);cursor:pointer}.x-drawer-subitem:hover,.x-drawer-subitem.active{background:#f8eef4;color:var(--brand)}.x-drawer-subitem b{font-size:24px}.x-drawer-item{width:100%;display:grid;grid-template-columns:30px 1fr;grid-template-areas:"icon title" "icon sub";align-items:center;text-align:left;border:0;background:transparent;border-radius:12px;padding:11px 10px;color:var(--ink);cursor:pointer}.x-drawer-item span{grid-area:icon;display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--surface-2);font-size:11px;font-weight:900}.x-drawer-item b{grid-area:title;font-size:13px}.x-drawer-item small{grid-area:sub;margin-top:2px;color:var(--muted);font-size:9px;line-height:1.3}.x-drawer-item.active{background:#f8eef4;color:var(--brand)}.x-drawer-item.active span{background:var(--brand);color:#fff}body.drawer-open{overflow:hidden}.x-ai-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}.x-ai-actions button{flex:1;min-width:180px}.x-real-ai-result{margin:12px 0 0;padding:13px;border:1px solid #d9c3d1;border-radius:12px;background:#fff}.x-real-ai-result h4{margin:4px 0 8px;font-size:13px}.x-real-ai-text{font-size:11px;line-height:1.75}.x-ai-loading{font-size:11px;color:var(--muted);padding:6px 0}@media(max-width:760px){.x-tournament-add{grid-template-columns:1fr 1fr}.x-tournament-add .primary-btn{grid-column:1 / -1}.x-pair-select-row{grid-template-columns:1fr auto 1fr}.x-pair-select-row .mini-btn{grid-column:1 / -1;justify-self:end}}@media(min-width:900px){main{max-width:900px;margin-left:auto}.app-header{padding-left:max(16px,4vw)}}';
    style.textContent += '.x-stats-player-select-card{padding:16px}.x-stats-player-select-card .form-field{width:100%;min-width:0}.x-stats-player-select-card label{display:block;margin:0 0 7px;font-size:14px;color:var(--ink);font-weight:800}.x-stats-player-select{display:block;width:100%;max-width:none;min-width:0;min-height:48px;padding:10px 42px 10px 14px;border:1px solid var(--line);border-radius:12px;background:#fff;color:var(--ink);font-size:16px;line-height:1.4;box-sizing:border-box}.x-stats-player-select:focus{outline:2px solid rgba(174,0,121,.18);outline-offset:1px}..x-stats-content{display:grid;gap:12px}.x-stats-hero{padding:16px}.x-stats-player{display:flex;align-items:center;justify-content:space-between}.x-stats-card{padding:16px}.x-stats-card .stats-section-head{margin-bottom:10px}.x-pairing-controls{padding:16px}.x-pairing-controls select,.x-pairing-controls input{min-width:0}.x-pair-select-row{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr) auto}.x-pair-select-row select{min-width:0}.x-tournament-card{min-width:0}.x-tournament-card>div{min-width:0;flex:1}.x-tournament-card b,.x-tournament-card small{overflow:hidden;text-overflow:ellipsis}.x-tournament-add{grid-template-columns:repeat(4,minmax(0,1fr));}.x-tournament-add>*{min-width:0}.x-tournament-add .primary-btn{grid-column:1 / -1}.x-tournament-detail .card{overflow:hidden}.x-ai-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.x-ai-actions button{min-width:0}.x-real-ai-result{overflow-wrap:anywhere}@media(max-width:760px){.x-tournament-add{grid-template-columns:repeat(2,minmax(0,1fr));}.x-tournament-add .primary-btn{grid-column:1 / -1}.x-pairing-subhead{align-items:flex-start;flex-direction:column}.x-pairing-subhead small{text-align:left}.x-pairing-actions{display:grid;grid-template-columns:1fr}.x-ai-actions{grid-template-columns:1fr}.stats-opponent-row{grid-template-columns:minmax(0,1fr) auto auto;gap:6px}.stats-opponent-row b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}@media(max-width:480px){.x-stats-hero,.x-stats-card,.x-ai-card{padding:13px}.x-tournament-add{grid-template-columns:1fr}.x-tournament-add .primary-btn{grid-column:auto}.x-pair-select-row{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)}.x-pair-select-row .mini-btn{grid-column:1 / -1;justify-self:end}.x-tournament-card{padding:11px}.x-tournament-card strong{font-size:11px}.x-ai-actions{grid-template-columns:1fr}.stats-opponent-row{grid-template-columns:minmax(0,1fr) auto;}.stats-opponent-row>span{grid-column:2;grid-row:2}.stats-opponent-row strong{grid-column:2;grid-row:1}}';
    document.head.appendChild(style);
    const aiStyle=document.createElement('style');
    aiStyle.textContent="\n/* AI action button: keep dynamically-rendered action clickable */\n.x-ai-actions{position:relative;z-index:2}\n.x-ai-actions button{pointer-events:auto!important;touch-action:manipulation;cursor:pointer}\n.x-ai-actions button:disabled{pointer-events:none;opacity:.55}\n";
    document.head.appendChild(aiStyle);
  }

  function xBindAiActions(){
    if(window.__kokudaiAiActionsBound)return;
    window.__kokudaiAiActionsBound=true;
    document.addEventListener('click',e=>{
      const btn=e.target.closest('#xRunRealAi');
      if(!btn)return;
      e.preventDefault();
      e.stopPropagation();
      const select=$('xPlayerSelect');
      const id=select?.value||state.players[0]?.id||'';
      if(!id){toast('選手を選択してください');return}
      xRunRealAiAnalysis(id);
    });
  }

  const ADMIN_MANUAL_PAGES={
    screenAdminManual:{title:'管理マニュアル',lead:'管理者が行う作業をまとめています。まず概要を確認し、必要な操作は各ページの手順から確認してください。'},
    screenAdminHowto:{title:'管理者画面の使い方',lead:'管理者向け設定を開くまでの手順と、管理者画面の基本的な見方です。'},
    screenAdminPlayers:{title:'選手情報の管理手順',lead:'選手の登録・変更・削除を行うときの基本手順です。'},
    screenAdminTournaments:{title:'大会情報の管理',lead:'大会情報を確認・更新するときの手順です。'},
    screenAdminData:{title:'データ管理の手順',lead:'共有データを確認し、安全に管理するための手順です。'},
    screenAdminBackup:{title:'バックアップ',lead:'共有データをJSONファイルとして保存・復元する手順です。'},
    screenAdminReset:{title:'データ初期化',lead:'共有データを初期化する場合の手順と、実行前に確認することをまとめています。'},
    screenAdminHandover:{title:'管理者交代・引き継ぎ',lead:'管理者が交代するときに、次の担当者へ引き継ぐ内容をまとめています。'},
    screenAdminTrouble:{title:'管理者向けトラブル対応',lead:'操作に問題が起きたときに、まず確認する項目です。'}
  };
  const ADMIN_MANUAL_DETAIL={
    screenAdminHowto:[['① 設定を開く','メニューから「設定」を選択し、管理者認証が表示されたら管理者用のユーザー名とパスワードを入力します。'],['② 管理者画面を確認する','認証に成功すると「データ管理」画面が開きます。共有データ、バックアップ、大会情報の更新、データ初期化などを確認できます。'],['③ 操作が終わったら','通常の練習に戻る場合は「ホームに戻る」を押してください。']],
    screenAdminPlayers:[['① 「選手」を開く','メニューを開き、「選手」を選択します。「選手登録」画面が表示されます。'],['② 選手情報を入力する','「名前（必須）」に選手名を入力します。「級」はA〜E級または「その他」から選択します。必要に応じて「表示用の段位・級」と「所属」も入力します。'],['③ 登録する','入力内容を確認して「登録」を押します。登録が完了すると、画面下の「登録済み」に選手が表示され、登録人数も更新されます。'],['④ 登録内容を変更する','「登録済み」から変更したい選手の「編集」を押します。順番に「名前」「級」「表示用の段位・級」「所属」を入力し直します。'],['⑤ 選手を削除する','「登録済み」から対象選手の「削除」を押します。確認メッセージを読み、削除する場合は確認してください。選手一覧からは削除されますが、過去の練習・試合履歴そのものは削除されません。'],['⑥ 削除前に確認する','削除後は選手一覧から選択できなくなります。今後も練習に参加する選手は削除せず、登録情報を残してください。']],screenAdminTournaments:[['① 大会を確認する','メニューの「大会」から「開催予定の大会を見る」を開きます。開催予定の大会、開催日、会場、國大締切などを確認できます。'],['② 条件を指定して確認する','「近場・関東・全国」、級、お気に入りなどの条件を使って、必要な大会を絞り込みます。'],['③ 大会情報の更新を依頼する','管理者画面の「大会お知らせを手動更新」を押します。管理者認証を行ったうえで更新を依頼します。'],['④ 更新を待つ','更新ボタンを押した直後に大会情報が変わるとは限りません。更新依頼が成功すると「数分以内に反映されます」と表示されます。'],['⑤ 更新後に確認する','大会画面を開き直し、必要な大会が表示されているか確認します。情報に問題がある場合は、公式大会ページも確認してください。']],
    screenAdminData:[['① 設定を開く','メニューから「設定」を選択し、管理者認証を行います。認証に成功すると「データ管理」画面が開きます。'],['② 共有データの状態を確認する','「共有データ」の「接続準備中…」「接続中…」「共有データと同期済み」などの表示を確認します。保存に問題がある場合は「共有データへの保存に失敗しました」などの表示も確認してください。'],['③ 必要な操作を選ぶ','バックアップが必要なら「JSONを書き出す」、以前のデータを戻すなら「JSONを読み込む」、全データを削除する場合だけ「共有データを初期化」を使用します。'],['④ 操作後の状態を確認する','データを変更した場合は、同期状態を確認してください。通信に問題があると保存できない場合があります。'],['⑤ 困ったとき','通常の操作で解決しない場合は、すぐに初期化せず、現在の状態を確認してから管理者向けトラブル対応を確認してください。']],
    screenAdminBackup:[['① データ管理を開く','メニューから「設定」を開き、管理者認証を行います。'],['② JSONを書き出す','「バックアップ」の「JSONを書き出す」を押します。現在の共有データがJSONファイルとして書き出されます。ファイル名にはバックアップ日が入ります。'],['③ ファイルを安全に保管する','作成されたJSONファイルを、次の管理者も取得できる安全な場所に保管します。年度の切り替えや管理者交代の前にも、最新のバックアップを残しておくと安心です。'],['④ JSONから復元する','「JSONを読み込む」から復元したいバックアップファイルを選択します。読み込みが成功すると、そのJSONの選手情報・練習履歴などで現在の共有データが置き換わります。'],['⑤ 復元前に確認する','復元すると現在の共有データが置き換わるため、必要なら先に現在のデータも「JSONを書き出す」でバックアップしてください。読み込むファイルを間違えないよう、保存日時も確認してください。']],
    screenAdminReset:[['① 初期化前にバックアップする','初期化すると現在の共有データが失われるため、必要なデータがある場合は、先に「JSONを書き出す」でバックアップしてください。'],['② 初期化が必要か確認する','通常の運用では使用しません。選手情報や練習履歴などを一度すべて削除して、共有データを初期状態に戻す必要がある場合だけ使用します。'],['③ データ管理を開く','メニューから「設定」を開き、管理者認証を行います。'],['④ 初期化を実行する','「共有データを初期化」を押します。確認メッセージが表示されるため、内容を確認してください。'],['⑤ DELETE を入力する','確認メッセージで「DELETE」と入力した場合だけ初期化が実行されます。入力が一致しなければ初期化されません。'],['⑥ 初期化されるデータを確認する','選手情報、練習履歴、試合結果、大会のお気に入りなど、共有している入力データが初期状態になります。'],['⑦ 初期化されない情報を確認する','大会のお知らせなど、公式サイトから取得する情報はこの操作では削除されません。初期化後はホーム画面へ移動します。']],
    screenAdminHandover:[['① 最新のバックアップを作成する','「設定」→「データ管理」→「JSONを書き出す」から、最新の共有データをバックアップします。'],['② バックアップを安全に引き渡す','作成したJSONファイルを、次の管理者が取得できる安全な場所に保管・共有します。不要な場所に置いたり、公開リポジトリへ登録したりしないでください。'],['③ 管理者情報を引き継ぐ','現在のアプリでは管理者認証に固定の管理者ユーザー名・パスワードを使用しています。次の担当者へ安全な方法で引き継いでください。管理者情報を変更する機能は現在の画面にはありません。'],['④ マニュアルを確認する','「管理マニュアル」と各詳細ページを次の管理者と一緒に確認します。特に選手管理、バックアップ・復元、大会情報更新、初期化を確認してください。'],['⑤ 実際に操作してもらう','次の管理者自身に設定画面を開き、管理者認証、バックアップ、大会情報更新などを一度操作してもらいます。'],['⑥ 引き継ぎ完了を確認する','アプリURL、最新バックアップ、管理者情報、管理マニュアルの場所が揃っていることを確認します。'],['⑦ 引き継ぎ後の注意','管理者認証はブラウザのセッション単位で保持されます。次の管理者の端末で必要なときに認証してください。'],['⑧ 困ったときの問い合わせ先','アプリ担当：木村星翔です。アプリの使い方や不具合、引き継ぎについて不明な点があればご相談ください。國學院大學かるた会のサークルLINEにいますので、そちらからご連絡ください。よろしくお願いします。']],
    screenAdminTrouble:[['画面が開かない','ページを再読み込みし、通信状態を確認してください。'],['共有データが反映されない','同期状態と通信状態を確認してください。'],['大会情報が更新されない','管理者画面から手動更新を行い、完了後に大会画面を開き直してください。'],['データを誤って変更した','すぐに初期化せず、まず現在の状態を確認してください。バックアップがある場合は、復元前に現在のデータもバックアップしてください。'],['原因が分からない','操作を繰り返したり初期化したりせず、現在の状態を記録してアプリ担当者に相談してください。']]
  };
  function xOpenAdminManual(id='screenAdminManual'){
    if(typeof adminLogin==='function'&&!adminLogin())return;
    xShowScreen(id);
  }
  function xBuildAdminManualScreens(){
    if($('screenAdminManual'))return;
    const main=document.createElement('section');
    main.id='screenAdminManual';main.className='screen';
    main.innerHTML='<div class="page-title-row"><div><div class="eyebrow">管理者向け</div><h2>管理マニュアル</h2><p class="setup-lead">'+esc(ADMIN_MANUAL_PAGES.screenAdminManual.lead)+'</p></div><button class="text-btn" data-admin-settings-back>設定に戻る</button></div>'+
      '<div class="card data-card"><h3>管理者画面の使い方</h3><p class="muted">管理者画面を開く方法と基本操作を確認します。</p><button type="button" class="secondary-btn" data-admin-detail="screenAdminHowto">手順を見る</button></div>'+
      '<div class="card data-card"><h3>選手情報の管理</h3><p class="muted">選手の登録・変更・削除を行います。</p><button type="button" class="secondary-btn" data-admin-detail="screenAdminPlayers">手順を見る</button></div>'+
      '<div class="card data-card"><h3>大会情報の管理</h3><p class="muted">大会情報の確認や手動更新を行います。</p><button type="button" class="secondary-btn" data-admin-detail="screenAdminTournaments">手順を見る</button></div>'+
      '<div class="card data-card"><h3>データ管理</h3><p class="muted">共有データの状態を確認し、必要な操作を行います。</p><button type="button" class="secondary-btn" data-admin-detail="screenAdminData">手順を見る</button></div>'+
      '<div class="card data-card"><h3>バックアップ</h3><p class="muted">共有データは定期的にバックアップしてください。特に管理者交代、大きな変更の前、年度が変わるときに確認します。バックアップは次の管理者が引き継げる場所に保管してください。</p><button type="button" class="secondary-btn" data-admin-detail="screenAdminBackup">手順を見る</button></div>'+
      '<div class="card data-card danger-card"><h3>データを初期化する</h3><p class="muted">共有データをすべて削除する操作です。通常の運用では使用しません。</p><button type="button" class="danger-btn" data-admin-detail="screenAdminReset">手順と注意事項を見る</button></div>'+
      '<div class="card data-card"><h3>管理者交代・引き継ぎ</h3><p class="muted">次の管理者へ、アカウント・バックアップ・運用方法を引き継ぎます。</p><button type="button" class="secondary-btn" data-admin-detail="screenAdminHandover">手順を見る</button></div>'+
      '<div class="card data-card"><h3>管理者向けトラブル対応</h3><p class="muted">操作に問題が起きたときの確認事項です。</p><button type="button" class="secondary-btn" data-admin-detail="screenAdminTrouble">対応手順を見る</button></div>';
    $('app').appendChild(main);
    Object.entries(ADMIN_MANUAL_PAGES).forEach(([id,meta])=>{
      if(id==='screenAdminManual'||$(id))return;
      const sec=document.createElement('section');sec.id=id;sec.className='screen';
      const rows=ADMIN_MANUAL_DETAIL[id]||[];
      sec.innerHTML='<div class="page-title-row"><div><div class="eyebrow">管理者向け</div><h2>'+esc(meta.title)+'</h2><p class="setup-lead">'+esc(meta.lead)+'</p></div><button class="text-btn" data-admin-manual-back>管理マニュアルに戻る</button></div>'+
        rows.map((r,i)=>'<div class="card data-card"><h3>'+esc(r[0])+'</h3><p class="muted">'+esc(r[1])+'</p></div>').join('')+
        '<div class="card data-card"><button type="button" class="secondary-btn" data-admin-manual-back>管理マニュアルに戻る</button></div>';
      $('app').appendChild(sec);
    });
    main.querySelector('[data-admin-settings-back]').onclick=()=>showScreen('screenData');
    document.querySelectorAll('[data-admin-detail]').forEach(b=>b.onclick=()=>xOpenAdminManual(b.dataset.adminDetail));
    document.querySelectorAll('[data-admin-manual-back]').forEach(b=>b.onclick=()=>xOpenAdminManual('screenAdminManual'));
    const dataScreen=$('screenData');
    if(dataScreen&&!dataScreen.querySelector('[data-open-admin-manual]')){
      const card=document.createElement('div');card.className='card data-card';
      card.innerHTML='<h3>管理マニュアル</h3><p class="muted">選手情報・大会情報・バックアップ・引き継ぎなど、管理者向けの操作手順を確認できます。</p><button type="button" class="secondary-btn" data-open-admin-manual>管理マニュアルを開く</button>';
      dataScreen.appendChild(card);
      card.querySelector('[data-open-admin-manual]').onclick=()=>xOpenAdminManual();
    }
  }

  function xInit(){
    ensureStateShape();
    xBuildPairingScreen();
    xBuildStatsScreen();
    xBuildTournamentScreen();
    xBuildAdminManualScreens();
    xBuildNavigation();
    xInjectStyles();
    xBindAiActions();
    xPatchHomeAndPractice();
    xDecoratePracticeSetup();
    if($('practiceDate'))$('practiceDate').value=$('practiceDate').value||today();
    if($('xTournamentDate'))$('xTournamentDate').value=today();
  }

  window.addEventListener('load',()=>{
    setTimeout(()=>{
      try{xInit();}catch(e){console.error('kokudai extension init',e)}
    },0);
  });

  // 既存UIから拡張画面へ遷移できるよう、直接参照できる入口も用意。
  window.KOKUDAI_EXTENSION={openPairing:()=>xOpenPairing('normal'),openStats:()=>xShowScreen('screenStats'),openTournament:()=>xShowScreen('screenTournament')};
})();
