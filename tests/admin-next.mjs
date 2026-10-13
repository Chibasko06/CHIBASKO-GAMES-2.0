class CookieJar {
  values=new Map()
  constructor(header=''){for(const pair of header.split(';')){const i=pair.indexOf('=');if(i>0)this.set(pair.slice(0,i).trim(),pair.slice(i+1).trim())}}
  set(name,value,options={}){if(typeof name==='object')this.values.set(name.name,name);else this.values.set(name,{name,value,...options})}
  get(name){return this.values.get(name)}
  getAll(){return [...this.values.values()]}
}
export class NextRequest extends Request {
  constructor(...args){super(...args);this.nextUrl=new URL(this.url);this.cookies=new CookieJar(this.headers.get('cookie')??'')}
}
export class NextResponse extends Response {
  cookies=new CookieJar()
  static next(){return new NextResponse(null,{status:200})}
  static redirect(url){return new NextResponse(null,{status:307,headers:{Location:String(url)}})}
}
