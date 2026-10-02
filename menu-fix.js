(function(){
  'use strict';
  function fix(){
    const drawer=document.getElementById('kokudaiDrawer');
    if(drawer)drawer.classList.add('x-drawer');
  }
  window.addEventListener('load',()=>setTimeout(fix,100));
  setTimeout(fix,500);
})();
