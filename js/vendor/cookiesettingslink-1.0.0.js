(function(){if(window.__fgCk)return;window.__fgCk=1;
var st=document.createElement('style');st.textContent='#CookiebotWidget{display:none!important}';document.head.appendChild(st);
function add(){document.querySelectorAll('a.link-block[href*="privacy-policy"]').forEach(function(p){
if(p.parentNode.querySelector('[data-fg-cookie]'))return;
var c=p.cloneNode(true),t=c.querySelector('.text-block-3')||c,de=/datenschutz/i.test(p.textContent);
c.setAttribute('href','#');c.setAttribute('role','button');c.setAttribute('data-fg-cookie','1');c.classList.remove('w--current');c.removeAttribute('aria-current');
t.textContent=de?'cookie-einstellungen.':'cookie settings.';
c.addEventListener('click',function(e){e.preventDefault();if(window.Cookiebot&&Cookiebot.renew)Cookiebot.renew();});
p.parentNode.insertBefore(c,p.nextSibling);});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',add);else add();})();