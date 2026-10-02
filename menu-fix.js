(function(){
  'use strict';
  function fix(){
    const drawer=document.getElementById('kokudaiDrawer');
    const menu=document.querySelector('.menu-btn');
    if(drawer){
      drawer.classList.add('x-drawer');
      drawer.querySelectorAll('.x-drawer-item b').forEach(el=>el.style.fontSize='26px');
      drawer.querySelectorAll('.x-drawer-item span').forEach(el=>{el.style.width='56px';el.style.height='56px';el.style.fontSize='22px';});
      drawer.querySelectorAll('.x-drawer-item small').forEach(el=>el.style.fontSize='18px');
    }
    if(menu){
      menu.style.zIndex='1101';
      menu.style.pointerEvents='auto';
    }
  }
  window.addEventListener('load',()=>setTimeout(fix,100));
  setTimeout(fix,500);
})();