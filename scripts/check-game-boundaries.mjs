import {readFile,readdir} from 'node:fs/promises'
import {resolve,relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import ts from 'typescript'
const root=fileURLToPath(new URL('../',import.meta.url))
const infrastructure=new Set(['@chibaskogames/sdk','@opennextjs/cloudflare','@supabase/ssr','@supabase/supabase-js','@xmldom/xmldom','@zip.js/zip.js','aws4fetch','image-size','next','react','react-dom','resend','server-only','tldts'])
export function imports(source){const found=[];const ast=ts.createSourceFile('module.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
 function visit(node){
  if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))found.push(node.moduleSpecifier.text)
  if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(node.expression)&&node.expression.text==='require')))found.push(node.arguments[0]&&ts.isStringLiteral(node.arguments[0])?node.arguments[0].text:'<computed>')
  ts.forEachChild(node,visit)
 }visit(ast);return found}
export function platformImportAllowed(value){
 if(value==='<computed>')return false
 if(/(?:^|\/)(?:game-server|games)\//.test(value)||/(?:^|\/)clientRegistry(?:\.[cm]?[jt]sx?)?$/.test(value))return false
 if(value.startsWith('@chibaskogames/'))return /^@chibaskogames\/sdk(?:\/(?:client|react|server))?$/.test(value)
 if(value.startsWith('.')||value.startsWith('@/')||value.startsWith('node:'))return true
 const name=value.startsWith('@')?value.split('/').slice(0,2).join('/'):value.split('/')[0]
 return infrastructure.has(name)
}
async function files(directory){const result=[];for(const entry of await readdir(directory,{withFileTypes:true})){const path=resolve(directory,entry.name);if(entry.isDirectory())result.push(...await files(path));else if(/\.(?:tsx?|m?js)$/.test(path))result.push(path)}return result}
export async function checkGameBoundaries(){const errors=[]
 for(const folder of ['app','components','lib'])for(const file of await files(resolve(root,folder)))for(const value of imports(await readFile(file,'utf8')))if(!platformImportAllowed(value))errors.push(relative(root,file)+': '+value)
 const manifest=JSON.parse(await readFile(resolve(root,'package.json'),'utf8')),lock=JSON.parse(await readFile(resolve(root,'package-lock.json'),'utf8'))
 for(const [name,spec]of Object.entries(manifest.dependencies))if(!infrastructure.has(name)||/^(?:git|github|file:|workspace:)/.test(spec))errors.push('Unapproved platform dependency: '+name)
 for(const entry of Object.values(lock.packages))if(entry.resolved&&!entry.resolved.startsWith('https://registry.npmjs.org/'))errors.push('Non-registry dependency')
 if(errors.length)throw Error(errors.join('\n'))
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){await checkGameBoundaries();console.log('Platform boundaries: artifacts and public SDK only; no game package, registry or Git install source.')}
