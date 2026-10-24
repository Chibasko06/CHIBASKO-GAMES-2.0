import {DataAccessError,readData} from './dataAccess'

export const READ_BATCH=100

// Les exports exhaustifs échouent explicitement si leur plafond est dépassé.
export async function readAllRows<T>(operation:string,request:(from:number,to:number)=>PromiseLike<{data:T[]|null;error?:unknown;count:number|null}>,maximum=50000):Promise<T[]>{
 const rows:T[]=[]
 const seen=new Set<string>()
 let total:number|undefined
 do{
  const result=await readData(operation,request(rows.length,rows.length+READ_BATCH-1))
  if(!Number.isSafeInteger(result.count)||result.count!<0||result.count!>maximum||!Array.isArray(result.data)||result.data.length>READ_BATCH)throw new DataAccessError('unexpected_error')
  if(total!==undefined&&total!==result.count)throw new DataAccessError('database_unavailable')
  total=result.count!
  if(!result.data.length&&rows.length<total)throw new DataAccessError('database_unavailable')
  for(const row of result.data){if(row&&typeof row==='object'){
   const identity='id' in row?row.id:'game_id' in row?row.game_id:undefined
   if(typeof identity==='string'||typeof identity==='number'){const key=String(identity);if(seen.has(key))throw new DataAccessError('database_unavailable');seen.add(key)}
  }}
  rows.push(...result.data)
 }while(rows.length<total)
 return rows
}

export function pageNumber(value:unknown):number{
 return typeof value==='string'&&/^[1-9]\d{0,5}$/.test(value)&&Number(value)<=41667?Number(value):1
}
