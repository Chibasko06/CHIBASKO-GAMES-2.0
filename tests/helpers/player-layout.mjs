import assert from 'node:assert/strict'
export async function assertPlayerLayout(page,fullscreen=false){
  const surface=await page.locator('[data-player-surface]').boundingBox()
  const dock=await page.locator('[data-player-dock]').boundingBox()
  if(!fullscreen){
  assert.ok(Math.abs(surface.y+surface.height-dock.y)<1,'dock must start below the game surface')
  assert.ok(dock.x>=surface.x-1 && dock.x+dock.width<=surface.x+surface.width+1)
  for(const button of await page.getByRole('group',{name:'Commandes du lecteur',exact:true}).getByRole('button').all()){
    const bounds=await button.boundingBox()
    assert.ok(bounds.width>=44 && bounds.height>=44)
    assert.ok(bounds.y>=dock.y && bounds.y+bounds.height<=dock.y+dock.height)
  }
  }
  if(fullscreen)assert.equal(dock,null)
  if(await page.locator('iframe').count()){
    const frame=await page.locator('iframe').boundingBox()
    assert.ok(frame.x>=surface.x-1 && frame.y>=surface.y-1)
    assert.ok(frame.x+frame.width<=surface.x+surface.width+1 && frame.y+frame.height<=surface.y+surface.height+1)
    assert.ok(Math.abs(frame.x+frame.width/2-surface.x-surface.width/2)<1)
    assert.ok(Math.abs(frame.y+frame.height/2-surface.y-surface.height/2)<1)
  }
  if(fullscreen){
    assert.equal(surface.x,0);assert.equal(surface.y,0)
    assert.equal(surface.width,await page.evaluate(()=>innerWidth))
    assert.ok(Math.abs(surface.height-await page.evaluate(()=>innerHeight))<1)
  }
}
