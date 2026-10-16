import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import ts from 'typescript'
import { Ajv2020 } from 'ajv/dist/2020.js'
import standaloneCode from 'ajv/dist/standalone/index.js'
import { build } from 'esbuild'

const directory=new URL('../lib/game-distribution/',import.meta.url)
const schema=JSON.parse(await readFile(new URL('chibasko.schema.v1.json',directory),'utf8'))
const ajv=new Ajv2020({strict:true,strictTypes:false,strictRequired:false,allErrors:false,code:{source:true,esm:true}})
const source=standaloneCode(ajv,ajv.compile(schema))
const bundled=await build({stdin:{contents:source,resolveDir:fileURLToPath(new URL('../',import.meta.url))},
  bundle:true,format:'esm',platform:'browser',write:false,minify:true,target:'es2022'})
const require=createRequire(import.meta.url)
const compilerVersion=require('ajv/package.json').version
const ajvRequire=createRequire(require.resolve('ajv/package.json'))
const notices=await Promise.all(['ajv','fast-deep-equal'].map(async name=>readFile(join(dirname(ajvRequire.resolve(name+'/package.json')),'LICENSE'),'utf8')))
const output=`/* eslint-disable */\n// Generated from chibasko.schema.v1.json with Ajv ${compilerVersion}. Run npm run generate:distribution-schema.\n/* Embedded helper licenses:\n${notices.join('\n')}\n*/\n`+bundled.outputFiles[0].text
const syntax=ts.createSourceFile('validator.mjs',output,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
function visit(node) {
  if ((ts.isCallExpression(node)||ts.isNewExpression(node)) && ts.isIdentifier(node.expression))
    assert.ok(!['eval','Function','require'].includes(node.expression.text),'Runtime code generation/import forbidden')
  ts.forEachChild(node,visit)
}
visit(syntax)
const destination=new URL('manifest-validator.generated.mjs',directory)
if(process.argv.includes('--check')) assert.equal(await readFile(destination,'utf8'),output,'Distribution schema validator is stale')
else await writeFile(destination,output)
console.log('Distribution schema validator '+(process.argv.includes('--check')?'current.':'generated (no runtime code generation).'))
