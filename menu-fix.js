(function(){
  'use strict';
  function fix(){
    const drawer=document.getElementById('kokudaiDrawer');
    const menu=document.querySelector('.menu-btn');
    if(drawer){
      drawer.classList.add('x-drawer');
    }
    if(menu){
      menu.style.zIndex='1101';
      menu.style.pointerEvents='auto';
    }
    if(!document.getElementById('kokudai-menu-size-style')){
      const style=document.createElement('style');
      style.id='kokudai-menu-size-style';
      style.textContent=".x-drawer-panel{width:min(92vw,420px)!important;padding:20px 18px!important}.x-drawer-head{padding:8px 4px 18px!important;margin-bottom:14px!important}.x-drawer-head strong{font-size:40px!important}.x-drawer-head .icon-btn{font-size:28px!important;min-width:56px;min-height:56px;padding:8px}.x-drawer-nav{gap:8px!important}.x-drawer-item{grid-template-columns:64px 1fr!important;padding:16px 14px!important;min-height:92px!important;border-radius:14px!important;column-gap:12px!important}.x-drawer-item span{width:56px!important;height:56px!important;border-radius:14px!important;font-size:22px!important}.x-drawer-item b{font-size:26px!important;line-height:1.25!important}.x-drawer-item small{font-size:18px!important;line-height:1.35!important;margin-top:5px!important}@media(max-width:480px){.x-drawer-panel{width:92vw!important;max-width:none!important;padding:18px 14px!important}.x-drawer-item{grid-template-columns:60px 1fr!important;min-height:88px!important;padding:14px 12px!important}.x-drawer-item span{width:52px!important;height:52px!important;font-size:21px!important}.x-drawer-item b{font-size:24px!important}.x-drawer-item small{font-size:17px!important}}";
      document.head.appendChild(style);
    }
  }
  window.addEventListener('load',()=>setTimeout(fix,100));
  setTimeout(fix,500);
  setTimeout(fix,1500);
})();