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
  }
  window.addEventListener('load',()=>setTimeout(fix,100));
  setTimeout(fix,500);
})();