import test from 'node:test'
import assert from 'node:assert/strict'
import {catalogueInput,readCatalogueForm} from '../lib/server/submissionCatalogue.ts'
import {developerSubmissionRequest} from '../lib/server/developerSubmissions.ts'
import {UploadError} from '../lib/game-distribution/uploads/policy.ts'
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const metadata={title:'Fixture',studio:'Fixture studio',releaseDate:'2026-10-20',description:'Description',categories:[id],mobile:true,technology:'HTML/JS',website:''}
const input={uploadId:id,kind:'new',metadata,ownership:true}
const png=new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')],'cover.png',{type:'image/png'})
function request(body=input,cover=png){const form=new FormData();form.set('metadata',JSON.stringify(body));if(cover)form.set('cover',cover);return new Request('https://site.example/api/developer/submissions',{method:'POST',body:form})}
test('new metadata is strictly validated and update cannot overwrite catalogue or community',()=>{
 assert.equal(catalogueInput(input).p_kind,'new')
 for(const change of [{studio:''},{releaseDate:'2026-02-30'},{mobile:'yes'},{technology:''},{categories:[]},{website:'javascript:alert(1)'},{community:100},{provider_name:'GameMonetize'}])assert.throws(()=>catalogueInput({...input,metadata:{...metadata,...change}}))
 assert.throws(()=>catalogueInput({...input,kind:'update'}))
 assert.equal(catalogueInput({...input,kind:'update',metadata:{}}).p_kind,'update')
})
test('multipart authenticates, authorizes known upload, validates image and sends only reviewed metadata to DB',async()=>{
 const calls=[];let uploaded=0
 const deps={authenticate:async()=>id,enabled:()=>true,cover:async()=>{uploaded++;return 'https://assets.chibaskogames.fr/game-thumbnails/'+id+'.png'},db:()=>({call:async(name,args)=>{calls.push({name,args});return name==='distribution_editorial_context'?{submissionId:null}:id}})}
 const response=await developerSubmissionRequest(request(),'submissions',deps)
 assert.equal(response.status,201);assert.equal(uploaded,1)
 assert.equal(calls[0].name,'distribution_editorial_context');assert.equal(calls[1].name,'distribution_submit_catalogue')
 assert.equal(calls[1].args.p_actor,id);assert.deepEqual(calls[1].args.p_metadata,metadata)
 assert.doesNotMatch(await response.text(),/staging_key|service_role|lease_token|game-thumbnails/)
 const denied={...deps,db:()=>({call:async()=>{throw new UploadError('forbidden',403)}})}
 assert.equal((await developerSubmissionRequest(request(),'submissions',denied)).status,403);assert.equal(uploaded,1)
 const anonymous={...deps,authenticate:async()=>{throw new UploadError('unauthorized',401)}}
 assert.equal((await developerSubmissionRequest(request(),'submissions',anonymous)).status,401)
 const duplicate={...deps,db:()=>({call:async()=>({submissionId:id})})}
 assert.equal((await developerSubmissionRequest(request(),'submissions',duplicate)).status,201);assert.equal(uploaded,1)
 assert.equal((await developerSubmissionRequest(request(input,new File(['not an image'],'x.png',{type:'image/png'})),'submissions',deps)).status,400)
 assert.equal(uploaded,1)
 assert.equal((await developerSubmissionRequest(request(input,null),'submissions',deps)).status,400)
 assert.equal((await developerSubmissionRequest(request({...input,kind:'update',metadata:{}},null),'submissions',deps)).status,201)
 assert.equal(uploaded,1)
})
test('multipart body has a strict size bound; JSON cannot bypass the new cover requirement',async()=>{
 await assert.rejects(readCatalogueForm(new Request('https://site.example',{method:'POST',headers:{'content-length':String(9*1024**2),'content-type':'multipart/form-data'},body:'fixture'})),{status:413})
 const response=await developerSubmissionRequest(new Request('https://site.example/api/developer/submissions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}),'submissions',{authenticate:async()=>id,enabled:()=>true,db:()=>({call:()=>assert.fail()})})
 assert.equal(response.status,400)
})
