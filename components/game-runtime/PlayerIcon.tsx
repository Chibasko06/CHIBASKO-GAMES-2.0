type IconName='like'|'dislike'|'favorite'|'volume'|'muted'|'fullscreen'|'restore'|'close'
const paths:Record<IconName,string>={
  like:'M7 10v10H3V10h4Zm0 0 5-7c2 0 2 2 1 6h6a2 2 0 0 1 2 2l-2 7a3 3 0 0 1-3 2H7',
  dislike:'M7 14V4H3v10h4Zm0 0 5 7c2 0 2-2 1-6h6a2 2 0 0 0 2-2l-2-7a3 3 0 0 0-3-2H7',
  favorite:'m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2-5.7-3-5.7 3 1.1-6.2-4.5-4.4 6.3-.9L12 3Z',
  volume:'m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  muted:'m11 4-6 5H2v6h3l6 5V4Zm5 5 5 6m0-6-5 6',
  fullscreen:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  restore:'M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5',
  close:'m6 6 12 12M18 6 6 18',
}
export default function PlayerIcon({name}:{name:IconName}){
  return <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]}/></svg>
}
