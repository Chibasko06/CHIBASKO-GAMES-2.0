import test from 'node:test'
import assert from 'node:assert/strict'
import {reviewPresentation,checklistComplete} from '../lib/game-distribution/admin-review-presentation.ts'
const full={tested:true,content:true,metadata:true,behavior:true}
const base={technicalStatus:'queued',versionStatus:null,gameVersionId:null,review:{decision:'pending',checklist:{},reviewedAt:null}}
const completed=()=>({...base,technicalStatus:'completed',versionStatus:'draft',gameVersionId:'fixture-version',review:{...base.review}})
test('admin presentation distinguishes technical processing, testing and persisted review without altering backend states',()=>{
 assert.equal(reviewPresentation(base).label,'À vérifier');assert.equal(reviewPresentation(base).technical,'En attente')
 assert.equal(reviewPresentation({...base,technicalStatus:'validating'}).technical,'En cours')
 assert.equal(reviewPresentation({...base,technicalStatus:'failed'}).technical,'Échec')
 assert.equal(reviewPresentation(completed()).label,'À tester')
 assert.equal(reviewPresentation(completed(),{tested:true}).label,'Revue à compléter')
 assert.equal(reviewPresentation({...completed(),gameVersionId:null}).label,'Vérification technique réussie')
 assert.equal(checklistComplete(full),true);assert.equal(checklistComplete({tested:true}),false)
})
test('publish stays disabled until exact persisted review/version prerequisites; unsaved edits cannot enable publication',()=>{
 assert.equal(reviewPresentation(base,full).canPublish,false)
 assert.equal(reviewPresentation(completed(),full).canPublish,false)
 const ready={...completed(),versionStatus:'in_review',review:{decision:'reviewed',reviewedAt:'2026-10-20T10:00:00Z',checklist:full}}
 assert.equal(reviewPresentation(ready).label,'Prêt à publier');assert.equal(reviewPresentation(ready).canPublish,true)
 for(const change of [{versionStatus:'approved'},{technicalStatus:'validating'},{gameVersionId:null},{review:{...ready.review,reviewedAt:null}},{review:{...ready.review,checklist:{}}}])assert.equal(reviewPresentation({...ready,...change}).canPublish,false)
 assert.equal(reviewPresentation(ready,{...full,tested:false}).canPublish,false)
})
test('terminal decisions have explicit badges and safe action eligibility',()=>{
 const build=completed()
 assert.equal(reviewPresentation({...build,versionStatus:'published'}).label,'Publié')
 assert.equal(reviewPresentation({...build,review:{...build.review,decision:'rejected'}}).label,'Refusé')
 assert.equal(reviewPresentation({...build,versionStatus:'archived'}).label,'Archivé')
 assert.equal(reviewPresentation({...build,versionStatus:'published'}).canReject,false)
 assert.equal(reviewPresentation({...build,versionStatus:'archived'}).canTest,false)
 assert.equal(reviewPresentation({...build,technicalStatus:'validating'}).canArchive,false)
})
