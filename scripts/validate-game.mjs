import {runArchiveCommand} from './review-archive.mjs'
const [archive,...options]=process.argv.slice(2)
if(!archive){console.error('Usage : npm run validate:game -- jeu.zip [--game UUID --version 1.0.0] [--report nouveau-rapport.json]');process.exitCode=1}
else try{
 const result=await runArchiveCommand(['validate','--archive',archive,...options])
 console.log(JSON.stringify(result));if(result.status!=='valid')process.exitCode=1
}catch{console.error('Contrôle local interrompu. Vérifiez le fichier, les paramètres et l’espace disque.');process.exitCode=1}
