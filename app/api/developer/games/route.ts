import {developerSubmissionRequest} from '@/lib/server/developerSubmissions'
export function GET(request:Request){return developerSubmissionRequest(request,'games')}
export function POST(request:Request){return developerSubmissionRequest(request,'games')}
