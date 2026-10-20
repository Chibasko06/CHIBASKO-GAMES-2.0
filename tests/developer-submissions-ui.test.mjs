import test from 'node:test'
import assert from 'node:assert/strict'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import Submit from '../components/SubmitGamePageClient.tsx'
import Editor from '../components/NewGameDraftEditor.tsx'
import {emptyDraftMetadata} from '../lib/game-distribution/submission-drafts.ts'
import Submissions from '../components/DeveloperSubmissions.tsx'
import {SubmissionTabs,ManagedGamePicker} from '../components/SubmissionGameChoice.tsx'
import {catalogueSource} from '../lib/catalogueSource.ts'
import {FormFeedback,HelpText} from '../components/ui/FormFeedback.tsx'
import Identity from '../components/GameIdentityNotice.tsx'
test('anonymous publish page explains account and preserves authentication return',()=>{
 globalThis.__productAuth={session:null,loading:false}
 const html=renderToStaticMarkup(createElement(Submit,{categories:[]}))
 assert.match(html,/login\?next=%2Fpublier-un-jeu/);assert.match(html,/register\?next=%2Fpublier-un-jeu/)
 assert.doesNotMatch(html,/type="file"/);assert.match(html,/compte est nécessaire/)
})

test('feedback distinguishes errors, statuses, warnings, information and secondary help; identity is copyable',()=>{
 const error=renderToStaticMarkup(createElement(FormFeedback,{tone:'error',title:'Erreur'},'Détail sûr'))
 assert.match(error,/role="alert"/);assert.match(error,/border-rose/);assert.match(error,/tabindex="-1"/)
 const success=renderToStaticMarkup(createElement(FormFeedback,{tone:'success',title:'Succès'},'Reçu'))
 assert.match(success,/role="status"/);assert.match(success,/border-emerald/)
 const warning=renderToStaticMarkup(createElement(FormFeedback,{tone:'warning',title:'Attention'}))
 const info=renderToStaticMarkup(createElement(FormFeedback,{tone:'info',title:'Information'}))
 assert.match(warning,/border-amber/);assert.match(info,/border-cyan/);assert.doesNotMatch(warning,/role="alert"/)
 assert.match(renderToStaticMarkup(createElement(HelpText,null,'Aide secondaire')),/text-zinc-400/)
 const identity=renderToStaticMarkup(createElement(Identity,{gameId:'fixture-id',newGame:true}))
 assert.match(identity,/Identité privée du jeu créée/);assert.match(identity,/Copier le gameId/);assert.match(identity,/chibasko.json/);assert.match(identity,/n’est pas encore publié/)
})
test('connected form exposes game reservation, ZIP and editorial separation; submissions stay private',()=>{
 globalThis.__productAuth={session:{user:{id:'fixture-user'},access_token:'fixture-token'},loading:false}
 const html=renderToStaticMarkup(createElement(Submit,{categories:[]}))
 assert.match(html,/Publications en cours/);assert.match(html,/chibasko.json/);assert.match(html,/obtenir son gameId/)
 const editor=renderToStaticMarkup(createElement(Editor,{initial:{gameId:'fixture-id',metadata:emptyDraftMetadata,version:'',revision:0,submitted:false,upload:null,file:null,hashes:{}},token:'fixture-token',categories:[],max:524288000,onBack:()=>{}}))
 assert.match(editor,/Informations du nouveau jeu/);assert.doesNotMatch(editor,/Site développeur/)
 assert.match(html,/role="tablist"/);assert.match(html,/Publier un nouveau jeu/);assert.match(html,/Mettre à jour un jeu existant/)
 for(const field of ['Développeur / studio','Date de sortie','Compatible mobile','Technologie','image de couverture','Version du build'])assert.ok(editor.includes(field))
 assert.doesNotMatch(html,/Jeu géré|<option value="">Nouveau jeu|Provider|GameMonetize/)
 assert.doesNotMatch(html,/fixture-token|service_role|staging_key/)
 assert.match(renderToStaticMarkup(createElement(Submissions)),/Mes soumissions/)
})

test('update picker handles no memberships and only renders its managed games; catalogue provenance is explicit',()=>{
 const empty=renderToStaticMarkup(createElement(ManagedGamePicker,{games:[],value:'',loading:false,onChange:()=>{}}))
 assert.match(empty,/Vous ne gérez aucun jeu/);assert.doesNotMatch(empty,/<select/)
 const picker=renderToStaticMarkup(createElement(ManagedGamePicker,{games:[{id:'managed-id',title:'Managed fixture'}],value:'',loading:false,onChange:()=>{}}))
 assert.match(picker,/Managed fixture/);assert.doesNotMatch(picker,/Nouveau jeu|GameMonetize/)
 const tabs=renderToStaticMarkup(createElement(SubmissionTabs,{mode:'update',disabled:false,onChange:()=>{}}))
 assert.match(tabs,/id="tab-update" aria-selected="true"/)
 assert.deepEqual(catalogueSource({catalogue_source:'developer_submission',provider_name:'GameMonetize'}),{label:'Source',value:'Soumission développeur'})
 assert.deepEqual(catalogueSource({provider_name:'GameMonetize'}),{label:'Provider',value:'GameMonetize'})
})
