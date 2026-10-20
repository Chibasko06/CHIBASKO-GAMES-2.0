import {developerSubmissionRequest} from '@/lib/server/developerSubmissions'
export function GET(request:Request){return developerSubmissionRequest(request,'submissions')}
export function POST(request:Request){return developerSubmissionRequest(request,'submissions')}
