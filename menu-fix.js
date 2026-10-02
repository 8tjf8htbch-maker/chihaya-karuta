(function(){
  'use strict';
  function fix(){
    const drawer=document.getElementById('kokudaiDrawer');
    const menu=document.querySelector('.menu-btn');
    if(drawer){
      drawer.classList.add('x-drawer');
      drawer.style.pointerEvents='auto';
    }
    if(menu){
      menu.style.zIndex='1101';
      menu.style.pointerEvents='auto';
    }
    if(!document.getElementById('kokudai-readability-style')){
      const style=document.createElement('style');
      style.id='kokudai-readability-style';
      style.textContent=`
        body{font-size:15px}
        .eyebrow{font-size:11px!important}
        .muted{font-size:13px!important}
        .primary-btn,.accent-btn,.secondary-btn,.danger-btn{font-size:13px!important}
        .text-btn,.icon-btn{font-size:13px!important}
        .nav-item{font-size:12px!important}
        .x-drawer-item{padding:13px 11px!important}
        .x-drawer-item span{width:30px!important;height:30px!important;font-size:13px!important}
        .x-drawer-item b{font-size:15px!important}
        .x-drawer-item small{font-size:11px!important}
        .menu-btn{width:44px!important;height:44px!important}
        .menu-btn span{width:20px!important;height:2.5px!important}
        .quick-card b{font-size:14px!important}
        .quick-card small{font-size:11px!important}
        .player-check-main b{font-size:14px!important}
        .player-check-main small{font-size:12px!important}
        .player-info b{font-size:14px!important}
        .player-info span{font-size:11px!important}
        .player-names b{font-size:15px!important}
        .player-names small{font-size:10px!important}
        .match-names{font-size:13px!important}
        .history-card h3{font-size:17px!important}
        .stats-opponent-row b{font-size:13px!important}
        .stats-opponent-row strong{font-size:14px!important}
        .stats-opponent-row>span{font-size:11px!important}
        .x-ai-item p,.x-real-ai-text{font-size:12px!important}
        @media(max-width:480px){
          body{font-size:14px}
          .muted{font-size:12px!important}
          .primary-btn,.accent-btn,.secondary-btn,.danger-btn{font-size:13px!important}
          .x-drawer-item b{font-size:15px!important}
          .x-drawer-item small{font-size:11px!important}
          .player-names b{font-size:13px!important}
        }
      `;
      document.head.appendChild(style);
    }
  }
  window.addEventListener('load',()=>setTimeout(fix,100));
  setTimeout(fix,500);
})();
