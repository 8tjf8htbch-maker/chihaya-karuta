/* 國大練習｜今日の対戦編成 v2
 * 目的：指導 / 調整 / 通常
 * - 今回の練習内で同じ相手とは絶対に再戦しない
 * - 過去14日以内の対戦はなるべく避ける
 * - 指導は格上、調整は格下、通常は級が近い相手を優先
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
    const ra=getRank(a.id),rb=getRank(b.id);
    const diff=Math.abs(ra-rb);
    const ga=goals[a.id]||'normal',gb=goals[b.id]||'normal';
    const recent=recent14(a.id,b.id),history=historyCount(a.id,b.id);
    let score=0;
    const reasons=[];

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
    apply(ga,ra,rb);
    apply(gb,rb,ra);

    if(recent){score-=700;reasons.push('過去14日以内に対戦');}
    else {score+=220;reasons.push('過去14日以内の対戦なし');}
    if(history===0){score+=90;reasons.push('過去の対戦なし');}
    else {score-=Math.min(history*18,90);reasons.push('過去'+history+'回対戦');}

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
      used.add(c.a.id);used.add(c.b.id);
      pairs.push(c);
    }
    const rest=arr.filter(p=>!used.has(p.id)).sort((a,b)=>{
      const p=currentPractice();
      const ra=p?.rounds?.filter(r=>r.restPlayerId===a.id).length||0;
      const rb=p?.rounds?.filter(r=>r.restPlayerId===b.id).length||0;
      return ra-rb;
    })[0]||null;
    return {pairs,rest};
  }

  function openPairing(){
    ensure();
    const p=currentPractice();
    if(!p){openNewPractice();return;}
    const screen=document.getElementById('screenPairing');
    if(!screen)return;
    document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active',s===screen));
    document.querySelectorAll('.nav-item,.x-drawer-item').forEach(b=>b.classList.toggle('active',b.dataset.nav==='screenHome'));
    window.scrollTo({top:0,behavior:'smooth'});
    renderPairing();
  }

  function renderPairing(){
    ensure();
    const p=currentPractice(),screen=document.getElementById('screenPairing');
    if(!p||!screen)return;
    const ids=(p.participantIds||[]).filter(id=>getPlayer(id));
    if(!p.pairingGoals)p.pairingGoals={};
    ids.forEach(id=>{if(!p.pairingGoals[id])p.pairingGoals[id]='normal';});
    screen.innerHTML=
      '<div class="page-title-row">'+
        '<div><div class="eyebrow">TODAY MATCHING</div><h2>今日の対戦を組む</h2><p class="setup-lead">一人ずつ今日の目的を設定してください。</p></div>'+
        '<button id="xPairingBackV2" class="text-btn" type="button">戻る</button>'+
      '</div>'+
      '<section class="card x-pairing-v2-goals">'+
        '<div class="panel-title"><div><div class="eyebrow">TODAY\'S GOAL</div><h3>今日の目的</h3></div><span class="muted">'+ids.length+'人</span></div>'+
        '<p class="muted">指導＝格上、調整＝格下、通常＝級が近い相手を優先します。</p>'+
        '<div class="x-pairing-v2-list">'+ids.map(id=>{
          const pl=getPlayer(id),g=p.pairingGoals[id]||'normal';
          return '<div class="x-pairing-v2-row"><div><b>'+esc2(pl.name)+'</b><small>'+esc2(typeof playerDisplayRank==='function'?playerDisplayRank(pl):pl.rank+'級')+'</small></div><select data-goal-id="'+esc2(id)+'"><option value="normal" '+(g==='normal'?'selected':'')+'>通常</option><option value="coaching" '+(g==='coaching'?'selected':'')+'>指導</option><option value="tuning" '+(g==='tuning'?'selected':'')+'>調整</option></select><span>'+goalNote(g)+'</span></div>';
        }).join('')+'</div>'+
      '</section>'+
      '<section class="card">'+
        '<div class="panel-title"><div><div class="eyebrow">SUGGESTIONS</div><h3>対戦候補</h3></div><button id="xPairingRegenerateV2" class="accent-btn" type="button">組み直す</button></div>'+
        '<div id="xPairingV2Suggestions" class="stack"></div>'+
        '<div class="custom-match-footer"><span id="xPairingV2Rest" class="muted"></span><button id="xPairingV2Apply" class="primary-btn" type="button">この組み合わせで次の試合を作る</button></div>'+
      '</section>';
    document.getElementById('xPairingBackV2').onclick=()=>showHome();
    screen.querySelectorAll('[data-goal-id]').forEach(el=>el.onchange=()=>{
      p.pairingGoals[el.dataset.goalId]=el.value;
      save();
      renderPairing();
    });
    document.getElementById('xPairingRegenerateV2').onclick=()=>renderPairing();
    document.getElementById('xPairingV2Apply').onclick=()=>{
      const result=makePairs(ids,p.pairingGoals);
      applyPairs(result);
    };
    renderSuggestions(ids,p.pairingGoals);
  }

  function renderSuggestions(ids,goals){
    const result=makePairs(ids,goals),list=document.getElementById('xPairingV2Suggestions');
    if(!list)return;
    list.innerHTML=result.pairs.length?result.pairs.map((x,i)=>
      '<div class="suggestion-row x-pairing-v2-suggestion"><span class="suggestion-num">'+(i+1)+'</span><div><b>'+esc2(x.a.name)+' <span>×</span> '+esc2(x.b.name)+'</b><small>'+esc2(typeof playerDisplayRank==='function'?playerDisplayRank(x.a):x.a.rank+'級')+'・'+goalLabel(x.goalA)+'　vs　'+esc2(typeof playerDisplayRank==='function'?playerDisplayRank(x.b):x.b.rank+'級')+'・'+goalLabel(x.goalB)+'</small></div><span class="suggestion-reason">'+esc2(x.reasons.join('・'))+'</span></div>'
    ).join(''):'<div class="empty-small">条件を考慮できる組み合わせがありません。</div>';
    document.getElementById('xPairingV2Rest').textContent=result.rest?'今回は'+result.rest.name+'を休み候補にします。':'全員を対戦に入れます。';
  }

  function applyPairs(result){
    const p=currentPractice();
    if(!p||!result.pairs.length){toast('組み合わせを作れませんでした');return;}
    const pairs=result.pairs.map(x=>[x.a,x.b]);
    generateRound(pairs.length? p:p,pairs,result.rest?.id||null);
    save();renderHome();renderHistory();
    showHome();
    toast(pairs.length+'試合を追加しました');
  }

  function showHome(){
    document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active',s.id==='screenHome'));
    document.querySelectorAll('.nav-item,.x-drawer-item').forEach(b=>b.classList.toggle('active',b.dataset.nav==='screenHome'));
    if(typeof renderHome==='function')renderHome();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function install(){
    ensure();
    const drawer=document.getElementById('kokudaiDrawer');
    drawer?.querySelector('[data-nav="screenPairing"]')?.remove();

    const wire=()=>{
      document.getElementById('homeAddRoundBtn')?.addEventListener('click',openPairing);
      document.getElementById('recommendBtn')?.addEventListener('click',openPairing);
      document.getElementById('customMatchBtn')?.addEventListener('click',openPairing);
    };
    wire();

    const screen=document.getElementById('screenPairing');
    if(screen){
      screen.classList.remove('active');
      const observer=new MutationObserver(()=>{
        if(screen.querySelector('h2')?.textContent==='対戦')renderPairing();
      });
      observer.observe(screen,{childList:true,subtree:true});
    }
  }

  function injectStyle(){
    if(document.getElementById('pairing-v2-style'))return;
    const s=document.createElement('style');
    s.id='pairing-v2-style';
    s.textContent='.x-pairing-v2-goals{padding:16px}.x-pairing-v2-list{display:grid;gap:7px;margin-top:12px}.x-pairing-v2-row{display:grid;grid-template-columns:minmax(0,1fr) 88px minmax(110px,auto);gap:9px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:10px;background:#fff}.x-pairing-v2-row b{display:block;font-size:12px}.x-pairing-v2-row small{display:block;color:var(--muted);font-size:9px;margin-top:2px}.x-pairing-v2-row select{width:100%;min-width:0;padding:8px;border:1px solid var(--line);border-radius:8px;background:#fff}.x-pairing-v2-row>span{font-size:9px;color:var(--muted);text-align:right}.x-pairing-v2-suggestion>div{min-width:0}.x-pairing-v2-suggestion small{display:block;margin-top:3px;color:var(--muted);font-size:9px}.x-pairing-v2-suggestion .suggestion-reason{max-width:190px;text-align:right;font-size:9px;line-height:1.4}@media(max-width:600px){.x-pairing-v2-goals{padding:13px}.x-pairing-v2-row{grid-template-columns:minmax(0,1fr) 82px}.x-pairing-v2-row>span{grid-column:1 / -1;text-align:left}.x-pairing-v2-suggestion{grid-template-columns:24px minmax(0,1fr)}.x-pairing-v2-suggestion .suggestion-reason{grid-column:2;max-width:none;text-align:left}}';
    document.head.appendChild(s);
  }

  window.addEventListener('load',()=>setTimeout(()=>{try{injectStyle();install()}catch(e){console.error('pairing v2',e)}},150));
  window.KOKUDAI_PAIRING_V2={open:openPairing};
})();