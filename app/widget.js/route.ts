import { getPublicEnvironment } from "@/lib/env";

export async function GET() {
  const base = getPublicEnvironment().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const script = `(function(){
  var current=document.currentScript;if(!current||current.dataset.klabsLoaded)return;current.dataset.klabsLoaded='true';
  var key=current.dataset.chatbotKey;if(!key){console.error('K-Labs chatbot: missing data-chatbot-key');return;}
  var position=current.dataset.position||'bottom-right';var language=current.dataset.language||'auto';
  var frame=document.createElement('iframe');frame.title='Website chat assistant';frame.setAttribute('aria-label','Website chat assistant');
  var lang=language==='auto'?((document.documentElement.lang||navigator.language||'en').toLowerCase().startsWith('ar')?'ar':'en'):language;
  frame.src='${base}/embed/'+encodeURIComponent(key)+'?language='+encodeURIComponent(lang)+'&pageUrl='+encodeURIComponent(location.href);
  frame.style.cssText='position:fixed;z-index:2147483000;border:0;background:transparent;width:76px;height:76px;bottom:16px;'+(position==='bottom-left'?'left:16px':'right:16px')+';color-scheme:normal;';
  if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){frame.style.transition='width 320ms cubic-bezier(.22,1,.36,1),height 320ms cubic-bezier(.22,1,.36,1),bottom 320ms cubic-bezier(.22,1,.36,1),left 320ms cubic-bezier(.22,1,.36,1),right 320ms cubic-bezier(.22,1,.36,1)';frame.style.willChange='width,height,bottom,left,right';}
  frame.allow='clipboard-write';document.body.appendChild(frame);
  window.addEventListener('message',function(event){if(event.origin!=='${new URL(base).origin}'||event.source!==frame.contentWindow||!event.data||event.data.type!=='klabs-widget-resize')return;
    var open=!!event.data.open;frame.style.width=open?Math.min(400,window.innerWidth-20)+'px':'76px';frame.style.height=open?Math.min(700,window.innerHeight-20)+'px':'76px';frame.style.bottom=open?'10px':'16px';if(position==='bottom-left')frame.style.left=open?'10px':'16px';else frame.style.right=open?'10px':'16px';
  });
})();`;
  return new Response(script, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=300", "access-control-allow-origin": "*", "x-content-type-options": "nosniff" } });
}
