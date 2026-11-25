export type PlayerViewport={width:number;height:number}
export type PlayerSizing={mode:'responsive'}|{mode:'fixed';viewport:PlayerViewport}
export const RESPONSIVE_SIZING:PlayerSizing={mode:'responsive'}
export const LEGACY_VIEWPORT:PlayerViewport={width:1280,height:720}
export const LEGACY_SIZING:PlayerSizing={mode:'fixed',viewport:LEGACY_VIEWPORT}
export function playerSizing(sizing:PlayerSizing|undefined,viewport?:PlayerViewport):PlayerSizing{
 const valid=(v:PlayerViewport|undefined)=>!!v&&Number.isFinite(v.width)&&Number.isFinite(v.height)&&v.width>0&&v.height>0
 if(sizing?.mode==='responsive')return RESPONSIVE_SIZING
 if(sizing?.mode==='fixed'&&valid(sizing.viewport))return sizing
 return valid(viewport)?{mode:'fixed',viewport:viewport!}:RESPONSIVE_SIZING
}
