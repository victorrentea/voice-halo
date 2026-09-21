/* webvs de pe CDN, cu patch aplicat în browser.
 *
 * Bundle-ul are 175 KB și FTP-ul cPanel refuză constant fișierul
 * ("max-retries exceeded"), așa că nu-l mai găzduim. Îl luăm de pe unpkg și
 * aplicăm aceleași trei corecții ca în build/patch-webvs.py, pe text, înainte
 * de a-l evalua:
 *   1. getspec() — lipsește din webvs, deși getosc() există
 *   2. TextureSetManager pornește cu 8 buffere, nu 2 (AVS folosește 8)
 *   3. findIndex crește setul de buffere la cerere, în loc să arunce
 */
(function (global) {
  const CDN = 'https://unpkg.com/webvs@3.0.0/dist/webvs.min.js';

  const GETSPEC_IMPL =
    't.prototype.getspec=function(t,e,r){var n=this.analyser.getSpectrum(),' +
    'l=n.length-1,o=Math.max(0,Math.min(l,Math.floor((t-e/2)*l))),' +
    'i=Math.max(o,Math.min(l,Math.floor((t+e/2)*l))),a=0,s=o;' +
    'for(;s<=i;s++)a+=n[s];return a/(i-o+1)},';

  const FIND_OLD =
    'if(!(n.default(t)&&t>=0&&t<this.textures.length))throw console.log(' +
    '"arg = ",typeof t,"textures = ",this.textures),' +
    'new Error("Unknown texture \'"+t+"\'");';
  const FIND_NEW =
    'if(n.default(t)&&t>=0&&t<64){for(;this.textures.length<=t;)this.addTexture()}' +
    'else{throw new Error("Unknown texture \'"+t+"\'")}';

  function patch(src) {
    const applied = [];

    if (src.indexOf('getosc:3,') !== -1) {
      src = src.replace('getosc:3,', 'getosc:3,getspec:3,');
      applied.push('arity');
    }
    if (src.indexOf('["getosc","gettime"]') !== -1) {
      src = src.replace('["getosc","gettime"]', '["getosc","getspec","gettime"]');
      applied.push('glslPreCompute');
    }
    const anchor = 't.prototype.getosc=function';
    const a = src.indexOf(anchor);
    if (a !== -1) {
      const b = src.indexOf('},t.prototype.', a) + 2;
      src = src.slice(0, b) + GETSPEC_IMPL + src.slice(b);
      applied.push('getspec');
    }
    if (src.indexOf('void 0===n&&(n=2),this.rctx=t,this.copier=e,this.initTexCount=n') !== -1) {
      src = src.replace('void 0===n&&(n=2),this.rctx=t,this.copier=e,this.initTexCount=n',
                        'void 0===n&&(n=8),this.rctx=t,this.copier=e,this.initTexCount=n');
      applied.push('texCount8');
    }
    if (src.indexOf(FIND_OLD) !== -1) {
      src = src.replace(FIND_OLD, FIND_NEW);
      applied.push('growBuffers');
    }
    return { src, applied };
  }

  global.loadWebvs = async function loadWebvs() {
    const res = await fetch(CDN, { mode: 'cors' });
    if (!res.ok) throw new Error('webvs nu s-a putut descărca: HTTP ' + res.status);
    const { src, applied } = patch(await res.text());
    if (applied.indexOf('getspec') === -1) {
      console.warn('webvs-loader: patch-ul getspec nu s-a aplicat — ' +
                   'probabil s-a schimbat bundle-ul upstream');
    }
    const el = document.createElement('script');
    el.textContent = src;                // script tag: se evaluează în scope global
    document.head.appendChild(el);
    if (!global.Webvs) throw new Error('bundle-ul s-a evaluat dar Webvs lipsește');
    return applied;
  };
})(window);
