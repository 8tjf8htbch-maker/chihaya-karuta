(function(){
  'use strict';
  function fix(){
    const drawer=document.getElementById('kokudaiDrawer');
    const menu=document.querySelector('.menu-btn');
    if(drawer){
      drawer.classList.add('x-drawer');
      const panel=drawer.querySelector('.x-drawer-panel');
      if(panel){
        panel.style.width='min(92vw,420px)';
        panel.style.padding='20px 18px';
      }
      const head=drawer.querySelector('.x-drawer-head strong');
      if(head)head.style.fontSize='40px';
      drawer.querySelectorAll('.x-drawer-item').forEach(el=>{
        el.style.minHeight='92px';
      });
      drawer.querySelectorAll('.x-drawer-item b').forEach(el=>{
        el.style.fontSize='26px';
      });
      drawer.querySelectorAll('.x-drawer-item small').forEach(el=>{
        el.style.fontSize='18px';
      });
      drawer.querySelectorAll('.x-drawer-item span').forEach(el=>{
        el.style.width='40px';
        el.style.height='40px';
        el.style.fontSize='15px';
      });
      drawer.querySelectorAll('.x-drawer-subitem b').forEach(el=>{
        el.style.fontSize='24px';
      });
    }
    if(menu){
      menu.style.zIndex='1101';
      menu.style.pointerEvents='auto';
    }
  }
  window.addEventListener('load',()=>setTimeout(fix,100));
  setTimeout(fix,500);
  setTimeout(fix,1500);
})();