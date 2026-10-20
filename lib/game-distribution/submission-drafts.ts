export type DraftMetadata={title:string;studio:string;releaseDate:string;description:string;categories:string[];mobile:boolean|null;technology:string}
export const emptyDraftMetadata:DraftMetadata={title:'',studio:'',releaseDate:'',description:'',categories:[],mobile:null,technology:''}
export type PublicationDraft={gameId:string;title:string;metadata:DraftMetadata;version:string;revision:number;updatedAt:string;requestId:string;
 file:{name:string;size:number;lastModified:number}|null;hashes:Record<string,string>;submitted:boolean;coverUrl:string|null;
 state:'draft'|'uploading'|'upload_failed'|'submitted';upload:{id:string;status:string;version:string;archiveSize:number;expiresAt:string;partSize:number}|null}
export const publicationDraftLabel=(draft:PublicationDraft)=>draft.submitted?'Soumission reçue — revue manuelle':draft.state==='upload_failed'?'Envoi à reprendre':draft.upload?'Envoi en cours':'Brouillon non soumis'
