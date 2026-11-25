export const controlCorners=['top-left','top-right','bottom-left','bottom-right'] as const
export type ControlCorner=typeof controlCorners[number]
type Rect={left:number;top:number;right:number;bottom:number}
/** Les marges connues sont préférées ; le HUD interne d’un tiers reste inconnu. */
export function playerControlCorner(surface:Rect,content:Rect|undefined):ControlCorner{
 if(!content)return 'top-left'
 const width=104,height=60
 const overlap=(x:number,y:number)=>Math.max(0,Math.min(x+width,content.right)-Math.max(x,content.left))*Math.max(0,Math.min(y+height,content.bottom)-Math.max(y,content.top))
 const scores=[overlap(surface.left,surface.top),overlap(surface.right-width,surface.top),overlap(surface.left,surface.bottom-height),overlap(surface.right-width,surface.bottom-height)]
 return controlCorners[scores.indexOf(Math.min(...scores))]
}
