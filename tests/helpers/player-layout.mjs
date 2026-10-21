import assert from 'node:assert/strict'
export async function assertPlayerLayout(page,fullscreen=false){
  const surface=await page.locator('[data-player-surface]').boundingBox()
  const dock=await page.getByRole('group',{name:'Commandes du lecteur',exact:true}).boundingBox()
  assert.ok(Math.abs(surface.y+surface.height-dock.y)<1,'dock must start below the game surface')
  assert.ok(dock.x>=surface.x-1 && dock.x+dock.width<=surface.x+surface.width+1)
  for(const button of await page.getByRole('group',{name:'Commandes du lecteur',exact:true}).getByRole('button').all()){
    const bounds=await button.boundingBox()
    assert.ok(bounds.width>=44 && bounds.height>=44)
    assert.ok(bounds.y>=dock.y && bounds.y+bounds.height<=dock.y+dock.height)
  }
  if(await page.locator('iframe').count()){
    const frame=await page.locator('iframe').boundingBox()
    assert.ok(Math.abs(frame.y-surface.y)<1 && Math.abs(frame.height-surface.height)<1)
    assert.ok(Math.abs(frame.x-surface.x)<1 && Math.abs(frame.width-surface.width)<1)
    assert.ok(frame.y+frame.height<=dock.y+0.5,'dock cannot cover iframe pixels')
  }
  if(fullscreen){
    assert.equal(surface.x,0);assert.equal(surface.y,0)
    assert.equal(surface.width,await page.evaluate(()=>innerWidth))
    assert.ok(Math.abs(dock.y+dock.height-await page.evaluate(()=>innerHeight))<1)
  }
}
