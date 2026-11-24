import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {developerDate,developerNumber,projectStatus,buildStatus,externalStatus,activityInPeriod,monthlyActivity} from '../lib/developerPresentation.ts'
import {EmailNotice} from '../components/developer/DeveloperUI.tsx'

test('French dates use Paris time, including month boundaries, without leaking ISO strings',()=>{
 assert.equal(developerDate('2026-11-23T23:30:00Z'),'24 novembre 2026')
 assert.match(developerDate('2026-11-23T23:30:00Z',true),/24 nov.*2026.*00:30/)
 for(const value of [null,undefined,'wrong'])assert.equal(developerDate(value),'Date non renseignée')
 assert.equal(developerNumber(NaN),'—');assert.equal(developerNumber(undefined),'—')
})
test('accepted versions, public games, corrections and external reviews remain distinct',()=>{
 assert.equal(buildStatus({decision:'published',technicalStatus:'completed',versionStatus:'published',reason:null}).label,'Version acceptée')
 assert.equal(projectStatus({isPublished:true}).label,'Jeu publié')
 assert.equal(projectStatus({isPublished:false,activeVersionId:'version'}).label,'Version acceptée · hors ligne')
 assert.equal(projectStatus({isPublished:true,correctionRequired:true}).label,'Correction demandée')
 assert.equal(projectStatus({isPublished:false,buildCount:0,revisionCount:0,draftState:null}).label,'Brouillon')
 assert.equal(externalStatus('approve','accepted').label,'Révision acceptée')
 assert.equal(externalStatus('publish','accepted').label,'Révision publiée')
})
test('publication charts derive only recorded deposits, honour filters and ignore invalid dates',()=>{
 const now=Date.parse('2026-11-24T12:00:00Z'),rows=[{createdAt:'2026-11-23T23:30:00Z'},{createdAt:'2026-10-01T12:00:00Z'},{createdAt:'bad'},{createdAt:'2030-01-01'}]
 assert.equal(activityInPeriod(rows,7,now).length,1)
 assert.equal(activityInPeriod(rows,0,now).length,2)
 assert.deepEqual(monthlyActivity(activityInPeriod(rows,0,now)).map(r=>[r.month,r.count]),[['2026-10',1],['2026-11',1]])
})
test('unconfirmed accounts get a clear notice, with no promise of an enabled email stream',()=>{
 globalThis.__productAuth={session:{user:{id:'fixture',email:'fixture@example.test',email_confirmed_at:null}},loading:false}
 const html=renderToStaticMarkup(createElement(EmailNotice));assert.match(html,/n’est pas confirmée/);assert.match(html,/Aucune notification développeur/);assert.doesNotMatch(html,/notifications.*sont envoyées|fixture@example/)
 globalThis.__productAuth.session.user.email_confirmed_at='2026-11-23T12:00:00Z';assert.equal(renderToStaticMarkup(createElement(EmailNotice)),'')
 globalThis.__productAuth={session:null,loading:false};assert.equal(renderToStaticMarkup(createElement(EmailNotice)),'')
})
test('developer entry lives in account menu and dashboard, not public primary navigation',async()=>{
 const [navbar,dropdown,dashboard]=await Promise.all(['components/Navbar.tsx','components/UserDropdown.tsx','app/dashboard/page.tsx'].map(f=>readFile(new URL('../'+f,import.meta.url),'utf8')))
 assert.doesNotMatch(navbar,/href="\/developer" className=\{sharedLinkClass\}/)
 assert.match(dropdown,/href="\/developer"/);assert.match(dashboard,/href="\/developer"/)
 assert.match(navbar,/Mon compte[\s\S]*href="\/developer"/)
})
test('verified recipient still comes exclusively from the existing guarded SQL helper',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/20261123000200_developer_email_events.sql',import.meta.url),'utf8')
 assert.match(sql,/a.email_confirmed_at is not null/);assert.match(sql,/distribution_confirmed_submission_email\(s.id\)/);assert.match(sql,/from public,anon,authenticated,service_role/)
 const config=await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8');assert.match(config,/"GAME_DEVELOPER_NOTIFICATIONS_ENABLED": "0"/)
})
