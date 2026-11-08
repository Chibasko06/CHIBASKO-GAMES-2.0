import {faqLinks} from '@/lib/faqLinks'
export default function FaqAnswer({text}:{text:string}){
 return <>{faqLinks(text).map((part,index)=>part.href?<a key={index} href={part.href} target="_blank" rel="noopener noreferrer" className="break-words text-cyan-300 underline underline-offset-4 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-cyan-300">{part.text}</a>:part.text)}</>
}
