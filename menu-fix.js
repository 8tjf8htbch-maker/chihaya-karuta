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
  }
  window.addEventListener('load',()=>setTimeout(fix,100));
  setTimeout(fix,500);
  setTimeout(fix,1500);
})();