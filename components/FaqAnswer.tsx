export default function FaqAnswer({text}:{text:string}){
 const parts=text.split(/(uBlock\s+Origin)/gi)
 return <>{parts.map((part,index)=>/^uBlock\s+Origin$/i.test(part)?<a key={index} href="https://github.com/gorhill/uBlock#installation" className="text-cyan-300 underline underline-offset-4 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-cyan-300">{part}</a>:part)}{parts.length>1&&<span className="mt-2 block text-xs text-zinc-400">La disponibilité et les fonctionnalités de l’extension dépendent du navigateur.</span>}</>
}
