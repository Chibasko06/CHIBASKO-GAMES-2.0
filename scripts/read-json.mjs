import {readFile} from 'node:fs/promises'
/** Accept UTF-8 and the UTF-16LE redirection used by Windows PowerShell 5. */
export async function readJson(path) {
 const bytes=await readFile(path),encoding=bytes[0]===255&&bytes[1]===254?'utf-16le':'utf-8'
 return JSON.parse(new TextDecoder(encoding,{fatal:true}).decode(bytes))
}
