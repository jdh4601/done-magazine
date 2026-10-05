// Locked D.one magazine template spec. Every page position, size and color comes from here.
// Human-readable version: docs/decisions/001-magazine-template-spec.md
// Values are pinned by tests/spec.test.js, so a change must be a deliberate design decision.

function deepFreeze(value) {
  for(const child of Object.values(value))if(child&&typeof child==='object')deepFreeze(child);
  return Object.freeze(value);
}

export const SPEC=deepFreeze({
  canvas:{width:1080,height:1350,margin:80,contentWidth:920},
  colors:{ink:'#0A0A0A',paper:'#EDEAE3',blue:'#1712FF',light:'#fff'},
  cover:{
    // Figma cover gradient: #000 at 0% opacity → 100% opacity at the 62% stop.
    gradient:{y:940,height:410,stops:[{position:0,opacity:0},{position:0.62,opacity:1}]},
    grainOpacity:0.45,
    // Title box top = clamp(minY, maxY, bottomY − title height); left-aligned at the margin.
    title:{fontFamily:'Pretendard',fontWeight:800,fontSize:90,lineHeight:108,maxHeight:350,minY:840,maxY:1010,bottomY:1250},
    // Logo is centered; its cap top sits gapBelowTitle under the visible bottom of the title.
    // Hangul in Pretendard ExtraBold 90px ends hangulDescent px below the baseline.
    logo:{fontSize:36,gapBelowTitle:50,hangulDescent:8},
  },
  body:{
    title:{fontFamily:'Pretendard',fontWeight:700,fontSize:55,maxHeight:160},
    text:{fontFamily:'Pretendard',fontWeight:400,fontSize:30},
    titleToBody:64,
    photoHeight:675,
    overlayShadeOpacity:0.76,
    // Photo-bottom pages: logo only at the top (cap top at the 80px margin), no rule.
    header:{logoY:72,logoSize:26},
    footer:{ruleY:1248,ruleOpacity:0.3,logoY:1268,logoSize:26},
    // bodyLimit is the lowest y the body text may reach before it is flagged as overflowing.
    layouts:{
      overlay:{titleY:365,bodyLimit:1190,brand:'footer'},
      photoTop:{titleY:750,bodyLimit:1225,brand:'footer'},
      photoBottom:{titleY:174,bodyLimit:645,brand:'header'},
    },
  },
});

export function bodyLayoutSpec(layout) {
  if(layout==='photo-overlay')return SPEC.body.layouts.overlay;
  return layout.endsWith('top')?SPEC.body.layouts.photoTop:SPEC.body.layouts.photoBottom;
}
