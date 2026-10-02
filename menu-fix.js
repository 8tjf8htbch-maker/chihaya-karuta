(function(){
  'use strict';
  function fix(){
    const drawer=document.getElementById('kokudaiDrawer');
    if(drawer){drawer.classList.add('x-drawer');\n      drawer.querySelectorAll('.x-drawer-item b').forEach(el=>el.style.fontSize='26px');\n      drawer.querySelectorAll('.x-drawer-item small').forEach(el=>el.style.fontSize='18px');\n    }
  }
  window.addEventListener('load',()=>setTimeout(fix,100));
  setTimeout(fix,500);
})();
