export type FaqPart={text:string;href?:string}
function httpsLink(value:string){
 if(/[\s\\<>\u0000-\u001f]/.test(value))return null
 try{const url=new URL(value);return url.protocol==='https:'&&url.hostname&&!url.username&&!url.password?url.href:null}catch{return null}
}
export function faqLinks(text:string):FaqPart[]{
 const parts:FaqPart[]=[],pattern=/\[([^\]\r\n]{1,500})\]\(|https:\/\//gi
 let offset=0,match:RegExpExecArray|null
 while((match=pattern.exec(text))){
  const start=match.index,urlStart=pattern.lastIndex
  let end=urlStart,label='',url=''
  if(match[1]!==undefined){
   let depth=0
   for(;end<text.length;end++){const char=text[end];if(char==='\n'||char==='\r')break;if(char==='(')depth++;if(char===')'){if(depth===0)break;depth--}}
   if(text[end]!==')')continue
   label=match[1];url=text.slice(urlStart,end);end++
  }else{
   while(end<text.length&&!/[\s<>"\u0000-\u001f]/.test(text[end]))end++
   url=text.slice(start,end).replace(/[.,;:!?]+$/,'')
   while(url.endsWith(')')&&(url.match(/\)/g)?.length??0)>(url.match(/\(/g)?.length??0))url=url.slice(0,-1)
   end=start+url.length;label=url
  }
  const href=httpsLink(url)
  if(start>offset)parts.push({text:text.slice(offset,start)})
  parts.push(href?{text:label,href}:{text:text.slice(start,end)})
  offset=end;pattern.lastIndex=end
 }
 if(offset<text.length)parts.push({text:text.slice(offset)})
 return parts
}
