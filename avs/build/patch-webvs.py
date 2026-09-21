#!/usr/bin/env python3
"""webvs 3.0.0 implementează getosc() dar NU getspec() — exact funcția care
definește un analizor de spectru circular. Patch minimal peste bundle-ul minificat.

  1. tabelul de arități:      getosc:3            -> + getspec:3
  2. lista pre-compute GLSL:  ["getosc","gettime"] -> + "getspec"
  3. implementarea:           oglindește getosc, dar citește analyser.getSpectrum()
"""
import sys, re

IMPL = ('t.prototype.getspec=function(t,e,r){var n=this.analyser.getSpectrum(),'
        'l=n.length-1,o=Math.max(0,Math.min(l,Math.floor((t-e/2)*l))),'
        'i=Math.max(o,Math.min(l,Math.floor((t+e/2)*l))),a=0,s=o;'
        'for(;s<=i;s++)a+=n[s];return a/(i-o+1)},')

# AVS are 8 buffere de lucru (Buffer Save); webvs creează implicit doar 2, iar
# findIndex aruncă "Unknown texture 'N'" pentru orice id mai mare. Creștem
# implicitul și lăsăm findIndex să aloce la cerere, în loc să arunce.
TEXCOUNT_OLD = 'void 0===n&&(n=2),this.rctx=t,this.copier=e,this.initTexCount=n'
TEXCOUNT_NEW = 'void 0===n&&(n=8),this.rctx=t,this.copier=e,this.initTexCount=n'

FIND_OLD = ('if(!(n.default(t)&&t>=0&&t<this.textures.length))throw console.log('
            '"arg = ",typeof t,"textures = ",this.textures),'
            'new Error("Unknown texture \'"+t+"\'");')
FIND_NEW = ('if(n.default(t)&&t>=0&&t<64){for(;this.textures.length<=t;)this.addTexture()}'
            'else{throw new Error("Unknown texture \'"+t+"\'")}')


def patch(src: str) -> str:
    if 'getspec:3' in src:
        return src                                   # deja aplicat
    assert src.count('getosc:3,') == 1, 'tabelul de arități nu a fost găsit'
    src = src.replace('getosc:3,', 'getosc:3,getspec:3,', 1)

    assert src.count('["getosc","gettime"]') == 1, 'lista glslPreComputeFuncs nu a fost găsită'
    src = src.replace('["getosc","gettime"]', '["getosc","getspec","gettime"]', 1)

    anchor = 't.prototype.getosc=function'
    i = src.index(anchor)
    j = src.index('},t.prototype.', i) + 2           # imediat după corpul lui getosc
    src = src[:j] + IMPL + src[j:]

    assert src.count(TEXCOUNT_OLD) == 1, 'constructorul TextureSetManager nu a fost găsit'
    src = src.replace(TEXCOUNT_OLD, TEXCOUNT_NEW, 1)

    assert src.count(FIND_OLD) == 1, 'findIndex nu a fost găsit'
    src = src.replace(FIND_OLD, FIND_NEW, 1)
    return src

if __name__ == '__main__':
    p = sys.argv[1]
    s = open(p, encoding='utf8').read()
    out = patch(s)
    open(p, 'w', encoding='utf8').write(out)
    print('patch aplicat' if 'getspec:3' in out else 'NEAPLICAT', '->', p)
